# Catálogo Universal de Temas (aditivo, sem alterar nada do que existe)

Objetivo: cobrir praticamente qualquer nicho que um cliente digitar, com feeds RSS reais e validados, mantendo 100% intacto tudo que já funciona hoje.

## Regra de ouro (não negociável)

- Nenhum perfil, alias, termo ou feed existente é editado, renomeado ou removido.
- Só é permitido **acrescentar** novas entradas ao fim das listas.
- Nenhuma mudança em banco, RLS, UI, worker ou lógica de captura/filtragem.
- Todo feed novo só entra no catálogo depois de responder HTTP 200 com XML válido e itens recentes na verificação.

## O que muda na prática

Hoje existem 12 perfis de nicho reconhecidos (tecnologia, economia, forex, cripto, esportes, política, mundo, saúde, fitness, entretenimento, direito, beleza) e apenas 8 deles têm catálogo curado de feeds. Quando o cliente pede um nicho fora dessa lista (viagem, pets, gastronomia, moda, etc.), a IA precisa "adivinhar" endereços de RSS — e a maioria devolve 404, exatamente o que apareceu na conta de turismo.

Com o catálogo universal, cada nicho novo passa a ter feeds reais garantidos, e a IA vira apenas complemento, não a fonte principal.

## Temas a acrescentar

Grupo 1 — cobertura imediata (feeds fortes e estáveis):
viagem e turismo, gastronomia, pets e animais, moda, automóveis, games, cinema e séries, música, educação, carreira e empregos, imóveis, agronegócio, ciência, meio ambiente, empreendedorismo e PMEs, marketing digital, religião e fé, maternidade e família, decoração e casa, moda masculina/barbearia, odontologia, psicologia e saúde mental, seguros e previdência, construção civil, energia, varejo e e-commerce, logística, turismo local/eventos de cidade, cultura pop e memes, true crime e polícia.

Grupo 2 — nichos locais de serviço (sem imprensa dedicada): entram como monitoramento por tema (busca) em vez de RSS, que é o comportamento correto para eles.

Para cada tema novo: chave, rótulo em português, apelidos (sinônimos que o cliente costuma digitar), termos de relevância e a query de busca de reserva.

## Ajuste de frescor por nicho (também aditivo)

Nichos de cadência semanal (viagem, moda, decoração, imóveis, religião) recebem janela de data maior por padrão, senão o filtro atual de 1 dia rejeita conteúdo bom. Nichos já existentes mantêm exatamente a janela atual.

## Verificação antes de publicar

1. Testar cada URL candidata (status, tipo de conteúdo, número de itens, data do item mais recente).
2. Descartar automaticamente qualquer feed que devolva 404/403, HTML sem itens ou último item com mais de 30 dias.
3. Rodar o pré-visualizador do Piloto Editorial em 5 nichos de amostra e confirmar que nenhuma fonte volta com "rejeitada".
4. Reconfirmar que os 8 nichos antigos continuam devolvendo exatamente as mesmas fontes de antes.

## Detalhes técnicos

- `supabase/functions/_shared/niche-discovery.ts`: acrescentar entradas ao fim de `KNOWN_PROFILES` (sem tocar nas 12 existentes) e, se necessário, novos apelidos apenas em perfis novos.
- `supabase/functions/discover-rss/index.ts`: acrescentar chaves novas ao objeto `FALLBACK_FEEDS`; as 8 chaves atuais permanecem byte a byte iguais.
- Janela de frescor: mapa novo de nicho → horas, consultado como fallback em `freshnessWindowHours` sem alterar as regras já configuradas por fonte.
- Teste novo em `src/test/` garantindo que (a) todo perfil tem chave única, (b) as 12 entradas originais seguem inalteradas, (c) todo nicho novo tem pelo menos 1 feed ou cai em monitoramento por tema.
- Redeploy apenas de `discover-rss` e das funções que importam o módulo compartilhado.
