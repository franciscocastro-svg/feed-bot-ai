// Receives Instagram OAuth callback, exchanges code for long-lived token, saves account.
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_ID = Deno.env.get('INSTAGRAM_APP_ID')!;
const APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`;
const APP_ORIGIN = 'https://feed-bot-ai.lovable.app';

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

function htmlRedirect(target: string, message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${message}</title><meta http-equiv="refresh" content="0;url=${target}"><p>${message} <a href="${target}">Continuar</a></p>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return htmlRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=error&reason=${encodeURIComponent(errParam)}`, 'Falha na autorização');
  }
  if (!code || !state) {
    return htmlRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=error&reason=missing_params`, 'Parâmetros ausentes');
  }

  try {
    // 1. Validate state
    const parts = state.split('.');
    if (parts.length !== 3) throw new Error('invalid_state');
    const [userId, ts, sig] = parts;
    const expected = await hmac(`${userId}.${ts}`, APP_SECRET);
    if (sig !== expected) throw new Error('state_signature_mismatch');
    if (Date.now() - parseInt(ts, 10) > STATE_MAX_AGE_MS) throw new Error('state_expired');

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
      throw new Error(`short_token_failed: ${JSON.stringify(shortData)}`);
    }
    const shortToken = shortData.access_token as string;
    const igUserId = String(shortData.user_id ?? '');

    // 3. Exchange short -> long-lived (60 days)
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', APP_SECRET);
    longUrl.searchParams.set('access_token', shortToken);
    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (!longRes.ok || !longData.access_token) {
      console.error('long token error', longData);
      throw new Error(`long_token_failed: ${JSON.stringify(longData)}`);
    }
    const longToken = longData.access_token as string;
    const expiresIn = (longData.expires_in as number) ?? 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 4. Get IG user info
    const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username,user_id&access_token=${encodeURIComponent(longToken)}`);
    const me = await meRes.json();
    const username = (me.username as string) || `ig_${igUserId}`;
    const finalIgUserId = String(me.user_id ?? me.id ?? igUserId);

    // 5. Upsert into instagram_accounts
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
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
      await admin.from('instagram_accounts').insert({
        user_id: userId,
        username,
        ig_user_id: finalIgUserId,
        access_token: longToken,
        token_expires_at: expiresAt,
        active: true,
      });
    }

    return htmlRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=connected&u=${encodeURIComponent(username)}`, `Conta @${username} conectada!`);
  } catch (e) {
    console.error('callback error', e);
    return htmlRedirect(`${APP_ORIGIN}/dashboard/accounts?ig=error&reason=${encodeURIComponent((e as Error).message)}`, 'Erro ao conectar');
  }
});
