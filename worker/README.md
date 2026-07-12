# 🚀 Guia de Setup do Worker de Mídia no VPS — feed-bot-ai

Este worker Node.js automatiza a geração de imagens de Posts, Stories e vídeos Reels (MP4) diretamente no VPS, rodando 24/7 de forma 100% autônoma. Ele substitui a necessidade de manter o navegador aberto no painel administrativo para que o autopilot funcione.

---

## 🛠️ Requisitos no VPS

Antes de rodar o worker, certifique-se de que seu VPS (Linux Ubuntu/Debian ou similar) tem os seguintes softwares instalados:

1. **Node.js (v18 ou superior)** e **npm**
2. **FFmpeg** (utilizado para compilar os vídeos MP4 com trilha sonora)

### Como instalar os requisitos no Ubuntu/Debian:
```bash
# Atualizar lista de pacotes
sudo apt update

# Instalar FFmpeg
sudo apt install -y ffmpeg

# Verificar se o ffmpeg foi instalado com sucesso
ffmpeg -version
```

---

## 📦 Instalação e Configuração

1. **Navegue até o diretório do worker no VPS:**
   ```bash
   cd feed-bot-ai/worker
   ```

2. **Instale as dependências do Node.js:**
   ```bash
   npm install
   ```
   *Nota: O `@napi-rs/canvas` utiliza Skia compilado em Rust de forma nativa, dispensando a instalação de compiladores extras ou bibliotecas gráficas pesadas (como Cairo).*

3. **Configure as Variáveis de Ambiente:**
   Crie ou copie um arquivo `.env` dentro da pasta `worker/` (ou garanta que ele exista na raiz da pasta `feed-bot-ai/`):
   ```bash
   cat > .env << 'EOF'
   SUPABASE_URL=https://SUA_URL_SUPABASE.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
   GEMINI_API_KEY=SUA_CHAVE_GEMINI
   GROQ_API_KEY=SUA_CHAVE_GROQ
   CUT_TRANSCRIPTION_PROVIDERS=groq,gemini
   CUT_ANALYSIS_PROVIDERS=gemini,xai
   CUT_SUBTITLE_LEAD_MS=80
   EOF
   ```
   > ⚠️ **IMPORTANTE:** Use a **Service Role Key** (não a anon/public key), pois o worker precisa ignorar o RLS para ler a fila e escrever no bucket de Storage.

### Grok/xAI (opcional e preparado para o futuro)

O Cortes IA não depende do Grok para funcionar. A produção usa Groq/Whisper para timestamps de fala e Gemini para análise e enquadramento. Quando a conta xAI estiver aprovada, acrescente:

```bash
XAI_API_KEY=SUA_CHAVE_XAI
XAI_CUT_MODEL=grok-4.5
CUT_ANALYSIS_PROVIDERS=xai,gemini
```

O adapter usa a API compatível de Chat Completions da xAI e aceita resposta JSON estruturada. Não é necessário alterar o worker, o banco ou o frontend. O Grok entra somente na seleção/análise dos melhores trechos; a sincronização de áudio permanece no provedor de transcrição com timestamps.

### Captura por link do YouTube

O worker tenta, nesta ordem: cliente público padrão do yt-dlp, clientes públicos compatíveis, configuração personalizada e, por último, cookies válidos quando disponíveis. Um cookies.txt inválido não bloqueia mais os vídeos públicos.

Configurações opcionais para instalações que usam um provedor de PO Token:

```bash
YT_DLP_REMOTE_COMPONENTS=ejs:github
YT_DLP_EXTRACTOR_ARGS=youtube:player_client=mweb
```

Essas opções são deliberadamente opt-in. Mantenha o yt-dlp atualizado e configure um provedor de PO Token compatível antes de ativá-las.

### Recursos do Cortes IA Studio

- Presets Viral, Clean, Podcast, Produto, Melhores momentos e prompt personalizado.
- Whisper/Groq como primeira opção de legenda e Gemini como contingência.
- Correção configurável de atraso da legenda com `CUT_SUBTITLE_LEAD_MS`.
- Detecção do apresentador em vários quadros e reenquadramento suavizado.
- Validação H.264/AAC, resolução, pixel format, duração e tamanho antes do upload.
- Identidade visual separada por conta do Instagram.
- Nova versão a partir do mesmo vídeo e reprocessamento de um corte editado.
- Originais privados preservados por sete dias e depois removidos pela rotina do worker.

---

## 🏃 Como Executar o Worker

### Opção A: Executar em Modo de Desenvolvimento (para testar rápido)
```bash
node index.js
```
*Isto irá rodar o worker no seu terminal atual e exibir os logs em tempo real.*

### Opção B: Executar em Background 24/7 com PM2 (Recomendado para VPS)
O PM2 garante que o worker continue rodando mesmo se o terminal fechar ou o processo falhar.

1. **Instale o PM2 globalmente (se já não tiver):**
   ```bash
   sudo npm install -g pm2
   ```

2. **Inicie os workers separados com o PM2 (na raiz do projeto):**
   ```bash
   pm2 startOrReload ecosystem.config.cjs --update-env
   pm2 save
   ```

3. **Verifique os logs e status:**
   ```bash
   # Ver status
   pm2 status

   # Ver logs em tempo real
   pm2 logs feedbot-cuts
   pm2 logs feedbot-media

   # Configurar para iniciar junto com o VPS se ele reiniciar
   pm2 startup
   pm2 save
   ```

---

## 🧪 Como Verificar se Funcionou (Passo a Passo)

Siga este procedimento simples para testar se tudo está rodando 100%:

1. **Inicie o worker no VPS** (de preferência via `node index.js` em um terminal aberto para que você possa ver os logs ao vivo).
2. **Abra o painel do seu Feed Bot AI** no navegador.
3. **Crie um agendamento novo:**
   - Acesse o feed de Notícias.
   - Selecione uma notícia processada.
   - Clique em Agendar e escolha o tipo de mídia **Reel** ou **Feed**.
   - Defina o horário e salve (o post ficará com o status `Agendado`).
4. **Observe os logs do terminal do Worker:**
   Em até 20 segundos, você deverá ver uma saída parecida com esta:
   ```text
   --- [PROCESSANDO] Post ... (Tipo: reel) | Usuário: ... | News: ... ---
   [reel] Gerando capa editorial para o item ...
   [reel] Baixando imagem da capa de ...
   [reel] Baixando áudio de ...
   [reel] Iniciando compilação do vídeo no FFmpeg...
   [ffmpeg] Rodando comando: ffmpeg -y -loop 1 -i ...
   [reel] Vídeo gerado localmente com sucesso. Realizando upload...
   [reel] Upload de vídeo concluído: https://...
   [OK] Reel processado com vídeo: https://...
   ```
5. **Verifique o resultado:**
   - **No Banco de Dados/Dashboard:** A publicação agendada que estava cinza/pendente ficará pronta com a imagem ou vídeo visível. No banco de dados, a tabela `news_items` terá `editorial_ready = true` e o link do vídeo/imagem gerado.
   - **No Supabase Storage:** Vá no bucket `post-images` → pasta do ID do seu usuário. Você verá o arquivo `.mp4` (para Reels) ou `.png` (para Feed) salvo lá. Clique nele para tocar e verificar se o áudio está embutido perfeitamente no vídeo!
