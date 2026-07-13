export const RETRYABLE_EFFECT_TYPES = [
  "stripe_cancel_after_refund",
  "meta_start_trial",
  "meta_purchase",
] as const;

export type RetryableEffectType = typeof RETRYABLE_EFFECT_TYPES[number];
export type EffectPolicy = "retry" | "manual_resend" | "unsupported";

export function getEffectPolicy(effectType: string): EffectPolicy {
  if ((RETRYABLE_EFFECT_TYPES as readonly string[]).includes(effectType)) {
    return "retry";
  }
  if (effectType === "send_verification_code") return "manual_resend";
  return "unsupported";
}

export function retryDelaySeconds(attemptCount: number): number {
  const safeAttempt = Number.isFinite(attemptCount)
    ? Math.max(0, Math.min(6, Math.floor(attemptCount)))
    : 0;
  return Math.min(3_600, 60 * (2 ** safeAttempt));
}

export function canRetryEffect(
  effectType: string,
  attemptCount: number,
): boolean {
  return getEffectPolicy(effectType) === "retry" && attemptCount < 8;
}
