# Cortes IA 2.0-A — Eficiência e Reutilização

Esta fase reduz trabalho duplicado no processamento em nuvem sem alterar a
escolha editorial da IA, as durações flexíveis, os presets, os formatos, a
publicação ou as regras dos clientes.

## Problema observado

O pipeline já transcrevia o vídeo completo para selecionar os melhores trechos,
mas transcrevia novamente cada saída para criar as legendas. Quando o mesmo
trecho era solicitado em vários formatos, ele também repetia a preparação do
segmento e a análise de enquadramento para cada formato.

No limite atual de cinco sugestões e três formatos, isso podia gerar quinze
transcrições curtas e quinze análises de enquadramento adicionais.

## Reutilização implementada

- a transcrição completa é recortada e reutilizada nas legendas;
- timestamps são recalculados quando silêncios são removidos;
- o segmento bruto e a remoção de silêncio são compartilhados entre formatos;
- a análise de enquadramento é compartilhada entre formatos do mesmo trecho;
- se a transcrição completa estiver indisponível, o fallback anterior por corte
  continua ativo;
- reprocessamentos manuais continuam isolados e podem usar a transcrição editada;
- duração mínima de 8 segundos e máxima de 180 segundos permanecem limites de
  segurança, mas a duração final continua sendo escolhida pela IA conforme a
  ideia completa.

## Telemetria

O campo JSON `provider_trace`, já existente, passa a registrar:

- chamadas e provedores usados na transcrição da fonte;
- tempo de transcrição, análise, renderização e total;
- quantidade de preparações e reutilizações de segmento;
- quantidade de transcrições adicionais por corte;
- análises e reutilizações de enquadramento;
- quantidade de saídas renderizadas.

Nenhuma coluna ou migration foi necessária.

## Escopo preservado

- nenhum frontend foi alterado;
- nenhuma Edge Function foi alterada;
- nenhuma migration foi criada ou modificada;
- pagamentos, Stripe, Meta, banco e secrets permanecem intocados;
- ativação no VPS só ocorrerá depois de merge e fluxo automático autorizados.

## Rollback

Antes do merge, o rollback é remover o commit desta branch. Depois de eventual
merge, o rollback deve ser feito por Pull Request de revert. O formato de dados
continua compatível porque a telemetria usa somente JSON já existente.
