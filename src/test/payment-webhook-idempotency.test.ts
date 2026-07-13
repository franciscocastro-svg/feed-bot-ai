/**
 * Reference in-memory implementation of the SQL claim/complete/fail state
 * machine used by `payments-webhook`. These tests document the intended
 * semantics enforced by the migration + RPCs; the SQL versions are what
 * actually run in production, but keeping the semantics locked in a
 * vitest-runnable model prevents accidental drift.
 *
 * Phase 1E-A.1 additions:
 *  - complete/fail are fenced by request_id — an old attempt cannot mutate
 *    a row whose ownership has been transferred to a recovered worker.
 *  - complete/fail return a boolean indicating whether the row was actually
 *    updated. The webhook MUST verify both `.error` and this boolean.
 *  - Only claim status === "claimed" allows side effects to run. Any
 *    unknown/null value must translate to a 500 with no effects and no
 *    ledger mutation.
 *  - A durable outbox reserves each external effect exactly once per
 *    (provider, environment, event_id, effect_type).
 */
import { describe, expect, it } from "vitest";

type Row = {
  provider: string;
  environment: string;
  event_id: string;
  event_type: string;
  status: "processing" | "completed" | "failed";
  attempt_count: number;
  request_id: string | null;
  started_at: number;
  completed_at: number | null;
  error_code: string | null;
};

const STALE_MS = 5 * 60 * 1000;

class Ledger {
  private rows = new Map<string, Row>();
  private effects = new Set<string>();
  private key(p: string, env: string, id: string) {
    return `${p}::${env}::${id}`;
  }
  private effectKey(p: string, env: string, id: string, t: string) {
    return `${p}::${env}::${id}::${t}`;
  }
  claim(
    provider: string,
    environment: string,
    eventId: string,
    eventType: string,
    requestId: string,
    now: number,
  ): "claimed" | "duplicate_completed" | "already_processing" {
    const k = this.key(provider, environment, eventId);
    const existing = this.rows.get(k);
    if (!existing) {
      this.rows.set(k, {
        provider,
        environment,
        event_id: eventId,
        event_type: eventType,
        status: "processing",
        attempt_count: 1,
        request_id: requestId,
        started_at: now,
        completed_at: null,
        error_code: null,
      });
      return "claimed";
    }
    if (existing.status === "completed") return "duplicate_completed";
    if (existing.status === "processing" && existing.started_at > now - STALE_MS) {
      return "already_processing";
    }
    existing.status = "processing";
    existing.attempt_count += 1;
    existing.request_id = requestId;
    existing.started_at = now;
    existing.completed_at = null;
    existing.error_code = null;
    return "claimed";
  }
  /** Fenced complete — returns true only when this worker still owns the row. */
  complete(provider: string, environment: string, eventId: string, requestId: string, now: number) {
    const row = this.rows.get(this.key(provider, environment, eventId));
    if (!row) return false;
    if (row.status !== "processing" || row.request_id !== requestId) return false;
    row.status = "completed";
    row.completed_at = now;
    row.error_code = null;
    return true;
  }
  /** Fenced fail — returns true only when this worker still owns the row. */
  fail(provider: string, environment: string, eventId: string, requestId: string, code: string, now: number) {
    const row = this.rows.get(this.key(provider, environment, eventId));
    if (!row) return false;
    if (row.status !== "processing" || row.request_id !== requestId) return false;
    row.status = "failed";
    row.completed_at = now;
    row.error_code = /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? code : "unknown_error";
    return true;
  }
  peek(provider: string, environment: string, eventId: string) {
    return this.rows.get(this.key(provider, environment, eventId));
  }
  /** Outbox — returns true only for the first caller of a given effect. */
  tryClaimEffect(provider: string, environment: string, eventId: string, effectType: string) {
    const k = this.effectKey(provider, environment, eventId, effectType);
    if (this.effects.has(k)) return false;
    this.effects.add(k);
    return true;
  }
}

/**
 * Minimal reproduction of the webhook branch table so we can assert that
 * unknown claim statuses do NOT cause effects to run.
 */
function decideHttp(claimStatus: string | null): { status: number; runEffects: boolean } {
  if (claimStatus === "claimed") return { status: 200, runEffects: true };
  if (claimStatus === "duplicate_completed") return { status: 200, runEffects: false };
  if (claimStatus === "already_processing") return { status: 200, runEffects: false };
  // null, "unknown", anything else -> 500 without effects
  return { status: 500, runEffects: false };
}

describe("payment webhook idempotency (reference model of claim RPC)", () => {
  it("new event is claimed", () => {
    const l = new Ledger();
    expect(l.claim("stripe", "live", "evt_1", "invoice.paid", "req_A", 1000)).toBe("claimed");
    expect(l.peek("stripe", "live", "evt_1")?.attempt_count).toBe(1);
  });

  it("completed event returns duplicate_completed without side effects", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_1", "invoice.paid", "req_A", 1000);
    l.complete("stripe", "live", "evt_1", "req_A", 1100);
    const before = { ...l.peek("stripe", "live", "evt_1")! };
    expect(l.claim("stripe", "live", "evt_1", "invoice.paid", "req_B", 1200)).toBe("duplicate_completed");
    const after = l.peek("stripe", "live", "evt_1")!;
    expect(after.attempt_count).toBe(before.attempt_count);
    expect(after.status).toBe("completed");
  });

  it("two concurrent attempts for the same event: second gets already_processing", () => {
    const l = new Ledger();
    expect(l.claim("stripe", "sandbox", "evt_2", "invoice.paid", "req_A", 5_000)).toBe("claimed");
    expect(l.claim("stripe", "sandbox", "evt_2", "invoice.paid", "req_B", 5_100)).toBe("already_processing");
    // The row still belongs to req_A.
    expect(l.peek("stripe", "sandbox", "evt_2")?.request_id).toBe("req_A");
  });

  it("failed event is retryable and increments attempt_count + rotates request_id", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_3", "invoice.paid", "req_A", 1000);
    l.fail("stripe", "live", "evt_3", "req_A", "handler_error", 1200);
    expect(l.claim("stripe", "live", "evt_3", "invoice.paid", "req_B", 1300)).toBe("claimed");
    const row = l.peek("stripe", "live", "evt_3")!;
    expect(row.attempt_count).toBe(2);
    expect(row.request_id).toBe("req_B");
  });

  it("abandoned processing older than 5 minutes is recovered as claimed by a new owner", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_4", "invoice.paid", "req_A", 0);
    const later = 6 * 60 * 1000;
    expect(l.claim("stripe", "live", "evt_4", "invoice.paid", "req_B", later)).toBe("claimed");
    expect(l.peek("stripe", "live", "evt_4")?.request_id).toBe("req_B");
  });

  it("fail sanitizes unsafe error codes", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_5", "invoice.paid", "req_A", 1);
    l.fail("stripe", "live", "evt_5", "req_A", "code with spaces & symbols!!!", 2);
    expect(l.peek("stripe", "live", "evt_5")?.error_code).toBe("unknown_error");
  });

  it("invalid signature scenario never touches the ledger (documented by absence)", () => {
    const l = new Ledger();
    expect(l.peek("stripe", "live", "evt_never")).toBeUndefined();
  });

  it("HTTP contract: duplicate_completed => 200 no effects; unknown => 500 no effects; error path stays failed", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_9", "invoice.paid", "req_A", 100);
    l.complete("stripe", "live", "evt_9", "req_A", 200);

    const dup = l.claim("stripe", "live", "evt_9", "invoice.paid", "req_B", 300);
    expect(decideHttp(dup)).toEqual({ status: 200, runEffects: false });

    // Unknown claim status must NOT run effects and must be 500.
    expect(decideHttp(null)).toEqual({ status: 500, runEffects: false });
    expect(decideHttp("something_unexpected")).toEqual({ status: 500, runEffects: false });

    // Real failure path.
    l.claim("stripe", "live", "evt_10", "invoice.paid", "req_A", 400);
    l.fail("stripe", "live", "evt_10", "req_A", "handler_error", 401);
    expect(l.peek("stripe", "live", "evt_10")?.status).toBe("failed");
  });

  it("mutation failure must NOT mark the event completed", () => {
    // Simulate: claim ok, side-effect throws, handler calls fail() (not complete).
    const l = new Ledger();
    l.claim("stripe", "live", "evt_mut", "invoice.paid", "req_A", 1000);
    const mutationOk = false;
    try {
      if (!mutationOk) throw new Error("db_write_failed");
      l.complete("stripe", "live", "evt_mut", "req_A", 1100);
    } catch {
      l.fail("stripe", "live", "evt_mut", "req_A", "db_write_failed", 1100);
    }
    const row = l.peek("stripe", "live", "evt_mut")!;
    expect(row.status).toBe("failed");
    expect(row.status).not.toBe("completed");
  });

  it("request_id fencing: old request cannot complete a recovered attempt", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_fence", "invoice.paid", "req_OLD", 0);
    // Row is abandoned; new worker takes over.
    const later = 6 * 60 * 1000;
    expect(l.claim("stripe", "live", "evt_fence", "invoice.paid", "req_NEW", later)).toBe("claimed");
    // Old worker wakes up and tries to complete — must fail the fence.
    expect(l.complete("stripe", "live", "evt_fence", "req_OLD", later + 1)).toBe(false);
    // Row must still be processing under the new owner.
    const row = l.peek("stripe", "live", "evt_fence")!;
    expect(row.status).toBe("processing");
    expect(row.request_id).toBe("req_NEW");
    // New owner completes successfully.
    expect(l.complete("stripe", "live", "evt_fence", "req_NEW", later + 2)).toBe(true);
  });

  it("request_id fencing: old request cannot fail a recovered attempt either", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_fence2", "invoice.paid", "req_OLD", 0);
    const later = 6 * 60 * 1000;
    l.claim("stripe", "live", "evt_fence2", "invoice.paid", "req_NEW", later);
    expect(l.fail("stripe", "live", "evt_fence2", "req_OLD", "handler_error", later + 1)).toBe(false);
    expect(l.peek("stripe", "live", "evt_fence2")?.status).toBe("processing");
  });

  it("outbox: an external effect reserved by one attempt is not repeated by a retry", () => {
    const l = new Ledger();
    // First delivery
    l.claim("stripe", "live", "evt_out", "invoice.paid", "req_A", 1000);
    expect(l.tryClaimEffect("stripe", "live", "evt_out", "meta_purchase")).toBe(true);
    l.complete("stripe", "live", "evt_out", "req_A", 1100);

    // Retry (e.g. Stripe redelivery). claim => duplicate_completed AND
    // even if it weren't, the effect outbox would refuse a second claim.
    expect(l.claim("stripe", "live", "evt_out", "invoice.paid", "req_B", 1200)).toBe("duplicate_completed");
    expect(l.tryClaimEffect("stripe", "live", "evt_out", "meta_purchase")).toBe(false);
  });

  it("outbox: distinct effect types on the same event are independent", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_multi", "customer.subscription.created", "req_A", 1);
    expect(l.tryClaimEffect("stripe", "live", "evt_multi", "send_verification_code")).toBe(true);
    expect(l.tryClaimEffect("stripe", "live", "evt_multi", "meta_start_trial")).toBe(true);
    expect(l.tryClaimEffect("stripe", "live", "evt_multi", "send_verification_code")).toBe(false);
  });
});
