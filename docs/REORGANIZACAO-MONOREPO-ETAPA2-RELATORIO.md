# Reorganização do monorepo — Etapa 2 (mover Retiradas pra apps/retiradas)

> Segunda etapa controlada, conforme escopo autorizado. Branch de trabalho
> `refactor/monorepo-quatro-apps`. Nenhuma branch original foi alterada,
> nenhum push/deploy/migration foi executado.

## 1. Estado inicial e final do Git

| | Inicial | Final |
|---|---|---|
| Branch ativa | `refactor/monorepo-quatro-apps` | `refactor/monorepo-quatro-apps` (inalterada) |
| Working tree | 2 arquivos não rastreados (relatórios da Etapa 1) | Limpo |
| `master` | `a594f54aec8d905255d68a4864e4b9eedc045a23` | idêntico |
| `finan` | `b5424c2c7f65ce32981be2629f5e86325487a847` | idêntico |
| `adm` | `41da07210b996cd2d4e2253b3b3f34abf04dd173` | idêntico |
| `rot` | `a746f589e92f07d69ef0653e7a0a88714bf81e84` | idêntico |
| stashes | 2 da Operação (entre outros de sessões anteriores) | os mesmos 2, intactos |

## 2. SHA do checkpoint

`backup/pre-move-retiradas` → `185a52efa803e6014b9f4099820bcf756a684b6e`
(commit de documentação, imediatamente antes da movimentação estrutural).

Antes disso, resolvido o único arquivo não rastreado pendente da etapa
anterior (`docs/REORGANIZACAO-MONOREPO-DIAGNOSTICO.md`): verificado sem
segredos e versionado junto com `docs/REORGANIZACAO-MONOREPO-ETAPA1-RELATORIO.md`
num commit exclusivo de documentação (`185a52e`).

## 3. Inventário dos arquivos da raiz

| Caminho | Categoria | Consumidores | Destino | Referências a atualizar | Risco |
|---|---|---|---|---|---|
| `src/` | retiradas-frontend | Vite, Vitest, ESLint, Finan (Tailwind `@source`) | `apps/retiradas/frontend/src` | vite.config, eslint.config, CI, Finan | Alto (Finan depende) |
| `vps/` | retiradas-backend | package.json raiz (indireto, sem script direto), CI, systemd/nginx remoto | `apps/retiradas/backend` | CI (`--prefix vps`, tar `-C vps`), CLAUDE.md | Médio |
| `public/` | retiradas-frontend | Vite (assets estáticos) | `apps/retiradas/frontend/public` | nenhuma (resolvido via `root` do Vite) | Baixo |
| `index.html` | retiradas-frontend | Vite (entry point) | `apps/retiradas/frontend/index.html` | nenhuma (resolvido via `root`) | Baixo |
| `vite.config.js` | retiradas-frontend | scripts npm raiz | `apps/retiradas/frontend/vite.config.js` | package.json scripts, `root`/`outDir`/`cacheDir` explícitos | Alto (build quebra se mal configurado) |
| `.env.example` (raiz) | retiradas-frontend | `npm run dev` local | `apps/retiradas/frontend/.env.example` | nenhuma | Baixo |
| `tests/e2e/` | retiradas-e2e | Playwright | `apps/retiradas/frontend/tests/e2e` | playwright.config testDir (relativo, sem mudança) | Baixo |
| `playwright.config.js` | retiradas-e2e | scripts npm raiz | `apps/retiradas/frontend/playwright.config.js` | package.json script `test:e2e` | Baixo |
| `tests/firestore.rules.test.mjs` | **desconhecido/ambíguo** | nenhum (órfão, era Firestore/pré-Postgres) | **não movido** | — | — |
| `cors.json` | **desconhecido/ambíguo** | nenhum identificado (origens `*.web.app`/`*.firebaseapp.com`, era Firebase Hosting) | **não movido** | — | — |
| `scripts/` | compartilhado | `report:capacity` (script genérico de relatório de carga, não amarrado a nenhum app específico) | raiz (não movido) | nenhuma | Baixo |
| `examples/` | compartilhado | `scripts/generate-capacity-report.js` (fixture de exemplo) | raiz (não movido) | nenhuma | Baixo |
| `package.json`/`package-lock.json` (raiz) | orquestração-monorepo | Retiradas (deps) + Finan (deps herdadas) | raiz (não movido, Fase 3) | scripts atualizados | Alto |
| `eslint.config.js` | configuração-global | todo o monorepo | raiz (não movido) | blocos `files` atualizados | Médio |
| `sonar-project.properties` | configuração-global | Sonar local | raiz (não movido) | `sonar.sources`/`tests`/`exclusions` atualizados | Baixo |
| `biome.json` | configuração-global | não usado no lint versionado (`eslint .`) | raiz (não movido) | nenhuma | Baixo |
| `.github/` | infraestrutura | CI/CD | raiz (não movido) | `ci.yml` paths locais atualizados | Alto |
| `.gitignore`, `.vscode/`, `.claude/` | configuração-global | tooling/editor | raiz (não movido) | nenhuma | Baixo |
| `CLAUDE.md`, `README.md`, `DOCUMENTATION.md`, `CONTRIBUTING.md`, `SECURITY_REVIEW.md`, `CHANGELOG.md`, `CONTEXT.md`, `informativo.md`, `relatorio-responsividade.md` | documentação-global | humanos/assistentes | raiz (não movido, Fase 6 explícita) | `CLAUDE.md` atualizado (parcial, seção 19); demais com referências residuais documentadas (seção 19 deste relatório) | Baixo (documental) |
| `docs/` | documentação-global | humanos/assistentes | raiz (não movido) | nenhuma (docs de arquitetura passada tratados como histórico) | Baixo |

Nenhum item teve propriedade ambígua o suficiente pra travar a
movimentação principal — os 2 casos ambíguos encontrados
(`tests/firestore.rules.test.mjs`, `cors.json`) são órfãos isolados sem
consumidor identificado, sinalizados e deixados intocados na raiz, sem
bloquear o restante.

## 4. Arquivos movidos

738 arquivos renomeados com 100% de similaridade detectada pelo git
(`src/` → `apps/retiradas/frontend/src`, `vps/` → `apps/retiradas/backend`,
`public/`, `index.html`, `.env.example`, `tests/e2e/` →
`apps/retiradas/frontend/tests/e2e`, `playwright.config.js`). Todos via
`git mv`.

**1 exceção**: `vite.config.js` aparece como delete+create (não rename)
no diff, porque o conteúdo foi editado substancialmente no mesmo commit
(adição de `root`/`cacheDir`/`build.outDir` explícitos), o que derrubou a
similaridade abaixo do limiar de detecção automática do git. É
semanticamente o mesmo arquivo movido, só não foi reconhecido como rename
pela heurística.

## 5. Arquivos mantidos na raiz e justificativa

Ver tabela da seção 3 — resumo: tudo que é `configuração-global`,
`orquestração-monorepo`, `documentação-global`, `infraestrutura` ou
`compartilhado` ficou na raiz, por definição explícita do escopo (Fase 2
do plano: "não mover documentação global para dentro do Retiradas", "não
mover infraestrutura compartilhada sem comprovação"). `scripts/` e
`examples/` ficaram porque `generate-capacity-report.js` não tem
acoplamento identificado a nenhum app específico (usa `users`,
`avgResponseMs` genéricos — poderia servir qualquer um dos 4 sistemas).

## 6. Configurações atualizadas

| Arquivo | O que mudou |
|---|---|
| `apps/retiradas/frontend/vite.config.js` | `root` explícito (via `import.meta.url`, funciona independente do cwd de invocação), `cacheDir: "../../../node_modules/.vite"`, `build.outDir: "../../../dist"` + `emptyOutDir: true` — preserva `dist/` gerado na raiz do repo (mesmo local que o CI já espera) |
| `eslint.config.js` | 5 blocos `files` atualizados: `src/**` → `apps/retiradas/frontend/src/**`, `vps/**` → `apps/retiradas/backend/**`, `tests/e2e/**`+`playwright.config.js` → novos caminhos, `src/context/**` → novo caminho, `src/test/**` (no bloco catch-all de testes) → novo caminho |
| `sonar-project.properties` | `sonar.sources`, `sonar.tests`, `sonar.test.inclusions`, `sonar.exclusions` atualizados pros novos caminhos (também adicionei `apps/adm/**`/`apps/rot/**` às exclusões, já que agora coexistem na árvore e não devem ser escaneados pelo projeto Sonar do Retiradas) |
| `.env.example` (agora em `apps/retiradas/frontend/`) | Só movido, conteúdo inalterado |

## 7. Scripts atualizados

`package.json` (raiz) — 8 scripts do Retiradas passaram a apontar
explicitamente pro novo `vite.config.js`/`playwright.config.js` via
`--config`:

```diff
- "dev": "vite",
+ "dev": "vite --config apps/retiradas/frontend/vite.config.js",
- "test": "vitest",
+ "test": "vitest --config apps/retiradas/frontend/vite.config.js",
- "coverage": "vitest run --coverage",
+ "coverage": "vitest run --coverage --config apps/retiradas/frontend/vite.config.js",
- "build": "vite build",
+ "build": "vite build --config apps/retiradas/frontend/vite.config.js",
- "test:e2e": "playwright test",
+ "test:e2e": "playwright test --config apps/retiradas/frontend/playwright.config.js",
- "preview": "vite preview",
+ "preview": "vite preview --config apps/retiradas/frontend/vite.config.js",
- "test:coverage": "vitest run --coverage",
+ "test:coverage": "vitest run --coverage --config apps/retiradas/frontend/vite.config.js",
- "test:coverage:json": "vitest run --coverage --coverage.reporter=json-summary",
+ "test:coverage:json": "vitest run --coverage --coverage.reporter=json-summary --config apps/retiradas/frontend/vite.config.js",
- "test:watch": "vitest",
+ "test:watch": "vitest --config apps/retiradas/frontend/vite.config.js",
```

`"lint": "eslint ."` e `"report:capacity"` **não mudaram** (raiz continua
sendo o cwd correto pra ambos). Nenhuma dependência removida do
`package.json` raiz — React, Vite, Chart.js etc. continuam lá,
compartilhados com o Finan (Fase 3, sem workspaces nesta etapa).

## 8. Imports do Finan corrigidos

Busquei (`rg`/`grep`) por `src/modules|src/pages|src/context|src/services|src/utils|@source.*src`
dentro de `apps/finan` e analisei cada ocorrência individualmente (sem
substituição cega):

- **~15 ocorrências eram só comentários** ("Replica visual de
  src/modules/X", "portado de src/context/Y") — descrevem de onde um
  componente foi *inspirado*, não um import real. Não precisam de
  correção (continuam descrevendo a origem histórica corretamente).
- **1 ocorrência era um import JS real, mas já resolvido localmente**:
  `FinanFinanceiroPage.jsx` importa `FinanceiroPage` de
  `"../modules/financeiro/components/FinanceiroPage"` — é a **cópia
  própria do Finan** (`apps/finan/frontend/src/modules/financeiro/...`),
  não o `src/modules/financeiro` da raiz. O comentário em `index.css`
  que descrevia esse acoplamento como direto estava desatualizado — não
  toquei no comentário (fora do escopo, é só texto), só no `@source`
  real.
- **A única dependência ativa real**: `apps/finan/frontend/src/index.css:27`,
  `@source "../../../../src/**/*.{js,jsx,ts,tsx}"` → corrigido pra
  `@source "../../../retiradas/frontend/src/**/*.{js,jsx,ts,tsx}"`.

Nenhum lazy-import do Finan (`App.jsx`, todos os 27+ `lazy(() =>
import("./components/..."))`) referencia código fora de `apps/finan` —
todos são locais. A caracterização anterior (Fase 1) de que o Finan fazia
"lazy-import direto de páginas administrativas de `src/modules/**`" não
se confirmou no código real desta branch; era baseada num comentário
desatualizado, não em imports vivos.

## 9. Estratégia utilizada para evitar React duplicado

`apps/finan/frontend/package.json` não lista `react`/`react-dom`/`vite`
como dependência (documentado no próprio arquivo como intencional).
Confirmado após a movimentação:

```
node -e "console.log(require.resolve('react', {paths: ['apps/finan/frontend']}))"
→ C:\...\retiradas\node_modules\react\index.js
```

Resolve pra uma única instância, na raiz — não há `react` dentro de
`apps/finan/frontend/node_modules`. Build do Finan rodado com sucesso
depois da correção do `@source`, sem nenhum erro de "invalid hook call",
React duplicado, contexto `undefined` ou `react/jsx-runtime` — não houve
bloqueio arquitetural nesta etapa.

## 10. Tratamento de uploads

Backend do Retiradas usa `path.resolve(process.env.UPLOADS_DIR ||
path.join(process.cwd(), "uploads"))` (`apps/retiradas/backend/api/src/app.js`,
código não alterado). Como o backend continua sendo invocado via `cd
apps/retiradas/backend && npm run api:start` (mesmo padrão de antes,
`cd vps && npm run api:dev`), `process.cwd()` continua sendo o diretório
do backend — o caminho relativo de uploads/avatares **não mudou de
profundidade**, só de nome do diretório pai. Nenhum código de upload foi
tocado. Nenhum arquivo de upload real foi movido, copiado ou versionado.

## 11. Alterações no workflow versionado (`.github/workflows/ci.yml`)

Só 3 padrões, todos referências **locais** de origem (nunca os destinos
remotos):

| Antes | Depois | Ocorrências |
|---|---|---|
| `vps/package-lock.json` (cache-dependency-path) | `apps/retiradas/backend/package-lock.json` | 5 |
| `npm ci --prefix vps` | `npm ci --prefix apps/retiradas/backend` | 2 |
| `-C vps .` (empacotamento tar do backend) | `-C apps/retiradas/backend .` | 2 |

**Preservado sem alteração**: todos os triggers (`on.push.branches`),
condições `if:` de cada job, os 3 secrets de VPS (`VPS_HOST`/`VPS_PORT`/
`VPS_USER`), `VPS_API_PATH` (`/opt/retiradas/vps`, `/opt/retiradas/vps-homolog`
— destinos remotos, continuam válidos), nomes de serviço
(`retiradas-api`, `retiradas-api-homolog`), portas (`3001`), domínios,
health checks, jobs de deploy do Finan (`deploy-finan-vps`) e homologação
(`deploy-homolog-vps`) — nenhum deles foi tocado. Nada de ADM ou Operação
foi adicionado ao CI (fora do escopo desta etapa). Workflow **não foi
executado nem publicado**.

## 12. Commits criados

| Commit | Mensagem | Tipo |
|---|---|---|
| `185a52e` | `docs(monorepo): record pre-migration architecture diagnosis` | Documental (Fase 0) |
| `e2a043e` | `refactor(monorepo): move Retiradas into apps directory` | Estrutural atômico (move + correção Finan + configs) |

`backup/pre-move-retiradas` aponta pro commit imediatamente anterior
(`185a52e`).

## 13. Resultado de lint

```
npm run lint -- --quiet
```

**14 erros, todos pré-existentes em `apps/adm/**/*.test.jsx`** (mesmo
achado documentado na Etapa 1 — lacuna de configuração do ESLint pra
`apps/**` que já existia antes desta etapa, não relacionada à
movimentação do Retiradas). **Zero erros novos** em
`apps/retiradas/frontend/src/**` — confirma que o realinhamento dos
blocos `files` do `eslint.config.js` funcionou sem introduzir regressão.

## 14. Resultado dos testes

```
npm test -- --run
```

**Antes da correção dos 29 arquivos de teste do backend**: 29 arquivos
falharam (33 testes), porque usavam `createRequire`/`require.resolve`
com o caminho hardcoded `"vps/..."` (agora inexistente).

**Depois da correção** (path `"vps/` → `"apps/retiradas/backend/` nos 29
arquivos, usando `require.resolve`/`createRequire` com caminhos
compostos via `process.cwd()`):

```
Test Files  63 passed (63)
     Tests  353 passed (353)
```

100% de sucesso — inclusive o teste que tinha falhado por timeout na
validação da Etapa 1 passou dessa vez (confirma que era flakiness de
ambiente, não um problema estrutural).

## 15. Resultado dos builds

| Sistema | Comando | Resultado |
|---|---|---|
| Retiradas | `npm run build` | ✅ OK (14.53s), `dist/` gerado corretamente na raiz do repo |
| Finan (frontend) | `npm run build` (`apps/finan/frontend`) | ✅ OK (3.73s), sem erro de React duplicado/hook/contexto |
| ADM (frontend) | `npm run build` (`apps/adm/frontend`) | ✅ OK — reconfirmado inalterado |
| Operação (frontend) | `npm run build` (`apps/rot/frontend`) | ✅ OK (14.55s) — reconfirmado inalterado |

## 16. Resultado dos E2E

```
npx playwright test --config apps/retiradas/frontend/playwright.config.js --list
```

Config resolvida corretamente, **11 testes localizados em 2 arquivos**
(`critical-flows.spec.js`, `critical-ui-flows.spec.js`) — confirma que o
`testDir` relativo continua válido após a movimentação. **Execução real
não realizada**: os testes exigem um dev server rodando
(`http://127.0.0.1:5173`) e, no caso de login válido, credenciais reais
via `E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` — subir esse ambiente completo
estava fora do escopo desta validação estrutural local. Documentado
conforme instrução ("execute o subconjunto possível").

## 17. Hash do ADM antes e depois

`2e0fa5a6e4c14be33ffe189d2f60f309448bba43` → `2e0fa5a6e4c14be33ffe189d2f60f309448bba43`
(**idêntico**, confirmado via `git rev-parse HEAD:apps/adm`).

## 18. Hash da Operação antes e depois

`dfcfbf568a5f178299de37124546b1e6cf910682` → `dfcfbf568a5f178299de37124546b1e6cf910682`
(**idêntico**, confirmado via `git rev-parse HEAD:apps/rot`). `apps/rot`
**não foi renomeado** — permanece com esse nome, conforme instrução
explícita desta etapa.

## 19. Referências antigas restantes e classificação

| Arquivo:linha | Referência | Classificação | Ação |
|---|---|---|---|
| `CLAUDE.md:263,265` | `"app original (`src/`, ...)"` ao descrever `master`/`homolog-dev` | **Caminho de produção/branch ainda válido** | Nenhuma — essas branches genuinamente ainda têm `src/` na raiz (não foram tocadas por esta migração), a frase descreve elas corretamente |
| `CHANGELOG.md` (várias) | `src/utils/` | **Documentação histórica** | Nenhuma — changelog descreve entregas passadas |
| `informativo.md` (várias) | `src/**`, `vps/**`, `vps/api/src/...`, `vps/scripts/...` | **Documentação histórica** | Nenhuma — relatório de missão de segurança já concluída, com contagens "antes/depois" de um momento específico |
| `relatorio-responsividade.md` (várias) | `src/components/...`, `src/pages/...`, `src/modules/...` | **Documentação histórica** | Nenhuma — auditoria de responsividade ponto-no-tempo, como um relatório do Sonar |
| `CONTEXT.md:7` | `src/modules/financeiro/domain/financialStatement.js` | **Falso positivo** | Refere-se à cópia própria do Finan (`apps/finan/frontend/src/modules/financeiro/domain/`), não à raiz antiga — path relativo ambíguo no texto, mas não está quebrado |
| `CONTEXT.md:6` | `vps/api/src/financeiroStatement.js` | **Erro (pendência)** | Refere-se ao antigo backend do Retiradas — desatualizado, não corrigido nesta etapa (documento narrativo, baixa prioridade operacional) |
| `README.md:8,35` | `/vps/api`, `vps/` | **Erro (pendência)** | Quickstart do README ficou desatualizado — recomendo corrigir numa próxima passada de documentação, não crítico pro funcionamento |
| `DOCUMENTATION.md:62,78` | `.\vps\api\src\app.js` (local) + `/opt/retiradas/vps/...` (remoto) | **Misto**: local é erro (pendência), remoto é caminho válido | Lado remoto preservado corretamente; lado local desatualizado, não corrigido nesta etapa |
| `docs/*.md` (SONARQUBE-MAP, TECHNICAL-AUDIT, DATABASE-CONSTRAINTS-PLAN, DEPLOY-ROLLBACK, REORGANIZACAO-MONOREPO-DIAGNOSTICO) | várias | **Documentação histórica** | Nenhuma — são registros de auditorias/diagnósticos anteriores, reescrever mudaria o que eles documentam |

Nenhuma ocorrência restante representa um caminho que o **código** (não
documentação) ainda tenta resolver — todas as referências funcionais
(scripts, configs, imports, CI) foram corrigidas e validadas via
build/lint/test.

## 20. Falhas ou pendências

- **Falha real encontrada e corrigida durante a etapa**: 29 arquivos de
  teste do backend (`apps/retiradas/frontend/src/backend/*.test.js`)
  quebraram por causa de caminho hardcoded `"vps/..."` — não estava
  documentado no diagnóstico da Fase 1 (que focou em imports JS, não em
  strings de path usadas por `require.resolve`/`createRequire` em
  testes). Corrigido e validado (353/353 testes passando).
- **Pendência de documentação** (não bloqueante): `README.md`,
  `DOCUMENTATION.md` e `CONTEXT.md` têm referências desatualizadas a
  `vps/`/`src/` que não foram corrigidas nesta etapa (ver seção 19) —
  recomendo uma passada dedicada de documentação depois que a
  reorganização estrutural completa (Operação renomeada, workspaces,
  etc.) estabilizar, pra não reescrever a mesma doc várias vezes.
- **E2E não executado de ponta a ponta** — só validação de config/listagem
  (seção 16), por exigir ambiente completo (dev server + backend +
  banco).
- `tests/firestore.rules.test.mjs` e `cors.json` continuam órfãos na
  raiz, sem decisão tomada sobre eles (mantidos intocados, como
  instruído).

## 21. Confirmação: branches e stashes originais permanecem intactos

Confirmado na seção 1 — `master`, `finan`, `adm`, `rot` seguem nos
mesmos SHAs registrados no início desta etapa. `git stash list` idêntica,
2 stashes da Operação nas mesmas posições, nenhum `pop`/`apply`/`drop`
executado.

## 22. Confirmação: nenhum push, deploy ou migration foi realizado

Confirmado. Todas as operações foram locais (`git mv`, edição de
arquivos, `git commit`, `npm run build`/`lint`/`test`, `npx playwright
test --list`). Nenhum `git push`. Nenhum `npm run migrate*`/`backup:database`
executado em nenhum dos 4 apps. Nenhuma conexão a banco real. O
`.github/workflows/ci.yml` foi editado mas **não executado nem
publicado**.

---

## Estado final — onde tudo ficou

- Branch ativa: `refactor/monorepo-quatro-apps` (2 commits à frente do
  checkpoint da Etapa 1: documentação + movimentação atômica).
- `apps/retiradas/frontend/src`, `apps/retiradas/backend/api`,
  `apps/retiradas/backend/sql` existem e funcionam. `src`/`vps` não
  existem mais na raiz.
- Finan builda com a correção do `@source`. ADM e Operação inalterados
  (hash idêntico). `apps/rot` não foi renomeado.
- CI, ESLint, Sonar e `package.json` raiz atualizados e validados.
- Branches originais e stashes intactos. Nada publicado.

**Aguardando sua revisão antes de qualquer próxima etapa** (renomear
`apps/rot` → `apps/operacao`, adicionar workspaces, separar bancos, ou
promover esta branch pra `master`).
