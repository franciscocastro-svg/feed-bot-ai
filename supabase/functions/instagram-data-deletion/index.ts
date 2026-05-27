// Meta calls this when a user requests deletion of their data.
// Must respond with confirmation_code + status URL.
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ORIGIN = 'https://feed-bot-ai.lovable.app';

function b64urlDecode(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function parseSignedRequest(signed: string): Promise<{ user_id?: string } | null> {
  const [encSig, encPayload] = signed.split('.');
  if (!encSig || !encPayload) return null;
  const sigBytes = b64urlDecode(encSig);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(encPayload));
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(b64urlDecode(encPayload)));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const form = await req.formData();
    const signed = String(form.get('signed_request') ?? '');
    const data = await parseSignedRequest(signed);
    if (!data?.user_id) return new Response(JSON.stringify({ ok: false }), { status: 400 });

    const igUserId = String(data.user_id);
    const confirmationCode = `del_${igUserId}_${Date.now()}`;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    await admin.from('instagram_accounts').delete().eq('ig_user_id', igUserId);

    return new Response(JSON.stringify({
      url: `${APP_ORIGIN}/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('data-deletion error', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500 });
  }
});
