# Google Analytics com consentimento

## Escopo

O frontend usa a propriedade pública `G-0PP4T02MH7` por meio de `VITE_GOOGLE_ANALYTICS_ID`. Google Analytics e Meta Pixel compartilham uma preferência de consentimento armazenada localmente no navegador.

## Garantias

- Modo básico: nenhum script de medição é carregado antes da autorização.
- Recusar não bloqueia login, pagamento, dashboard ou qualquer função do produto.
- Somente rotas públicas permitidas geram visualizações.
- O Google recebe `page_path` e `page_location` sem query string.
- O Meta Pixel não dispara em páginas sensíveis nem quando a URL contém query string.
- O carregamento é assíncrono e não bloqueia a aplicação.
- A configuração do Google desativa pageview automático, Google Signals e personalização de anúncios.
- O visitante pode reabrir as preferências pela Política de Privacidade.

## Publicação

Esta entrega exige apenas publicação do frontend. Não existe migration, Edge Function, secret, alteração de banco ou operação em Stripe/Meta.

## Rollback

Republique o frontend do commit anterior. A preferência local se torna inerte sem os trackers.
