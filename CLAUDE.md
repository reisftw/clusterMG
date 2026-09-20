# CLAUDE.md

Guia de contexto para assistentes de IA trabalharem neste repositório sem perder as convenções reais do projeto.

## 1. Visão geral do projeto

- Sistema: **Gestão Retiradas / Cluster MG**, aplicação operacional para gestão de retiradas, O.S., mapa/match, agendamentos, mensageria, metas, estoque, documentos, financeiro, imóveis administrativos, usuários, cargos e permissões.
- Contexto de negócio: apoia operação de campo e áreas administrativas de uma empresa de internet, com dashboards públicos e telas internas autenticadas.
- Stakeholders/usuários identificados no código: administradores, supervisores, backoffice de retirada, líderes de empresa, agentes autorizados, financeiro, administrativo, logística, atendimento, técnicos e visitantes de painéis públicos.
- Rotas públicas relevantes: `/painel`, `/painel/mapa`, `/painel/match`, `/aa-sempre`, `/devolucao`, `/duvidas`, `/acompanhamento/financeiro`.
- Rotas autenticadas principais: `/`, `/mapa`, `/agendamentos`, `/financeiro`, `/mensageria`, `/documentos`, `/administrativo/imoveis`, `/usuarios`, `/configuracoes/cargos`, `/logs`.

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
  - Node.js/CommonJS em `apps/retiradas/backend/api`.
  - Express `4.x`, PostgreSQL via `pg`, `helmet`, `cors`, `compression`, `multer`, `nodemailer`, `argon2`.
  - Entrada em `apps/retiradas/backend/api/src/index.js`, que sobe API e workers de mensageria, confirmação de agendamento, financeiro e recuperação de jobs.
- Banco de dados:
  - PostgreSQL.
  - Auth/RBAC: `app_users`, `app_roles`, `app_role_permissions`, `app_permissions`, `app_sessions`.
  - Legado Firestore/Postgres: `app_documents`, acessado por `apps/retiradas/backend/api/src/documents.js`.
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
  npm ci --prefix apps/retiradas/backend
  ```
- Rodar frontend local:
  ```bash
  npm run dev
  ```
- Rodar backend local:
  ```bash
  cd apps/retiradas/backend
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
  cd apps/retiradas/backend
  npm run migrate:sql
  ```
- Migrations normalizadas:
  ```bash
  cd apps/retiradas/backend
  npm run migrate:normalized:apply
  ```
- Scripts de migração por domínio:
  ```bash
  cd apps/retiradas/backend
  npm run migrate:regionais-usuarios
  npm run migrate:mensageria
  npm run migrate:agendamentos-esteira
  npm run migrate:imoveis
  npm run migrate:ordens
  ```
- Backup manual:
  ```bash
  cd apps/retiradas/backend
  npm run backup:database
  ```

## 4. Arquitetura

- Estrutura principal:
  - `apps/retiradas/frontend/src/main.jsx`: entrada React, providers globais, service worker e error tracking.
  - `apps/retiradas/frontend/src/router`: rotas públicas/protegidas e constantes de rota.
  - `apps/retiradas/frontend/src/context`: autenticação, tema, modo de layout e estado global do sistema.
  - `apps/retiradas/frontend/src/services`: cliente HTTP para a VPS, sessão local, snapshots, eventos em tempo real e serviços transversais.
  - `apps/retiradas/frontend/src/modules`: módulos internos por domínio.
  - `apps/retiradas/frontend/src/pages`: páginas públicas/especiais como Painel Público, Mapa, Acompanhamento e Terceiros.
  - `apps/retiradas/backend/api/src`: API Express, repositórios, integrações, workers e rotas administrativas.
  - `apps/retiradas/backend/sql`: migrations SQL numeradas.
  - `apps/retiradas/backend/scripts`: importadores, migrations idempotentes, backup e reconciliações.
  - `tests/e2e`: fluxos Playwright.
- Padrão arquitetural:
  - Monólito modular pragmático.
  - Backend ainda mistura rotas grandes em `app.js` com routers/controller/service por módulo em áreas mais recentes.
  - A direção atual é **deep modules**: domínio com contrato próprio, repositório próprio e callers sem depender do shape genérico de Firestore.
- Fluxo principal:
  - Frontend: rota React -> página/componente -> hook/service de módulo -> `requestVpsApi` -> API REST.
  - Backend: rota Express/controller -> service/repository -> `db.query`/`db.connect` -> PostgreSQL.
- Camada de compatibilidade:
  - `apps/retiradas/backend/api/src/documents.js` mantém `listDocuments`, `getDocument`, `upsertDocument`, `deleteDocument` para legado e compatibilidade.
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
  - Backend em `apps/retiradas/backend` usa CommonJS (`require`/`module.exports`).
- Erros:
  - Frontend centraliza chamadas em `requestVpsApi`, que lança `Error` com `status`, `data` e `details`.
  - Backend usa `next(error)` e respostas JSON controladas; stacks não devem ir ao cliente.
  - Mutations autenticadas usam CSRF (`X-CSRF-Token`) quando necessário.
  - Em módulos normalizados, preferir erro visível/log objetivo a fallback silencioso que esconda inconsistência.
- Logging:
  - Backend usa `console.log`, `console.warn`, `console.error` com prefixos de módulo em workers e integrações.
  - Frontend usa `apps/retiradas/frontend/src/utils/logger.js` e Sentry quando configurado.
  - Auditoria fica em `apps/retiradas/backend/api/src/auditLog.js`.
- Commits e branches:
  - `CONTRIBUTING.md` recomenda Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
  - Branches recomendadas: `feature/<tema>`, `fix/<tema>`, `hotfix/<tema>`, `chore/<tema>`.
  - Operação atual: `homolog-dev` para homologação; `master` para produção.
- Lint/formatação:
  - ESLint flat config em `eslint.config.js`.
  - Regra ativa importante: `no-unused-vars` como erro, ignorando variáveis/argumentos que casem com `^[A-Z_]`.
  - Frontend usa globals de browser; backend `apps/retiradas/backend/**/*.js` usa globals Node/CommonJS.
  - Biome existe em `biome.json` com tabs e aspas duplas, mas o script versionado de lint é `eslint .`.

## 7. Testes

- Framework principal: Vitest `4.x`.
- Ambiente frontend: `jsdom`, configurado em `vite.config.js`.
- Setup global: `apps/retiradas/frontend/src/test/setup.js`, com `@testing-library/jest-dom/vitest`, `cleanup` e `vi.restoreAllMocks`.
- E2E: Playwright em `tests/e2e`, base URL padrão `http://127.0.0.1:5173`, retries no CI.
- Convenções de nomes:
  - `*.test.js`, `*.test.jsx`, `*.test.mjs`.
  - Testes backend ficam em `apps/retiradas/frontend/src/backend`, mas carregam módulos de `apps/retiradas/backend/api/src`.
  - Testes de módulo também aparecem perto do domínio, como `apps/retiradas/frontend/src/modules/financeiro/utils/*.test.js`.
- Mocks:
  - Frontend usa `vi.mock`, `vi.stubGlobal("fetch", ...)`, Testing Library e `renderHook`.
  - Backend usa `createRequire` apontando para `apps/retiradas/backend/package.json` e injeta mocks no `require.cache` para `db`, `auth`, repositórios e integrações.
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
  - Backend: `apps/retiradas/backend/api/.env.example` com PostgreSQL, CORS, auth, rate limits, webhooks, Google Drive, SMTP e integrações.
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
  - Cada app do monorepo tem sua própria branch: `finan` atua em `apps/finan`, `adm` atua em `apps/adm`, `rot` (nome externo: Operação) atua em `apps/operacao`. `master`/`homolog-dev` seguem cuidando do app original (`src/`, `apps/retiradas/backend/api`), que continua publicando via CI/GitHub Actions normalmente (não confundir com a regra abaixo).
  - Para mexer num desses três apps (`finan`/`adm`/`rot`), troque a branch ativa na mesma pasta (`git checkout <branch>`) antes de editar — não crie worktree novo por padrão.
  - Para `apps/finan`, `apps/adm` e `apps/operacao`: trabalhar local primeiro (editar, testar, buildar) e só depois subir para a VPS via **deploy manual por SSH** (chave `~/.ssh/retiradas_github_actions_deploy`), sem depender do CI para publicar essas mudanças. Isso é diferente da regra de "não fazer deploy manual" da seção 9, que vale para o app original (`src/`/`apps/retiradas/backend/api`) publicado via GitHub Actions.
  - Antes de qualquer deploy desses três apps, o estado local deve ser tratado como a fonte da verdade a caminho da VPS: local vira produção, não o contrário — se a VPS estiver na frente do local (arquivo alterado direto lá), isso é excepcional e deve ser puxado e reconciliado explicitamente, não presumido.

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
- Não mexer em grandes refatorações recentes de `apps/retiradas/frontend/src/modules/financeiro/components/FinanceiroPage.jsx` sem contexto; várias partes já foram extraídas para hooks, utils e subcomponentes.
- Não alterar `operationalImports.js`, `publicDashboard.js` ou snapshots dentro de refactors estruturais sem isolar o risco e validar manualmente painel/mapa/match.
- Pode acessar via SSH utilizando as chaves do GIT HUB ACTIONS, apenas não faça deploy manual.

## 10. Contexto adicional útil

- Documentação complementar:
  - `README.md`: resumo do projeto e comandos básicos.
  - `DOCUMENTATION.md`: arquitetura técnica inicial.
  - `CONTRIBUTING.md`: branches, commits e checklist de PR.
  - `SECURITY_REVIEW.md`: controles de autenticação, sessão, API, webhooks e infraestrutura.
  - `apps/retiradas/backend/README.md`: estrutura da VPS e comandos de API/backup.
  - `apps/retiradas/backend/docs/homologacao.md`: ambiente de homologação.
  - `apps/retiradas/backend/api/src/webhooks/WEBHOOK_VALIDATIONS.md`: validações de webhooks.
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

## Última atualização

2026-08-31

Este arquivo deve ser revisado quando houver mudanças arquiteturais significativas.
