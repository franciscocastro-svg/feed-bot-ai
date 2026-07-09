# Plano — Cortes IA (3 fases)

Feature já está 90% construída (UI + DB + worker VPS). Nunca rodou em produção — zero jobs criados. Plano é destravar, depois evoluir.

---

## 📦 Fase 1 — Fazer funcionar de ponta a ponta (infra + destravar)

**Objetivo:** um cliente cola link do YouTube (ou envia MP4), recebe cortes prontos pra revisar.

1. **Confirmar worker VPS ativo**
   - Rodar `pm2 status feed-bot-worker` no VPS.
   - Se caiu: `pm2 restart feed-bot-worker`.
   - Confirmar `ffmpeg -version`, `ffprobe -version`, `yt-dlp --version`.

2. **Atualizar yt-dlp** (crítico — YouTube bloqueia versões antigas com "sign in to confirm you're not a bot")
   - `yt-dlp -U` ou reinstalar via pip.
   - Adicionar cron semanal pra atualizar sozinho.

3. **Validar `GEMINI_API_KEY` no worker** — a chave que o worker usa pra escolher os cortes precisa estar no `.env` do VPS e ser válida (a do process-news está funcionando, então provavelmente é a mesma).

4. **Testar 2 jobs reais** (eu monitoro pelo banco):
   - Um vídeo público de 5min do YouTube.
   - Um MP4 curto via upload.
   - Verificar se `video_cut_clips` populam com `video_url` e `thumbnail_url`.

5. **Liberar rota `/dashboard/cuts` pra beta-testers** — hoje é admin-only (`ADMIN_ONLY_PATHS`). Adicionar 2-3 user_ids no `BETA_USER_IDS` de `src/config/featureFlags.ts`.

6. **Tratar erro "YouTube bloqueou"** — melhorar mensagem no UI e sugerir upload direto do MP4 como fallback (já existe parcialmente).

**Entrega:** Cortes IA gerando clipes reais pra beta-testers.

---

## 🎬 Fase 2 — Qualidade dos cortes (o vídeo entregue fica bom)

**Objetivo:** o corte entregue parece feito por editor humano, não por bot.

1. **Crop vertical 9:16 automático** — hoje ffmpeg só corta no tempo, mantém formato original. Adicionar `crop=ih*9/16:ih` + smart-crop pra centralizar rosto/ação (via ffmpeg `cropdetect` ou análise Gemini de bounding box).

2. **Legendas queimadas no vídeo (subtitles)** — usar Whisper (ou Groq/Gemini transcription) pra transcrever o áudio do corte e queimar legendas estilizadas com ffmpeg `subtitles` filter. Diferencial vs concorrência.

3. **Thumbnail com template da marca** — hoje thumbnail é frame cru. Compor 9:16 com template do cliente (mesma lógica do `composeStoryCanvas`), logo, gancho.

4. **Legenda/hashtags no tom da marca** — prompt do Gemini hoje é genérico. Injetar `brand_name`, `ai_tone`, `default_niche` da `user_settings` no prompt de análise.

5. **Áudio original preservado com boost** — normalizar volume (`ffmpeg loudnorm`) pra corte não sair mudo/estourado.

**Entrega:** cortes prontos pra publicar sem edição manual.

---

## 🧠 Fase 3 — IA de seleção mais inteligente

**Objetivo:** escolher os *melhores* momentos, não apenas trechos válidos.

1. **Score de retenção/gancho** — prompt do Gemini devolve `score` (0-100) por corte baseado em: presença de gancho verbal, mudança de tom, momento emocional. Hoje devolve mas nada usa — expor no UI e ordenar.

2. **Detecção de silêncios/pausas** — ffmpeg `silencedetect` pra cortar entradas/saídas mortas automaticamente (aparo dos 0.5s inicial/final).

3. **Priorizar cortes com fala forte** — analisar transcript + volume RMS pra evitar cortes onde só tem música/silêncio.

4. **Multi-idioma** — detectar idioma do vídeo e gerar legenda no idioma do cliente (usa `translation_enabled` do plano).

5. **Aprender do histórico** — cortes aprovados vs descartados alimentam prompt (few-shot) pra próximas análises daquele cliente.

**Entrega:** taxa de aprovação de cortes > 70% (cliente aprova a maioria dos que a IA sugeriu).

---

## 🔧 Detalhes técnicos

- **Arquivos afetados por fase:**
  - Fase 1: nenhum código no repo (só ops no VPS) + `src/config/featureFlags.ts` (liberar rota).
  - Fase 2: `worker/index.js` (funções `generateVideoCutClip`, `writeCutOverlayPng`, `analyzeYoutubeForCuts`).
  - Fase 3: `worker/index.js` (prompt do Gemini, novos steps ffmpeg) + schema `video_cut_clips` (adicionar coluna `score`).
- **Sem migrations na Fase 1 e 2.** Fase 3 adiciona 1 coluna.
- **Custo:** Fase 2 adiciona chamadas Whisper/transcrição — ~$0.006/min de vídeo. Cabe no plano pago.
- **Riscos:** yt-dlp é o ponto mais frágil. Se YouTube apertar de vez, sobra só o fluxo de upload MP4.

---

## ⏱️ Ordem sugerida
Fase 1 primeiro (1-2 dias) pra você já ter clientes usando. Fase 2 e 3 podem rodar em paralelo depois.

Quer que eu comece pela Fase 1 (rodar o teste ponta a ponta + liberar pra beta)?
