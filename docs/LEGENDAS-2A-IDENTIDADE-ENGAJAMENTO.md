# Legendas 2.0-A — Identidade, Qualidade e Engajamento

## Objetivo

Gerar legendas originais para Instagram com leitura fluida, fatos preservados,
uma única chamada de engajamento e exatamente uma menção à conta que fará a
publicação.

## Contrato público

- A legenda não exibe fonte, portal, URL, crédito ou origem da imagem.
- A origem continua armazenada internamente nos campos de captura da notícia.
- O texto produzido pela IA contém apenas fatos e contexto, sem inventar dados.
- CTA e identidade são acrescentadas deterministicamente depois da IA.
- Todo `@handle` vindo da IA, do Perfil do Criador ou do cache é removido.
- O username real da conta de publicação é a autoridade final.
- A legenda final contém exatamente uma CTA e uma ocorrência desse username.
- Hashtags são deduplicadas e limitadas a oito no feed e cinco no Reel.

## Barreiras

1. O Perfil do Criador orienta o tom da CTA, mas seu texto não é mais anexado
   literalmente à legenda.
2. A chave do cache inclui ID e handle da conta, evitando reaproveitamento entre
   contas que herdam o mesmo perfil global.
3. `process-news` finaliza a legenda antes de persistir o conteúdo novo.
4. `publish-scheduler` reaplica a mesma regra de forma idempotente imediatamente
   antes da publicação, protegendo também itens já agendados.
5. Stories continuam sem legenda e nenhuma duração de vídeo é alterada.

## Escopo operacional

Esta mudança não altera conteúdos já publicados, banco, migrations, pagamentos,
Autopiloto, templates, duração de Reels, Stories ou Cortes IA. A origem e os
metadados internos continuam disponíveis para auditoria e deduplicação.
