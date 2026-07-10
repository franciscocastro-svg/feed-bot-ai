// Meta calls this when a user requests deletion of their data.
// Must respond with confirmation_code + status URL.
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://fluxifeed.com';

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

function confirmationCode(): string {
  return `del_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function removeStoragePaths(admin: any, bucket: string, paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  for (let index = 0; index < unique.length; index += 100) {
    const { error } = await admin.storage.from(bucket).remove(unique.slice(index, index + 100));
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const form = await req.formData();
    const signed = String(form.get('signed_request') ?? '');
    const data = await parseSignedRequest(signed);
    if (!data?.user_id) return new Response(JSON.stringify({ ok: false }), { status: 400 });

    const igUserId = String(data.user_id);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: accounts, error: accountError } = await admin
      .from('instagram_accounts')
      .select('id,user_id')
      .eq('ig_user_id', igUserId);
    if (accountError) throw accountError;

    const accountIds = (accounts || []).map((account: any) => account.id);
    let jobs: any[] = [];
    let clips: any[] = [];
    let news: any[] = [];
    if (accountIds.length > 0) {
      const [{ data: jobRows }, { data: newsRows }] = await Promise.all([
        admin.from('video_cut_jobs')
          .select('id,user_id,source_storage_bucket,source_storage_path')
          .in('instagram_account_id', accountIds),
        admin.from('news_items').select('id,user_id').in('instagram_account_id', accountIds),
      ]);
      jobs = jobRows || [];
      news = newsRows || [];
      const jobIds = jobs.map((job: any) => job.id);
      if (jobIds.length > 0) {
        const { data: clipRows } = await admin.from('video_cut_clips').select('id,user_id').in('job_id', jobIds);
        clips = clipRows || [];
      }
    }

    const code = confirmationCode();
    const { error: deleteError } = await admin.rpc('delete_instagram_account_data', {
      _meta_user_id: igUserId,
      _confirmation_code: code,
    });
    if (deleteError) throw deleteError;

    const storageWarnings: string[] = [];
    try {
      await removeStoragePaths(admin, 'video-cut-inputs', jobs
        .filter((job: any) => (job.source_storage_bucket || 'video-cut-inputs') === 'video-cut-inputs')
        .map((job: any) => job.source_storage_path));
    } catch (error) {
      storageWarnings.push(`private-inputs: ${(error as Error).message}`);
    }
    try {
      const postPaths = [
        ...clips.flatMap((clip: any) => [
          `${clip.user_id}/cuts/${clip.id}.mp4`,
          `${clip.user_id}/cuts/${clip.id}.jpg`,
        ]),
        ...news.flatMap((item: any) => [
          `${item.user_id}/${item.id}_raw.jpg`,
          `${item.user_id}/${item.id}_raw.png`,
          `${item.user_id}/${item.id}_editorial.png`,
          `${item.user_id}/${item.id}_reel_cover.png`,
          `${item.user_id}/${item.id}.mp4`,
          `${item.user_id}/${item.id}.jpg`,
          `${item.user_id}/${item.id}.png`,
        ]),
      ];
      await removeStoragePaths(admin, 'post-images', postPaths);
    } catch (error) {
      storageWarnings.push(`generated-assets: ${(error as Error).message}`);
    }
    if (storageWarnings.length > 0) {
      console.warn('data-deletion storage cleanup warnings', storageWarnings);
      await admin.from('data_deletion_requests')
        .update({ details: { storage_warnings: storageWarnings } })
        .eq('confirmation_code', code);
    }

    return new Response(JSON.stringify({
      url: `${APP_ORIGIN}/data-deletion?code=${code}`,
      confirmation_code: code,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('data-deletion error', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500 });
  }
});
