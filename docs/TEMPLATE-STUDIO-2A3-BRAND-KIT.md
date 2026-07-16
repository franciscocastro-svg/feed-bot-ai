# Template Studio 2A.3 — Kit de Marca e recomendações

## Resultado

Cada conta do Instagram passa a ter um Kit de Marca isolado com nome, arroba,
logos principal/clara/escura, cinco cores, fontes de título e corpo e uma
personalidade visual. Alterar uma conta não modifica as demais.

O estúdio recomenda três modelos da biblioteca profissional usando regras
determinísticas: nicho da conta, objetivo do conteúdo, personalidade visual,
popularidade e contraste. A recomendação não usa IA, não consome créditos e
nunca ativa ou publica um modelo automaticamente.

## Contrato de segurança e publicação

- A tabela `account_brand_kits` possui RLS e leitura apenas pelo dono.
- Escritas do navegador passam por `save_account_brand_kit`, que valida
  `auth.uid()`, propriedade da conta, URLs HTTPS, cores e fontes permitidas.
- O Kit é aplicado a uma cópia do modelo e vira um rascunho da conta/formato.
- O modelo publicado permanece imutável até o cliente clicar em **Publicar versão**.
- O rascunho guarda uma fotografia da paleta, das fontes e da logo. Uma mudança
  futura no Kit não altera artes antigas nem versões já publicadas.

## Paridade visual

As famílias suportadas são Inter, Montserrat, Poppins e Lora. O navegador usa
as mesmas famílias da prévia, e o worker `feedbot-media` baixa e registra as
fontes no VPS. Feed, Stories e Reels leem os mesmos campos normalizados de
fonte/logo no editor, nos canvases manuais e no render automático do worker.

## Liberação

1. Sincronizar o commit na `main`.
2. Aplicar somente `20260716013000_template_studio_2a3_brand_kits.sql`.
3. Publicar o frontend.
4. Atualizar e reiniciar somente o worker `feedbot-media` no VPS.
5. Não é necessário implantar Edge Functions.

## Rollback

Republique o frontend/worker anteriores. Os campos novos nos snapshots são
ignorados por renderizadores antigos. A tabela pode permanecer inerte; se for
necessário removê-la, primeiro remova as duas RPCs e depois a tabela em uma
migration corretiva, sem tocar nas versões de template publicadas.
