# NewsFlow — Automação de Conteúdo para Instagram com IA

O **NewsFlow** (Feed Bot AI) é uma plataforma SaaS que automatiza a captação de notícias via feeds RSS, realiza a reescrita inteligente do conteúdo com Inteligência Artificial (**Gemini 2.5 Pro**) em legendas ricas e hashtags e publica de forma totalmente automatizada no Instagram através da API oficial do Facebook (Meta Graph API).

---

## 🚀 Funcionalidades Principais

* **Captação Multicanais**: Conexão e leitura de feeds RSS públicos estruturados, com extração robusta do conteúdo do artigo na íntegra.
* **Reescrita Editorial com IA**: Redação automática de títulos virais, resumos e legendas longas otimizadas com emojis e blocos de conteúdo para o Instagram Feed e Reels.
* **Geração Visual de Postagens**: Composição dinâmica de imagens 1080x1080 (Feed) e capas 1080x1920 (Reels/Stories) usando templates de nicho pré-definidos ou imagens geradas por IA.
* **Geração de Vídeo Reels**: Automação de criativos transformando criativos 9:16 e trilhas sonoras em arquivos de vídeo MP4 prontos para o Instagram.
* **Agendamento Inteligente & Espaçamento**: Fila de publicação automática que respeita os limites diários do plano e distribui posts de forma a evitar spam e bloqueios na Meta.
* **Auto-Freio de Quota da Meta**: Monitoramento de limites da API da Meta para travar envios temporariamente se o uso de cota estiver crítico (>80%).
* **Verificação Ativa de Saúde dos Tokens**: Monitoramento e renovação automática de tokens do Facebook de longa duração (OAuth de 60 dias).

---

## 🏗️ Arquitetura do Sistema

O projeto é estruturado em três camadas principais:

### 1. Frontend (Vite + React)
* Localizado em `/src`.
* Interface responsiva, com visual premium e animações fluidas via **Framer Motion** e design system baseado em **TailwindCSS** e **Shadcn/UI**.
* Utiliza `@tanstack/react-query` para gerenciar estado assíncrono com cache local de 2 minutos para otimizar chamadas ao Supabase.
* Dashboard administrativo do proprietário (`/dashboard/admin`) e painel de controle do usuário.

### 2. Backend & Banco de Dados (Supabase)
* **PostgreSQL**: Tabelas sob políticas de segurança RLS (Row Level Security) ativas para isolar dados de cada usuário.
* **Tabelas Principais**:
  * `profiles`: Informações básicas do usuário.
  * `news_sources`: Canais RSS monitorados.
  * `news_items`: Registro de matérias captadas, conteúdo reescrito pela IA e caminhos de arquivos criativos.
  * `scheduled_posts`: Fila cronológica de agendamento de posts (status: `scheduled`, `posting`, `posted`, `failed`).
  * `instagram_accounts`: Credenciais, IDs comerciais e Access Tokens obtidos via OAuth da Meta.
  * `post_templates`: Estilos visuais personalizados (fontes, cores, posicionamento de caixas) criados pelo usuário.
  * `meta_api_usage`: Logs de uso de quota extraídos dos headers da Meta.
* **Storage Buckets**:
  * `post-images`: Armazena criativos finais PNG e Reels em vídeo MP4.
  * `template-backgrounds`: Armazena as imagens de fundo enviadas pelo usuário para compor seus templates.

### 3. Edge Functions (Deno Deploy)
Localizadas em `/supabase/functions`. São chamadas via triggers HTTP ou agendadas via Supabase pg_cron. As mais importantes:
* `process-news`: Acionada por webhook. Executa o Gemini para reescrever a notícia, faz a adaptação cultural (conversão de moedas, termos brasileiros), busca a imagem de melhor qualidade da matéria e gera o criativo editorial.
* `publish-scheduler`: Roda a cada minuto em segundo plano. Seleciona os posts devido da fila, valida o intervalo mínimo configurado entre posts, analisa a cota da Meta e faz a publicação oficial do post.
* `instagram-oauth-start` / `instagram-oauth-callback`: Gerenciam o fluxo de login comercial com o Facebook para obter e renovar tokens de acesso com segurança.

---

## 💻 Desenvolvimento Local

### Pré-requisitos
* Node.js v18 ou superior.
* Supabase CLI instalado.

### Configuração do Projeto
1. Clone o repositório e instale as dependências:
   ```bash
   npm install
   ```
2. Inicialize o arquivo de variáveis de ambiente:
   Crie um arquivo `.env` na raiz do projeto com as credenciais do Supabase:
   ```env
   VITE_SUPABASE_URL=https://sua-url-do-supabase.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=seu-token-publico-do-supabase
   ```
3. Inicie o servidor de desenvolvimento local:
   ```bash
   npm run dev
   ```

### Execução de Testes
Para rodar os testes unitários do agendador e utilitários:
```bash
npm run test
```

---

## 🚀 Deploy de Banco e Edge Functions

### Banco de Dados
Para empurrar novas migrations locais para a nuvem do Supabase:
```bash
supabase db push
```

### Deploy de Funções
Para implantar todas as Edge Functions:
```bash
supabase functions deploy
```
*Lembre-se de configurar as variáveis de ambiente necessárias (como `APP_ORIGIN`, `LOVABLE_API_KEY`, `INTERNAL_CRON_SECRET` e `SUPABASE_SERVICE_ROLE_KEY`) no painel de controle do Supabase em Edge Functions -> Secrets.*
