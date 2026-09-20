# Relatório final — Auditoria de pré-promoção do monorepo (Etapas 7 e 8)

Branch: `refactor/monorepo-quatro-apps`. Este documento consolida em um único relatório o que antes estava em três arquivos separados: a auditoria de pré-promoção (Etapa 7), a estabilização final e correção dos gates (Etapa 8), o runbook de promoção e o backlog de hardening do Finan (agora seção 14). O relatório individual da Etapa 7 (`docs/REORGANIZACAO-MONOREPO-ETAPA7-RELATORIO.md`) permanece como registro histórico já commitado, com uma nota apontando para este documento consolidado.

Em nenhuma das etapas houve `git push`, merge/rebase/cherry-pick sobre `master`, deploy, migration, alteração de DNS/Nginx/systemd/PM2/Docker, criação/aplicação/remoção de stash, ou alteração de branches legadas (`finan`, `adm`, `rot`). A etapa final corrigiu os achados `npm audit --audit-level=high` da raiz e do backend do Retiradas e ampliou o job `security` para auditar os 8 pacotes do monorepo.

**Decisão final: GO PARA PROMOÇÃO.**

---

## 1. Branch, SHAs e checkpoints

| Marco | SHA |
|---|---|
| Checkpoint Etapa 6 (início da Etapa 7) | `adb8801ae5d18fd6d49237ca1ab8d7190e4d2888` |
| Fim da Etapa 7 | `b743a02fb486e3c383b06364f5f64cf402768ce2` |
| Checkpoint Etapa 8 (`backup/pre-release-stabilization`) | `b743a02fb486e3c383b06364f5f64cf402768ce2` (mesmo HEAD inicial, sem checkout) |
| SHA antes da consolidação (relatório da Etapa 8) | `3c1c92f` |
| SHA antes da etapa final de segurança/CI | `20d8c3ce8751fe070ea1c381335962ab8bfc3c81` |
| Correção final de dependências `high` | `2c67fbb` |
| Correção final do job `security` | `29d0201` |
| **SHA final aprovado** | este próprio commit (consolidação final do relatório) |

`git rev-list --left-right --count master...HEAD` = `0  72` (0 commits exclusivos de `master`, 72 exclusivos da branch, após este commit documental final). `git merge-base --is-ancestor master HEAD` = verdadeiro → **fast-forward mecanicamente possível**, sem merge-commit, sem conflito.

## 2. Estado do Git (inicial e final)

Working tree limpo no início e no fim de ambas as etapas. 12 stashes pré-existentes, todos intactos (nenhum criado/aplicado/removido). Todas as branches `backup/*` preexistentes preservadas, incluindo o novo checkpoint `backup/pre-release-stabilization`. Branches legadas `finan`, `adm`, `rot` não tocadas.

Diretórios locais não versionados encontrados (todos confirmados `git check-ignore` positivo, 0 arquivos rastreados, conteúdo não lido além do necessário para classificação — não são risco de promoção): `rot/` (raiz, contém `.env` local), `apps/finan/tmp/sync-production-.../`, `apps/operacao/tmp/sync-production-.../`, `apps/operacao/tmp/vps-recovery-.../`.

## 3. Diff contra `master`

2051 arquivos tocados (contagem por nome). Nenhuma exclusão acidental — a única deleção do diff já era esperada. Renomeações de `apps/retiradas/backend/api` preservadas como `R` no `git diff --summary`. Sem binários grandes inesperados, sem `dist/`, `node_modules/`, `.env` real ou dump de banco no diff.

### Ocorrências do caminho antigo `vps/`

19 ocorrências de `vps/api`/`vps/scripts`/`vps/sql` em arquivos versionados: 17 são comentários históricos de linhagem (não afetam execução, não corrigidos — apagar contexto histórico seria ampliar escopo sem necessidade); 2 eram comandos reais quebrados no `CLAUDE.md` (`cd vps && npm run ...`), **corrigidos** (commit `b8faf52`, ver seção 12). Os 24 arquivos de teste órfãos do ADM que referenciam `vps/package.json` já estavam excluídos da coleta de testes desde a Etapa 4/5.

**Nenhuma substituição global de `rot` por `operacao` foi feita.** A coexistência `rot`/`operacao` em paths de VPS e domínio (`apps/operacao/ops/rot-api.service.example`, `server_name ... rot.retiradas.tech`) é intencional e documentada nos próprios arquivos de exemplo.

## 4. Investigação do commit `6ef5d9f`

`git show --stat`/`git show` confirmam: altera **exclusivamente** `offlineRotQueue.isNetworkFailure.test.js` (1 arquivo, 45 inserções, **0 linhas de produção**). O corpo do commit já dizia "não exigiram mudança de código" — condizente com o relatório da Etapa 6. **Não há contradição factual real**: só o prefixo `fix:` no assunto do commit é impreciso (deveria ser `test:`) — não é risco funcional nem erro de relatório. Reescrever o commit está fora do que a etapa autoriza (sem rebase). Confirmado: HTTP 400/401/500 não entram na fila offline; só `TypeError` de fetch ou `navigator.onLine=false` entram.

## 5. Matriz CI/CD

| Job | App | Trigger | Deploy real? | Gate antes do deploy |
|---|---|---|---|---|
| `security` | todos | push/PR | não | — |
| `build-and-test` | Retiradas | push/PR | não | — |
| `validate-finan` | Finan | push/PR | não (só `verify:finan`) | — |
| `validate-adm` | ADM | push/PR | não (só `verify:adm`) | — |
| `validate-operacao` | Operação | push/PR | não (só `verify:operacao`) | — |
| `deploy-finan-vps` | Finan | push em `finan` apenas | sim (SSH, `finan-api.service`) | `security`+`build-and-test`+`validate-finan`+`detect-finan-changes` |
| `deploy-vps` | Retiradas (prod) | push em `master`/`main` | sim (SSH, `retiradas-api`) | **`security`+`build-and-test`+`validate-finan`+`validate-adm`+`validate-operacao`** (5 gates desde a Etapa 8 — antes eram só os 2 primeiros) |
| `deploy-homolog-vps` | Retiradas (homolog) | push em `homolog-dev` | sim (SSH, `retiradas-api-homolog`) | `security`+`build-and-test` (inalterado) |
| `e2e-smoke-prod`/`e2e-smoke-homolog` | Retiradas | pós-deploy | não | `deploy-vps`/`deploy-homolog-vps` |

**Conclusão crítica**: `deploy-vps` empacota **somente** `dist/` do Retiradas e `apps/retiradas/backend` — nunca toca Finan/ADM/Operação. ADM e Operação não têm nenhum job de deploy no CI. Finan só deploya a partir da branch `finan`. **Promover e dar push em `master` só redeploya o Retiradas em produção.**

## 6. Alteração dos gates do CI (Etapa 8)

```diff
   needs:
     - security
     - build-and-test
+    - validate-finan
+    - validate-adm
+    - validate-operacao
   if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master')
```

Único diff do arquivo. `validate-finan`/`validate-adm`/`validate-operacao` já rodavam em todo push para `master` (sem `if:` próprio) — sem risco de o deploy nunca disparar por dependência que não roda. `deploy-homolog-vps` e `deploy-finan-vps` inalterados. Nenhum secret/host/porta/usuário/caminho remoto tocado. Commit `206ce82`.

Coberto por teste de contrato novo, `tests/contracts/ciDeployGates.test.js` (commit `85281d2`) — originalmente 2 testes: confirma que `deploy-vps` depende dos 5 jobs obrigatórios e que os 3 `validate-*` existem no workflow. A etapa final adicionou um terceiro contrato (commit `29d0201`) garantindo que o job `security` cubra lockfile/install/audit dos 8 projetos do monorepo. **Verificado negativamente** antes de confiar nele: removendo `validate-operacao` do `needs:` temporariamente, o teste falhou com mensagem explícita; revertido e reaplicado.

## 7. Matriz operacional por app

| App | Dir. VPS | Serviço | Porta | Health check | Deploy |
|---|---|---|---|---|---|
| Retiradas (prod) | `/var/www/retiradas/dist` · `/opt/retiradas/vps` | `retiradas-api` | 3001 | `GET /api/health` (interno, 10x/3s) | CI automático |
| Retiradas (homolog) | `/var/www/retiradas-homolog/dist` · `/opt/retiradas/vps-homolog` | `retiradas-api-homolog` | 3002 | idem | CI automático |
| Finan | `/opt/retiradas/apps/finan/{frontend/dist,backend}` | `finan-api.service` (`User=root`, **não hardened**) | 3101 | `GET /api/finan/health`, `/api/v1/health` | CI (branch `finan`) OU manual SSH |
| ADM | `/opt/retiradas/apps/adm/{frontend/dist,backend}` | `adm-api.service` (`User=svc-adm`, hardened) | 3301 | **`GET /api/health` sem autenticação — novo, Etapa 8** (`{"ok":true,"service":"adm-api"}`, não consulta banco) | Manual SSH |
| Operação | `/opt/retiradas/apps/rot/{frontend/dist,backend}` (path externo intencional `rot`) | `rot-api.service` (`User=operacao`, hardened) | 3201 | `GET /api/health` (com banco) — inalterado | Manual SSH |

O bloqueador "ADM sem health-check HTTP não autenticado", anotado na Etapa 7, foi **resolvido na Etapa 8** (seção 9).

## 8. Estabilização do teste flaky do ADM (Etapa 8)

`apps/adm/frontend/src/pages/PainelPublico/hooks/useDashboardData.test.js`, primeiro teste do arquivo, falhava por `Test timed out in 5000ms` **só** dentro da suíte completa (35 arquivos vitest concorrentes) sob carga de CPU alta — nunca isolado.

**Investigação**: sem timer real vazando entre testes (o efeito limpa seu próprio `setTimeout` no unmount; RTL `cleanup()` roda em todo `afterEach`); sem promise/cache vazando entre testes (`vi.resetModules()` garante módulo fresco por teste); mocks de `fetch` corretamente isolados. **Causa real**: custo de cold-start do ambiente jsdom para o primeiro teste de cada arquivo, quando 35 ambientes são inicializados concorrentemente sob carga externa (medido: campo `environment` do Vitest somou 107-168s entre workers).

**Correção**: timeout específico de 15000ms aplicado **só** a esse teste (3º argumento de `it(...)`), com comentário explicando a causa — não mascara falha de lógica. Commit `c1acdf4`.

**Estabilidade comprovada** (nenhuma exigiu retry manual):

| Repetição | Resultado |
|---|---|
| 20x arquivo isolado | 20/20 `EXIT:0`, 4-6s cada |
| 10x suíte completa do ADM | 10/10 `EXIT:0`, 23-27s cada |
| 5x `npm run test:adm` | 5/5 `EXIT:0`, 28-30s cada |
| 5x `npm run verify:all` | 5/5 `EXIT:0`, 171-241s cada |

## 9. Health check do ADM (Etapa 8)

`GET /api/health` (`apps/adm/backend/src/health/routes.js`, módulo dedicado seguindo a convenção já usada pela Operação), montado antes de qualquer middleware de autenticação: sem autenticação, sem consulta ao banco (por desenho), resposta fixa `200 {"ok": true, "service": "adm-api"}`, corpo com exatamente 2 chaves (sem env/credenciais/stack trace), método não suportado não retorna 200. Status detalhado autenticado (`/api/admin/api-status`) inalterado. Commit `55d6350`.

Testado em `apps/adm/frontend/src/adminHealthRoute.test.js` (fora de `src/backend/`, excluído da coleta do ADM) — sobe o Express num socket local efêmero e usa `fetch` real, sem adicionar `supertest` como dependência nova. **4/4 testes passando.**

## 10. Matriz real de testes por app

Investigação de scripts + execução isolada de cada `test:<app>` — corrige a atribuição errada de números por app que constava numa versão anterior deste relatório (o total e o `EXIT:0` sempre estiveram corretos, só a linha por app estava trocada):

| App | Script | O que executa de fato | Testes/casos reais |
|---|---|---|---|
| Retiradas | `test:retiradas` | Vitest (frontend, inclui testes que carregam o backend via `createRequire`) | 353 |
| Finan | `test:finan` | **Não são testes** — `node --check` (sintaxe) de 118 arquivos do backend. Finan não tem nenhum teste automatizado hoje. | 0 testes / 118 arquivos verificados |
| ADM | `test:adm` | Vitest (frontend) + `node --check` (sintaxe do backend, 82 arquivos) | 125 (121 + 4 do health check novo) |
| Operação | `test:operacao` | `node --test` (backend, 10 arquivos) + Vitest (frontend, 3 arquivos) | 55 (42 + 13) |
| Contratos | `test:contracts` | `node --test` (2 arquivos) | 5 (2 originais + 3 de `ciDeployGates.test.js`) |

**Total: 538 testes.** `test:finan` não deve ser chamado de "teste unitário" em nenhuma documentação futura.

## 11. Validação em clean-room

Executada de fato em ambas as etapas — clone isolado fora do diretório de trabalho, `npm ci` (sem regenerar lockfile) em todos os `package.json` relevantes:

- **Etapa 7** (SHA `adb8801`): 1ª rodada falhou por engano metodológico meu (faltou instalar `apps/retiradas/backend`), corrigido; 2ª rodada expôs o teste flaky do ADM (isolado 3x passou, confirmando flakiness); 3ª rodada `EXIT:0`.
- **Etapa 8** (SHA `c269122`, após a correção do teste flaky): `npm run verify:all` **`EXIT:0` na primeira execução, sem retry** — 537 testes. `npx eslint apps/<app> --max-warnings=0` nos 4 apps: **0 erros/0 warnings em todos.** Pasta temporária removida ao final.

## 12. Varredura de segurança (segredos e dependências)

**Segredos** (Etapa 8 ampliou a varredura da Etapa 7 para incluir arquivos de teste): `git diff master...HEAD` completo buscado por chave privada, AWS/GitHub/Slack token, string de conexão com credencial embutida, Google API key — **zero ocorrências reais**. Ocorrências de `password=`/`api_key=`/`secret=`/`token=` hardcoded encontradas são todas placeholders óbvios (dígitos sequenciais, `"test-...-for-suite"`, `"[REDACTED]"`) ou fixtures que testam se um sanitizador de log redige corretamente campos sensíveis (`"senha-real"`, `"csrf-real"`) — nenhum segredo real. Nenhum nome de arquivo sensível (`.env`, `.pem`, `.key`, `id_rsa`) no diff. `.gitignore` cobre `.env*`/`dist/`/`node_modules/`/`uploads/` nos 4 apps (confirmado via `git check-ignore -v`). Gitleaks não é reproduzível localmente (binário Go) — depende do job `security` do CI.

**Dependências** (`npm audit --audit-level=high`, reproduzido localmente nos 8 `package.json` do monorepo após a etapa final):

| Projeto | Resultado |
|---|---|
| raiz | 0 `high/critical`; 4 moderate (`@vitest/mocker`/Vitest) |
| `apps/retiradas/backend` | 0 `high/critical`; 3 moderate (`qs` via `express`/`body-parser`) |
| `apps/finan/frontend`/`backend` | 0 vulnerabilidades |
| `apps/adm/frontend` | 0 `high/critical`; 2 moderate (`@vitest/mocker`/Vitest) |
| `apps/adm/backend` | 0 `high/critical`; 2 low + 2 moderate (`cookie` via `csurf`, `uuid` via `exceljs`) |
| `apps/operacao/frontend` | 2 moderate |
| `apps/operacao/backend` | 0 vulnerabilidades |

Correções aplicadas sem `npm audit fix --force`: raiz atualizada para `js-yaml@4.3.2` e `qs@6.16.0`; backend do Retiradas atualizado para `multer@2.4.0` e `nodemailer@10.0.10`. Observação operacional: `nodemailer@10.0.10` exige Node `>=20`; a VPS deve ser confirmada antes do deploy do Retiradas. O job `security` do CI agora instala e audita os 8 projetos com retry controlado e falha se a auditoria não completar ou detectar `high/critical`.

## 13. Runbook de promoção (comandos, não executados)

```bash
git checkout master
git merge --ff-only refactor/monorepo-quatro-apps   # fast-forward, master é ancestral estrito
npm run verify:all                                   # verificação pós-merge
git push origin master
```

Se `--ff-only` falhar (alguém commitou em `master` nesse meio-tempo), **parar** e reauditar a topologia antes de qualquer `merge` não-ff ou `rebase`.

**Ordem de deploy por app**: Retiradas via CI automático (`deploy-vps`, no push); Finan/ADM/Operação **fora do escopo** deste push, deploy manual por SSH quando decidido separadamente.

**Smoke tests**: Retiradas prod já tem health-check interno (`curl http://127.0.0.1:3001/api/health`, 10x/3s) + `e2e-smoke-prod` (Playwright, pós-deploy). Quando o deploy manual do ADM for feito, validar com `curl -fsS http://127.0.0.1:3301/api/health` (novo endpoint). Operação já tinha health check com banco.

**Rollback**: sem comando automatizado no workflow. Procedimento manual via SSH, reaplicando o pacote do SHA anterior ou via `git revert` em `master` + novo push — só com necessidade comprovada.

**Migrations/DB**: `deploy-vps` roda `migrate:sql` e `migrate:normalized:apply` automaticamente. Nenhuma migration, tabela ou coluna foi alterada por estas auditorias.

**Branches legadas**: `finan`, `adm`, `rot` não são apagadas nesta fase.

**Feature flag do ADM**: `VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS` permanece `false` por padrão, não muda com esta promoção (ADM não é deployado por ela).

**Validação pós-publicação de rompimentos** (Operação, fora do escopo desta promoção): quando o deploy manual da Operação for feito, validar manualmente criação de tratativa, anexo de 1-10 imagens, finalização e sincronização da fila offline.

## 14. Hardening pendente (fora do escopo desta promoção)

### 14.1 `finan-api.service` roda como `User=root`

`apps/finan/ops/finan-api.service.example` usa `User=root`, sem hardening adicional (nenhum `ProtectSystem`, `NoNewPrivileges`, `CapabilityBoundingSet`) — diferente do padrão já aplicado em ADM (`User=svc-adm`) e Operação (`User=operacao`). Não há justificativa documentada no repositório para a escolha por root; a hipótese mais provável é que o Finan foi provisionado antes de o padrão de usuário dedicado ser adotado (inferência, não fato confirmado).

**Diretórios que precisam de escrita** (levantado via `git grep` por `mkdir`/`writeFile`): `/opt/retiradas/backups/finan` (`FINAN_BACKUP_DIR`); diretório temporário do OS (`os.tmpdir()`, usado pela extração de OCR de documentos — hoje o `.service` do Finan não tem `PrivateTmp=true`, diferente de ADM/Operação/Retiradas). Diferente de ADM e Operação, **o Finan não tem pasta `uploads/` própria fora do `/tmp`** — simplifica o hardening.

**Permissões propostas para um usuário dedicado `svc-finan`** (por analogia com `adm-api.service.example`):

```ini
User=svc-finan
Group=svc-finan
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictSUIDSGID=true
PrivateDevices=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=/opt/retiradas/backups/finan /tmp
```

`EnvironmentFile=/opt/retiradas/apps/finan/.env` continua funcionando sem alterar seu modo/dono (600, root) — o systemd (PID 1, sempre root) lê o `EnvironmentFile` antes de trocar para `User=svc-finan`. `finan-db-backup.service.example` também roda hoje como `User=root` — deveria migrar junto.

**Dependências que poderiam quebrar**: Tesseract OCR (`runTesseract`, chama o binário via `child_process` — precisa confirmar que é executável pelo novo usuário); qualquer webhook/integração que grave log fora dos dois caminhos mapeados acima (não descoberto por `git grep`, não é garantia de que não exista).

**Proposta de migração**: (1) `useradd --system --no-create-home --shell /usr/sbin/nologin svc-finan`; (2) `chown -R svc-finan:svc-finan /opt/retiradas/backups/finan`; (3) atualizar os `.service.example` com o bloco de hardening acima, primeiro nos arquivos versionados; (4) copiar para `/etc/systemd/system/` em homologação primeiro (não existe homologação dedicada ao Finan hoje); (5) `systemctl daemon-reload && systemctl restart finan-api.service finan-db-backup.service`; (6) validar health check, OCR de um documento de teste e backup manual.

**Teste**: rodar os passos 1-3 num servidor de teste (ou janela de manutenção documentada com rollback pronto); validar health check, rota autenticada simples, fluxo de OCR e backup manual; monitorar `journalctl -u finan-api -f` por `EACCES`/`EPERM` nas primeiras 24h.

**Rollback**: reverter `User=svc-finan` para `User=root` nos dois `.service` e `systemctl daemon-reload && systemctl restart`. Não requer mudança de dono de arquivo (root sempre tem acesso).

**Status**: backlog documentado. **Nenhuma mudança aplicada ao serviço real.** Não deve ser executado sem teste manual prévio em ambiente não produtivo.

### 14.2 Vulnerabilidades de dependência

Da seção 12 — não corrigidas nesta auditoria (atualização de dependência sem necessidade comprovada por esta etapa está fora do escopo).

## 15. Correções documentais aplicadas

1. `CLAUDE.md` (seção 3): `cd vps` → `cd apps/retiradas/backend` em 5 blocos de comando; removidas 2 linhas de scripts npm inexistentes (`migrate:financeiro-reports`, `migrate:financeiro-budget-config`) — já cobertos por `migrate:normalized:apply`. Commit `b8faf52`.
2. Matriz de testes reconciliada (seção 10) — corrigida a atribuição por app que estava trocada num relatório anterior.

## 16. Commits criados (Etapas 7 e 8)

1. `b8faf52` — `docs(etapa7): corrige comandos obsoletos do CLAUDE.md e adiciona runbook de promocao`
2. `c1acdf4` — `test(adm): stabilize dashboard data hook test under load`
3. `85281d2` — `test(ci): enforce monorepo validation gates before Retiradas deploy`
4. `206ce82` — `chore(ci): gate retiradas deploy on all app validations`
5. `55d6350` — `feat(adm): add minimal unauthenticated health endpoint`
6. `8e552c2` — `docs(security): plan finan service hardening`
7. `c269122` — `docs(release): reconcile test matrix and promotion runbook`
8. `2c67fbb` — `fix(security): clear high npm audit findings`
9. `29d0201` — `ci(security): audit all monorepo packages`
10. este commit — `docs(release): refresh final monorepo promotion report`

Nenhum commit vazio. Nenhum push.

## 17. Riscos residuais

1. Finan não tem nenhum teste automatizado (frontend ou backend) — só checagem de sintaxe. Estado pré-existente, agora corretamente documentado; criar testes novos é funcionalidade nova, fora do escopo.
2. Vulnerabilidades moderadas/baixas residuais em dependências de teste ou bibliotecas transitivas (`@vitest/mocker`, `qs`, `cookie`/`csurf`, `uuid`/`exceljs`) — sem `high/critical`; corrigir as que exigem `--force` fica fora do escopo desta promoção.
3. `finan-api.service` continua como `User=root` em produção — plano documentado, não executado.
4. Gitleaks não é reproduzível localmente — o scan de segredos depende de padrões manuais + `npm audit`; o job `security` do CI continua sendo a fonte de verdade.

## 18. Confirmações finais

- Nenhum `git push`, merge, rebase ou cherry-pick sobre `master`; nenhum checkout de `master`.
- Nenhum deploy, nenhuma migration executada; nenhum acesso ou alteração na VPS/DNS/Nginx/PM2/Docker/serviços.
- Nenhum stash criado, aplicado ou removido; 12 stashes pré-existentes intactos.
- Branches `finan`, `adm`, `rot` não tocadas; todas as branches `backup/*` preservadas.
- Nenhum NPM Workspaces introduzido; atualizações de dependência limitadas aos achados de auditoria (`js-yaml`, `qs`, `multer`, `nodemailer`).
- Nenhuma funcionalidade de produto implementada (o health check do ADM é infraestrutura operacional mínima, não feature de produto).
- Nenhum segredo ou `.env` real alterado, lido além do necessário para classificação, ou impresso.
- Nenhum `continue-on-error` adicionado; nenhum gate de lint/teste/CI enfraquecido — pelo contrário, o gate de deploy foi reforçado (seção 6).
- Nenhuma substituição global cega de `rot` por `operacao`.

## 19. Decisão final

Todos os critérios de GO foram atendidos com evidência: fast-forward mecanicamente possível; diff limpo (zero segredos/artefatos indevidos, mesmo incluindo testes); a única "contradição" apontada (commit `6ef5d9f`) resolvida como não-contradição real; matriz de testes corrigida e comprovada por execução isolada; teste flaky do ADM corrigido com causa explicada e estabilidade comprovada (20/10/5/5 repetições, zero retry); `verify:all` verde (538 testes, lint/build/sintaxe nos 4 apps); `npm audit --audit-level=high` verde nos 8 projetos; deploy do Retiradas agora depende dos 5 gates obrigatórios, comprovado por teste de contrato; job `security` audita todo o monorepo, comprovado por contrato; health check do ADM implementado e testado; push a `master` comprovadamente isolado (não afeta Finan/ADM/Operação); runbook completo; nenhuma branch legada ou stash tocado.

**GO PARA PROMOÇÃO**
