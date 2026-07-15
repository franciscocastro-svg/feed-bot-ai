# Qualidade de Fontes 1A

## Objetivo

Melhorar a prévia e a captação de fontes do tipo Pessoa, Tema, RSS/Site e URL sem alterar banco, pagamentos ou o agendamento de publicações.

## Mudanças

- reconhece `News:Image` nos resultados RSS do Bing e normaliza imagens relativas;
- extrai a URL direta do publicador nos links intermediários do Bing;
- enriquece com a imagem do artigo até três resultados sem imagem na prévia de busca;
- limita o enriquecimento a duas requisições concorrentes, orçamento total de sete segundos e timeout por item;
- quando a URL direta falha, tenta busca pelo domínio no Google Notícias e depois no Bing;
- mantém as validações SSRF, DNS público, redirecionamentos, tamanho máximo e protocolos HTTP/HTTPS;
- exibe miniaturas reais na prévia, com carregamento tardio e sem envio de referrer.

## Limites intencionais

- não contorna login, paywall, CAPTCHA, Cloudflare ou bloqueios do publicador;
- não garante imagem para páginas sem metadados ou com hotlink bloqueado;
- Google e Bing permanecem rotas de fallback, não substitutos para acordos/licenças de conteúdo;
- nenhuma fonte existente é reprocessada automaticamente durante o deploy.

## Validação e liberação

1. `npm run ci`.
2. `npm audit --omit=dev --audit-level=moderate`.
3. `deno check supabase/functions/preview-source/index.ts`.
4. `deno check supabase/functions/fetch-rss/index.ts`.
5. Implantar somente `preview-source` e `fetch-rss`.
6. Publicar o frontend do mesmo commit para exibir as miniaturas.
7. Sem migration, alteração de banco ou invocação manual das funções.

## Rollback

Reimplantar as versões anteriores de `preview-source` e `fetch-rss` e publicar o frontend anterior. Não há rollback de banco.
