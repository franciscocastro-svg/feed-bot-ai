# Cortes IA 2.0-B — Qualidade Profissional

Esta fase melhora a escolha editorial dos Cortes IA sem fixar sua duração e sem
adicionar uma segunda chamada de inteligência artificial.

## Melhorias

- a única chamada de análise retorna um pequeno conjunto de candidatos, em vez
  de encerrar a seleção nos primeiros resultados;
- os candidatos são reavaliados localmente por gancho, clareza, emoção,
  completude da fala e densidade de conteúdo;
- início e fim são alinhados a pontuação e pausas naturais da transcrição;
- trechos quase duplicados ou excessivamente sobrepostos são descartados;
- ideias completas podem continuar entre 8 e 180 segundos — a IA permanece
  responsável pela duração editorial;
- a nota profissional e as decisões de alinhamento ficam registradas nos JSONs
  já existentes de qualidade e rastreabilidade.

## Velocidade e custo

O refinamento é determinístico e executado no próprio worker. A análise utiliza
uma única chamada de IA, como antes. O conjunto de candidatos é limitado a oito
itens, e o resultado final continua limitado ao total solicitado pelo cliente.
Não há nova transcrição, renderização ou análise visual nesta etapa.

## Escopo preservado

- nenhuma migration;
- nenhuma Edge Function;
- nenhum frontend;
- nenhuma alteração em banco, pagamentos, Stripe, Meta ou secrets;
- duração flexível dos Cortes IA preservada;
- a reutilização implementada na fase 2.0-A permanece ativa.

## Rollback

Antes do merge, basta remover o commit da branch. Após eventual merge, o
rollback deve ser um Pull Request de revert. Não há rollback de dados porque a
fase utiliza exclusivamente campos JSON já existentes.
