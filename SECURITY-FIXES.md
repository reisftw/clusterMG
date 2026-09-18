# Security Fixes

## 2026-09-14 - Limite explicito para payload JSON da Operacao

- **Achado corrigido:** parser JSON da Operacao aceitava ate 10 MB globalmente, acima do necessario para endpoints administrativos comuns.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `apps/rot/backend/src/app.js`
  - `apps/rot/backend/src/security/errors.js`
  - `src/backend/rotPayloadLimits.test.js`
- **Mudanca aplicada:** o limite padrao de JSON passou para 1 MB, com override por `ROT_JSON_LIMIT` quando uma instalacao precisar ampliar de forma consciente. Erros de payload grande agora retornam HTTP 413 com mensagem controlada, e JSON malformado retorna HTTP 400.
- **Validacao executada:**
  - `npm test -- --run src/backend/rotPayloadLimits.test.js`.
  - `node --check apps/rot/backend/src/app.js`.
  - `node --check apps/rot/backend/src/security/errors.js`.
- **Como validar manualmente:**
  - Enviar um JSON maior que 1 MB para uma rota da Operacao; deve retornar HTTP 413.
  - Enviar JSON malformado; deve retornar HTTP 400.
  - Se alguma rotina real exigir maior limite, configurar `ROT_JSON_LIMIT` no ambiente e reiniciar a API.

## 2026-09-14 - CSP sem `unsafe-inline` amplo em estilos

- **Achado corrigido:** configuracoes nginx tinham `unsafe-inline` diretamente em `style-src`, liberando estilos inline de forma ampla.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `apps/rot/ops/nginx-rot.conf.example`
  - `vps/nginx/retiradas.conf`
  - `src/backend/cspConfig.test.js`
- **Mudanca aplicada:** `style-src` ficou restrito a fontes de CSS permitidas; a excecao necessaria para atributos `style={{...}}` do React foi movida para `style-src-attr 'unsafe-inline'`. Tambem foi adicionado `object-src 'none'`.
- **Ajuste pos-deploy:** o vhost da Operacao tambem replica os headers de seguranca dentro de `location /` e `location /assets/`, porque `add_header Cache-Control` nesses blocos impede heranca dos headers definidos no `server`.
- **Validacao executada:**
  - `npm test -- --run src/backend/cspConfig.test.js`.
- **Como validar manualmente:**
  - Aplicar a configuracao nginx, rodar `nginx -t` e recarregar o servico.
  - Abrir Operacao e Retiradas em uma tela com componentes dinamicos/progress bars e confirmar que nao ha erros de CSP no console.

## 2026-09-14 - Validacao de corpo em rotas criticas da Operacao

- **Achado corrigido:** rotas legadas da Operacao consumiam `req.body` diretamente e aceitavam campos extras silenciosamente, principalmente em autenticacao, usuarios e cargos.
- **Rotas legadas mapeadas com uso de `req.body`:**
  - `apps/rot/backend/src/absences/routes.js`
  - `apps/rot/backend/src/activities/routes.js`
  - `apps/rot/backend/src/agents/routes.js`
  - `apps/rot/backend/src/apr/routes.js`
  - `apps/rot/backend/src/assetsSecurity/routes.js`
  - `apps/rot/backend/src/assetsSecurity/publicRoutes.js`
  - `apps/rot/backend/src/attachments/routes.js`
  - `apps/rot/backend/src/auth/routes.js`
  - `apps/rot/backend/src/companies/routes.js`
  - `apps/rot/backend/src/documents/adminRoutes.js`
  - `apps/rot/backend/src/equipments/routes.js`
  - `apps/rot/backend/src/fleet/routes.js`
  - `apps/rot/backend/src/holidays/routes.js`
  - `apps/rot/backend/src/integrations/routes.js`
  - `apps/rot/backend/src/keys/routes.js`
  - `apps/rot/backend/src/legacySync/routes.js`
  - `apps/rot/backend/src/materials/routes.js`
  - `apps/rot/backend/src/notices/routes.js`
  - `apps/rot/backend/src/oauth/routes.js`
  - `apps/rot/backend/src/operationFlows/routes.js`
  - `apps/rot/backend/src/qrcodes/routes.js`
  - `apps/rot/backend/src/rain/routes.js`
  - `apps/rot/backend/src/regionals/routes.js`
  - `apps/rot/backend/src/roles/routes.js`
  - `apps/rot/backend/src/rompimentos/routes.js`
  - `apps/rot/backend/src/serviceTypes/routes.js`
  - `apps/rot/backend/src/settings/routes.js`
  - `apps/rot/backend/src/shifts/routes.js`
  - `apps/rot/backend/src/technicians/routes.js`
  - `apps/rot/backend/src/tecnicosBolsaAuditoria/routes.js`
  - `apps/rot/backend/src/tickets/routes.js`
  - `apps/rot/backend/src/users/routes.js`
  - `apps/rot/backend/src/warlinho/routes.js`
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `apps/rot/backend/src/auth/routes.js`
  - `apps/rot/backend/src/roles/routes.js`
  - `apps/rot/backend/src/security/bodyValidation.js`
  - `apps/rot/backend/src/users/routes.js`
  - `src/backend/rotBodyValidation.test.js`
- **Mudanca aplicada:** foi criado o middleware `validateBody`, que rejeita corpos nao-objeto e campos nao permitidos antes de chegar no handler. A primeira aplicacao ficou nas rotas de login/MFA/reset/senha/MFA preference, administracao de usuarios e administracao de cargos, que sao as rotas de escrita com maior impacto de seguranca.
- **Validacao executada:**
  - `npm test -- --run src/backend/rotBodyValidation.test.js`.
  - `node --check apps/rot/backend/src/security/bodyValidation.js`.
  - `node --check apps/rot/backend/src/auth/routes.js`.
  - `node --check apps/rot/backend/src/roles/routes.js`.
  - `node --check apps/rot/backend/src/users/routes.js`.
- **Como validar manualmente:**
  - Enviar `POST /api/auth/login` com campos `username`, `password` e um campo extra; deve retornar HTTP 400.
  - Criar/editar usuario ou cargo normalmente pelos formularios oficiais; deve seguir funcionando.
  - Tentar enviar campos administrativos extras nao previstos nesses endpoints; deve retornar HTTP 400 antes de alterar dados.

## 2026-09-14 - Dependencias moderadas no backend da Operacao

- **Achado corrigido:** `npm audit` do backend da Operacao apontava vulnerabilidades moderadas em `express/qs` e `gaxios/uuid`.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `apps/rot/backend/package.json`
  - `apps/rot/backend/package-lock.json`
  - `apps/rot/backend/scripts/firebase-import/**` removido
- **Mudanca aplicada:** `express` foi atualizado para a revisao corrigida; `google-auth-library` foi atualizado para 11.x, removendo o caminho vulneravel de `gaxios/uuid`; como o sistema nao usa mais Firebase, `firebase-admin` e os scripts legados de importacao Firestore foram removidos em vez de manter overrides transitivos.
- **Validacao executada:**
  - `npm audit --audit-level=moderate` em `apps/rot/backend`: `found 0 vulnerabilities`.
  - Smoke de dependencias: `node -e "require('express'); require('google-auth-library'); require('gaxios'); console.log('rot backend deps sem firebase ok')"`.
  - `npm ls firebase-admin @firebase/app @google-cloud/firestore @google-cloud/storage gaxios uuid --depth=4` confirma ausencia de Firebase e `gaxios@7.3.1`.
  - `node --check src/index.js` e `node --check src/app.js` em `apps/rot/backend`.
  - `npm test -- --run` na raiz: 62 arquivos e 331 testes passaram.
- **Como validar manualmente:**
  - Rodar `npm install` em `apps/rot/backend` e confirmar que nenhum pacote Firebase e instalado.
  - Rodar `npm audit --audit-level=moderate` e confirmar zero vulnerabilidades.
  - Subir o backend da Operacao e validar login Google/OAuth, pois essa foi a dependencia funcional atualizada.

## 2026-09-14 - Filtro padronizado para uploads de imagens na Operacao

- **Achado corrigido:** rotas de upload de avatar/avisos/APR precisavam de `fileFilter` consistente e limites explicitos.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `apps/rot/backend/src/auth/routes.js`
  - `apps/rot/backend/src/notices/routes.js`
  - `apps/rot/backend/src/security/uploadFilters.js`
  - `apps/rot/backend/src/settings/routes.js`
  - `src/backend/rotUploadFilters.test.js`
- **Mudanca aplicada:** foi criado um helper unico `imageFileFilter` para aceitar apenas PNG, JPEG, WEBP e GIF, com limites explicitos para avatar, avisos e fotos de APR. As rotas rastreadas de avatar e avisos agora usam esse helper compartilhado.
- **Validacao executada:**
  - `npm test -- --run src/backend/rotUploadFilters.test.js`.
  - `node --check apps/rot/backend/src/auth/routes.js`, `node --check apps/rot/backend/src/notices/routes.js`, `node --check apps/rot/backend/src/settings/routes.js` e `node --check apps/rot/backend/src/security/uploadFilters.js`.
- **Como validar manualmente:**
  - Tentar subir PDF/TXT/HTML como avatar ou imagem de aviso; a API deve retornar HTTP 400.
  - Subir PNG/JPEG/WEBP/GIF dentro do limite e confirmar sucesso.
  - Confirmar que avatar de usuario e avatar padrao seguem limite de 700 KB, e imagem de aviso segue limite de 2 MB.
- **Pendencia de branch:** `apps/rot/backend/src/apr/routes.js` ainda esta em modulo novo nao rastreado nesta branch; o arquivo local foi ajustado para usar o mesmo helper, mas deve entrar junto ao commit funcional do APR para evitar quebrar dependencias ainda nao versionadas.

## 2026-09-14 - Sessao da Operacao em cookie HttpOnly

- **Achado corrigido:** token JWT da Operacao era armazenado em `localStorage`, aumentando impacto de XSS.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `apps/rot/backend/src/auth/middleware.js`
  - `apps/rot/backend/src/auth/routes.js`
  - `apps/rot/frontend/src/api/rotApi.js`
  - `apps/rot/frontend/src/state/RotAuthContext.jsx`
  - `src/backend/rotAuthSessions.test.js`
  - `src/frontend/rotApiSessionCookie.test.js`
- **Mudanca aplicada:** login, login Google e verificacao MFA agora gravam a sessao em cookie `operacao_session` com `HttpOnly`, `SameSite=Strict`, `Secure` em producao e `Max-Age` de 7 dias. O frontend envia requisicoes com `credentials: "include"` e nao persiste credenciais no `localStorage`; o cache local ficou restrito a perfil/permissoes para manter o PWA utilizavel offline.
- **Validacao executada:**
  - `npm test -- --run src/backend/rotAuthSessions.test.js src/frontend/rotApiSessionCookie.test.js`.
  - `node --check apps/rot/backend/src/auth/middleware.js` e `node --check apps/rot/backend/src/auth/routes.js`.
- **Como validar manualmente:**
  - Fazer login na Operacao e confirmar no navegador que existe cookie `operacao_session` `HttpOnly` e que `localStorage.rot-auth-token` nao existe.
  - Abrir `/api/auth/me` autenticado e confirmar HTTP 200 sem header `Authorization`.
  - Fazer logout e confirmar que o cookie foi removido e chamadas autenticadas retornam HTTP 401.
  - Abrir o PWA offline apos um login recente e confirmar que o usuario/cache operacional continua disponivel; ao voltar a internet, sincronizacoes devem usar a sessao via cookie se ela ainda estiver valida.

## 2026-09-14 - Revogacao de sessoes JWT no Operacao

- **Achado corrigido:** JWT stateless no Operacao nao podia ser revogado no servidor.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `apps/rot/backend/sql/035_operacao_auth_sessions.sql`
  - `apps/rot/backend/src/auth/middleware.js`
  - `apps/rot/backend/src/auth/routes.js`
  - `apps/rot/frontend/src/api/rotApi.js`
  - `apps/rot/frontend/src/state/RotAuthContext.jsx`
  - `src/backend/rotAuthSessions.test.js`
- **Mudanca aplicada:** cada JWT do Operacao agora recebe `jti` gravado em `rot_sessions`; toda requisicao autenticada exige sessao ativa no banco; `/api/auth/logout` revoga a sessao atual; o frontend chama logout no servidor antes de limpar o token local.
- **Validacao executada:**
  - `npm test -- --run src/backend/rotAuthSessions.test.js`.
  - `node --check apps/rot/backend/src/auth/middleware.js` e `node --check apps/rot/backend/src/auth/routes.js`.
- **Como validar manualmente:**
  - Fazer login na Operacao, chamar `/api/auth/me` e confirmar HTTP 200.
  - Fazer logout e tentar chamar `/api/auth/me` com o mesmo token antigo; deve retornar HTTP 401.
  - Conferir que `rot_sessions.revoked_at` foi preenchido para a sessao encerrada.

## 2026-09-14 - Validacao real de upload por magic bytes

- **Achado corrigido:** uploads em documentos/imoveis devem validar assinatura real do arquivo alem de mimetype/extensao informados pelo cliente.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `src/backend/documentosFileMagicBytes.test.js`
  - `vps/api/src/documentos/routes/documentosRoutes.js`
- **Mudanca aplicada:** a validacao por magic bytes existente em documentos foi exposta para teste automatizado; foi adicionado teste que confirma aceite de PDF/PNG/JPEG reais e rejeicao de executavel/HTML disfarçados como PDF. A validacao de imoveis ja estava conectada nas rotas de upload e foi revalidada por teste existente.
- **Validacao executada:**
  - `npm test -- --run src/backend/documentosFileMagicBytes.test.js src/backend/imoveisFileMagicBytes.test.js`.
- **Como validar manualmente:**
  - Tentar subir um `.pdf` cujo conteudo comece com `MZ` ou HTML em Documentos e Imoveis; a API deve retornar HTTP 400.
  - Subir um PDF, PNG e JPG legitimos e confirmar sucesso.

## 2026-09-14 - TTL de sessao do app principal e refresh token rotativo

- **Achado corrigido:** TTL padrao de 365 dias no token de acesso do app principal.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `src/backend/authRbac.test.js`
  - `src/services/vpsApiClient.js`
  - `vps/api/src/app.js`
  - `vps/api/src/auth.js`
  - `vps/sql/061_auth_refresh_sessions.sql`
- **Mudanca aplicada:** o access token padrao passou para 24h; foi adicionado refresh token opaco com expiracao padrao de 7 dias, armazenado em cookie HttpOnly e rotacionado a cada uso via `/api/auth/refresh`; o cliente tenta renovar uma vez ao receber HTTP 401.
- **Validacao executada:**
  - `npm test -- --run src/backend/authRbac.test.js`: valida login, sessoes ativas/revogadas, TTL curto e rotacao do refresh token.
- **Como validar manualmente:**
  - Fazer login e confirmar que o sistema cria os cookies `retiradas_session`, `retiradas_refresh` e `retiradas_csrf`.
  - Reduzir temporariamente `ACCESS_TOKEN_TTL_SECONDS` em homologacao, aguardar expirar e confirmar que uma chamada autenticada renova a sessao sem redirecionar para login.
  - Fazer logout e confirmar que chamadas autenticadas subsequentes retornam 401.
- **Impacto operacional:** usuarios logados antes do deploy podem precisar entrar novamente porque sessoes antigas nao possuem refresh token.

## 2026-09-14 - Dependencias vulneraveis no VPS

- **Achado corrigido:** CVEs de alta severidade em `multer@2.2.0` e `nodemailer@9.0.5` no pacote `vps`.
- **Arquivos alterados:**
  - `SECURITY-FIXES.md`
  - `vps/package.json`
  - `vps/package-lock.json`
  - `vps/tests/security-dependencies-smoke.test.js`
- **Mudanca aplicada:** atualizado `multer` para `^2.4.0` e `nodemailer` para `^10.0.10`; adicionado smoke test para validar upload multipart em memoria e envio via `jsonTransport` sem rede externa.
- **Validacao executada:**
  - `npm audit --audit-level=moderate --json` em `vps`: vulnerabilidades altas de `multer` e `nodemailer` removidas; permaneceram 3 moderadas de `express/body-parser/qs`, tratadas em item separado.
  - `node --test tests/security-dependencies-smoke.test.js` em `vps`: 2 testes passaram.
- **Como validar manualmente:**
  - Enviar um avatar/anexo simples por uma tela que use upload do app principal e confirmar sucesso.
  - Enviar um e-mail de teste pelo painel de e-mail/admin e confirmar envio.
  - Rodar `npm audit --audit-level=moderate` em `vps` e confirmar que nao ha achados altos.
