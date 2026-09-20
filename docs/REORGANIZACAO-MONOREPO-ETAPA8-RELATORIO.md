# Etapa 8 — Estabilização final, correção dos gates do monorepo e preparação definitiva para promoção

Nenhum push, merge, deploy ou migration foi executado. Nenhuma branch legada ou stash foi tocado.

## 1. Branch e SHA inicial

- Branch: `refactor/monorepo-quatro-apps`.
- SHA inicial (fim da Etapa 7): `b743a02fb486e3c383b06364f5f64cf402768ce2`.

## 2. SHA do checkpoint

- `backup/pre-release-stabilization` → `b743a02fb486e3c383b06364f5f64cf402768ce2` (mesmo HEAD inicial, criado na Fase 0, sem checkout).

## 3. SHA final

- `c269122618082b1b45277fc6bb161382bfe2858b` — **SHA final aprovado desta auditoria.**
- `master...HEAD`: 0 commits exclusivos de `master`, 67 exclusivos da branch (59 na Etapa 7 + 2 da própria Etapa 7 + 6 desta etapa). Fast-forward continua mecanicamente possível.

## 4. Estado inicial e final do Git

Inicial: working tree limpo, branch correta, `master` sem commits exclusivos (confirmado na Fase 0). Final: working tree limpo, 6 commits novos, mesmo checkpoint preservado, 12 stashes intactos (nenhum criado/aplicado/removido), todas as branches `backup/*` preexistentes preservadas, branches legadas `finan`/`adm`/`rot` não tocadas.

## 5. Causa técnica do teste flaky

`apps/adm/frontend/src/pages/PainelPublico/hooks/useDashboardData.test.js`, primeiro teste do arquivo (`"carrega o data.json com sucesso e popula o estado"`), falhava por `Test timed out in 5000ms` **apenas** quando executado dentro da suíte completa (35 arquivos vitest concorrentes) sob carga de CPU alta — nunca isolado.

Investigação (checklist completo da Fase 2):

- **Timers reais**: o hook agenda um `window.setTimeout(750ms)` real (refresh silencioso em background) a cada montagem — não é mockado no teste. Mas o efeito limpa esse timer no `unmount` (`window.clearTimeout(refreshTimer)`), e o RTL `cleanup()` roda em `afterEach` (`apps/adm/frontend/src/test/setup.js`), então não há timer sobrevivendo entre testes.
- **Promises não aguardadas / cache module-level**: `cache`/`pendingRequest`/`cacheGeneration` são module-scoped em `useDashboardData.js`, mas `loadModule()` chama `vi.resetModules()` antes de cada `import()` dinâmico, garantindo módulo fresco por teste — não há vazamento de estado entre casos.
- **Mocks de `fetch`**: `vi.stubGlobal("fetch", vi.fn())` em `beforeEach`, `vi.unstubAllGlobals()` em `afterEach` — isolamento correto.
- **Causa real**: custo de cold-start do ambiente jsdom para o **primeiro** teste de cada arquivo, quando 35 ambientes jsdom são inicializados concorrentemente sob carga de CPU externa à suíte (outros processos rodando na mesma máquina). Medido: campo `environment` do Vitest somou 107-168s distribuídos entre workers nas execuções completas da Etapa 7/8 — custo real de setup de ambiente, não latência de aplicação (o `fetch` é mockado e resolve sincronamente).

## 6. Correção aplicada

Timeout específico de 15000ms aplicado **somente** a esse teste (terceiro argumento de `it(...)`), com comentário explicando a causa (cold-start, não falha de lógica). Nenhum timeout global foi alterado; nenhum outro teste foi tocado. Commit `c1acdf4`.

## 7. Resultados das 20 execuções isoladas

`npx vitest run src/pages/PainelPublico/hooks/useDashboardData.test.js`, 20x consecutivas: **20/20 `EXIT:0`**, duração 4-6s cada.

## 8. Resultados das 10 suítes frontend do ADM

`npx vitest run` (suíte completa, 36 arquivos após a Fase 5) dentro de `apps/adm/frontend`, 10x consecutivas: **10/10 `EXIT:0`**, duração 23-27s cada.

## 9. Resultados das 5 execuções de `test:adm`

`npm run test:adm`, 5x consecutivas: **5/5 `EXIT:0`**, duração 28-30s cada.

## 10. Resultados das 5 execuções de `verify:all`

`npm run verify:all`, 5x consecutivas: **5/5 `EXIT:0`**, duração 171-241s cada. Nenhuma exigiu retry manual.

## 11. Matriz real de testes dos quatro apps

Investigação de scripts (`package.json` raiz) + execução isolada de cada `test:<app>`:

| Script | Subcomandos executados | Framework | Arquivos coletados | Testes/casos | Resultado |
|---|---|---|---|---|---|
| `test:retiradas` | `vitest run --config apps/retiradas/frontend/vite.config.js` | Vitest (frontend, inclui testes que carregam o backend via `createRequire`) | 63 arquivos | 353 testes | passou |
| `test:finan` | `node scripts/check-backend-syntax.mjs apps/finan/backend/src apps/finan/backend/scripts` | **Não é framework de teste** — checagem de sintaxe (`node --check`) | 118 arquivos backend | **0 testes** (Finan não tem nenhum arquivo `*.test.js`, nem frontend nem backend) | 0 erros de sintaxe |
| `test:adm` | `npm test --prefix apps/adm/frontend` (Vitest) + `node scripts/check-backend-syntax.mjs apps/adm/backend/src` | Vitest (frontend) + checagem de sintaxe (backend) | 36 arquivos vitest + 82 arquivos backend | 125 testes vitest (121 + 4 do health check novo, Fase 5) | passou |
| `test:operacao` | `node --test` (10 arquivos backend) + `npm test --prefix apps/operacao/frontend` (Vitest) | node:test (backend) + Vitest (frontend) | 10 arquivos node:test + 3 arquivos vitest | 42 + 13 = 55 | passou |
| `test:contracts` | `node --test tests/contracts/cspConfig.test.js tests/contracts/ciDeployGates.test.js` | node:test | 2 arquivos | 4 (2 originais + 2 novos da Fase 4) | passou |

**Correção de rotulagem**: o relatório da Etapa 7 (item 12) atribuiu esses números ao app errado — o total (531 na Etapa 7, 537 agora com os 6 testes novos desta etapa) e o `EXIT:0` sempre estiveram corretos; só a tabela por app estava com as linhas trocadas (o "121" que a Etapa 7 chamou de Finan é do ADM; o "42" que chamou de ADM/`node --test` é o backend da Operação). Corrigido com nota transparente em `docs/REORGANIZACAO-MONOREPO-ETAPA7-RELATORIO.md`, sem reescrever histórico de commit.

`test:finan` **não deveria ser chamado de "teste unitário"** em nenhuma documentação futura — é checagem de sintaxe. Isso também significa que **o Finan não tem nenhuma cobertura de teste automatizado hoje** (frontend ou backend) — registrado como risco residual (item 22), não corrigido nesta etapa por estar fora do escopo (criar testes novos para o Finan é funcionalidade nova, não estabilização).

## 12. Alteração exata dos gates do CI

`.github/workflows/ci.yml`, job `deploy-vps`:

```diff
   needs:
     - security
     - build-and-test
+    - validate-finan
+    - validate-adm
+    - validate-operacao
   if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master')
```

Único diff do arquivo (3 linhas adicionadas, 0 removidas). `validate-finan`/`validate-adm`/`validate-operacao` já rodavam em todo push para `master` (sem `if:` próprio) — não havia risco de o deploy nunca rodar por dependência que não dispara. `deploy-homolog-vps` e `deploy-finan-vps` não foram alterados (política preservada). Nenhum secret, host, porta, usuário ou caminho remoto foi tocado. Commit `206ce82`.

## 13. Resultado do teste contratual do CI

`tests/contracts/ciDeployGates.test.js` (novo, commit `85281d2`): 2 testes — confirma que `deploy-vps` depende dos 5 jobs obrigatórios, e que os 3 jobs `validate-*` existem no workflow. Verificado negativamente antes de aplicar em definitivo: removendo temporariamente `validate-operacao` do `needs:`, o teste falhou corretamente com mensagem explícita; revertido e reaplicado. Passa na versão final do `ci.yml`.

## 14. Contrato do health check do ADM

`GET /api/health` (`apps/adm/backend/src/health/routes.js`, módulo dedicado seguindo a convenção já usada pela Operação em `src/health/`), montado em `app.js` antes de qualquer middleware de autenticação:

- Sem autenticação.
- Sem consulta ao banco (por desenho — só confirma que o processo HTTP está vivo).
- Resposta fixa: `200 {"ok": true, "service": "adm-api"}`.
- Não expõe variáveis de ambiente, credenciais, host de banco ou stack trace (corpo tem exatamente 2 chaves).
- Método não suportado (`POST`) não retorna 200.

Status detalhado e autenticado (`/api/admin/api-status`) permanece inalterado.

## 15. Resultado dos testes do health check

`apps/adm/frontend/src/adminHealthRoute.test.js` (fora de `src/backend/`, que é excluído da coleta do Vitest do ADM) — sobe o Express num socket local efêmero (porta 0, só `127.0.0.1`) e usa `fetch` real, sem adicionar `supertest` como dependência nova (não estava disponível no `node_modules` isolado do ADM). **4/4 testes passando**: 200 sem autenticação, corpo exato esperado, ausência de dados sensíveis no corpo, método não suportado não retorna 200.

## 16. Resultado do scan completo de segurança

`git diff master...HEAD` (sem excluir `*.test.js`/`*.test.jsx` desta vez) buscado por padrões de chave privada, AWS (`AKIA...`), GitHub token (`ghp_...`), Slack token, string de conexão com credencial embutida (`mongodb://user:pass@`, `postgres://user:pass@`), Google API key — **zero ocorrências reais**.

Busca complementar por `password=`/`api_key=`/`secret=`/`token=` hardcoded — todas as ocorrências (`APP_AUTH_SECRET`/`ROT_JWT_SECRET` com dígitos sequenciais `01234...`, tokens de template de mensageria como `"{cliente}"`, fixtures nomeadas `"test-...-for-suite"`, valores `"[REDACTED]"`, e um fixture literal `"senha-real"`/`"csrf-real"` que testa se um sanitizador de log redige corretamente esses campos) são placeholders óbvios ou fixtures de teste de segurança — nenhum segredo real.

Nomes de arquivo sensíveis (`.env`, `.pem`, `.key`, `id_rsa`, `credentials.json`) no diff completo — nenhum.

Gitleaks não está disponível localmente (binário Go, não reproduzível via `npx` nesta máquina) — mesma limitação já registrada na Etapa 7; depende do job `security` do CI (`gitleaks/gitleaks-action@v2`).

`npm audit --audit-level=high` reproduzido localmente (mesmo comando do job `security`) em todos os 8 `package.json` do monorepo — **achados reais, mas não são segredos** (não acionam o critério de NO-GO desta etapa, que é especificamente sobre segredo real versionado):

| Projeto | Resultado |
|---|---|
| raiz | 1 high (`js-yaml`), 5 moderate — **já presente em `master`** (confirmado via `git show master:package-lock.json`), não introduzido por esta branch |
| `apps/retiradas/backend` | 2 high (`multer` DoS, `nodemailer` SSRF/bypass de allowlist), 3 moderate — **não auditado pelo job `security` do CI hoje** (o step `npm audit` do workflow roda só na raiz, sem `--prefix apps/retiradas/backend`) |
| `apps/finan/frontend`, `apps/finan/backend` | 0 vulnerabilidades |
| `apps/adm/frontend` | 2 moderate |
| `apps/adm/backend` | vulnerabilidades presentes (nível não-high) |
| `apps/operacao/frontend` | 2 moderate |
| `apps/operacao/backend` | 0 vulnerabilidades |

Registrado como risco residual (item 22) — corrigir exigiria atualização de dependências sem necessidade comprovada por esta etapa (fora do escopo: Etapa 8 é sobre estabilização de testes/CI/health-check/docs, não patch de dependências) e ampliar o `security` job para auditar `apps/retiradas/backend` também é uma mudança de CI não pedida nesta etapa.

## 17. Resultado do clean-room na primeira execução

Clone isolado do SHA final (`c269122`) em pasta temporária fora do diretório de trabalho, `npm ci` (sem regenerar lockfile) nos 8 projetos (raiz + `apps/retiradas/backend` + `apps/{finan,adm,operacao}/{frontend,backend}`). `npm run verify:all`: **`EXIT:0` na primeira execução, sem retry** — 353 (Retiradas) + 125 (ADM) + 42+13 (Operação) + 4 (Contratos) = 537 testes, todos passando. Pasta temporária removida ao final (só ela, nada do repositório de trabalho).

## 18. Lint, testes, builds e contratos (clean-room)

```bash
npx eslint apps/retiradas --max-warnings=0   # OK, 0 erros/0 warnings
npx eslint apps/finan --max-warnings=0       # OK, 0 erros/0 warnings
npx eslint apps/adm --max-warnings=0         # OK, 0 erros/0 warnings
npx eslint apps/operacao --max-warnings=0    # OK, 0 erros/0 warnings
```

Todos os 4 builds (`build:retiradas`, `build:finan`, `build:adm`, `build:operacao`) e `test:contracts` passaram dentro do `verify:all` do item 17.

## 19. Documentação criada ou atualizada

- `docs/REORGANIZACAO-MONOREPO-ETAPA7-RELATORIO.md` — correção transparente da matriz de testes (item 11 acima).
- `docs/runbooks/promocao-monorepo.md` — atualizado com o gate final de deploy, health check do ADM, matriz real de testes, backlog de hardening do Finan.
- `apps/adm/ops/README.md` — documentado o novo `/api/health`.
- `docs/security/finan-service-hardening.md` (novo) — backlog de hardening do `finan-api.service` (item 20).
- `docs/REORGANIZACAO-MONOREPO-ETAPA8-RELATORIO.md` (este arquivo).

## 20. Plano de hardening do Finan

`docs/security/finan-service-hardening.md`: `finan-api.service`/`finan-db-backup.service` rodam como `User=root`, sem o hardening já aplicado em ADM/Operação (`ProtectSystem=strict`, `NoNewPrivileges`, etc.). Documentado: diretórios que precisam de escrita (`/opt/retiradas/backups/finan` + tmpdir — Finan não tem pasta de uploads persistente, diferente de ADM/Operação), permissões propostas para um usuário dedicado `svc-finan`, dependências que poderiam quebrar (Tesseract OCR), procedimento de teste e rollback. **Nenhuma mudança aplicada ao serviço real.**

## 21. Commits criados

1. `c1acdf4` — `test(adm): stabilize dashboard data hook test under load`
2. `85281d2` — `test(ci): enforce monorepo validation gates before Retiradas deploy`
3. `206ce82` — `chore(ci): gate retiradas deploy on all app validations`
4. `55d6350` — `feat(adm): add minimal unauthenticated health endpoint`
5. `8e552c2` — `docs(security): plan finan service hardening`
6. `c269122` — `docs(release): reconcile test matrix and promotion runbook`

Nenhum commit vazio. Nenhum push.

## 22. Riscos residuais

1. **Finan não tem nenhum teste automatizado** (frontend ou backend) — só checagem de sintaxe. Não é regressão desta etapa, é o estado real pré-existente, agora corretamente documentado (item 11). Fora do escopo desta etapa criar testes novos.
2. **`npm audit --audit-level=high` encontra vulnerabilidades reais** (não segredos) na raiz (`js-yaml`, pré-existente em `master`) e em `apps/retiradas/backend` (`multer`, `nodemailer`, **não coberto pelo job `security` do CI hoje**, que só audita a raiz). Fora do escopo de correção desta etapa (atualização de dependência sem necessidade comprovada + mudança de CI não pedida).
3. `finan-api.service` continua como `User=root` em produção — plano documentado (item 20), não executado.
4. Gitleaks não é reproduzível localmente — o scan de segredos desta etapa (item 16) depende de padrões manuais + `npm audit`, não do Gitleaks real. O job `security` do CI continua sendo a fonte de verdade para isso.

## 23. Decisão final

Todos os critérios de GO da Etapa 8 foram atendidos com evidência: working tree limpo, matriz de testes corrigida e comprovada por execução isolada de cada script, teste flaky do ADM corrigido com causa explicada (20/20 isolado, 10/10 suíte completa, 5/5 `test:adm`, 5/5 `verify:all`, nenhum retry manual), clean-room verde na primeira execução, lint dos 4 apps com zero erros/zero warnings, builds e contratos passando, deploy do Retiradas agora depende dos 5 gates obrigatórios (comprovado por teste de contrato que falha se a dependência for removida), health check do ADM implementado e testado, scan de segurança sem nenhum segredo real (as vulnerabilidades de dependência encontradas não são segredos e são pré-existentes/fora de escopo), runbook atualizado, nenhuma branch legada ou stash tocado, nenhum push/merge/deploy/migration executado.

**GO PARA PROMOÇÃO**

## 24. Confirmação — nenhum push, merge, deploy ou migration

Confirmado: nenhum `git push`, nenhum `git merge`/`rebase`/`cherry-pick` sobre `master`, nenhum checkout de `master`, nenhum deploy, nenhuma migration executada, nenhum acesso ou alteração na VPS, nenhuma alteração de DNS/Nginx/PM2/Docker/serviços ativos, nenhum secret ou `.env` real alterado, nenhum `continue-on-error` adicionado.

## 25. Confirmação — branches e stashes intactos

Confirmado: 12 stashes pré-existentes intactos (nenhum criado, aplicado ou removido nesta etapa). Todas as branches `backup/*` preexistentes preservadas, incluindo o novo checkpoint `backup/pre-release-stabilization` (`b743a02`). Branches legadas `finan`, `adm`, `rot` não foram tocadas. Nenhum NPM Workspaces introduzido. Nenhuma atualização de dependência não relacionada à auditoria.
