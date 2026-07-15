# Enquadramento Inteligente 1A

Esta entrega protege o assunto principal das imagens editoriais de cortes agressivos em Feed, Stories e Reels.

## Comportamento

- A imagem original deixa de ser convertida antecipadamente em um quadrado com `fit=cover`.
- A fotografia completa é centralizada e exibida com `contain`.
- O espaço que sobra é preenchido por uma cópia ampliada, escurecida e suavizada da própria fotografia.
- O mesmo contrato é usado pelo processador automático, pelo navegador e pelo worker do VPS.
- No editor manual, **Inteligente** passa a ser o modo padrão; **Preencher** e **Encaixar** continuam disponíveis.

Assim, rostos, pessoas e objetos próximos das bordas permanecem visíveis sem criar faixas vazias ou alterar o formato final exigido pelo Instagram.

## Implantação

1. Executar os gates do projeto e o scanner de segredos.
2. Implantar somente a Edge Function `process-news`.
3. Publicar o frontend.
4. Atualizar e reiniciar o worker do VPS a partir do mesmo commit.

Não há migration, segredo novo ou mudança em pagamentos. Artes antigas não são regeneradas automaticamente; a regra vale para novas composições e regenerações solicitadas pelo usuário.

## Rollback

Reimplantar `process-news`, frontend e worker a partir do commit anterior. Nenhuma reversão de banco é necessária.
