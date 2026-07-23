// Receives Instagram OAuth callback, exchanges code for long-lived token, saves account.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  exchangeLongLivedInstagramToken,
  instagramOAuthRedirect,
  publicInstagramOAuthError,
} from '../_shared/instagram-oauth.ts';

const APP_ID = Deno.env.get('INSTAGRAM_APP_ID')!;
const APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`;
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://fluxifeed.com';

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAuthorizationCodeAlreadyUsed(data: any): boolean {
  const message = String(data?.error_message || data?.error?.message || '').toLowerCase();
  return message.includes('authorization code has been used');
}

async function findRecentlyConnectedAccount(admin: any, userId: string, stateTimestamp: string) {
  const stateMs = Number(stateTimestamp);
  const sinceMs = Number.isFinite(stateMs) ? Math.max(stateMs - 30_000, Date.now() - 5 * 60_000) : Date.now() - 5 * 60_000;
  const since = new Date(sinceMs).toISOString();
  const { data } = await admin
    .from('instagram_accounts')
    .select('username, created_at, updated_at')
    .eq('user_id', userId)
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function canInsertInstagramAccount(admin: any, userId: string): Promise<boolean> {
  const { count } = await admin
    .from('instagram_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('active', true);

  const { data: sub } = await admin
    .from('user_subscriptions')
    .select('plan, status, created_at, current_period_end, expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let plan = sub?.plan || 'free';
  const periodEnd = sub?.current_period_end || sub?.expires_at;
  if (
    (plan === 'free' && sub?.created_at && new Date(sub.created_at).getTime() < Date.now() - 7 * 86400000) ||
    (plan !== 'free' && periodEnd && new Date(periodEnd).getTime() < Date.now()) ||
    (plan !== 'free' && ['canceled', 'unpaid', 'incomplete_expired'].includes(String(sub?.status || '')))
  ) {
    plan = 'expired';
  }

  const { data: limits } = await admin
    .from('plan_limits')
    .select('max_ig_accounts')
    .eq('plan', plan)
    .maybeSingle();

  const maxAccounts = limits?.max_ig_accounts ?? 0;
  return maxAccounts < 0 || (count || 0) < maxAccounts;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return instagramOAuthRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=error&reason=authorization_denied`);
  }
  if (!code || !state) {
    return instagramOAuthRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=error&reason=missing_params`);
  }

  try {
    // 1. Validate state
    const parts = state.split('.');
    if (parts.length !== 3) throw new Error('invalid_state');
    const [userId, ts, sig] = parts;
    const expected = await hmac(`${userId}.${ts}`, APP_SECRET);
    if (sig !== expected) throw new Error('state_signature_mismatch');
    if (Date.now() - parseInt(ts, 10) > STATE_MAX_AGE_MS) throw new Error('state_expired');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2. Exchange code -> short-lived access token
    const form = new FormData();
    form.append('client_id', APP_ID);
    form.append('client_secret', APP_SECRET);
    form.append('grant_type', 'authorization_code');
    form.append('redirect_uri', REDIRECT_URI);
    form.append('code', code);

    const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: form,
    });
    const shortData = await shortRes.json();
    if (!shortRes.ok || !shortData.access_token) {
      console.error('short token error', shortData);
      if (isAuthorizationCodeAlreadyUsed(shortData)) {
        const recent = await findRecentlyConnectedAccount(admin, userId, ts);
        if (recent?.username) {
          return instagramOAuthRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=connected&u=${encodeURIComponent(recent.username)}`);
        }
        throw new Error('authorization_code_already_used');
      }
      throw new Error('short_token_failed');
    }
    const shortToken = shortData.access_token as string;
    const igUserId = String(shortData.user_id ?? '');

    // 3. Exchange short -> long-lived (60 days).
    // Instagram currently accepts GET for this exchange. A narrowly-scoped POST
    // fallback keeps compatibility if Meta explicitly rejects the GET method.
    const { accessToken: longToken, expiresIn } = await exchangeLongLivedInstagramToken(
      shortToken,
      APP_SECRET,
    );
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 4. Get IG user info
    const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username,user_id&access_token=${encodeURIComponent(longToken)}`);
    const me = await meRes.json();
    const username = (me.username as string) || `ig_${igUserId}`;
    const finalIgUserId = String(me.user_id ?? me.id ?? igUserId);

    // 5. Upsert into instagram_accounts
    const { data: existing } = await admin
      .from('instagram_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('ig_user_id', finalIgUserId)
      .maybeSingle();

    if (existing?.id) {
      await admin.from('instagram_accounts').update({
        username,
        access_token: longToken,
        token_expires_at: expiresAt,
        active: true,
        verification_status: 'pending',
      }).eq('id', existing.id);
    } else {
      if (!(await canInsertInstagramAccount(admin, userId))) {
        throw new Error('account_limit_reached');
      }

      await admin.from('instagram_accounts').insert({
        user_id: userId,
        username,
        ig_user_id: finalIgUserId,
        access_token: longToken,
        token_expires_at: expiresAt,
        active: true,
      });
    }

    return instagramOAuthRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=connected&u=${encodeURIComponent(username)}`);
  } catch (e) {
    const reason = publicInstagramOAuthError(e);
    console.error('callback error', {
      reason,
      diagnostic: e && typeof e === 'object' && 'diagnostic' in e
        ? (e as { diagnostic: unknown }).diagnostic
        : undefined,
    });
    return instagramOAuthRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=error&reason=${encodeURIComponent(reason)}`);
  }
});
