# Runbook — Promoção de `refactor/monorepo-quatro-apps` para `master`

Auditado na Etapa 7 (`docs/REORGANIZACAO-MONOREPO-ETAPA7-RELATORIO.md`). Este runbook descreve os passos para quem for executar a promoção — nenhum comando aqui foi executado pela auditoria.

## 1. Pré-condições

- Branch auditada: `refactor/monorepo-quatro-apps`.
- SHA auditado (checkpoint Etapa 6): `adb8801ae5d18fd6d49237ca1ab8d7190e4d2888`.
- `master` deve continuar sendo ancestral estrito de `HEAD` no momento da promoção (checar de novo antes de agir — outros commits podem ter entrado em qualquer um dos dois lados desde a auditoria).
- `verify:all` deve estar verde em ambiente limpo (clean-room) imediatamente antes da promoção, não apenas no momento da auditoria.
- Nenhuma alteração local pendente (`git status` limpo) na máquina que for promover.

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
- `deploy-vps` (deploy real, só do Retiradas — frontend `dist/` + `apps/retiradas/backend`).

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

## 13. Confirmações

- Nenhum comando de promoção foi executado por esta auditoria (Etapa 7) — apenas documentado.
- Nenhum push, merge, deploy ou migration foi executado pela auditoria.
