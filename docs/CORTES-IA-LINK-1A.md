# Cortes IA por Link 1A — Captura Resiliente

## Objetivo

Tornar o caminho YouTube → transcrição → seleção → renderização previsível no VPS, sem sacrificar bons trechos por uma duração rígida.

## Contrato entregue

- Links `watch`, `youtu.be`, `shorts` e `live` gravada viram uma URL canônica por vídeo.
- Playlist sem vídeo direto, URL externa e identificador inválido são recusados antes de reservar processamento.
- O banco impede dois trabalhos simultâneos do mesmo vídeo para o mesmo usuário.
- O worker faz preflight de metadados antes de baixar o arquivo e valida o limite do plano antes de consumir banda.
- Captura possui timeout, retries e categorias sanitizadas: privado, transmissão ativa, restrição, anti-bot, limite de requisições, indisponível, rede e falha genérica.
- O job persiste `capture_status`, `capture_error_code` e `capture_checked_at`, sem guardar cookies, headers ou payloads sensíveis.
- Um heartbeat de 60 segundos impede que um processamento longo e saudável seja recuperado como abandonado.
- A reserva diária é finalizada pelo fluxo de falha já existente; captura malsucedida não consome corte concluído.
- Se o YouTube bloquear, o painel muda para MP4 preservando conta, quantidade e formatos.

## Duração natural

Não existe trava editorial de 30 segundos. A IA busca normalmente 20–90 segundos, aceita 8–180 segundos e deve preservar o começo e o fim da frase, resposta, demonstração ou revelação. O limite de 180 segundos é apenas uma proteção técnica compatível com o reprocessamento existente.

## Segurança

- `create_video_cut_job` continua exigindo sessão e propriedade da conta.
- Todos os overloads têm `EXECUTE` removido de `anon` e `PUBLIC`.
- Claim continua exclusivo de `service_role` e usa `FOR UPDATE SKIP LOCKED`.
- Cookies e PO Tokens continuam opcionais e ficam somente no VPS.

## Deploy e rollback

1. Aplicar `20260717003000_youtube_cut_capture_resilience_1a.sql`.
2. Atualizar o VPS e instalar `worker/package-lock.json` com `npm --prefix worker ci --omit=dev`.
3. Reiniciar somente `feedbot-cuts` com PM2.
4. Publicar o frontend; nenhuma Edge Function precisa ser implantada.

Rollback: restaurar o worker/frontend anterior e criar migration corretiva que remova o trigger e as quatro colunas de observabilidade somente se os dados não forem mais necessários. Não reabrir `EXECUTE` para `anon`.
