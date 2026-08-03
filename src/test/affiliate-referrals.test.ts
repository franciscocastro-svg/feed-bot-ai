import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeAffiliateReferralCode,
  readStoredAffiliateReferral,
  storeAffiliateReferralCode,
} from "@/lib/affiliateReferrals";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260802230000_affiliate_referrals.sql");
const authPage = read("src/pages/Auth.tsx");
const authContext = read("src/contexts/AuthContext.tsx");
const dashboard = read("src/pages/dashboard/Affiliates.tsx");
const admin = read("src/components/admin/AffiliateManager.tsx");
const layout = read("src/components/DashboardLayout.tsx");
const app = read("src/App.tsx");
const types = read("src/integrations/supabase/types.ts");

describe("affiliate referrals", () => {
  beforeEach(() => window.localStorage.clear());

  it("normalizes and stores only valid first-party referral codes", () => {
    expect(normalizeAffiliateReferralCode("  Parceiro-2026 ")).toBe("parceiro-2026");
    expect(normalizeAffiliateReferralCode("bad code")).toBeNull();
    expect(normalizeAffiliateReferralCode("abc")).toBeNull();
    expect(storeAffiliateReferralCode(" Parceiro_01 ")).toBe(true);
    expect(readStoredAffiliateReferral()?.code).toBe("parceiro_01");
  });

  it("keeps attribution private, immutable and one affiliate per referred user", () => {
    expect(migration).toContain("create table if not exists public.affiliate_accounts");
    expect(migration).toContain("create table if not exists public.affiliate_referrals");
    expect(migration).toContain("referred_user_id uuid not null unique");
    expect(migration).toContain("alter table public.affiliate_accounts enable row level security");
    expect(migration).toContain("alter table public.affiliate_referrals enable row level security");
    expect(migration).toContain("revoke all on table public.affiliate_accounts from public, anon, authenticated");
    expect(migration).toContain("revoke all on table public.affiliate_referrals from public, anon, authenticated");
    expect(migration).not.toContain("create policy");
  });

  it("allows only active codes, new registrations and no self-referral", () => {
    const claimStart = migration.indexOf("function public.claim_affiliate_referral");
    const dashboardStart = migration.indexOf("function public.get_my_affiliate_dashboard");
    const claim = migration.slice(claimStart, dashboardStart);

    expect(claim).toContain("account.status = 'active'");
    expect(claim).toContain("v_user_created_at < now() - interval '24 hours'");
    expect(claim).toContain("v_affiliate.user_id = v_user_id");
    expect(claim).toContain("already_attributed");
    expect(claim).toContain("registration_window_expired");
    expect(claim).toContain("perform pg_advisory_xact_lock");
  });

  it("limits affiliate activation to admins with customer permission", () => {
    const adminStart = migration.indexOf("function public.admin_set_affiliate");
    const claimStart = migration.indexOf("function public.claim_affiliate_referral");
    const adminRpc = migration.slice(adminStart, claimStart);

    expect(adminRpc).toContain("public.is_admin()");
    expect(adminRpc).toContain("public.admin_has_permission('users')");
    expect(adminRpc).toContain("referral_code_in_use");
    expect(adminRpc).toContain("status = 'paused'");
  });

  it("derives paid conversion without writing billing, plans or subscriptions", () => {
    expect(migration).toContain("subscription.environment = 'live'");
    expect(migration).toContain("subscription.status = 'active'");
    expect(migration).toContain("subscription.approval_status = 'approved'");
    expect(migration).toContain("subscription.access_frozen = false");
    expect(migration).not.toMatch(/(?:insert into|update|delete from) public\.user_subscriptions/i);
    expect(migration).not.toMatch(/(?:insert into|update|delete from) public\.plan_limits/i);
  });

  it("returns only aggregate data to the affiliate and keeps PII in the admin RPC", () => {
    const ownStart = migration.indexOf("function public.get_my_affiliate_dashboard");
    const adminStart = migration.indexOf("function public.admin_affiliate_overview");
    const ownRpc = migration.slice(ownStart, adminStart);

    expect(ownRpc).toContain("registered_count");
    expect(ownRpc).toContain("paid_active_count");
    expect(ownRpc).toContain("conversion_rate");
    expect(ownRpc).toContain("monthly_registrations");
    expect(ownRpc).not.toContain("users.email");
    expect(ownRpc).not.toContain("display_name");
  });

  it("captures the referral through password and OAuth authentication", () => {
    expect(authPage).toContain('searchParams.get("ref")');
    expect(authPage).toContain("storeAffiliateReferralCode");
    expect(authContext).toContain("claimStoredAffiliateReferral");
    expect(authContext).toContain("affiliateClaimUserId");
  });

  it("adds the private affiliate dashboard and admin manager without exposing them to everyone", () => {
    expect(app).toContain('<Route path="indicacoes" element={<Affiliates />} />');
    expect(layout).toContain('label: "Indicações"');
    expect(layout).toContain("isAffiliate ?");
    expect(layout).toContain('supabase.rpc("get_my_affiliate_dashboard")');
    expect(dashboard).toContain('supabase.rpc("get_my_affiliate_dashboard")');
    expect(dashboard).toContain("Dados pessoais e financeiros dos clientes indicados não são exibidos");
    expect(admin).toContain('supabase.rpc("admin_affiliate_overview")');
    expect(admin).toContain('supabase.rpc("admin_set_affiliate"');
  });

  it("keeps generated database contracts synchronized", () => {
    expect(types).toContain("affiliate_accounts:");
    expect(types).toContain("affiliate_referrals:");
    expect(types).toContain("admin_affiliate_overview:");
    expect(types).toContain("admin_set_affiliate:");
    expect(types).toContain("claim_affiliate_referral:");
    expect(types).toContain("get_my_affiliate_dashboard:");
  });
});
