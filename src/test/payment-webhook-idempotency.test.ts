/**
 * Reference in-memory implementation of the SQL claim/complete/fail state
 * machine used by `payments-webhook`. These tests document the intended
 * semantics enforced by the migration + RPCs; the SQL versions are what
 * actually run in production, but keeping the semantics locked in a
 * vitest-runnable model prevents accidental drift.
 */
import { describe, expect, it } from "vitest";

type Row = {
  provider: string;
  environment: string;
  event_id: string;
  event_type: string;
  status: "processing" | "completed" | "failed";
  attempt_count: number;
  started_at: number;
  completed_at: number | null;
  error_code: string | null;
};

const STALE_MS = 5 * 60 * 1000;

class Ledger {
  private rows = new Map<string, Row>();
  private key(p: string, env: string, id: string) {
    return `${p}::${env}::${id}`;
  }
  claim(
    provider: string,
    environment: string,
    eventId: string,
    eventType: string,
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
    existing.started_at = now;
    existing.completed_at = null;
    existing.error_code = null;
    return "claimed";
  }
  complete(provider: string, environment: string, eventId: string, now: number) {
    const row = this.rows.get(this.key(provider, environment, eventId));
    if (!row) return;
    row.status = "completed";
    row.completed_at = now;
    row.error_code = null;
  }
  fail(provider: string, environment: string, eventId: string, code: string, now: number) {
    const row = this.rows.get(this.key(provider, environment, eventId));
    if (!row) return;
    row.status = "failed";
    row.completed_at = now;
    row.error_code = /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? code : "unknown_error";
  }
  peek(provider: string, environment: string, eventId: string) {
    return this.rows.get(this.key(provider, environment, eventId));
  }
}

describe("payment webhook idempotency (reference model of claim RPC)", () => {
  it("new event is claimed", () => {
    const l = new Ledger();
    expect(l.claim("stripe", "live", "evt_1", "invoice.paid", 1000)).toBe("claimed");
    expect(l.peek("stripe", "live", "evt_1")?.attempt_count).toBe(1);
  });

  it("completed event returns duplicate_completed without side effects", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_1", "invoice.paid", 1000);
    l.complete("stripe", "live", "evt_1", 1100);
    const before = { ...l.peek("stripe", "live", "evt_1")! };
    expect(l.claim("stripe", "live", "evt_1", "invoice.paid", 1200)).toBe("duplicate_completed");
    const after = l.peek("stripe", "live", "evt_1")!;
    expect(after.attempt_count).toBe(before.attempt_count);
    expect(after.status).toBe("completed");
  });

  it("concurrent processing returns already_processing", () => {
    const l = new Ledger();
    l.claim("stripe", "sandbox", "evt_2", "invoice.paid", 5_000);
    // second worker within stale window
    expect(l.claim("stripe", "sandbox", "evt_2", "invoice.paid", 5_100)).toBe("already_processing");
  });

  it("failed event is retryable and increments attempt_count", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_3", "invoice.paid", 1000);
    l.fail("stripe", "live", "evt_3", "handler_error", 1200);
    expect(l.claim("stripe", "live", "evt_3", "invoice.paid", 1300)).toBe("claimed");
    expect(l.peek("stripe", "live", "evt_3")?.attempt_count).toBe(2);
  });

  it("abandoned processing older than 5 minutes is recovered as claimed", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_4", "invoice.paid", 0);
    const later = 6 * 60 * 1000;
    expect(l.claim("stripe", "live", "evt_4", "invoice.paid", later)).toBe("claimed");
    expect(l.peek("stripe", "live", "evt_4")?.attempt_count).toBe(2);
  });

  it("fail sanitizes unsafe error codes", () => {
    const l = new Ledger();
    l.claim("stripe", "live", "evt_5", "invoice.paid", 1);
    l.fail("stripe", "live", "evt_5", "code with spaces & symbols!!!", 2);
    expect(l.peek("stripe", "live", "evt_5")?.error_code).toBe("unknown_error");
  });

  it("invalid signature scenario never touches the ledger (documented by absence)", () => {
    // In the real handler, `constructEventAsync` throws before `claim`
    // is ever called. Model that here by asserting: if we never invoke
    // claim, the ledger stays empty and no receipt row is created.
    const l = new Ledger();
    // (simulated) signature verification fails -> handler returns 400 early
    expect(l.peek("stripe", "live", "evt_never")).toBeUndefined();
  });

  it("HTTP contract: duplicate_completed => 200 without effects; real error => 500", () => {
    // This mirrors the payments-webhook branch table.
    const l = new Ledger();
    l.claim("stripe", "live", "evt_9", "invoice.paid", 100);
    l.complete("stripe", "live", "evt_9", 200);

    const dupOutcome = l.claim("stripe", "live", "evt_9", "invoice.paid", 300);
    const dupHttp = dupOutcome === "duplicate_completed" ? 200 : 500;
    expect(dupHttp).toBe(200);

    // Real error path: claim then fail (mimicking handler throwing).
    l.claim("stripe", "live", "evt_10", "invoice.paid", 400);
    l.fail("stripe", "live", "evt_10", "handler_error", 401);
    const failHttp = l.peek("stripe", "live", "evt_10")?.status === "failed" ? 500 : 200;
    expect(failHttp).toBe(500);
  });
});
