# Carrossel Editorial 2A — imagens reais, leitura rápida e custo controlado

## Objetivo

Gerar carrosséis editoriais com aparência profissional, inspirados em conteúdo
educativo de leitura rápida, sem copiar identidade visual de terceiros e sem
usar geração de imagens por IA.

## Contrato visual

- formato vertical `1080x1350`;
- fundo branco, tipografia preta e bastante espaço em branco;
- identidade da própria conta em cabeçalho editorial com logo, nome, selo visual de
  verificação e `@` efetivo;
- conjunto de perfil e informação centralizado verticalmente nos slides textuais;
- 5 a 7 slides;
- 24 a 38 palavras por slide, sem paredes de texto;
- até três frases curtas em negrito, preservadas literalmente do conteúdo;
- exatamente uma foto real por carrossel, sempre na capa;
- capa com manchete e a informação mais impactante, sem adiar o fato principal
  para o slide 2;
- último slide sempre textual, com uma CTA;
- rodapé discreto, contador e indicação de continuidade;
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
4. reserva a única imagem para a capa, inclusive promovendo uma sugestão visual
   que a IA tenha colocado em outro slide;
5. baixa a imagem para gerar o PNG final, sem hotlink permanente;
6. guarda o resultado da busca em cache privado por 24 horas;
7. registra internamente provedor, ID, autor, página, consulta e licença;
8. usa a imagem original da notícia como segunda opção e, se nenhuma imagem
   segura estiver disponível, mantém o carrossel bloqueado em preparação em vez
   de criar uma capa sem foto.

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
CAROUSEL_IMAGE_MAX_PER_CAROUSEL=1
```

Sem `PIXABAY_API_KEY` e sem imagem original, o worker não conclui o carrossel.
Essa trava evita publicar uma capa fora do padrão aprovado.

## Roteamento por conta

- fontes continuam vinculadas explicitamente a uma ou mais contas Instagram;
- temas avulsos e pautas exigem a conta de destino quando há mais de um perfil;
- o Perfil do Criador e o kit visual são carregados da conta escolhida;
- o piloto automático só usa fallback quando existe exatamente uma conta ativa;
- conteúdo sem vínculo nunca é enviado silenciosamente ao primeiro Instagram.

## Escopo preservado

- nenhuma migration;
- nenhuma alteração em Stripe, Meta ou regras de pagamento;
- nenhuma mudança em Reels, Stories ou Cortes IA;
- nenhum conteúdo publicado ou já existente é reprocessado;
- nenhum segredo é enviado para banco, frontend, legenda ou logs;
- a publicação continua usando o carrossel nativo já existente.
