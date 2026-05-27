import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
          .select("id, media_type, news_item_id, news_items(*)")
          .eq("user_id", user.id)
          .eq("status", "scheduled")
          .limit(10);

        const todo = (pending || []).filter((p: any) => {
          const n = p.news_items;
          if (!n) return false;
          // Não tenta compor se o AI rewrite ainda não terminou — evita
          // renderizar um Story/Reel sem título e sem resumo.
          if (!n.rewritten_title || !n.rewritten_summary) return false;
          if (n.editorial_ready) {
            // mesmo "ready", se for reel sem vídeo ainda, precisamos gerar o MP4
            if (p.media_type === "reel" && !n.generated_video_url) return true;
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
          const news = (p as any).news_items;
          const mediaType = (p as any).media_type as "feed" | "reel" | "story";
          try {
            if (mediaType === "feed") {
              const { composeAndUploadPost } = await import("@/lib/composePostCanvas");
              await composeAndUploadPost(news);
              await supabase.from("news_items").update({ editorial_ready: true }).eq("id", news.id);
            } else if (mediaType === "story") {
              const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
              await composeAndUploadStory(news);
              await supabase.from("news_items").update({ editorial_ready: true }).eq("id", news.id);
            } else if (mediaType === "reel") {
              // 1) capa editorial 9:16
              let sourceUrl = news.generated_cover_url;
              if (!sourceUrl) {
                const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
                sourceUrl = await composeAndUploadStory(news, { withFollowCta: true });
              }
              // 2) MP4
              if (!news.generated_video_url && sourceUrl) {
                const { imageToReelVideo } = await import("@/lib/imageToVideo");
                const audioUrl = news.chosen_audio_url || fallbackAudio;
                const blob = await imageToReelVideo(sourceUrl, 6, audioUrl);
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
