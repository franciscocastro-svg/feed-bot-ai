import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "fluxfeed.pendingAffiliateReferral";
const MAX_REFERRAL_AGE_MS = 24 * 60 * 60 * 1000;
const REFERRAL_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{5,31}$/;

type StoredReferral = {
  code: string;
  capturedAt: number;
};

export type AffiliateClaimStatus =
  | "claimed"
  | "already_attributed"
  | "registration_window_expired"
  | "invalid_or_inactive"
  | "self_referral";

const terminalClaimStatuses = new Set<AffiliateClaimStatus>([
  "claimed",
  "already_attributed",
  "registration_window_expired",
  "invalid_or_inactive",
  "self_referral",
]);

export function normalizeAffiliateReferralCode(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}
export function storeAffiliateReferralCode(value: string | null | undefined) {
  if (typeof window === "undefined") return false;
  const code = normalizeAffiliateReferralCode(value);
  if (!code) return false;

  const payload: StoredReferral = { code, capturedAt: Date.now() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return true;
}

export function readStoredAffiliateReferral(): StoredReferral | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredReferral>;
    const code = normalizeAffiliateReferralCode(parsed.code);
    const capturedAt = Number(parsed.capturedAt);
    if (!code || !Number.isFinite(capturedAt) || Date.now() - capturedAt > MAX_REFERRAL_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { code, capturedAt };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export async function claimStoredAffiliateReferral() {
  const stored = readStoredAffiliateReferral();
  if (!stored) return null;

  const { data, error } = await supabase.rpc("claim_affiliate_referral", {
    _referral_code: stored.code,
  });
  if (error) throw error;

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as { status?: AffiliateClaimStatus }
    : null;
  const status = result?.status;
  if (status && terminalClaimStatuses.has(status)) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return result || null;
}
