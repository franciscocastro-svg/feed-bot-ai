# Produto — Flux & Feed

Atualizado em **2026-08-02** para o Corte Editorial com correção Bold/Clean e saída Reel 9:16 implantadas, aguardando smoke autenticado sem publicação.

## Visão de produto

O Flux & Feed é uma central editorial autônoma para criadores, profissionais, portais e pequenas agências. A proposta é entender a identidade de cada Instagram, encontrar assuntos relevantes, transformar informação em conteúdo original e distribuir esse conteúdo nos formatos adequados.

O diferencial pretendido combina:

- notícias e fontes atuais;
- conteúdo perene por pautas;
- voz, público e posicionamento por perfil;
- produção multiformato;
- autopiloto com limites e revisão;
- publicação oficial pela Meta;
- operação multi-conta sem mistura de identidades;
- estratégia editorial assistida por preview.

## Público-alvo

1. Criadores e profissionais autônomos.
2. Negócios locais e prestadores de serviço.
3. Portais de notícias, entretenimento, esportes, finanças e nichos especializados.
4. Social medias e pequenas equipes.
5. Agências e operações com múltiplas marcas.

Direito, Saúde e Finanças exigem fontes confiáveis, linguagem educativa e revisão humana.

## Problemas resolvidos

- pesquisa, escrita, diagramação e publicação manuais;
- conteúdo genérico que ignora voz e público;
- mistura de fontes, filas ou identidade entre contas;
- produção separada de Feed, Reels, Stories e carrosséis;
- repetição de temas, imagens, legendas e CTA;
- ausência de cadência, limites e rastreabilidade;
- transformação manual de vídeos longos em cortes;
- risco de publicar na conta errada ou exceder limites;
- cobrança e acesso incompatíveis com planos diferentes.

## Funcionalidades confirmadas na `main`

### Conta e experiência

- autenticação, recuperação de senha e verificação de e-mail;
- dashboard protegido e área administrativa;
- interface principal em português e infraestrutura de idioma;
- ajuda contextual, tutorial, suporte e páginas legais;
- múltiplas contas Instagram por OAuth ou conexão manual controlada;
- identidade de marca, templates e configurações por conta;
- Perfil de Criador independente por Instagram.

### Conteúdo

- fontes RSS, descoberta, preview, captura, qualidade e deduplicação;
- vínculo e filtro de fontes por Instagram;
- notícias com estados de processamento, revisão e regeneração;
- pautas perenes e geração por tema/prompt;
- preferências de notícias e carrossel por conta;
- Feed, Stories, Reels e carrosséis editoriais;
- legendas com integridade, perfil, assinatura e CTA variáveis;
- seleção temática de imagens para carrosséis e fallback controlado;
- seleção de imagem principal da própria matéria, com preferência por resolução, preservação da miniatura como último recurso e enquadramento protegido para imagens pequenas;
- previews completos e editor visual.

### Automação e mídia

- agendamento, fila, aprovação e publicação pela Meta;
- autopiloto com reposição imediata e roteamento por conta;
- limites diários por Instagram, somando formatos;
- worker de mídia com Canvas, FFmpeg, retries, health reporting e deploy controlado por SHA/fila/rollback;
- captura, transcrição, cortes, legendas, rerender e reaproveitamento;
- Reels editoriais com duração configurável;
- insights, logs e saúde de tokens/API.

### Corte Editorial — backend e worker implantados

- `Cortes IA` foi organizado em `Criar corte` e `Meus cortes`; na criação, a nova opção fica ao lado de Corte tradicional e Corte com legendas, sem remover os formatos atuais;
- durante o teste inicial, Corte Editorial aparece como `Beta admin` apenas para administradores; a mesma regra é aplicada no banco, nas RPCs e na Edge Function, não somente na interface;
- saída selecionável em Feed 1080 × 1350 (4:5) ou Reel 1080 × 1920 (9:16), com cabeçalho da conta, título, comentário, vídeo central, rodapé e fonte quando disponível;
- transcrição como fonte factual principal e até quatro frames do próprio trecho apenas como contexto visual genérico;
- nomes, datas e números sem evidência literal, evidência ausente ou confiança abaixo de 72% produzem texto neutro e `Revisão necessária`;
- prévia em vídeo separada do arquivo final, com edição de título, comentário, trecho, enquadramento, fonte, cores e texto/ativação das legendas;
- regeneração somente de texto não persiste dados, não renderiza vídeo e não agenda publicação;
- o arquivo final só entra na fila após confirmação explícita; banco, UI e worker bloqueiam autopublicação/agendamento prematuro;
- vídeos pequenos usam primeiro plano sem ampliação no modo protegido; o recorte assistido limita ampliação a 2× e usa fundo desfocado para completar a área;
- compositor lê o original para cada saída e produz H.264/AAC 48 kHz/yuv420p em uma codificação, evitando usar a prévia como fonte do vídeo final.
- correção implantada no worker mantém o Gemini como padrão único e escolhe a estratégia pela entrada: vídeos curtos usam blocos de 120 segundos; vídeos com pelo menos 10 minutos ou 100 MB são enviados uma vez à Gemini Files API, analisados integralmente e têm somente os trechos candidatos transcritos. O arquivo remoto temporário é removido após a análise e a rota segmentada permanece como contingência;
- início, fim e duração dos cortes são persistidos como segundos inteiros, conforme o contrato atual do banco; o arredondamento abre o limite para preservar a fala, mas nunca ultrapassa o fim físico do vídeo;
- JSON parcialmente truncado é recuperado somente quando contém objetos completos; espera/retry são limitados e o progresso avança por fase. Se nenhuma fala utilizável for obtida, o job pode entregar uma prévia neutra com confiança 0%, `Revisão necessária` e edição obrigatória, sem autopublicação.

O Corte Editorial base e a restrição temporária `Beta admin` foram integrados pelos PRs #60/#61 nos merges `acc8363`/`e433493`. A migration foi aplicada no Supabase sob o registro `20260802144135`, o cache do schema foi recarregado e `regenerate-cut-editorial-text` foi implantada com teste anônimo HTTP 401. A Lovable registrou o estado no merge automático `ad273b4`. O PR #62 integrou o escopo operacional `cuts-only` no merge `67ced14`, implantado na VPS em 2026-08-02 com reinício exclusivo de `feedbot-cuts`, testes, nginx e health aprovados. `feedbot-media` e `feedbot-webhook` mantiveram os mesmos PIDs. Os primeiros testes, anteriores à implantação completa, não criaram clipes, agendamentos ou publicações; agora resta o smoke com fala real e a confirmação do frontend de produção.

Correção implantada após o primeiro smoke real: `Bold viral` e `Clean` eram aceitos pela RPC editorial, mas rejeitados pelo criador legado chamado internamente. O PR #64/merge `5105bca` integrou a correção; a migration foi registrada como `20260802164442_2b52a212-51a9-42c0-ad0f-681037be48ea.sql`, o frontend foi publicado e a `main` reconciliada em `efc8d15`. As RPCs v2 recebem `feed_portrait` ou `reels`; o compositor adapta layout, áreas seguras, legendas e validação de resolução. O worker `feedbot-cuts` foi atualizado isoladamente para `efc8d15`, com 588 testes principais, 36 de deploy, 24 de reconciliação, nginx e health aprovados, sem reiniciar mídia ou webhook. Resta o smoke autenticado 4:5/9:16 com fala real e sem publicação.

O smoke seguinte expôs três problemas independentes. Primeiro, a VPS tinha somente Gemini e o worker segmentava a fonte inteira em blocos de 600 segundos, causando respostas truncadas, timeouts e fila lenta. Depois, o refinamento de limites naturais devolveu `45.24` para colunas inteiras, encerrando o job com SQLSTATE `22P02`. Um novo teste iniciado às 15:12 concluiu a renderização de uma prévia de 35 segundos, mas sem transcrição: confiança 0%, conteúdo neutro e revisão necessária. Embora o job tenha sido solicitado como 9:16, a prévia foi rotulada/renderizada como Feed 1080 × 1350, confirmando a imposição 4:5. O PR #66/merge `bdd5c6d` resolveu os três pontos sem migration. A VPS instalou exatamente esse SHA com escopo `cuts-only`; 597 testes principais, 36 de deploy, 24 de reconciliação, nginx e health passaram, sem reiniciar mídia ou webhook. Resta o smoke autenticado 9:16/4:5 com fala real e sem publicação.

### Comercial

- quatro ofertas: Creator, Pro, Business e Agência;
- Creator, Pro e Business com teste/checkout por cartão;
- Agência por `contato@fluxifeed.com`;
- Billing Portal e proteção contra assinatura duplicada;
- webhooks, reconciliação e separação sandbox/live;
- assinatura manual/Pix compatível com acesso sem cartão;
- ação financeira explícita para escolher plano, registrar valor e liberar/renovar exatamente um mês em `live`;
- visão administrativa que distingue `live`, Stripe, Pix e cadastro existente somente em `sandbox`;
- nomes públicos consistentes na administração: Creator, Pro, Business e Agência;
- MRR e listagens financeiras que usam o valor registrado por cliente quando o pagamento é Pix;
- gate de acesso fail-closed com mensagens distintas para checkout, e-mail, aprovação, expiração, bloqueio e indisponibilidade técnica;
- limites e preços-base armazenados no banco.

Correção publicada em 2026-08-01: o resolvedor legado de limites escolhe somente a assinatura `live` não terminal mais recente, o financeiro prioriza o valor Pix registrado e a UI não expõe a chave técnica `starter`. O smoke autenticado confirmou plano Agência, limites e receita manual corretos.

### Piloto Editorial Inteligente — Fase 1

- contrato estrito `editorial-pilot/v1`;
- proposta local de posicionamento, pilares, fontes, pautas, formatos e cadência;
- fingerprint de perfil e isolamento por Instagram;
- guardrails para fofoca, Direito, Saúde e Finanças;
- prevenção do falso positivo “brasileiras” como domínio jurídico;
- feature flag desligada no contrato padrão e habilitada no ambiente de desenvolvimento;
- nenhuma escrita em fontes, pautas, configurações, filas ou publicações.

### Piloto Editorial Inteligente — Fase 2A

Integrado na `main` pelo PR #51/merge `ad39d3e`; schema/RPC e `discover-rss` implantados em 2026-08-01, mas ainda indisponível no frontend de produção até a publicação controlada da interface:

O deploy da função gerou automaticamente o commit `e290ac0` na `main`, restrito aos tipos Supabase regenerados; o comportamento de produto da Fase 2A não foi modificado.

- a ação de análise usa o nicho do Perfil do Criador para pesquisar fontes reais;
- feeds RSS e monitoramentos temáticos são validados por conteúdo recente e relevância;
- fontes inválidas permanecem visíveis com diagnóstico, mas não podem ser selecionadas;
- o usuário seleciona ou rejeita fontes e pautas individualmente;
- a interface apresenta o resumo exato por Instagram e exige confirmação final;
- a aplicação cria/vincula fontes e cria pautas em uma única transação idempotente;
- repetir a mesma proposta não duplica fontes, vínculos nem pautas;
- nenhuma publicação é criada e a cadência continua apenas como sugestão.

O primeiro teste autenticado da confirmação não persistiu dados porque o banco publicado não possuía a infraestrutura histórica de fingerprint esperada pela RPC. A correção do PR #53 adicionou essa compatibilidade, apresenta uma mensagem específica de falha de aplicação e melhora a descoberta de entretenimento: Quem e Metrópoles usam endpoints oficiais verificados, o fallback UOL Splash 404 foi removido e títulos de artistas, TV, música e relacionamentos deixam de ser falsamente rejeitados. CI local/remoto, migration e nova versão da Edge estão concluídos; o preview aguarda o smoke autenticado e o frontend de produção permanece sem publicação.

O segundo smoke chegou mais longe e revelou SQLSTATE `42702` no vínculo fonte–Instagram: a variável PL/pgSQL `source_id` colidia com a coluna homônima no alvo do `ON CONFLICT`. Nenhum item foi gravado. A migration corretiva foi integrada e registrada como `20260801194149`, renomeou a variável, passou a usar a PK explícita e mede o vínculo inserido por `ROW_COUNT`. O smoke seguinte aplicou 7 fontes e 4 pautas com segurança e sem publicação; resta confirmar o replay idempotente.

## Funcionalidades planejadas

### Piloto Editorial — Fase 2

1. concluir a edição manual da proposta antes da aplicação;
2. confirmar o replay idempotente da proposta já aplicada e decidir o rollout do frontend;
3. adicionar uma ação explícita de desfazer uma aplicação;
4. permitir aplicar preferências de cadência separadamente;
5. registrar métricas de qualidade por conta.

### Provedores e custos

- centralização adicional dos provedores de IA;
- OpenRouter opcional, por feature flag;
- modelos configuráveis e fallback monitorado;
- custos por requisição, tarefa, cliente e Instagram;
- tetos globais, diários e mensais;
- modo simulação/comparação com telemetria sanitizada.

O worker já possui xAI/Grok opcional para análise estruturada de cortes. Isso não equivale à integração OpenRouter planejada, e o FFmpeg continua responsável pelo corte e render físico.

### Outros itens

- ranking/licenciamento de imagens e fallback tipográfico;
- métricas de repetição editorial;
- sugestões de música compatíveis com direitos e APIs;
- TikTok e novos canais;
- onboarding comercial guiado;
- colaboração de equipe/agência;
- analytics de conversão e testes A/B;
- marketplace de templates.

## Regras de negócio

### Conta e identidade

- cada conteúdo publicável deve ter Instagram de destino explícito;
- uma conta não pode bloquear, herdar ou publicar conteúdo de outra;
- defaults globais podem ser herdados, mas exceções de conta/canal têm precedência;
- nomes, logos, handles e CTA vêm da conta de destino.

### Conteúdo

- usar apenas fatos presentes na fonte;
- não inventar pessoas, números, declarações ou contexto;
- diferenciar fato confirmado de rumor;
- carrossel usa capa de impacto, desenvolvimento legível e CTA final;
- priorizar imagem original ou temática relevante quando segura;
- escolher candidatos somente nos metadados e no corpo da própria matéria antes de usar uma miniatura de busca;
- nunca descartar a única imagem disponível apenas por ser pequena; nesse caso, usar enquadramento protegido sem ampliação agressiva;
- usar capa tipográfica quando nenhuma imagem adequada existir;
- respostas de IA inválidas não avançam;
- áreas reguladas exigem fonte e revisão humana.

### Autopiloto e publicação

- preparar o próximo conteúdo quando a fila da conta ficar vazia;
- intervalo limita publicação, não preparação;
- limites diários são por Instagram e somam Feed, Reel, Story e carrossel;
- carrossel completo conta como uma publicação;
- falha de uma conta não pode interromper as demais;
- publicação exige token, assinatura, aprovação, mídia e política válidos.

### Assinaturas

- Creator, Pro e Business usam lookup keys e checkout com cartão;
- Agência usa contato comercial, sem checkout automático;
- checkout reutiliza customer e bloqueia duplicidade em estados cobrados;
- Pix/manual pode liberar acesso sem customer Stripe;
- toda confirmação manual/Pix feita pela área administrativa é de produção (`live`), registra plano, valor, data e administrador e vale um mês;
- renovar um Pix ainda vigente acrescenta um mês ao vencimento atual; uma assinatura vencida recebe um mês a partir da confirmação;
- Pix substitui automaticamente somente tentativas Stripe `live` já canceladas, inadimplentes ou expiradas; estados ativos, em teste, atrasados dentro da cobrança, pausados ou incompletos exigem cancelamento no Stripe antes da liberação manual;
- acesso manual exige plano pago, status ativo, aprovação, verificação, vigência e ausência de bloqueio/reembolso;
- sandbox e live nunca se misturam;
- UI usa somente chave publicável; secrets ficam no backend;
- mudanças de preço não alteram assinaturas existentes sem autorização.

## Fluxos principais

### Novo cliente

1. cadastro e verificação de e-mail;
2. escolha do plano ou contato comercial;
3. checkout para planos automáticos;
4. webhook/reconciliação atualiza assinatura;
5. RPC calcula o acesso;
6. conexão de contas Instagram;
7. configuração do Perfil de Criador.

### Cliente pago via Pix

1. o financeiro localiza o cliente na área administrativa;
2. seleciona o plano comprado e registra o valor recebido;
3. confirma a operação, sempre marcada como `LIVE` e `PIX`;
4. a RPC cria ou renova a assinatura por um mês, sem cartão e sem IDs Stripe;
5. o gate recalcula o acesso usando o ambiente `live`;
6. no mês seguinte, uma nova confirmação Pix acrescenta a próxima competência.

### Conteúdo por notícia

1. fonte captura e deduplica item;
2. item é associado à conta correta;
3. IA gera conteúdo conforme perfil e política;
4. worker produz mídia quando necessário;
5. usuário revisa ou agenda;
6. publicador envia à Meta;
7. resultado e falhas ficam registrados.

### Conteúdo por pauta

1. pauta define conta, objetivo, público, tom e formatos;
2. geração retorna conteúdo estruturado;
3. identidade da conta é aplicada;
4. conteúdo segue para revisão/agendamento.

### Vídeo e cortes

1. URL ou arquivo cria job;
2. captura/transcrição produz timestamps;
3. análise sugere intervalos estruturados;
4. worker executa FFmpeg e aplica legenda/branding;
5. arquivos finais seguem para revisão e publicação.

No Corte Editorial, o usuário escolhe Feed 4:5 ou Reel 9:16 antes da criação. O passo 4 gera primeiro `editorial_preview_url` na proporção escolhida, mantendo `video_url` vazio. O usuário revisa os campos e solicita o render final; só depois de `editorial_review_confirmed_at` e `video_url` existirem o agendamento como Reel é permitido.

### Piloto Editorial

1. usuário escolhe Instagram e preenche o Perfil de Criador;
2. análise local monta e valida `editorial-pilot/v1`;
3. `discover-rss` pesquisa e valida fontes reais sem persistência;
4. usuário seleciona fontes e pautas e revisa o resumo exato;
5. somente a confirmação chama a aplicação transacional e idempotente;
6. fontes são vinculadas e pautas são criadas apenas para o Instagram escolhido;
7. cadência, filas e publicações não são alteradas nesta fase.

## Roadmap

### Estado da melhoria de imagens e do worker

- O PR #57 integrou a melhoria de imagens em `c4e703d`; frontend e `fetch-rss`, `preview-source` e `discover-rss` foram publicados pela Lovable nesse conteúdo.
- A recuperação do `SIGINT` foi concluída em `93ae2a3`: evidências e backups privados foram preservados, 43 estados anteriores foram marcados como substituídos e nenhum release intermediário foi executado.
- Somente `feedbot-media` foi reiniciado. Fila, bloqueio, SHA, nginx, PM2 e health terminaram consistentes; os processos de webhook e cortes permaneceram online sem reinício.
- O smoke de qualidade exige nova captura/regeneração, pois os arquivos de mídia existentes não são retroativamente alterados.

### Agora — prontidão e confiabilidade

- [concluído] cliente confirmou acesso autenticado após a liberação Pix live;
- [concluído em produção] corrigir limites/exibição de Agência para resolver somente a assinatura `live` válida;
- [concluído em produção] contabilizar no financeiro o valor manual do Pix quando o catálogo for negociável;
- [integrado e publicado] substituir miniaturas fracas pela imagem principal relacionada da matéria e proteger o fallback pequeno; frontend, Edge Functions e worker publicados, smoke visual pendente;
- [concluído] reconciliar a fila interrompida e implantar somente o worker de mídia no SHA final aprovado;
- validar o preview e concluir de forma controlada a publicação do frontend da Fase 2A do Perfil do Criador;
- revalidar frontend live, Stripe, webhooks, Supabase, Meta e VPS;
- confirmar SHAs e migrations efetivamente implantados;
- manter a flag do Piloto desligada por padrão até aprovação de rollout.
- repetir a sincronia com um vídeo que contenha fala real, sem publicar; os três renders físicos já receberam aceite visual;
- [concluído] implantar migration, Edge de texto e somente o worker `feedbot-cuts` no merge `67ced14`, sem reiniciar os outros processos;
- executar os smokes autenticados Feed 4:5 e Reel 9:16 com fala real, sem agendar ou publicar, e registrar o aceite visual;
- corrigir em atividade separada o `SIGINT` do deploy quando o webhook reinicia o próprio processo.

### Depois — Piloto assistido

- edição da proposta, desfazer aplicação e aplicação opcional da cadência;
- testes com contas do mesmo nicho e vozes diferentes;
- revisão humana obrigatória em áreas reguladas.

### Em seguida — inteligência e custos

- provider central opcional/OpenRouter;
- orçamento e telemetria sanitizada;
- avaliação de repetição e relevância editorial;
- observabilidade por conta e tarefa.

## Métricas recomendadas

- tempo até a primeira publicação;
- conteúdos preparados/publicados por conta;
- sucesso do autopiloto e da publicação;
- edição manual antes da publicação;
- repetição de tema, CTA e imagem;
- custo de IA por conteúdo/cliente;
- conversão trial → pago e churn;
- falhas por provedor, worker, Meta e assinatura;
- alcance, salvamentos e compartilhamentos por formato.
