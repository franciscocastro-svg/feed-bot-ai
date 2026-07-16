# Qualidade de Fontes 1C — Descoberta inteligente por nicho

## Problema corrigido

Quando a IA de descoberta estava indisponível, qualquer texto fora do catálogo
fixo recebia G1 Últimas e UOL Notícias. A validação confirmava apenas que o RSS
abria, sem verificar aderência ao nicho.

## Novo contrato

- sinônimos reconhecem nichos como fitness/academia e forex/câmbio/XAUUSD;
- nichos não cadastrados preservam o texto original em uma busca temática;
- o fallback genérico G1/UOL foi removido;
- toda sugestão precisa apresentar conteúdo recente correspondente ao nicho;
- a prévia identifica se a origem é catálogo, IA ou busca temática;
- uma fonte sem aderência fica desmarcada e não pode ser adicionada;
- a segunda chamada revalida exatamente as fontes escolhidas pelo usuário;
- a captura automática posterior continua usando o limite de 48 horas da 1B.

## Liberação

1. Executar CI, testes da fase, scanner de segredos e Deno check.
2. Implantar somente `discover-rss`.
3. Publicar somente o frontend.
4. Não executar discovery nem inserir fontes manualmente durante a liberação.
5. Validar depois com buscas iniciadas pelo usuário para nichos conhecidos e livres.

Não há migration, alteração de worker ou mudança em fontes já cadastradas.
