// Returns the Instagram OAuth URL with a signed state for the current user.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_ID = Deno.env.get('INSTAGRAM_APP_ID')!;
const APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://feed-bot-ai.lovable.app';

const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
].join(',');

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claims.claims.sub as string;

    const { data: quota } = await supabase.rpc('can_create_resource', {
      _user_id: userId,
      _resource: 'ig_account',
    });
    const quotaResult = quota as { allowed?: boolean; used?: number; limit?: number } | null;
    if (quotaResult && quotaResult.allowed === false) {
      return new Response(JSON.stringify({
        error: 'account_limit_reached',
        used: quotaResult.used,
        limit: quotaResult.limit,
        upgrade_url: `${APP_ORIGIN}/pricing`,
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ts = Date.now().toString();
    const payload = `${userId}.${ts}`;
    const sig = await hmac(payload, APP_SECRET);
    const state = `${payload}.${sig}`;

    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.searchParams.set('force_reauth', 'true');
    url.searchParams.set('client_id', APP_ID);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);

    return new Response(JSON.stringify({ url: url.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
