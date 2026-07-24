# Carrossel Editorial 2A — imagens reais, leitura rápida e custo controlado

## Objetivo

Gerar carrosséis editoriais com aparência profissional, inspirados em conteúdo
educativo de leitura rápida, sem copiar identidade visual de terceiros e sem
usar geração de imagens por IA.

## Contrato visual

- formato vertical `1080x1350`;
- fundo branco, tipografia preta, bastante espaço em branco e cor de destaque;
- identidade da própria conta (logo e `@` efetivo);
- 5 a 7 slides;
- trechos importantes em negrito;
- no máximo duas fotos reais por carrossel;
- último slide sempre textual, com uma CTA;
- nenhuma fonte, URL ou origem da imagem na legenda pública.

As fontes e os URLs de origem continuam preservados nos metadados internos do
slide (`image_asset`) para auditoria. Isso não altera a legenda nem as regras
funcionais do conteúdo.

## Provedor de imagens

A primeira integração usa Pixabay porque a licença de conteúdo permite uso sem
atribuição pública obrigatória. O worker:

1. aceita somente consultas visuais genéricas;
2. ativa `safesearch`;
3. pede fotografias verticais;
4. limita a duas imagens por carrossel;
5. baixa a imagem para gerar o PNG final, sem hotlink permanente;
6. guarda o resultado da busca em cache privado por 24 horas;
7. registra internamente provedor, ID, autor, página, consulta e licença;
8. cai para slide textual quando não há chave, resultado ou disponibilidade.

Não devem ser selecionadas automaticamente imagens de pessoas públicas,
logotipos, marcas ou eventos exatos. O objetivo da foto é apoiar um conceito,
sem fingir que ela documenta o fato descrito.

Referências de licença e API:

- <https://pixabay.com/api/docs/>
- <https://pixabay.com/service/license-summary/>
- <https://pixabay.com/service/terms/>

## Configuração futura no VPS

Adicionar ao ambiente privado do worker:

```dotenv
CAROUSEL_IMAGE_PROVIDER=pixabay
PIXABAY_API_KEY=<chave privada>
CAROUSEL_IMAGE_MAX_PER_CAROUSEL=2
```

Sem `PIXABAY_API_KEY`, o recurso permanece seguro e funcional, renderizando
todos os slides somente com texto.

## Escopo preservado

- nenhuma migration;
- nenhuma alteração em Stripe, Meta ou regras de pagamento;
- nenhuma mudança em Reels, Stories ou Cortes IA;
- nenhum conteúdo publicado ou já existente é reprocessado;
- nenhum segredo é enviado para banco, frontend, legenda ou logs;
- a publicação continua usando o carrossel nativo já existente.
