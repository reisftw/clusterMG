# Etapa 7 — Auditoria final de pré-promoção e plano seguro de release

Auditoria pura (sem push, merge, deploy, migration ou alteração de VPS/DNS/Nginx/systemd/Docker/stash/branches legadas). Duas correções documentais mínimas foram aplicadas (item 15).

## 1. Branch e SHA auditados

- Branch: `refactor/monorepo-quatro-apps`.
- SHA no início da Etapa 7: `adb8801ae5d18fd6d49237ca1ab8d7190e4d2888` (checkpoint da Etapa 6).
- SHA no fim da Etapa 7 (após as duas correções documentais desta etapa): `b8faf52` (`docs(etapa7): corrige comandos obsoletos do CLAUDE.md e adiciona runbook de promocao`).

## 2. Estado local no início

`git status` limpo (sem alterações pendentes) no início da Etapa 7. Dois diretórios locais não versionados e devidamente cobertos pelo `.gitignore` foram encontrados durante a auditoria (não são alterações "pendentes" — nunca estiveram rastreados): `rot/` (raiz, contém `.env` local, conteúdo não lido) e `apps/finan/tmp/sync-production-.../`. Um terceiro do mesmo tipo apareceu na varredura de Fase 7: `apps/operacao/tmp/sync-production-.../` e `apps/operacao/tmp/vps-recovery-.../`. Todos confirmados `git check-ignore` positivo e 0 arquivos rastreados — não representam risco de promoção nem foram lidos além do necessário para classificá-los.

## 3. Topologia master ↔ branch

- `git merge-base master HEAD` = `a594f54aec8d905255d68a4864e4b9eedc045a2`.
- `git rev-list --left-right --count master...HEAD` = `0  59` (0 commits exclusivos de `master`, 59 exclusivos da branch).
- `git merge-base --is-ancestor master HEAD` = verdadeiro → **`master` é ancestral estrito de `HEAD`, promoção fast-forward é mecanicamente possível** (sem merge-commit, sem conflito).

## 4. Commits exclusivos de cada lado

- Lado `master`: nenhum.
- Lado da branch: 59 commits (reorganização completa em 4 apps, Etapas 1–7).

## 5. Diff summary

Diff `master...HEAD` toca 2051 arquivos (contagem por nome, incluindo `apps/finan`, `apps/adm`, `apps/operacao` inteiros como código novo + reorganização de `apps/retiradas`). Nenhuma exclusão acidental de arquivo identificada; a única deleção do diff já era esperada (parte da reorganização). Todas as entradas "Added" nas 4 pastas de app são código genuinamente novo ou movido, não duplicação acidental.

## 6. Arquivos adicionados/renomeados/removidos

Renomeações de `apps/retiradas/backend/api` mantidas como `R` (rename) no `git diff --summary`, sem quebra do histórico de blame relevante. Sem arquivos binários grandes inesperados, sem `dist/`, `node_modules/`, `.env` real ou dump de banco no diff (confirmado item 16).

## 7. Ocorrências do caminho antigo `vps/`

Varredura (`git grep`) encontrou 19 ocorrências de `vps/api`, `vps/scripts` ou `vps/sql` em arquivos versionados. Classificação:

- **17 são comentários históricos/de linhagem** (`// mesmo padrão de vps/api/...`), documentando de onde um padrão de código veio antes da reorganização — não afetam execução, não são bug, não devem ser "corrigidos" (removê-los seria apagar contexto histórico legítimo e ampliar escopo sem necessidade).
- **2 eram comandos reais quebrados**: `CLAUDE.md` (seção 3) instruía `cd vps && npm run api:dev/migrate:sql/backup:database`, caminho inexistente desde a reorganização (scripts reais vivem em `apps/retiradas/backend/package.json`). **Corrigido nesta etapa** (commit `b8faf52`) — ver item 15.
- Arquivos de teste órfãos do ADM (`apps/adm/frontend/src/backend/*.test.js`, 24 arquivos) que referenciam `vps/package.json` já estavam excluídos da coleção de testes (`apps/adm/frontend/vitest.config.js`) desde a Etapa 4/5 — documentado, não executado, não é risco.

Nenhuma substituição global cega de `rot` por `operacao` foi feita ou é recomendada: o path `/opt/retiradas/apps/rot/...` no `apps/operacao/ops/rot-api.service.example` e o `server_name ... rot.retiradas.tech` no nginx são **intencionais** (alias externo legado documentado no próprio arquivo), não bug.

## 8. Investigação do commit `6ef5d9f` (Fase 3)

`git show --stat 6ef5d9f` e `git show 6ef5d9f` confirmam: o commit altera **exclusivamente** `apps/operacao/frontend/src/utils/offlineRotQueue.isNetworkFailure.test.js` (1 arquivo novo, 45 inserções, **0 linhas de código de produção alteradas**). O próprio corpo da mensagem do commit já diz "Achados (documentados, não exigiram mudança de código)" — condizente com o relatório da Etapa 6 ("Nenhuma mudança de código foi necessária"). **Não há contradição factual real**: o único problema é que o prefixo Conventional Commits usado no assunto (`fix:`) sugere uma correção de comportamento, quando na prática é `test:` (apenas cobertura nova). Isso é uma imprecisão de classificação do assunto do commit, não um risco funcional nem um erro de relatório — e reescrever histórico de commit já publicado na branch está fora do que a Etapa 7 autoriza (sem rebase). **Nenhuma ação de código foi necessária.** Confirmado também: HTTP 400/401/500 não entram na fila offline (`isNetworkFailure` retorna `false` para esses casos, testado); apenas `TypeError` de fetch ou `navigator.onLine=false` entram.

## 9. Matriz CI/CD

| Job | App | Trigger | Instala/builda | Deploy real? | Gate antes do deploy |
|---|---|---|---|---|---|
| `security` | todos | push/PR | `npm audit`, Semgrep, Gitleaks | não | — |
| `build-and-test` | Retiradas | push/PR | `npm ci` (+`apps/retiradas/backend`), lint/test/build | não | — |
| `validate-finan` | Finan | push/PR | `npm ci --prefix apps/finan/{frontend,backend}` | não (só `verify:finan`) | — |
| `validate-adm` | ADM | push/PR | idem ADM | não (só `verify:adm`) | — |
| `validate-operacao` | Operação | push/PR | idem Operação | não (só `verify:operacao`) | — |
| `detect-finan-changes` | Finan | push em `finan` | — | não | gate de `deploy-finan-vps` |
| `deploy-finan-vps` | Finan | push em `finan` **apenas** | build frontend, empacota `apps/finan` | **sim** (SSH, systemctl `finan-api.service`) | `security`+`build-and-test`+`validate-finan`+`detect-finan-changes` |
| `deploy-vps` | Retiradas (prod) | push em `master`/`main` | build `dist/` + `apps/retiradas/backend` | **sim** (SSH, systemctl `retiradas-api`) | `security`+`build-and-test` |
| `deploy-homolog-vps` | Retiradas (homolog) | push em `homolog-dev` | idem | **sim** (SSH, systemctl `retiradas-api-homolog`) | `security`+`build-and-test` |
| `e2e-smoke-prod` | Retiradas | após `deploy-vps` | Playwright | não | `deploy-vps` |
| `e2e-smoke-homolog` | Retiradas | após `deploy-homolog-vps` | Playwright | não | `deploy-homolog-vps` |

**Conclusão crítica para a promoção**: `deploy-vps` (disparado por push em `master`) empacota **somente** `dist/` (build do frontend do Retiradas) e `apps/retiradas/backend` — nunca toca `apps/finan`, `apps/adm` ou `apps/operacao`. ADM e Operação **não têm nenhum job de deploy no CI** (comentário explícito no `ci.yml`: "Job independente, validação apenas"). Finan só deploya automaticamente a partir da branch `finan`, que não será tocada. **Portanto, promover `refactor/monorepo-quatro-apps` → `master` e dar push só irá redeployar o Retiradas em produção** — Finan/ADM/Operação continuam exclusivamente em deploy manual por SSH, conforme já documentado no CLAUDE.md (seção 8).

## 10. Matriz operacional por app (Fase 5)

| App | Dir. VPS (frontend/backend) | Instalar | Build | Serviço | Porta | Health check | Deploy |
|---|---|---|---|---|---|---|---|
| Retiradas (prod) | `/var/www/retiradas/dist` · `/opt/retiradas/vps` | CI (`npm ci --omit=dev`) | CI | `retiradas-api` | 3001 | `GET /api/health` (interno, 10x/3s) | CI automático |
| Retiradas (homolog) | `/var/www/retiradas-homolog/dist` · `/opt/retiradas/vps-homolog` | CI | CI | `retiradas-api-homolog` | 3002 | idem | CI automático |
| Finan | `/opt/retiradas/apps/finan/{frontend/dist,backend}` | `npm install --omit=dev` (CI, branch `finan`) ou manual | `finan:frontend:build` | `finan-api.service` (`User=root`, **não hardened** como ADM/Operação) | 3101 | `GET /api/finan/health`, `/api/v1/health` | CI (branch `finan`) OU manual SSH |
| ADM | `/opt/retiradas/apps/adm/{frontend/dist,backend}` | manual (`useradd svc-adm` + template) | manual | `adm-api.service` (`User=svc-adm`, hardened: `ProtectSystem=strict`, `NoNewPrivileges`, capabilities vazias) | 3301 | **⚠️ Nenhum endpoint `/api/health` público** — único status (`/api/admin/api-status`) exige autenticação + role admin | Manual SSH |
| Operação | `/opt/retiradas/apps/rot/{frontend/dist,backend}` (path externo intencional `rot`, não `operacao` — ver item 7) | manual | manual | `rot-api.service` (`User=operacao`, hardened) | 3201 | `app.use("/api/health", healthRoutes)` | Manual SSH |

**Bloqueador/questão documentado (não inventado, não corrigido nesta etapa por estar fora do escopo — seria feature nova)**: o ADM não expõe um health-check HTTP sem autenticação. Um script de deploy manual não consegue validar "serviço no ar" com um `curl` simples como o Retiradas faz; hoje depende de `systemctl status adm-api` ou de login manual. Isso não bloqueia a promoção do Retiradas (item 9), mas é um risco operacional para quando o ADM for deployado manualmente.

## 11. Validação em clean-room (Fase 6)

Executada de fato, não apenas planejada: clone isolado do SHA `adb8801` em pasta temporária (`mktemp`-equivalente fora do repositório de trabalho), `npm ci` em todos os 5 `package.json` relevantes (`.`, `apps/retiradas/backend`, `apps/finan/{frontend,backend}`, `apps/adm/{frontend,backend}`, `apps/operacao/{frontend,backend}`) — sem regenerar nenhum lockfile.

- 1ª rodada: falha (`EXIT:1`) por engano metodológico meu (esqueci de instalar `apps/retiradas/backend`) — corrigido e re-executado, não é achado do código.
- 2ª rodada (`verify:all` completo): `EXIT:1` — 1 teste falhou por timeout (`useDashboardData.test.js`, dentro de `apps/adm/frontend`, 5000ms excedidos sob carga).
- Isolado 3x (`npx vitest run` só esse arquivo): **3/3 passou**, confirmando flakiness por timing sob carga, não defeito funcional.
- 3ª rodada (`verify:all` completo, do zero): **`EXIT:0`, 353+121+42+13+2 testes = todos passando** (total 531, correto — mas ver correção de atribuição por app na Etapa 8, abaixo).

**Conclusão**: baseline verde confirmado em ambiente limpo. Existe um teste com timeout fixo de 5000ms suscetível a flakiness sob CPU carregada (`apps/adm/frontend/src/pages/PainelPublico/hooks/useDashboardData.test.js`) — registrado como risco residual (item 20), corrigido na Etapa 8 (ver `docs/REORGANIZACAO-MONOREPO-ETAPA8-RELATORIO.md`).

> **Correção (Etapa 8, Fase 1)**: a tabela abaixo atribuiu os números de teste ao app errado. O total (531) e o `EXIT:0` continuam corretos — só a coluna "Testes" por linha estava trocada. A tabela real, verificada isolando cada script (`npm run test:<app>`), está em `docs/REORGANIZACAO-MONOREPO-ETAPA8-RELATORIO.md`, item 11. Resumo: Retiradas 353 (vitest), Finan **não tem testes automatizados** (apenas checagem de sintaxe de 118 arquivos backend via `node --check`, não é "teste unitário"), ADM 121 (vitest, não `node --test`), Operação 55 (42 backend via `node --test` + 13 frontend via vitest), Contratos 2 (`node --test`).

## 12. Resultado lint/test/build por app (clean-room, 3ª rodada) — tabela mantida como registro histórico, ver correção acima

| App | Lint | Testes (rótulo original — ver correção acima) | Build |
|---|---|---|---|
| Retiradas | 0 erros/0 warnings | 353/353 | OK |
| Finan | 0 erros/0 warnings | 121/121 | OK |
| ADM | 0 erros/0 warnings | 42/42 (`node --test`) | OK |
| Operação | 0 erros/0 warnings | 13/13 | OK |
| Contratos (`test:contracts`) | — | 2/2 | — |

`verify:all` final: **exit 0**.

## 13. Varredura de segredos (Fase 7)

`git diff master...HEAD` (excluindo `*.test.js`/`*.test.jsx`) buscado por padrões de chave privada, AKIA (AWS), `api_key=`, `password=` hardcoded — **nenhuma ocorrência real** (os 2 matches encontrados eram constantes de rota como `"/esqueci-senha"`). Nomes de arquivo sensíveis (`.env`, `.pem`, `.key`, `id_rsa`, `credentials`) no diff — **nenhum arquivo desse tipo adicionado**, apenas 2 arquivos de código-fonte chamados `webhookSecrets.js` (helpers, sem valores). `.gitignore` cobre `.env*`, `dist/`, `node_modules/`, `uploads/` nos 4 apps (confirmado via `git check-ignore -v`, item 2/10). O job `security` do CI já roda Gitleaks + Semgrep + `npm audit --audit-level=high` como gate adicional.

## 14. Diretórios locais não versionados encontrados

`rot/` (raiz), `apps/finan/tmp/sync-production-.../`, `apps/operacao/tmp/sync-production-.../`, `apps/operacao/tmp/vps-recovery-.../`. Todos confirmados ignorados pelo `.gitignore` e com 0 arquivos rastreados. Conteúdo não lido além do necessário para essa classificação (nenhum valor sensível foi impresso). Não são risco de promoção — são artefatos de trabalho local do operador, preservados sem alteração.

## 15. Correções aplicadas nesta etapa

Únicas duas, dentro do escopo estrito autorizado pela Fase 9 ("comandos de build/test quebrados por movimentação de diretório" e "documentação inconsistente"), commit `b8faf52`:

1. `CLAUDE.md` (seção 3): `cd vps` → `cd apps/retiradas/backend` em 5 blocos de comando (instalar backend, rodar backend local, migrations SQL gerais, migrations normalizadas, scripts de migração por domínio, backup manual) — caminho `vps/` não existe mais no repositório.
2. `CLAUDE.md` (seção 3): removidas 2 linhas de scripts npm inexistentes (`migrate:financeiro-reports`, `migrate:financeiro-budget-config`) — confirmado que não existem em nenhum `package.json` do repo; as migrations financeiras já rodam via `migrate:normalized:apply`.

Nenhuma outra alteração de escopo foi feita. `docs/runbooks/promocao-monorepo.md` foi criado (item 19) — não é uma "correção", é o entregável exigido pela Fase 8.

## 16. Commits criados nesta etapa

- `b8faf52` — `docs(etapa7): corrige comandos obsoletos do CLAUDE.md e adiciona runbook de promocao`.

Nenhum outro commit. Nenhum push.

## 17. Runbook de promoção

Criado em [`docs/runbooks/promocao-monorepo.md`](docs/runbooks/promocao-monorepo.md), com: comando exato `git merge --ff-only` (não merge-commit, já que `master` é ancestral estrito), verificação pós-merge, matriz de deploy por app (item 9), smoke tests, gatilhos e procedimento de rollback (manual, sem script de rollback automatizado identificado no CI), notas de migration/DB, confirmação de que `finan`/`adm`/`rot` não são apagadas, e validação manual pós-publicação do fluxo de rompimentos.

## 18. Riscos residuais

1. **Flakiness de timeout** em `apps/adm/frontend/src/pages/PainelPublico/hooks/useDashboardData.test.js` (timeout fixo de 5000ms) — passou 100% isolado, falhou 1x em 2 rodadas completas sob carga. Não bloqueia promoção (não afeta o Retiradas, que é o único deployado por este push), mas pode gerar falso-negativo intermitente em `validate-adm` no CI. Recomendação para uma etapa futura (fora do escopo desta): aumentar o timeout desse teste especificamente ou investigar a causa do fetch mock lento sob carga.
2. **ADM sem health-check HTTP não autenticado** (item 10) — risco operacional para deploy manual futuro do ADM, não para esta promoção.
3. **`finan-api.service` roda como `User=root`**, diferente do padrão hardened (`svc-adm`, `operacao`) usado por ADM e Operação — inconsistência de postura de segurança entre os 3 apps de deploy manual, pré-existente, fora do escopo de correção desta etapa (mudaria comportamento de serviço em produção).
4. Nenhum outro risco material identificado na auditoria de segredos, `.gitignore`, ou topologia git.

## 19. Comandos de promoção (não executados)

```bash
git checkout master
git merge --ff-only refactor/monorepo-quatro-apps
npm run verify:all
git push origin master
```

Documentados no runbook (item 17). Não executados nesta etapa, conforme instrução explícita.

## 20. Confirmações finais

- Nenhum `git push` foi executado.
- Nenhum merge, rebase ou cherry-pick sobre `master` foi executado.
- Nenhum deploy foi executado.
- Nenhuma migration foi executada.
- Nenhuma alteração em DNS, Nginx, systemd, PM2, Docker ou serviços da VPS.
- Nenhum stash foi criado, aplicado ou removido.
- Branches `finan`, `adm`, `rot` não foram tocadas.
- Nenhuma introdução de NPM Workspaces.
- Nenhuma atualização de dependência não relacionada à auditoria.
- Nenhuma funcionalidade de produto implementada.
- Nenhum segredo ou `.env` real alterado, lido em conteúdo além do necessário para classificação, ou impresso.
- Nenhum `continue-on-error` adicionado; nenhum gate de lint/teste/CI enfraquecido.

## 21. Substituição global `rot`→`operacao`

Não foi feita. Confirmado (item 7) que a coexistência `rot`/`operacao` em paths de VPS e domínio é intencional e documentada nos próprios arquivos de exemplo (`apps/operacao/ops/`).

## 22. Decisão final

Todos os critérios de GO foram atendidos: fast-forward mecanicamente possível, zero segredos/artefatos indevidos no diff, `.gitignore` cobrindo os 4 apps, `verify:all` verde em ambiente limpo (0 mudança de código de produção necessária), a única "contradição" apontada (commit `6ef5d9f`) resolvida como não-contradição real, e o push a `master` comprovadamente isolado (não afeta Finan/ADM/Operação). As duas correções documentais aplicadas são estritamente dentro do escopo permitido e não alteram comportamento de nenhum app.

**GO PARA PROMOÇÃO**
