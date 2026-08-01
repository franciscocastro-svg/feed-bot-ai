# Produto — Flux & Feed

Atualizado em **2026-08-01** para o release Pix live `6b362bf`.

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
- previews completos e editor visual.

### Automação e mídia

- agendamento, fila, aprovação e publicação pela Meta;
- autopiloto com reposição imediata e roteamento por conta;
- limites diários por Instagram, somando formatos;
- worker de mídia com Canvas, FFmpeg, retries e health reporting;
- captura, transcrição, cortes, legendas, rerender e reaproveitamento;
- Reels editoriais com duração configurável;
- insights, logs e saúde de tokens/API.

### Comercial

- quatro ofertas: Creator, Pro, Business e Agência;
- Creator, Pro e Business com teste/checkout por cartão;
- Agência por `contato@fluxifeed.com`;
- Billing Portal e proteção contra assinatura duplicada;
- webhooks, reconciliação e separação sandbox/live;
- assinatura manual/Pix compatível com acesso sem cartão;
- ação financeira explícita para escolher plano, registrar valor e liberar/renovar exatamente um mês em `live`;
- visão administrativa que distingue `live`, Stripe, Pix e cadastro existente somente em `sandbox`;
- gate de acesso fail-closed com mensagens distintas para checkout, e-mail, aprovação, expiração, bloqueio e indisponibilidade técnica;
- limites e preços-base armazenados no banco.

### Piloto Editorial Inteligente — Fase 1

- contrato estrito `editorial-pilot/v1`;
- proposta local de posicionamento, pilares, fontes, pautas, formatos e cadência;
- fingerprint de perfil e isolamento por Instagram;
- guardrails para fofoca, Direito, Saúde e Finanças;
- prevenção do falso positivo “brasileiras” como domínio jurídico;
- feature flag desligada no contrato padrão e habilitada no ambiente de desenvolvimento;
- nenhuma escrita em fontes, pautas, configurações, filas ou publicações.

## Funcionalidades planejadas

### Piloto Editorial — Fase 2

1. editar a proposta antes da aplicação;
2. selecionar ou rejeitar fontes e pautas individualmente;
3. mostrar o diff exato do que será criado;
4. exigir confirmação explícita;
5. aplicar de forma idempotente, transacional e reversível;
6. registrar métricas de qualidade por conta.

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
- Pix nunca sobrescreve uma assinatura Stripe `live`; conflitos devem parar de forma segura;
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

### Piloto Editorial

1. usuário escolhe Instagram e preenche o Perfil de Criador;
2. preview local monta `editorial-pilot/v1`;
3. usuário revisa estratégia, fontes, pautas e guardrails;
4. na Fase 1 nada é persistido;
5. uma fase futura aplicará apenas itens explicitamente aprovados.

## Roadmap

### Agora — prontidão e confiabilidade

- validar com o cliente a sessão autenticada após a liberação Pix live;
- revalidar frontend live, Stripe, webhooks, Supabase, Meta e VPS;
- confirmar SHAs e migrations efetivamente implantados;
- manter o Piloto restrito a preview até aprovação de rollout.

### Depois — Piloto assistido

- edição, seleção, diff, confirmação, idempotência e rollback;
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
