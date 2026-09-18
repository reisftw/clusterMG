# CLAUDE.md

Guia de contexto para assistentes de IA trabalharem neste repositório sem perder as convenções reais do projeto.

## 1. Visão geral do projeto

- Sistema: **Gestão Retiradas / Cluster MG**, aplicação operacional para gestão de retiradas, O.S., mapa/match, agendamentos, mensageria, metas, estoque, documentos, financeiro, imóveis administrativos, usuários, cargos e permissões.
- Contexto de negócio: apoia operação de campo e áreas administrativas de uma empresa de internet, com dashboards públicos e telas internas autenticadas.
- Stakeholders/usuários identificados no código: administradores, supervisores, backoffice de retirada, líderes de empresa, agentes autorizados, financeiro, administrativo, logística, atendimento, técnicos e visitantes de painéis públicos.
- Rotas públicas relevantes: `/painel`, `/painel/mapa`, `/painel/match`, `/aa-sempre`, `/devolucao`, `/duvidas`, `/acompanhamento/financeiro`.
- Rotas autenticadas principais: `/`, `/mapa`, `/agendamentos`, `/financeiro`, `/mensageria`, `/documentos`, `/administrativo/imoveis`, `/usuarios`, `/configuracoes/cargos`, `/logs`.
- Módulo separado: `apps/finan` é um sistema financeiro próprio (frontend + backend + banco Postgres dedicados), extraído deste app, destino `finan.retiradas.tech`. Ver seção 11.

## 2. Stack técnica

- Frontend:
  - JavaScript/JSX com React `19.2.x`.
  - Vite `8.x`.
  - React Router DOM `7.18.x`.
  - Tailwind CSS `4.x` via PostCSS.
  - UI com `lucide-react`, `@headlessui/react`, Chart.js e `react-chartjs-2`.
  - Importação/relatórios com `xlsx`, `exceljs`, `jspdf`, `jspdf-autotable`, `html2pdf.js`.
  - Sentry opcional via `VITE_SENTRY_DSN`.
- Backend:
  - Node.js/CommonJS em `vps/api`.
  - Express `4.x`, PostgreSQL via `pg`, `helmet`, `cors`, `compression`, `multer`, `nodemailer`, `argon2`.
  - Entrada em `vps/api/src/index.js`, que sobe API e workers de mensageria, confirmação de agendamento, financeiro e recuperação de jobs.
- Banco de dados:
  - PostgreSQL.
  - Auth/RBAC: `app_users`, `app_roles`, `app_role_permissions`, `app_permissions`, `app_sessions`.
  - Legado Firestore/Postgres: `app_documents`, acessado por `vps/api/src/documents.js`.
  - Tabelas normalizadas recentes: regionais/usuários, mensageria, agendamentos/esteira, financeiro reports/config/DRE, imóveis, ordens/snapshots, eventos operacionais e auxiliares de documentos.
- Cache/filas:
  - Cache em memória no backend para documentos, auth, financeiro, dashboard público e status de mensageria.
  - Filas persistidas no PostgreSQL; não há broker externo dedicado identificado.
- Serviços externos identificados:
  - Evolution/WhatsApp, Google Drive, Google OAuth, Okta OAuth, Hubsoft, Cvortex, Senior/Sapiens, Sempre API, Lalamove/logística.

## 3. Comandos essenciais

- Instalar dependências do frontend:
  ```bash
  npm ci
  ```
- Instalar dependências do backend:
  ```bash
  npm ci --prefix vps
  ```
- Rodar frontend local:
  ```bash
  npm run dev
  ```
- Rodar backend local:
  ```bash
  cd vps
  npm run api:dev
  ```
- Rodar lint:
  ```bash
  npm run lint
  ```
- Rodar testes:
  ```bash
  npm test
  ```
- Rodar cobertura:
  ```bash
  npm run test:coverage
  ```
- Rodar E2E:
  ```bash
  npm run test:e2e
  ```
- Build de produção:
  ```bash
  npm run build
  ```
- Preview do build:
  ```bash
  npm run preview
  ```
- Migrations SQL gerais:
  ```bash
  cd vps
  npm run migrate:sql
  ```
- Migrations normalizadas:
  ```bash
  cd vps
  npm run migrate:normalized:apply
  ```
- Scripts de migração por domínio:
  ```bash
  cd vps
  npm run migrate:regionais-usuarios
  npm run migrate:mensageria
  npm run migrate:agendamentos-esteira
  npm run migrate:financeiro-reports
  npm run migrate:financeiro-budget-config
  npm run migrate:imoveis
  npm run migrate:ordens
  ```
- Backup manual:
  ```bash
  cd vps
  npm run backup:database
  ```

## 4. Arquitetura

- Estrutura principal:
  - `src/main.jsx`: entrada React, providers globais, service worker e error tracking.
  - `src/router`: rotas públicas/protegidas e constantes de rota.
  - `src/context`: autenticação, tema, modo de layout e estado global do sistema.
  - `src/services`: cliente HTTP para a VPS, sessão local, snapshots, eventos em tempo real e serviços transversais.
  - `src/modules`: módulos internos por domínio.
  - `src/pages`: páginas públicas/especiais como Painel Público, Mapa, Acompanhamento e Terceiros.
  - `vps/api/src`: API Express, repositórios, integrações, workers e rotas administrativas.
  - `vps/sql`: migrations SQL numeradas.
  - `vps/scripts`: importadores, migrations idempotentes, backup e reconciliações.
  - `tests/e2e`: fluxos Playwright.
- Padrão arquitetural:
  - Monólito modular pragmático.
  - Backend ainda mistura rotas grandes em `app.js` com routers/controller/service por módulo em áreas mais recentes.
  - A direção atual é **deep modules**: domínio com contrato próprio, repositório próprio e callers sem depender do shape genérico de Firestore.
- Fluxo principal:
  - Frontend: rota React -> página/componente -> hook/service de módulo -> `requestVpsApi` -> API REST.
  - Backend: rota Express/controller -> service/repository -> `db.query`/`db.connect` -> PostgreSQL.
- Camada de compatibilidade:
  - `vps/api/src/documents.js` mantém `listDocuments`, `getDocument`, `upsertDocument`, `deleteDocument` para legado e compatibilidade.
  - Coleções já cortadas para normalizado aparecem em `NORMALIZED_ONLY_COLLECTIONS`; novas chamadas genéricas devem falhar em vez de voltar silenciosamente para `app_documents`.
  - Ainda existem adapters de compatibilidade para alguns domínios, especialmente imóveis e ordens, porque parte do contrato antigo continua existindo no código/testes.
  - Novo código deve chamar repositórios/serviços de domínio diretamente, não `documents.js`.
- Repositórios de domínio existentes:
  - `regionaisRepository.js` e `usersRepository.js`: regionais, cidades/responsáveis e usuários normalizados em `app_users`.
  - `mensageriaRepository.js`: config, templates, fila, histórico, callbacks, conversas e locks transacionais de fila.
  - `agendamentosRepository.js`: agendamentos, logs e esteira.
  - `financeiroReportsRepository.js`: Serasa/Tarifas, import logs e DRE.
  - `financeiroBudgetConfigRepository.js`: contas, centros, fornecedores, matrizes/filiais, diretorias e matriz orçamentária.
  - `imoveisRepository.js`: imóveis, contratos, anexos, reajustes/IPTU/aluguéis/aditivos e relatórios financeiros.
  - `ordensRepository.js`: ordens, match, legadas/acumuladas e snapshots operacionais.
  - `operationalEventsRepository.js`: eventos operacionais/API fora de `app_documents`.
- Domínios principais:
  - Operação/painel público: mapa, match, ordens, metas, acompanhamento.
  - Agendamentos/esteira: agenda, confirmação e clientes de esteira.
  - Mensageria: fila, histórico, callbacks, templates e integração Evolution.
  - Financeiro: reports Serasa/Tarifas, DRE, orçamento/configuração, contas, centros, KPIs e importações XLSX.
  - Administrativo: imóveis, documentos, insumos, usuários, cargos, regionais, empresas.
  - Integrações: Hubsoft, Cvortex, Senior, Sempre, Google Drive, e-mail.

## 5. Alterações estruturais recentes

- Homologação e produção:
  - Branch `homolog-dev` publica homologação.
  - Branch `master` publica produção.
  - Em `2026-08-31`, `homolog-dev` e `master` foram igualadas no commit `d236a10`.
- Normalização de banco:
  - `030_regionais_usuarios_normalizacao.sql`: regionais/cidades/responsáveis e colunas adicionais em `app_users`.
  - `031_mensageria_normalizacao.sql`: fila, histórico, callbacks, conversas, templates e config.
  - `032`/`033`: agendamentos/esteira e bloqueio de escrita antiga.
  - `034`/`035`: financeiro Serasa/Tarifas/import logs e bloqueio de escrita antiga.
  - `036`/`037`: financeiro orçamento/config e bloqueio de escrita antiga.
  - `038`/`039`: imóveis e bloqueio parcial via domínio.
  - `040`/`041`: ordens/match/legadas/acumuladas e bloqueio/snapshots normalizados.
  - `042_operational_events.sql`: eventos operacionais fora de `app_documents`.
  - `043_documentos_auxiliares_normalizacao.sql`: auxiliares de documentos fora de `app_documents`.
  - `044_dre_lancamentos.sql`: DRE normalizada.
- Refactor de contratos:
  - Imóveis, mensageria e agendamentos passaram a ter interface de domínio dedicada.
  - `documents.js` deve ser tratado como adapter legado, não como API interna padrão para módulos novos.
- Financeiro:
  - A aba antiga "Orçado x Realizado" foi substituída por DRE em `/financeiro/gestao-orcamento/dre`.
  - `FinanceiroPage.jsx` passou por extrações de hooks/utils/subcomponentes; evitar reacoplar lógica grande nesse arquivo.
  - Utilitários recentes relevantes: `dreStatement.js`, `financeiroPageViewModel.js`, `financeiroPdfText.js`, `budgetInsights.js`, `budgetCharts.js`, `budgetImportRows.js`.
- Auditoria/logs:
  - A intenção de produto é auditar ações humanas relevantes, não rotinas sistêmicas, MFA, imports automáticos, snapshots ou jobs de atualização.

## 6. Convenções de código

- Nomenclatura:
  - Componentes React em `PascalCase.jsx`.
  - Hooks como `useNomeDoDominio.js`.
  - Serviços frontend geralmente em `camelCaseService.js`.
  - Backend CommonJS com funções `camelCase` e módulos por domínio/repositório.
  - Constantes de rotas/permissões em `UPPER_SNAKE_CASE`.
- Imports:
  - Frontend usa ES modules.
  - Backend em `vps` usa CommonJS (`require`/`module.exports`).
- Erros:
  - Frontend centraliza chamadas em `requestVpsApi`, que lança `Error` com `status`, `data` e `details`.
  - Backend usa `next(error)` e respostas JSON controladas; stacks não devem ir ao cliente.
  - Mutations autenticadas usam CSRF (`X-CSRF-Token`) quando necessário.
  - Em módulos normalizados, preferir erro visível/log objetivo a fallback silencioso que esconda inconsistência.
- Logging:
  - Backend usa `console.log`, `console.warn`, `console.error` com prefixos de módulo em workers e integrações.
  - Frontend usa `src/utils/logger.js` e Sentry quando configurado.
  - Auditoria fica em `vps/api/src/auditLog.js`.
- Commits e branches:
  - `CONTRIBUTING.md` recomenda Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
  - Branches recomendadas: `feature/<tema>`, `fix/<tema>`, `hotfix/<tema>`, `chore/<tema>`.
  - Operação atual: `homolog-dev` para homologação; `master` para produção.
- Lint/formatação:
  - ESLint flat config em `eslint.config.js`.
  - Regra ativa importante: `no-unused-vars` como erro, ignorando variáveis/argumentos que casem com `^[A-Z_]`.
  - Frontend usa globals de browser; backend `vps/**/*.js` usa globals Node/CommonJS.
  - Biome existe em `biome.json` com tabs e aspas duplas, mas o script versionado de lint é `eslint .`.

## 7. Testes

- Framework principal: Vitest `4.x`.
- Ambiente frontend: `jsdom`, configurado em `vite.config.js`.
- Setup global: `src/test/setup.js`, com `@testing-library/jest-dom/vitest`, `cleanup` e `vi.restoreAllMocks`.
- E2E: Playwright em `tests/e2e`, base URL padrão `http://127.0.0.1:5173`, retries no CI.
- Convenções de nomes:
  - `*.test.js`, `*.test.jsx`, `*.test.mjs`.
  - Testes backend ficam em `src/backend`, mas carregam módulos de `vps/api/src`.
  - Testes de módulo também aparecem perto do domínio, como `src/modules/financeiro/utils/*.test.js`.
- Mocks:
  - Frontend usa `vi.mock`, `vi.stubGlobal("fetch", ...)`, Testing Library e `renderHook`.
  - Backend usa `createRequire` apontando para `vps/package.json` e injeta mocks no `require.cache` para `db`, `auth`, repositórios e integrações.
- Cobertura:
  - `npm run test:coverage` usa Istanbul e gera `text`, `html` e `lcov`.
  - Não há cobertura mínima obrigatória configurada em `vite.config.js`.
- Validação padrão antes de push/deploy:
  ```bash
  npm run lint -- --quiet
  npm test
  npm run build
  ```

## 8. Padrões e práticas específicas do time

- Autenticação:
  - Login local em `/api/auth/login`, sessão com JWT HS256 assinado por `APP_AUTH_SECRET`.
  - Senhas novas usam Argon2id; há suporte a senha legada PBKDF2.
  - Sessões persistem em `app_sessions`.
  - Google OAuth e Okta OAuth são opcionais/configuráveis.
- Autorização:
  - RBAC por cargos e permissões em `app_roles`, `app_permissions` e `app_role_permissions`.
  - Frontend valida com `ProtectedRoute` e `hasAnyPermission`.
  - Backend valida com `requireAuthenticated`, `requireRoles`, `requireAnyPermission` e regras por regional/empresa.
- Variáveis de ambiente:
  - Frontend: `.env.example` com `VITE_API_BASE_URL` e `VITE_DATA_BACKEND`.
  - Backend: `vps/api/.env.example` com PostgreSQL, CORS, auth, rate limits, webhooks, Google Drive, SMTP e integrações.
  - Secrets devem ficar em GitHub Actions ou `/etc/retiradas/*.env`, nunca versionados.
- API:
  - REST/JSON sob `/api`.
  - Rotas públicas sob `/api/public`.
  - Rotas administrativas/autenticadas sob `/api/admin`, `/api/documents`, `/api/auth`, e routers por domínio.
  - Mutations autenticadas exigem CSRF; webhooks externos exigem segredo em produção.
- Deploy:
  - `.github/workflows/ci.yml` roda security, lint, testes, build e deploy.
  - Push em `homolog-dev`: publica frontend em `/var/www/retiradas-homolog/dist`, backend em `/opt/retiradas/vps-homolog`, API `retiradas-api-homolog`, env `/etc/retiradas/api-homolog.env`.
  - Push em `master` ou `main`: publica produção em `/var/www/retiradas/dist`, backend em `/opt/retiradas/vps`, API `retiradas-api`, env `/etc/retiradas/api.env`.
  - O deploy executa `npm ci --omit=dev`, `npm run migrate:sql`, `npm run migrate:normalized:apply`, reinicia systemd e recarrega nginx.
  - A pipeline também prepara `uploads/avatars` com dono/permissão adequados para a API.
- Ambientes:
  - Produção: `https://retiradas.tech`, API interna padrão `3001`.
  - Homologação: `https://homolog.retiradas.tech`, API interna `3002`, banco `retiradas_homolog`.
- Versão visual:
  - O frontend recebe `VITE_APP_VERSION=${GITHUB_SHA::7}` e `VITE_APP_ENV_LABEL` pela pipeline para mostrar versão/ambiente no rodapé.
- Fluxo de trabalho local entre os apps do monorepo (padrão fixado em 18/09/2026):
  - O repositório tem uma única pasta de trabalho local (`retiradas`), sem worktrees separados por app.
  - Cada app tem sua própria branch: `finan` atua em `apps/finan`, `adm` atua em `apps/adm`, `rot` atua em `apps/rot`. `master`/`homolog-dev` seguem cuidando do app original (`src/`, `vps/api`).
  - Para mexer num app, troque a branch ativa na mesma pasta (`git checkout <branch>`) antes de editar — não crie worktree novo por padrão.
  - Sempre trabalhar local primeiro (editar, testar, buildar) e só depois subir para a VPS via **deploy manual por SSH** (chave `~/.ssh/retiradas_github_actions_deploy`). Não depender do CI para publicar essas mudanças.
  - Antes de qualquer deploy, o estado local deve ser tratado como a fonte da verdade a caminho da VPS: local vira produção, não o contrário — se a VPS estiver na frente do local (arquivo alterado direto lá), isso é excepcional e deve ser puxado e reconciliado explicitamente, não presumido.

## 9. O que NÃO fazer

- Não hardcodar senhas, tokens SSH, tokens de webhook, segredos de auth ou credenciais Google.
- Não reintroduzir escrita em `app_documents` para coleções que já foram cortadas para tabelas normalizadas sem decisão explícita.
- Não criar nova funcionalidade usando `documents.listDocuments`/`upsertDocument` quando já existir repositório de domínio.
- Não depender de `document_id` como chave confiável em coleções legadas; há histórico de duplicidades.
- Não mascarar erro crítico com fallback silencioso em módulos normalizados; exibir erro e registrar log claro.
- Não gerar auditoria para atualizações sistêmicas, jobs, imports automáticos ou snapshots operacionais como se fossem ações humanas.
- Não publicar dashboards públicos com informações financeiras sensíveis sem validação de regra de negócio.
- Não editar deploy manualmente em produção como padrão; o fluxo atual deve passar por branch, commit, push e GitHub Actions.
- Não versionar `dist`, `node_modules`, uploads, arquivos `.env`, pacotes de deploy (`*.tar.gz`, `*.zip`) ou temporários.
- Não mexer em grandes refatorações recentes de `src/modules/financeiro/components/FinanceiroPage.jsx` sem contexto; várias partes já foram extraídas para hooks, utils e subcomponentes.
- Não alterar `operationalImports.js`, `publicDashboard.js` ou snapshots dentro de refactors estruturais sem isolar o risco e validar manualmente painel/mapa/match.
- Não colocar `react`, `react-dom` ou `react-router-dom` como dependência direta em `apps/finan/frontend/package.json` — já causou instância duplicada do React em produção (tela quebrando em runtime). O Finan roda seu próprio Vite/React; se precisar reaproveitar página do workspace raiz, importe via `@source` do Tailwind, não via dependência cruzada de React.
- Não commitar um novo arquivo em `apps/finan/backend/sql/*.sql` sem rodar o preflight correspondente contra produção antes — o deploy do Finan (`deploy-finan-vps`) roda `npm run migrate` automaticamente a cada push pra `finan`/`master`, sem gate manual.
- Não dar efeito colateral de escrita a uma rota `GET` no backend do Finan (já causou incidente real de produção — ver seção 11).
- Não editar código de produção do Finan direto por SSH como atalho; mesma regra do app principal, sempre por branch/commit/push/CI.

## 10. Contexto adicional útil

- Documentação complementar:
  - `README.md`: resumo do projeto e comandos básicos.
  - `DOCUMENTATION.md`: arquitetura técnica inicial.
  - `CONTRIBUTING.md`: branches, commits e checklist de PR.
  - `SECURITY_REVIEW.md`: controles de autenticação, sessão, API, webhooks e infraestrutura.
  - `vps/README.md`: estrutura da VPS e comandos de API/backup.
  - `vps/docs/homologacao.md`: ambiente de homologação.
  - `vps/api/src/webhooks/WEBHOOK_VALIDATIONS.md`: validações de webhooks.
  - `docs/estabilizacao`: notas de estabilização e migração.
- Responsáveis/CODEOWNERS:
  - Não foi encontrado `CODEOWNERS`; responsáveis por módulo devem ser confirmados com o time.
- Observações sobre dados:
  - O projeto veio de um padrão Firebase/Firestore, e `app_documents` ainda existe como compatibilidade para parte do contrato.
  - A normalização está avançada, mas a remoção total do legado deve ser feita por domínio, validando callers backend/frontend antes de bloquear.
  - Ordens/match são críticos para dashboard público; mudanças nessa área exigem checagem manual de contagens, snapshots e importação.
- Observações sobre CI:
  - O job `security` roda `npm audit --audit-level=high`, Semgrep e Gitleaks.
  - O job `build-and-test` roda `npm run lint`, `npm test` e `npm run build`.
  - O CI usa Node.js `24`.

## 11. Módulo Finan (`apps/finan`)

- Visão geral:
  - Sistema financeiro extraído do Retiradas: orçamento, DRE (parcial), relatórios Serasa/Tarifas, integrações (Hubsoft/Cvortex), equipe (setores/cargos/colaboradores), configurações.
  - Workspace próprio dentro do monorepo, com frontend, backend e banco PostgreSQL **separados** do app principal. Produção em `https://finan.retiradas.tech`.
  - Frontend historicamente reaproveitava páginas administrativas do Retiradas via dependência cruzada de workspace; isso foi revertido por instabilidade em produção (ver "O que NÃO fazer"). O reaproveitamento visual hoje é só via `@source` do Tailwind apontando pra árvore `src/` do Retiradas.
- Stack:
  - Backend: Node.js/Express `4.x` CommonJS próprio em `apps/finan/backend/src`, PostgreSQL via `pg` cru (sem ORM), pool dedicado (`apps/finan/backend/src/db.js`).
  - Frontend: React `19.x`/Vite `8.x` próprio em `apps/finan/frontend`, porta de dev `5174`, Tailwind CSS `4.x` self-contido.
  - Banco: Postgres dedicado (não é o `retiradas` principal), tabelas prefixadas `finan_*`. Conexão via `FINAN_DATABASE_URL` OU o conjunto `FINAN_PGHOST`/`FINAN_PGPORT`/`FINAN_PGUSER`/`FINAN_PGPASSWORD`/`FINAN_PGDATABASE` (produção usa a segunda forma — o backend suporta as duas, ver `buildConfig()` em `db.js`).
- Comandos:
  ```bash
  # frontend
  npm run finan:frontend:dev
  npm run finan:frontend:build

  # backend (dentro de apps/finan/backend)
  npm run api:dev
  npm run api:start

  # migrations (dentro de apps/finan/backend) — roda tudo em sql/*.sql, nao recursivo
  npm run migrate

  # backup dedicado (dentro de apps/finan/backend)
  npm run backup:database

  # testes de integracao com Postgres real (sobe container via docker-compose.test.yml)
  npm run finan:test:integration
  npm run finan:test:db:migrate
  ```
  - Scripts auxiliares de migration (preflight/rollback) ficam em `apps/finan/backend/sql-tools/`, **fora** do diretório que o runner varre (`sql/`) — colocar ali por engano faz o runner tentar executar `\echo`/meta-comandos psql como SQL e falhar.
  - Testes de integração usam `fileParallelism: false` (`vitest.finan-integration.config.js`) — nunca rodar duas suítes de integração ao mesmo tempo contra o mesmo Postgres de teste; já causou `deadlock detected` em `TRUNCATE` concorrente.
- Segurança (`apps/finan/backend/src/security/`):
  - `authRateLimit.js`: rate limit por IP em login (20/15min), verificação MFA (30/15min) e reset de senha (10/15min) — configurável via `FINAN_LOGIN_RATE_LIMIT`/`FINAN_MFA_RATE_LIMIT`/`FINAN_PASSWORD_RESET_RATE_LIMIT`.
  - `errors.js`: handler global de erro sanitizado (nunca vaza stack/secret ao cliente).
  - `cors.js`, `logSanitizer.js`, `noStore.js`.
  - Padrão obrigatório: toda rota async precisa de `try/catch` + `next(error)`. Express 4 não captura rejection automaticamente — um erro de banco não tratado derruba o processo Node inteiro (Node 15+), não só a requisição. Foi a causa raiz de um crash loop real de produção (27 restarts/24h) em 2026-09-05.
- Deploy (`.github/workflows/ci.yml`, job `deploy-finan-vps`):
  - Dispara em push pra `finan` ou `master`, depois de `security` + `build-and-test` passarem.
  - Builda o frontend, empacota `apps/finan` (exceto `node_modules`/`.env`), envia por SCP, instala deps só se `package.json` mudou (hash em `.package-json.sha256`), roda `npm run migrate` (**aplica migrations pendentes automaticamente, sem gate manual** — qualquer `.sql` novo em `apps/finan/backend/sql/` commitado é executado em produção real no próximo deploy), reinicia `finan-api.service`, valida `nginx -t` e recarrega o nginx.
  - Produção: `/opt/retiradas/apps/finan`, serviço `finan-api.service` (porta interna `3101`), env `/opt/retiradas/apps/finan/.env` (permissão 600, dono root), domínio `https://finan.retiradas.tech`.
- Backup:
  - `apps/finan/backend/scripts/database-backup.js` — `pg_dump --format=custom`, permissão 600, retenção configurável (`FINAN_BACKUP_RETENTION`, padrão 30; `FINAN_BACKUP_MAX_BYTES`, padrão 10GB), grava em `FINAN_BACKUP_DIR`.
  - Automatizado via systemd: `finan-db-backup.service` + `.timer` (diário `00:30 UTC`, 29min depois do backup do banco principal pra não concorrer por I/O), instalado e habilitado em produção em `2026-09-05`. Exemplos versionados em `apps/finan/ops/finan-db-backup.{service,timer}.example`.
  - Este backup é **separado** do backup automatizado do banco `retiradas` principal (`retiradas-db-backup.timer`) — cobre só o banco do Finan.
- Estado conhecido / dívidas técnicas:
  - **DRE não implementado**: a rota `GET /api/financeiro/gestao-orcamento/dre` referencia uma tabela `dre_lancamentos` que nunca foi criada no banco do Finan (diferente do Retiradas principal, que tem `044_dre_lancamentos.sql`). Retorna 500 hoje — não é regressão, é feature pendente. Vai precisar de migration própria quando for priorizada.
  - `financeiroBudgetConfigRepository.saveBudgetCostCenters` faz `DELETE`+reinsert completo de `finan_orcamento_matriz`/`finan_filiais`/`finan_centros_custo`/`finan_diretorias`/`finan_fornecedores`/`finan_matrizes`/`finan_contas` a cada gravação de configuração orçamentária. É frágil: qualquer FK nova que envolva essas tabelas (como a migration 010) pode quebrar esse fluxo se alguma tabela dependente (ex.: `finan_orcamento_lancamentos`) não for considerada. `getBudgetCostCenters` (rota GET) já teve, e não deve voltar a ter, efeito colateral de escrita.
  - Nginx de produção do Finan ainda não tem os headers de hardening completos (`apps/finan/ops/nginx-finan.conf.example` já tem a versão endurecida pronta pra aplicar).
- Histórico relevante (`2026-09-05`, branch `finan`):
  - Auditoria de segurança em fases: secrets vazando em endpoint admin sem checagem de permissão (corrigido), config de pool, rate limiting, CORS, headers, sanitização de erro/log.
  - Migration `010_finan_data_integrity_constraints.sql` aplicada em produção real (NOT NULL, CHECK de período/ano, FK, UNIQUE), com preflight de 23 checks (0 violações) antes de aplicar. Preflight e rollback em `apps/finan/backend/sql-tools/`.
  - Bug de crash em produção corrigido: `orcamento/routes.js` referenciava `e.codigo`, coluna inexistente em `finan_matrizes` (o valor real mora em `source_payload->>'codigo'`, JSONB), sem `try/catch` — corrigido a query e adicionado tratamento de erro nas rotas `/resumo` e `/detalhes`.
  - Bug de regressão pós-migration corrigido: `GET /orcamento/centros-custo` tinha efeito colateral de escrita (ver dívida técnica acima) que passou a violar a FK nova da migration 010; removida a escrita implícita da rota de leitura.
  - Backup automatizado dedicado do Finan criado, validado (`pg_dump`/`pg_restore` reais) e habilitado em produção.
  - Ícone/PWA: `apps/finan/frontend/public/manifest.webmanifest` + `sw.js` (app instalável como PWA, mesmo padrão do app principal — ver seção 8), favicon e logo do menu lateral trocados pelo novo ícone do Finan.

## Última atualização

2026-09-05

Este arquivo deve ser revisado quando houver mudanças arquiteturais significativas.
