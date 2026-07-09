# Cortes IA — Legenda animada, edição inteligente e auto-postagem

Ordem: **Pacote A → C → B** (visual impact primeiro, depois automação, depois polimento).

---

## Pacote A — Legenda animada estilo TikTok

**Objetivo:** cada corte sai com legenda palavra-por-palavra queimada, destacando a palavra falada no momento.

1. **Transcrição via Whisper (Groq)**
   - Nova secret `GROQ_API_KEY` no worker (Groq roda `whisper-large-v3` a ~$0.02/hora — 3x mais barato que OpenAI).
   - Worker chama Groq **depois** do ffmpeg cortar o trecho (transcreve só o clip, não o vídeo inteiro).
   - Resposta com `word-level timestamps` (formato `verbose_json`).

2. **Renderização da legenda no ffmpeg**
   - Gerar arquivo `.ass` (Advanced SubStation) com uma linha por palavra, cada uma com fade-in/highlight no timestamp exato.
   - Filtro `ass=legenda.ass` no ffmpeg junto do overlay atual.
   - 3 templates de estilo salvos em `worker/subtitleStyles.js`:
     - **Classic**: branco + contorno preto grosso
     - **Neon**: amarelo brilhante, palavra ativa em vermelho
     - **Karaokê**: branco → verde progressivo

3. **UI (Cuts.tsx)**
   - Dropdown "Estilo da legenda" (Nenhum / Classic / Neon / Karaokê) no painel de criação.
   - Nova coluna `subtitle_style` em `video_cut_jobs` e `video_cut_clips` (default `classic`).

4. **Posicionamento por formato**
   - Reels 9:16: legenda centralizada, 60% da altura
   - Feed 1:1: legenda em baixo, dentro do safe-zone
   - Feed 4:5: legenda em baixo, safe-zone maior

---

## Pacote C — Auto-postagem no Instagram

**Objetivo:** corte aprovado (ou auto-aprovado) vira post agendado sem clique.

1. **Nova coluna `auto_publish` em `video_cut_jobs`** (boolean, default false).
2. **UI**: toggle "Publicar automaticamente sem revisão" na criação do job (só habilita pro plano Pro).
3. **Geração de caption com IA**
   - Nova função no worker: `generateCutCaption(clip, userSettings)` usando Gemini.
   - Injeta `brand_name`, `ai_tone`, `default_niche` do `user_settings`.
   - Devolve: caption (280 chars) + 8 hashtags relevantes.
4. **Enfileirar em `scheduled_posts`**
   - Quando `clip.status = 'ready'` E (`auto_publish = true` OU usuário clicar "Aprovar"):
     - Trigger no worker (ou edge function `approve-cut`) cria row em `scheduled_posts` com:
       - `media_type = 'reel'`
       - `generated_video_url = clip.video_url`
       - `caption`, `hashtags`
       - `scheduled_for = now() + 10min` (dá tempo do usuário cancelar)
5. **Botão "Aprovar e agendar"** no painel de cortes (já existe "Aprovar" — só passar a agendar).

---

## Pacote B — Edição inteligente

**Objetivo:** o vídeo entregue parece feito por editor humano.

1. **Normalização de áudio**
   - Adicionar `loudnorm=I=-16:TP=-1.5:LRA=11` no filtro de áudio do ffmpeg.
   - Zero custo, resultado imediato.

2. **Remoção de silêncios**
   - `ffmpeg silencedetect` roda antes do corte final, identifica pausas > 0.7s.
   - Segundo pass com `-filter_complex` remove os trechos silenciosos.
   - Flag opcional na UI: "Aperto de ritmo" (on/off, default on).

3. **Smart-crop 9:16**
   - `ffmpeg cropdetect` no clip cortado → detecta região com mais movimento/rosto.
   - Aplica `crop=ih*9/16:ih:x=<centro_detectado>` em vez de crop cego no centro.
   - Fallback: se cropdetect falhar, usa centro (comportamento atual).

4. **Zoom sutil (Ken Burns opcional)**
   - Flag "Efeito de zoom" na UI (default off).
   - Filtro `zoompan=z='min(zoom+0.0005,1.05)':d=1` — 5% de zoom lento ao longo do corte.

---

## Detalhes técnicos

**Arquivos afetados:**
- `worker/index.js`: novas funções `transcribeClipGroq()`, `generateAssSubtitles()`, `generateCutCaption()`, `applySilenceRemoval()`, `applySmartCrop()`.
- `worker/subtitleStyles.js` (novo).
- `worker/package.json`: nenhuma dep nova (Groq via fetch, .ass é texto puro).
- `src/pages/dashboard/Cuts.tsx`: dropdowns Estilo/Auto-publicar/Aperto/Zoom.
- `supabase/migrations/`: 1 migration adicionando `subtitle_style`, `auto_publish`, `smart_crop`, `remove_silences`, `zoom_effect` em `video_cut_jobs` e propagando `subtitle_style` pra `video_cut_clips`.
- `supabase/functions/approve-cut/` (nova edge function): enfileira em `scheduled_posts` quando corte aprovado.

**Secrets:**
- `GROQ_API_KEY` — o usuário precisa criar em https://console.groq.com/keys e colar via `add_secret` (será usado tanto pela edge function `approve-cut` quanto propagado pro `.env` do VPS).

**Custo por vídeo de 10min:**
- Gemini análise: ~$0.02
- Groq Whisper: ~$0.003 (10min = 0.16h × $0.02)
- Gemini caption: ~$0.001
- **Total: ~$0.025/vídeo**

**Ação no VPS depois do deploy:**
1. `git pull` no `~/feed-bot-worker`
2. Adicionar `GROQ_API_KEY` no `.env` do VPS
3. `pm2 restart feed-bot-worker`

**Ordem de implementação neste chat:**
1. Migration (colunas novas)
2. `worker/index.js` + `worker/subtitleStyles.js` (Pacote A + B + geração de caption)
3. Edge function `approve-cut` (Pacote C)
4. `Cuts.tsx` (todos os controles novos)
5. Instruções finais pro usuário fazer no VPS

**Riscos:**
- Groq às vezes tem fila — worker precisa retry com backoff (2 tentativas).
- `.ass` mal formado quebra ffmpeg — validar timestamps antes de escrever.
- Auto-publicar sem revisão é feature perigosa: deixar **opt-in explícito** com aviso claro.
