# Informativo — Missão de Otimização Completa do Sistema de Retiradas

**Período:** 2026-09-06 (sessão única)
**Branches:** `homolog-dev` → promovido para `master` (produção)
**Commits da missão:** `074df47`..`603440e` (14 commits)
**Status final:** ✅ Promovido para produção, validado, saudável.

> Todos os números abaixo foram medidos de verdade (rodando lint/testes/build
> localmente, consultando o banco real via SSH autorizado, lendo logs e
> métricas reais do servidor). Nenhuma métrica foi estimada ou inventada.

---

## 1. Resumo executivo

A missão cobriu um diagnóstico completo (Fase 0) do Sistema de Retiradas
(`src/**` + `vps/**`, excluindo explicitamente `apps/finan/**`, sistema
separado), seguido de implementação em fases (A a I) das correções
priorizadas. **Nenhum item CRÍTICO foi encontrado** na auditoria inicial —
não há SQL injection, não há segredo hardcoded, não há bypass de
autenticação. Os achados foram todos ALTO/MÉDIO/BAIXO, e os de maior risco
real (IDOR em agendamentos/atendimento, migrations sem preflight/backup,
gaps de auditoria) foram corrigidos nesta sessão.

Adicionalmente, a pedido explícito do usuário, foi resolvida uma dívida
que tinha sido conscientemente adiada durante a sessão (achado #9 —
transação no fluxo de reconciliação agendamento→mapa) antes da promoção
para produção. Durante a promoção, foi descoberto e corrigido um problema
real no pipeline de CI/CD (deploy do Finan disparando indevidamente a
cada push em `master`).

**Nenhuma mudança de autenticação com PIN/código numérico foi feita** —
conforme instrução explícita, a auditoria reforçou o mecanismo existente
(JWT próprio + cookie + Argon2id + revogação real de sessão) em vez de
substituí-lo.

---

## 2. Baseline (Fase 0 — diagnóstico)

- Levantamento 100% read-only, três investigações independentes (auth/RBAC/
  segurança; banco/domínio de OS-agendamentos; testes/CI-CD/frontend/PWA).
- **20 achados** classificados: 0 CRÍTICO, 6 ALTO, 8 MÉDIO, 6 BAIXO
  (ver tabela completa em [`docs/TECHNICAL-AUDIT.md`](docs/TECHNICAL-AUDIT.md#243)).
- Testes antes da missão: **70 arquivos de teste** em `src/`.
- Documento produzido: `docs/TECHNICAL-AUDIT.md` (534 linhas).

---

## 3. Execução por fase

| Fase | Status | O que foi feito |
|---|---|---|
| **A — IDOR** | ✅ Completa | `vps/api/src/security/regionalScope.js` (116 linhas) aplicado em `agendamentosRoutes.js` e `atendimentoService.js`: checagem de escopo regional antes de `PUT/DELETE` por ID, fechando o gap onde qualquer usuário com permissão de "manage" podia agir sobre registro de qualquer regional. |
| **B — Migrations/deploy** | ✅ Completa | `vps/scripts/migration-preflight.js` (132 linhas) + convenção `vps/sql-tools/preflight_*.sql`; backup automático e health check adicionados ao pipeline de deploy (`homolog` e `produção`); rollback documentado em `docs/DEPLOY-ROLLBACK.md`. Bug real de CI corrigido em produção (`-E` sobrando causava exit 127). |
| **C — DTO/validação** | 🔶 Parcial (por decisão de escopo) | Infra em `vps/api/src/dtos/` (schema builder próprio, 226 linhas). Aplicado de ponta a ponta em **agendamentos** (`unknownKeys: "reject"`) e **usuários administrados** (`unknownKeys: "strip"`). Ordens de serviço (escrita só via import em lote) e atendimento (arquivo de 3000+ linhas, fluxo de chatbot com estado) ficaram no backlog — não são risco de segurança pendente, são trabalho estrutural futuro. |
| **D — Auditoria** | ✅ Completa | `auditLog.recordAuditLog` cobrindo criação/edição/exclusão de agendamentos, casos e técnicos de atendimento, e criação/restauração de backup de banco (ação administrativa mais sensível do sistema, antes sem rastro nenhum). |
| **E — Constraints de banco** | ✅ Completa | Acesso de leitura à VPS de homologação liberado durante a sessão; dados reais verificados (ver seção 4). Migration `060_ordens_agendamentos_regional_mac.sql` aplicada com sucesso: `regional_id` (FK+índice) em `ordens_servico`/`agendamentos`, `CHECK` de `agendamentos.status`/`turno`, normalização canônica de MAC. |
| **F — Robustez PostgreSQL** | ✅ Completa | Pool `pg` com `max`/timeouts + `pool.on("error")`; teto de segurança em `listAllAppointmentLogs`; **transação atômica no fluxo de reconciliação** (`agendamentoMapaReconciliation.js`) — resolvida a pedido explícito do usuário antes da promoção (ver seção 6). |
| **G — E2E real** | ✅ Completa | `tests/e2e/critical-ui-flows.spec.js` (79 linhas, UI real via Playwright), executado e verificado manualmente contra `https://homolog.retiradas.tech`. Habilitado no CI (`e2e-smoke-homolog`, `e2e-smoke-prod`). Descobriu um bug real de produção (ver seção 5). |
| **H — Hardening secundário** | 🔶 Parcial (por decisão de escopo) | `publicReadLimiter` (60 req/min/IP) em 4 rotas públicas; magic bytes em upload de imóveis; `html2pdf.js` órfã removida. SSE (`/api/events`) mantido sem auth de propósito (investigado — quebraria o Painel Público). Decomposição de componentes grandes do Painel Público **não** feita — sem medição real de performance (Fase I), seria refactor especulativo. |
| **I — Performance** | Não executada | Requer ferramenta de profiling real; registrada como próxima iteração dedicada, condicionada a medição real antes de qualquer decomposição de componente. |

---

## 4. Dados reais verificados (Fase E, via SSH autorizado)

- PostgreSQL 16.15 (homologação).
- `ordens_servico`: 49464 linhas · `agendamentos`: 207 linhas.
- Colisão de MAC (case/separador): **0 linhas** — antes e depois do backfill.
- Órfãos regionais: `ordens_servico` só "Sem Regional" (26, placeholder
  legítimo) · `agendamentos` só "Metropolitana SUB 1" (1) e "ONNET" (1).
- Violações de enum `agendamentos.status`/`turno`: **0**.
- `ordens_servico.status`: 5 valores distintos (Aguardando Agendamento
  29788, Pendente 17191, Finalizado 1645, vazio 839, "-" 1).
- `ordens_servico.tipo`: 37 valores distintos (não constrangido — volátil,
  múltiplas integrações).
- Migration 060 testada dentro de `BEGIN;...ROLLBACK;` contra o banco real
  antes de commitar: `UPDATE 46953` (regional_id em ordens), `UPDATE 20`
  (regional_id em agendamentos), ambos `CHECK` aplicados sem erro,
  `UPDATE 0`/`UPDATE 0` na normalização de MAC (dado já canônico).

---

## 5. Bug real encontrado e corrigido (via Fase G)

`POST /api/auth/login` respondia **HTTP 200** mesmo para credenciais
inválidas (o front-end não quebrava porque checava `data.ok === false`
independente do status HTTP, mas a API violava o contrato REST esperado).
Descoberto pelo teste E2E real rodando contra homologação em CI. Causa:
`auth.js#verifyPasswordCredentials` lançava erro sem `.statusCode`, e o
catch de `/api/auth/login` nunca chamava `res.status(...)`.

**Correção**: `error.statusCode = 401` explícito + `res.status(error?.statusCode
|| 401)`. Teste de caracterização pré-existente (que documentava o bug com
`expect(response.status).toBe(200)`) foi **atualizado para refletir o
comportamento correto** (`toBe(401)`), por instrução explícita da missão de
não mascarar bug de aplicação com teste errado. Verificado em produção
real após o deploy: `curl -X POST https://retiradas.tech/api/auth/login`
com credenciais inválidas retorna `401` em 61ms.

---

## 6. Item resolvido a pedido explícito antes da promoção (achado #9)

Durante a Fase F, a transação explícita no fluxo
`agendamentoMapaReconciliation.js` (atualização do agendamento + gravação
do log de verificação) tinha sido **conscientemente adiada** por exigir
threading de um `client` opcional por uma função genérica usada por ~20
outros call sites. O usuário pediu explicitamente para resolver isso antes
de ir para produção.

**Implementado** (commit `43ffbb7`):
- `getDocument`/`upsertDocument`/`saveAppointment`/`recordAppointmentLog`
  em `agendamentosRepository.js` passaram a aceitar `{client}` opcional
  (default = `db` do módulo — zero mudança de comportamento para os
  callers existentes).
- `agendamentoMapaReconciliation.js`: cada registro agora abre uma
  transação (`db.connect()` + `begin`/`commit`, `rollback`+`release` no
  catch) envolvendo o par de escritas, eliminando a janela onde o
  agendamento ficava com status novo sem o log correspondente.
- 2 testes novos garantindo begin→commit em ordem, client correto
  propagado, e rollback+release em falha simulada.
- **Verificado em produção real** via SSH: arquivo rodando contém a
  transação (`client.query("begin")` presente), serviço saudável.

---

## 7. Migrations executadas

| Migration | Status | Efeito |
|---|---|---|
| `060_ordens_agendamentos_regional_mac.sql` | ✅ Aplicada (homolog + produção) | `regional_id` (FK+índice) em `ordens_servico`/`agendamentos`, `CHECK` de `agendamentos.status`/`turno`, normalização de MAC. Testada em `BEGIN/ROLLBACK` contra dado real antes de commitar. |
| `preflight_060_...sql` | ✅ Rodado (0 violações) | Detecção de colisão de MAC pós-normalização, pareado com a 060 na convenção nova de preflight. |

Deliberadamente **não aplicado** (registrado como backlog, não risco
ativo): `UNIQUE` de MAC, `CHECK` de `ordens_servico.status`/`tipo` (37
valores legítimos e voláteis).

---

## 8. Testes

- **Antes da missão**: 70 arquivos de teste em `src/`.
- **Depois**: 78 arquivos de teste em `src/` (+8 novos:
  `agendamentosRoutesRegionalScope`, `atendimentoServiceRegionalScope`,
  `databaseBackupsAdminController`, `imoveisFileMagicBytes`, `macUtils`,
  `migrationPreflight`, `security/regionalScope`, `userAdminDto`) + 1 novo
  E2E de UI real (`tests/e2e/critical-ui-flows.spec.js`).
- **Suíte completa nesta sessão**: `78 arquivos / 408 testes — 100% passando`
  (última execução completa, isolada, sem flakiness).
- **E2E real**: `critical-ui-flows.spec.js` executado manualmente contra
  `https://homolog.retiradas.tech` (3 testes credential-free: login
  carrega, credenciais inválidas mostram erro, rota protegida redireciona
  — todos passando). `e2e-smoke-homolog`/`e2e-smoke-prod` habilitados no
  CI e confirmados verdes pelo usuário após o deploy de produção.

---

## 9. Endpoints/fluxos protegidos ou corrigidos

- `PUT/DELETE /api/agendamentos/:id` — IDOR fechado (escopo regional).
- `PUT/DELETE` de casos e técnicos de atendimento — IDOR fechado.
- `PUT /api/admin/users/:uid` — DTO com validação centralizada.
- Escrita de agendamentos — DTO com validação centralizada
  (`unknownKeys: "reject"`).
- `/api/public/dashboard`, `/api/public/static/:domain`,
  `/api/public/documents*` — rate limit dedicado (60 req/min/IP).
- 5 endpoints de upload de imóveis — validação de magic bytes real
  (antes só MIME/extensão, spoofável).
- `POST /api/auth/login` — status HTTP correto em falha de autenticação.
- Restauração/criação de backup de banco — auditoria adicionada.

---

## 10. Arquivos criados e modificados

- **23 arquivos novos** (3119 linhas), incluindo: 3 documentos (`docs/
  TECHNICAL-AUDIT.md`, `docs/DEPLOY-ROLLBACK.md`, `docs/DATABASE-
  CONSTRAINTS-PLAN.md`), 8 arquivos de teste backend + 1 E2E, infra de DTO
  (5 arquivos), `regionalScope.js`, `macUtils.js`, `migration-preflight.js`,
  1 migration SQL + 1 preflight.
- **21 arquivos modificados**, incluindo `app.js`, `auth.js`, `db.js`,
  `agendamentosRepository.js`, `agendamentoMapaReconciliation.js`,
  `atendimentoService.js`, `ordensRepository.js`, `sempreIntegration.js`,
  `imoveis.js`, `databaseBackupsAdminController.js`,
  `.github/workflows/ci.yml`, `CLAUDE.md`.
- **Diffstat total da missão** (`074df47~1..603440e`):
  `44 files changed, 11659 insertions(+), 7809 deletions(-)`
  (a maior parte das remoções é `package-lock.json` regenerado após
  remover a dependência órfã).

---

## 11. Dependências alteradas

- **Removida**: `html2pdf.js` (confirmada sem nenhum uso via grep + build
  bem-sucedido após remoção).
- **Nenhuma dependência nova adicionada** — toda a infra de DTO e
  validação foi escrita à mão, seguindo a restrição explícita da missão
  contra over-engineering.

---

## 12. Bug de CI descoberto e corrigido durante a promoção

Ao promover `homolog-dev` → `master`, o job `deploy-finan-vps` disparou
mesmo sem nenhuma mudança em `apps/finan/**` — porque sua condição
(`if: ref == 'refs/heads/master'`) não checava se o Finan realmente havia
mudado. Corrigido (commit `603440e`) com um novo job
`detect-finan-changes` que compara `apps/finan/` via `git diff` entre o
commit anterior e o atual, e só permite o deploy do Finan em `master`
quando há mudança real. Sincronizado em ambas as branches
(`homolog-dev` e `master`).

---

## 13. Riscos mitigados

- IDOR em agendamentos/atendimento (ALTO).
- Migrations em produção sem preflight/backup/rollback (ALTO).
- Auditoria ausente em ações administrativas sensíveis, incluindo
  restauração de backup (ALTO).
- E2E real ausente do CI, único E2E prévio não cobria UI (ALTO).
- Falta de FK/CHECK básicos em `ordens_servico`/`agendamentos` (ALTO,
  parcialmente — regional_id e enum de agendamentos).
- MAC sem normalização/detecção de duplicidade (ALTO).
- Pool `pg` sem timeout/handler de erro (MÉDIO).
- Falta de transação no fluxo de reconciliação (MÉDIO — resolvido a
  pedido explícito antes da promoção).
- Upload de imóveis sem validação real de arquivo (BAIXO).
- Rate limit ausente em rotas públicas de leitura (MÉDIO).
- Deploy do Finan disparando sem necessidade a cada push de Retiradas em
  `master` (descoberto e corrigido durante esta promoção).

## 14. Riscos residuais (backlog, não bloqueiam produção)

- DTO de ordens de serviço (payload de importação em lote — desenho
  diferente de CRUD REST).
- DTO/decomposição de `atendimentoService.js` (3000+ linhas, chatbot com
  estado).
- `CHECK` de `ordens_servico.status`/`tipo` e `UNIQUE` de MAC (dados
  voláteis, precisam de mais tempo de observação).
- Fase I (medição real de performance) — pré-requisito para qualquer
  decomposição de componente grande do Painel Público.
- JWT manual vs. `jsonwebtoken` (débito técnico, BAIXO).
- TTL de sessão de 1 ano com renovação silenciosa — **recomendação
  registrada, não alterada** (mudança de comportamento que exige decisão
  de produto, não só técnica):
  - Reduzir para 30 dias com renovação deslizante mantém UX similar
    (sessão renovada a cada uso) mas reduz a janela de exposição em caso
    de token vazado de 1 ano para 30 dias.
  - Reduzir para 90 dias é intermediário — ainda uma redução de ~4x no
    pior caso, com menos impacto em usuários que abrem o sistema
    esporadicamente.
  - Qualquer uma das duas exige comunicação prévia (usuários serão
    deslogados na primeira aplicação da mudança) e não deve ser feita
    silenciosamente.

---

## 15. Deploy e verificação em produção

- `homolog-dev` → `master`: fast-forward puro (13 commits, sem
  divergência), validado com lint/testes/build antes do push.
- Deploy de produção confirmado via SSH (leitura, autorizado): serviço
  `retiradas-api` reiniciado com sucesso, código da Fase F confirmado
  rodando, health check respondendo (200 OK, ~2-4ms interno / 123ms
  externo).
- Smoke test pós-produção: `nginx -t` ok; CPU 2 vCPU (load avg
  0.06/0.27/0.27); RAM 1.7GB/7.8GB usado; disco 28% usado (70GB livres);
  zero erros no log da API em 30min; zero 5xx em ~500 requisições reais
  de produção (497×200, 3×401 esperados); Postgres ativo, 28 conexões.
- Bug de auth (seção 5) reproduzido manualmente contra produção real após
  o deploy: `401` correto em 61ms.
- `e2e-smoke-prod` no CI: confirmado verde pelo usuário após reexecução
  (a primeira tentativa sofreu timeout transitório durante a janela de
  restart do serviço, sem relação com bug de aplicação).

---

## 16. Conclusão

A missão cobriu diagnóstico completo, correção dos achados ALTO/MÉDIO com
risco real, e promoção controlada para produção com validação em cada
etapa (lint, testes, build, dados reais de banco, health check, smoke
test). Nenhuma métrica foi inventada — todos os números deste documento
vieram de execução real de comandos nesta sessão. Os itens não resolvidos
(Fase C parcial, Fase H parcial, Fase I não executada) são decisões
deliberadas de escopo, documentadas como backlog, sem risco de segurança
ou estabilidade pendente.

---

*Gerado por Claude Code ao final da sessão de otimização do Sistema de
Retiradas, 2026-09-06.*
