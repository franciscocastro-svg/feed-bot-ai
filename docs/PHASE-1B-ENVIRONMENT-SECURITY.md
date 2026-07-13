# Fase 1B — Segurança de ambientes e segredos

## Objetivo

Impedir que novas credenciais privadas sejam versionadas acidentalmente e deixar explícito onde cada configuração deve viver. Esta fase não troca credenciais, não altera integrações e não modifica o banco de dados.

## Fronteiras de confiança

### Frontend e Lovable

Toda variável iniciada por `VITE_` é incorporada ao JavaScript entregue ao navegador. Portanto, ela deve ser considerada pública mesmo quando configurada pelo painel da Lovable.

Valores permitidos no frontend:

- URL e chave publicável/anon do Supabase;
- identificador do Meta Pixel;
- token público do provedor de pagamentos;
- URL pública dos binários FFmpeg.

Nunca usar `VITE_` para service role, segredo de webhook, chave privada de IA, segredo da Meta/Instagram ou credencial administrativa.

### Edge Functions e Supabase

Segredos de Stripe/pagamentos, Meta/Instagram, Resend, Lovable AI, provedores de IA, cron interno e service role pertencem ao cofre de segredos do ambiente. Eles não devem existir em arquivos versionados.

### Worker e VPS

O worker lê credenciais privadas do ambiente do processo ou de um `.env` local protegido com permissão `600`. Use `worker/.env.example` somente como contrato de nomes; nunca preencha o arquivo de exemplo.

## Verificação automática

`npm run check:secrets` examina arquivos rastreados e arquivos novos não ignorados. A verificação procura formatos de credenciais de alta confiança e atribuições preenchidas de variáveis sensíveis.

Por segurança, a saída contém somente caminho, linha e identificador da regra. O valor encontrado nunca é impresso. A verificação bloqueia `npm run ci` e, consequentemente, o workflow do GitHub.

Limites conhecidos:

- a verificação não substitui o secret scanning do provedor Git;
- ela inspeciona a árvore atual, não todo o histórico;
- identificadores públicos e placeholders documentais são permitidos;
- qualquer credencial exposta deve ser revogada, mesmo após a remoção do arquivo.

## Situação transitória de `.env.production`

O repositório já possuía um `.env.production` versionado com configurações públicas `VITE_*`. Ele foi preservado nesta fase para não interromper pagamentos ou Meta antes de confirmar a configuração equivalente na Lovable.

Regras durante a transição:

1. não adicionar nenhum segredo privado ao arquivo;
2. manter os valores equivalentes no ambiente de produção da Lovable;
3. confirmar build e pagamento em homologação;
4. remover o arquivo do Git em uma fase própria após a confirmação operacional.

Adicionar `.env.*` ao `.gitignore` impede novos arquivos de ambiente por padrão, mas não deixa de rastrear um arquivo que já está no histórico. A remoção futura deverá ser explícita e revisada.

## Rotação e incidente

Se um token aparecer em commit, log, mensagem ou captura de tela:

1. revogar imediatamente no provedor;
2. criar uma credencial nova com privilégio mínimo e expiração;
3. atualizar apenas o cofre do ambiente correspondente;
4. validar o serviço afetado;
5. registrar o incidente sem copiar o valor da credencial.

## Liberação e rollback

- Não há migration nem mudança de dados nesta fase.
- O scanner pode ser revertido como um único commit caso produza falso positivo impeditivo.
- Os arquivos `.env` reais continuam fora do Git.
- Nenhuma configuração de produção deve ser removida antes de uma validação na Lovable e no serviço correspondente.
