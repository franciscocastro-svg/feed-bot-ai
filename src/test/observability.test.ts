import { describe, expect, it, vi, afterEach } from "vitest";
import {
  classifyError,
  containsPII,
  containsSensitiveKeyword,
  createLogger,
  formatLogLine,
  newRequestId,
} from "../../supabase/functions/_shared/observability";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("observability logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("newRequestId returns a v4-ish UUID string", () => {
    const id = newRequestId();
    expect(id).toMatch(UUID_RE);
  });

  it("formatLogLine emits one-line JSON with only allowed fields", () => {
    const line = formatLogLine("info", "hello", {
      function_name: "test-fn",
      request_id: "00000000-0000-4000-8000-000000000000",
      event_type: "invoice.paid",
      environment: "sandbox",
      duration_ms: 12,
      // deliberately try to smuggle extra fields:
      ...({ recipient: "victim@example.com", authorization: "Bearer abc" } as unknown as Record<string, never>),
    });
    expect(line.includes("\n")).toBe(false);
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(parsed.function_name).toBe("test-fn");
    expect(parsed.event_type).toBe("invoice.paid");
    expect(parsed).not.toHaveProperty("recipient");
    expect(parsed).not.toHaveProperty("authorization");
  });

  it("createLogger writes structured JSON to console and never leaks PII/secrets", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("payments-webhook");
    log.info("event_received", { event_id: "evt_123", event_type: "invoice.paid" });
    log.error("boom", { error_code: "handler_failed" });

    const infoLine = spy.mock.calls[0][0] as string;
    const errLine = errSpy.mock.calls[0][0] as string;
    for (const line of [infoLine, errLine]) {
      expect(containsPII(line)).toBe(false);
      expect(containsSensitiveKeyword(line)).toBe(false);
      const parsed = JSON.parse(line);
      expect(parsed.request_id).toMatch(UUID_RE);
      expect(parsed.function_name).toBe("payments-webhook");
    }
  });

  it("classifyError sanitizes unknown errors to a safe code and generic message", () => {
    const raw = classifyError(new Error("customer email user@example.com was rejected: sk_live_XYZ"));
    expect(raw.error_code).toBe("Error");
    expect(raw.message).toBe("Operation failed");
    expect(containsPII(raw.error_code + raw.message)).toBe(false);
    expect(containsSensitiveKeyword(raw.error_code + raw.message)).toBe(false);

    const coded = classifyError({ code: "resend_send_failed" });
    expect(coded.error_code).toBe("resend_send_failed");

    const junk = classifyError({ code: "not a code because spaces" });
    expect(junk.error_code).toBe("unknown_error");
  });

  it("redaction sentinels detect PII and secrets in arbitrary text", () => {
    expect(containsPII("please contact victim@example.com")).toBe(true);
    expect(containsPII("no email here")).toBe(false);
    for (const s of [
      "Authorization: Bearer x",
      "cookie=abc",
      "stripe-signature: t=1,v1=y",
      "api_key stored",
      "x-supabase-hook-secret: sh",
      "the token was rotated",
    ]) {
      expect(containsSensitiveKeyword(s)).toBe(true);
    }
  });
});
