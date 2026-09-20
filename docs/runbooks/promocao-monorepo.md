# Runbook — Promoção de `refactor/monorepo-quatro-apps` para `master`

Auditado nas Etapas 7 e 8 (`docs/REORGANIZACAO-MONOREPO-ETAPA7-RELATORIO.md`, `docs/REORGANIZACAO-MONOREPO-ETAPA8-RELATORIO.md`). Este runbook descreve os passos para quem for executar a promoção — nenhum comando aqui foi executado pela auditoria.

## 1. Pré-condições

- Branch auditada: `refactor/monorepo-quatro-apps`.
- SHA final aprovado (Etapa 8): ver `docs/REORGANIZACAO-MONOREPO-ETAPA8-RELATORIO.md`, item 3.
- `master` deve continuar sendo ancestral estrito de `HEAD` no momento da promoção (checar de novo antes de agir — outros commits podem ter entrado em qualquer um dos dois lados desde a auditoria).
- `verify:all` deve estar verde em ambiente limpo (clean-room) imediatamente antes da promoção, não apenas no momento da auditoria — a Etapa 8 confirmou isso na primeira execução, sem retry (item 17 do relatório da Etapa 8).
- Nenhuma alteração local pendente (`git status` limpo) na máquina que for promover.
- **Gate obrigatório (Etapa 8, Fase 4)**: `deploy-vps` só roda se `security`, `build-and-test`, `validate-finan`, `validate-adm` e `validate-operacao` passarem — coberto por teste de contrato em `tests/contracts/ciDeployGates.test.js` (falha se alguém remover essa dependência no futuro).

## 2. Comando de promoção (fast-forward, não merge-commit)

Como `master` é ancestral estrito de `HEAD` (0 commits exclusivos do lado de `master`), a promoção correta é fast-forward — não criar merge-commit:

```bash
git checkout master
git merge --ff-only refactor/monorepo-quatro-apps
```

Se `--ff-only` falhar (alguém commitou em `master` nesse meio-tempo), **parar** e reauditar a topologia antes de qualquer `merge` não-ff ou `rebase`.

## 3. Verificação pós-merge (antes do push)

```bash
git log --oneline -5
npm run verify:all
```

## 4. Push

```bash
git push origin master
```

Isso dispara automaticamente (via `.github/workflows/ci.yml`):
- `security`, `build-and-test` (gates).
- `validate-finan`, `validate-adm`, `validate-operacao` (gates, sem deploy).
- `deploy-vps` (deploy real, só do Retiradas — frontend `dist/` + `apps/retiradas/backend`) — **desde a Etapa 8, só roda se os 5 gates acima passarem** (antes dependia só de `security`+`build-and-test`).

**Finan, ADM e Operação NÃO são deployados por este push** — `deploy-finan-vps` só dispara em push para a branch `finan`; ADM e Operação não têm job de deploy no CI (deploy manual por SSH, fora deste fluxo). Ver seção 5.

## 5. Ordem de deploy por app

| App | Mecanismo | Quando |
|---|---|---|
| Retiradas | CI automático (`deploy-vps`) | No push a `master`, junto com a promoção. |
| Finan | Manual SSH (chave `~/.ssh/retiradas_github_actions_deploy`) OU CI (`deploy-finan-vps`, só na branch `finan`) | Fora do escopo desta promoção — branch `finan` não é tocada. |
| ADM | Manual SSH | Fora do escopo desta promoção — sem job de deploy no CI. |
| Operação | Manual SSH | Fora do escopo desta promoção — sem job de deploy no CI. |

## 6. Smoke tests por app

- Retiradas prod: `deploy-vps` já roda health-check interno (`curl http://127.0.0.1:3001/api/health`, 10x/3s) antes de finalizar; `e2e-smoke-prod` roda Playwright contra a URL pública depois.
- Finan/ADM/Operação: sem pipeline de smoke automatizado nesta promoção (não deployados por ela). Validação manual fica para quando o deploy manual desses apps for executado.
- **ADM (Etapa 8, Fase 5)**: agora tem `GET /api/health` sem autenticação (`{"ok":true,"service":"adm-api"}`, não consulta banco). Quando o deploy manual do ADM for feito, validar com `curl -fsS http://127.0.0.1:3301/api/health` (ou via nginx, `adm.retiradas.tech/api/health`) antes de considerar o deploy concluído — resolve o bloqueador anotado na Etapa 7 (ADM não tinha health-check público).
- Operação já tinha `GET /api/health` (com consulta ao banco) — sem mudança nesta etapa.

## 7. Gatilhos de rollback

- Health-check interno do `deploy-vps` falha (10 tentativas).
- `e2e-smoke-prod` falha após deploy.
- Erros 5xx sustentados nos minutos seguintes ao deploy (observação manual — não há alerta automático identificado no repositório).

## 8. Procedimento de rollback

Não há comando de rollback automatizado no workflow. Procedimento manual, via SSH (chave de GitHub Actions), reaplicando o pacote do SHA anterior (`/tmp/retiradas-dist-<sha-anterior>.tar.gz`, se ainda presente) ou reexecutando o job `deploy-vps` a partir de um `git revert` em `master` seguido de novo push. **Não fazer isso sem necessidade comprovada** — é ação fora do escopo desta etapa de auditoria.

## 9. Notas sobre migrations/DB

O `deploy-vps` roda `migrate:sql` e `migrate:normalized:apply` automaticamente antes de reiniciar o serviço. A Etapa 7 não alterou nenhuma migration, tabela ou coluna — apenas auditou. Nenhuma migration nova está pendente de promoção além das já existentes no branch.

## 10. Branches legadas

`finan`, `adm` e `rot` **não são apagadas** nesta fase — continuam existindo e não foram tocadas por esta auditoria nem devem ser tocadas pela promoção.

## 11. Feature flag do ADM

`VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS` permanece com default `false` (ausência = `false`) e não deve ser ativada em produção nesta fase — isso é independente da promoção do Retiradas (ADM não é deployado por este fluxo).

## 12. Validação pós-publicação do fluxo de rompimentos

Fora do escopo desta promoção (Operação não é deployado por este push). Quando o deploy manual da Operação for feito, validar manualmente: criação de tratativa (`POST /admin/rompimentos`), anexo de 1 a 10 imagens, finalização (`PUT .../:id` com `status=concluido`), e sincronização da fila offline.

## 13. Matriz real de testes por app (corrigida na Etapa 8)

| App | Script | O que executa de fato | Testes/casos reais |
|---|---|---|---|
| Retiradas | `test:retiradas` | Vitest (frontend, inclui testes que carregam o backend via `createRequire`) | 353 |
| Finan | `test:finan` | **Não são testes** — `node --check` (checagem de sintaxe) de 118 arquivos do backend. Finan não tem nenhum teste automatizado (frontend ou backend) hoje. | 0 testes / 118 arquivos verificados |
| ADM | `test:adm` | Vitest (frontend) + `node --check` (sintaxe do backend, 82 arquivos) | 125 (121 + 4 do novo teste de health check, Fase 5) |
| Operação | `test:operacao` | `node --test` (backend, 10 arquivos) + Vitest (frontend, 3 arquivos) | 55 (42 + 13) |
| Contratos | `test:contracts` | `node --test` | 4 (2 originais + 2 novos de `ciDeployGates.test.js`, Fase 4) |

O relatório da Etapa 7 atribuiu esses números ao app errado (mas o total e o `EXIT:0` estavam corretos) — ver correção em `docs/REORGANIZACAO-MONOREPO-ETAPA7-RELATORIO.md`, item 12, e detalhamento em `docs/REORGANIZACAO-MONOREPO-ETAPA8-RELATORIO.md`, item 11.

## 14. Hardening pendente (fora do escopo desta promoção)

- `finan-api.service` roda como `User=root` — plano de migração para `svc-finan` documentado em `docs/security/finan-service-hardening.md` (Etapa 8, Fase 9). Não aplicado ao serviço real; requer teste manual antes de qualquer mudança em produção.
- `npm audit --audit-level=high` encontra vulnerabilidades reais (não segredos) em `package-lock.json` da raiz (js-yaml) e de `apps/retiradas/backend` (multer, nodemailer) — pré-existentes, não introduzidas por esta reorganização, fora do escopo de correção desta etapa (ver `docs/REORGANIZACAO-MONOREPO-ETAPA8-RELATORIO.md`, item 16).

## 15. Confirmações

- Nenhum comando de promoção foi executado por esta auditoria (Etapa 7) — apenas documentado.
- Nenhum push, merge, deploy ou migration foi executado pela auditoria.
