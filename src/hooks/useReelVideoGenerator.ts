import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

function isManagedReelVideoUrl(url?: string | null, userId?: string | null, itemId?: string | null, contentType?: string | null) {
  if (contentType === "video_cut") return Boolean(url);
  if (!url || !userId || !itemId) return false;
  const clean = String(url).split("?")[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep raw url */ }
  const expectedPath = `${userId}/${itemId}.mp4`;
  return decoded.includes(`/post-images/${expectedPath}`) || decoded.endsWith(`/${expectedPath}`);
}

/**
 * Roda em background no dashboard: para cada post agendado, garante que a arte
 * editorial correta já está pronta:
 *  - Feed  -> composeAndUploadPost (1080x1080 com template, título, badge, etc.)
 *  - Story -> composeAndUploadStory (1080x1920 editorial)
 *  - Reel  -> composeAndUploadStory (capa 9:16) + imageToReelVideo (MP4 com áudio)
 *
 * Marca news_items.editorial_ready = true depois para o publish-scheduler saber
 * que pode publicar com segurança (e não adiar mais).
 */
export function useReelVideoGenerator() {
  const running = useRef(false);

  useEffect(() => {
    let stopped = false;

    async function tick() {
      if (running.current) return;
      running.current = true;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: pending } = await supabase
          .from("scheduled_posts")
          .select("id, media_type, instagram_account_id, news_item_id, news_items(*)")
          .eq("user_id", user.id)
          .eq("status", "scheduled")
          .limit(10);

        const todo = (pending || []).filter((p: any) => {
          const n = p.news_items;
          if (!n) return false;
          // Reels são gerados e validados exclusivamente pelo FFmpeg do VPS.
          // Cortes IA já chegam prontos e Reels de notícias entram na fila server-side.
          if (p.media_type === "reel") return false;
          // Não tenta compor se o AI rewrite ainda não terminou — evita
          // renderizar um Story/Reel sem título e sem resumo.
          if (!n.rewritten_title || !n.rewritten_summary) return false;
          if (n.editorial_ready) {
            // mesmo "ready", se o Reel não foi renderizado pelo Flux & Feed para esta notícia, gera o MP4.
            if (p.media_type === "reel" && !isManagedReelVideoUrl(n.generated_video_url, n.user_id || user.id, n.id, n.content_type)) return true;
            return false;
          }
          return true;
        });
        if (!todo.length) return;

        const { data: settings } = await supabase
          .from("user_settings")
          .select("reel_audio_url")
          .eq("user_id", user.id)
          .maybeSingle();
        const fallbackAudio = settings?.reel_audio_url || null;

        for (const p of todo) {
          if (stopped) return;
          const post = p as any;
          const accountId = post.instagram_account_id || post.news_items?.instagram_account_id || null;
          const news = { ...post.news_items, instagram_account_id: accountId };
          const mediaType = (p as any).media_type as "feed" | "reel" | "story";
          try {
            if (accountId && post.news_items?.id && post.news_items.instagram_account_id !== accountId) {
              await supabase
                .from("news_items")
                .update({ instagram_account_id: accountId })
                .eq("id", post.news_items.id);
            }
            if (mediaType === "feed") {
              const { composeAndUploadPost } = await import("@/lib/composePostCanvas");
              await composeAndUploadPost(news);
              await supabase.from("news_items").update({ editorial_ready: true }).eq("id", news.id);
            } else if (mediaType === "story") {
              const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
              await composeAndUploadStory(news);
              await supabase.from("news_items").update({ editorial_ready: true }).eq("id", news.id);
            } else if (mediaType === "reel") {
              // 1) sempre recompõe a capa editorial 9:16 para respeitar o template atual da conta.
              const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
              const sourceUrl = await composeAndUploadStory(news, { withFollowCta: true });
              // 2) MP4
              if (!isManagedReelVideoUrl(news.generated_video_url, user.id, news.id, news.content_type) && sourceUrl) {
                const { imageToReelVideo, STANDARD_NEWS_REEL_DURATION_SECONDS } = await import("@/lib/imageToVideo");
                let accountAudio = null;
                if (accountId) {
                  const { data: effective } = await supabase.rpc("get_effective_account_settings", { _account_id: accountId });
                  accountAudio = (effective as any)?.reel_audio_url || null;
                }
                const audioUrl = news.chosen_audio_url || accountAudio || fallbackAudio;
                const blob = await imageToReelVideo(sourceUrl, STANDARD_NEWS_REEL_DURATION_SECONDS, audioUrl);
                if (!(blob.type || "").includes("mp4")) {
                  console.warn("[reel-bg] navegador não gera mp4, pulando", news.id);
                  continue;
                }
                const path = `${user.id}/${news.id}.mp4`;
                const { error } = await supabase.storage.from("post-images")
                  .upload(path, blob, { contentType: "video/mp4", upsert: true });
                if (error) throw error;
                const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
                await supabase.from("news_items")
                  .update({ generated_video_url: pub.publicUrl, editorial_ready: true })
                  .eq("id", news.id);
              } else {
                await supabase.from("news_items").update({ editorial_ready: true }).eq("id", news.id);
              }
            }
          } catch (e) {
            console.error("editorial gen failed", news.id, mediaType, e);
          }
        }
      } finally {
        running.current = false;
      }
    }

    tick();
    const interval = setInterval(tick, 20_000);
    return () => { stopped = true; clearInterval(interval); };
  }, []);
}
