# Melhorias nos Cortes IA

## 1. Legendas via Gemini (substitui Groq)

**Problema:** Groq falhou em alguns vídeos → clips sem legenda.

**Solução:** trocar a transcrição pra **Gemini 2.5 Flash** via Lovable AI Gateway (mesma API que já paga as legendas das notícias). Áudio do clip é enviado como `audio/mp3` (multimodal) pedindo transcrição palavra-por-palavra com timestamps em JSON estruturado.

- `worker/index.js` → nova função `transcribeClipGemini(audioPath)` que faz POST em `https://ai.gateway.lovable.dev/v1/chat/completions` com header `Lovable-API-Key: $LOVABLE_API_KEY`.
- Retry 3x com backoff (2s, 5s, 10s).
- Se falhar mesmo assim, marca `clip.subtitle_error = true` e continua sem legenda (não trava o job).
- Remove dependência de `GROQ_API_KEY` do worker.

## 2. Detecção de momentos virais (3 melhorias combinadas)

### 2a. Prompt Gemini reforçado
Reescrever prompt de análise pra priorizar: **gancho nos primeiros 3s**, picos emocionais, frases de impacto, cliffhangers, revelações, números/dados marcantes. Custo zero extra.

### 2b. Análise de energia de áudio
Antes de mandar pro Gemini, `ffmpeg astats` mede volume RMS em janelas de 5s. Manda pro Gemini um array `[{time, energy}]` junto com a transcrição, e o prompt pede pra confirmar momentos coincidentes de fala intensa. +~$0.005/vídeo.

### 2c. Score de viralidade visível
Gemini devolve pra cada corte:
- `hook_score` (0-100)
- `emotion_score` (0-100)
- `clarity_score` (0-100)
- `viral_score` (média ponderada: 50% hook, 30% emoção, 20% clareza)

UI mostra badge colorido em cada clip (vermelho <50, amarelo 50-75, verde >75) + tooltip com breakdown.

## 3. Hook chamativo automático (opcional)

Toggle **"Adicionar hook chamativo"** na criação do job (default: on).

- Gemini gera, junto com a análise viral, um `hook_text` curto (max 6 palavras, tipo "VOCÊ NÃO VAI ACREDITAR", "OLHA ISSO", "3 COISAS QUE MUDAM TUDO").
- Renderizado no `.ass` como texto GRANDE (tamanho 3x da legenda normal), com fundo colorido, no terço superior do vídeo, durante os primeiros 3s do corte, com animação de fade-in + bounce.
- Se toggle off, `hook_text` fica NULL e não renderiza.

Nova coluna: `video_cut_jobs.hook_enabled` (bool), `video_cut_clips.hook_text` (text).

## 4. Multi-formato (cliente escolhe 1+)

UI: 3 checkboxes na criação do job — **Reels 9:16**, **Feed 1:1**, **Feed 4:5**. Mínimo 1.

- Nova coluna `video_cut_jobs.formats` (text[]) substituindo `format` singular (mantém compat: se `formats` NULL, usa `format`).
- Worker renderiza cada corte nos formatos escolhidos. Cada formato = 1 clip em `video_cut_clips` (com `format` próprio) e conta como 1 no limite diário.
- Ex.: 3 cortes × 2 formatos = 6 clips gerados = 6 do limite.
- RPC `create_video_cut_*_job` valida cota já multiplicada.

## Arquivos afetados

- **Migration:** colunas novas + atualização das 4 RPCs `create_video_cut_*` pra aceitar `_formats text[]`, `_hook_enabled bool`.
- **`worker/index.js`:** nova `transcribeClipGemini`, `analyzeAudioEnergy`, prompt viral novo, `hook_text` no `.ass`, loop de render por formato. Remove código Groq.
- **`worker/subtitleStyles.js`:** adicionar estilo `Hook` (grande, com fundo).
- **`src/pages/dashboard/Cuts.tsx`:** checkboxes de formato, toggle hook, badge de viral_score em cada clip, remove select single-format.
- **`src/lib/videoCuts.ts` + testes:** helper `computeViralBadgeColor(score)`, ajuste de cálculo de cota para multi-formato.

## Deploy no VPS depois

1. `git pull` no `~/feed-bot-worker`
2. Remover `GROQ_API_KEY` do `.env` (não é mais usado)
3. Confirmar que `LOVABLE_API_KEY` já está no `.env` (é o mesmo das notícias)
4. `pm2 restart feed-bot-worker`

## Custo por vídeo de 10min

- Gemini análise viral + hook: ~$0.03
- Gemini transcrição de 3 clips: ~$0.015
- Gemini caption: ~$0.001
- Se cliente escolher 2 formatos: só duplica render (ffmpeg local, zero custo IA)
- **Total: ~$0.05/vídeo** (era ~$0.025 antes)

## Ordem de implementação neste chat

1. Migration (colunas + RPCs)
2. `worker/index.js` + `subtitleStyles.js`
3. `Cuts.tsx` (checkboxes, toggle, badge de score)
4. Testes atualizados
5. Instruções finais VPS

## Riscos

- Gemini com áudio grande (>10min) pode dar timeout — worker corta o áudio ANTES de transcrever (só o trecho do clip, não vídeo inteiro).
- Multi-formato quadruplica tempo de render — limitar máximo a 3 formatos por job.
- Hook automático pode ficar cafona — usuário pode desligar toggle a qualquer momento.

Confirma que posso implementar tudo isso?
