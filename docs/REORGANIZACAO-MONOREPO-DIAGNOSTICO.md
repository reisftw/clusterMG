# Diagnóstico — Reorganização do monorepo em 4 apps independentes

> **Fase 1 (auditoria) do plano de reestruturação estrutural.** Nenhum
> arquivo foi movido, renomeado ou modificado. Levantamento 100% via
> `git show <branch>:<path>` / `git ls-tree -r <branch>` — sem checkout,
> sem alterar a branch ativa em nenhum momento. Gerado em 2026-09-19/20.

## 0. Segurança do working tree (obrigatório antes de qualquer mudança)

- Branch ativa no momento deste diagnóstico: **`finan`**, working tree
  **limpo** (`git status` sem saída), commit `b5424c2` já publicado
  localmente (correções de payload limit do Finan).
- **2 stashes pendentes na branch `rot`**, ainda não restaurados:
  - `stash@{0}`: `wip-rot-antes-de-ir-pra-adm-2026-09-19`
  - `stash@{1}`: `wip-claude-md-nova-versao-concorrente-2026-09-19`
  - Esses stashes **precisam ser preservados e restaurados** antes ou
    durante a reorganização da branch `rot` — não serão tocados por este
    plano sem sua confirmação explícita.
- Não há conflitos, merges pendentes ou rebases em andamento em nenhuma
  branch local.

## 1. Estrutura atual encontrada

Todas as 4 branches (`master`, `adm`, `finan`, `rot`) têm a **mesma
estrutura de raiz** (`src/`, `vps/`, `apps/`, configs de root idênticas em
nome) — mas o conteúdo de `src/`/`vps/`/`apps/*` diverge muito entre elas.
Isso já é a primeira divergência importante em relação ao prompt: **não
existe uma pasta por app fora do monorepo** — é tudo a mesma pasta
`retiradas`, com o conteúdo mudando conforme a branch ativa (confirmado em
conversa anterior desta sessão).

```
retiradas/                    <- pasta única, todas as branches
├── src/, vps/                <- sistema "Retiradas" (raiz, todas as branches têm uma cópia)
├── apps/
│   ├── finan/                <- existe em TODAS as branches (ver seção 3)
│   ├── adm/                  <- completo só na branch `adm`
│   └── rot/                  <- completo só na branch `rot`
├── .github/workflows/ci.yml  <- 1 arquivo só, versão diferente por branch
├── package.json              <- raiz, sem workspaces, com scripts finan:*
├── docs/, scripts/, tests/, public/, etc.
```

Não existem hoje: `packages/`, `infrastructure/`, `apps/retiradas/`,
`apps/operacao/`, nenhum `Dockerfile`, nenhum `tsconfig.json`/`jsconfig.json`
de aliases. A estrutura proposta no seu prompt é 100% nova — nada a migrar
de estruturas "vazias" pré-existentes.

## 2. Conteúdo relevante por branch

### 2.1 `master` (Retiradas, na raiz)

- `package.json` raiz: sem `workspaces`; scripts padrão (`dev`, `build`,
  `lint`, `test`, `test:coverage`, `test:e2e`) + família `finan:*` já
  embutida (`finan:frontend:dev`, `finan:backend:start`,
  `finan:migrate`, `finan:audit:retiradas`, `finan:migrate:from-retiradas`
  etc., todos via `--prefix apps/finan[/backend]`). **Nenhum script
  `adm:*`/`rot:*`.**
- `vite.config.js` raiz: sem `resolve.alias`; `test` (Vitest) aponta só
  pra `src/**`; sem `build.outDir` customizado (default `dist`).
- `src/`: 37 módulos de domínio em `src/modules/*`, 6 páginas públicas em
  `src/pages/*` (`Acompanhamento`, `Devolucao`, `DuvidasPublico`, `Mapa`,
  `PainelPublico`, `Terceiros`).
- `vps/`: `vps/api/src` (~40 arquivos, sem subpastas de domínio, estilo
  "tudo solto"), migrations em `vps/sql/` — **67 arquivos, `001` até
  `066_movimentacoes_backfill_resume.sql`** (a numeração avançou bem além
  dos `030–044` documentados no `CLAUDE.md` atual — CLAUDE.md desatualizado
  nesse ponto).
- **`apps/finan/` existe inteiro dentro de `master`** (não é exclusivo da
  branch `finan` — ver seção 3, é o achado mais crítico deste diagnóstico).
- Deploy: só via SSH/scp/systemctl/nginx reload no `.github/workflows/ci.yml`
  (job `deploy-vps`, dispara em push a `main`/`master`). Path
  `/var/www/retiradas/dist` (frontend) + `/opt/retiradas/vps` (backend),
  serviço `retiradas-api`, porta interna **3001**, banco `retiradas` /
  usuário `retorninho`. Sem PM2, sem Docker.
- Uploads: `UPLOADS_DIR` (default `<cwd>/uploads`), avatares servidos em
  `/api/uploads/avatars/*`, excluídos do pacote de deploy (persistem só na
  VPS).

### 2.2 `finan` (Gestão financeira)

- `apps/finan/frontend` e `apps/finan/backend` com `package.json` próprios
  (`finan-frontend`, `finan-backend`). Frontend **propositalmente sem**
  `react`/`vite`/`chart.js` nas deps — comentário explícito no
  `package.json` diz que são herdados do `node_modules` da raiz porque o
  Finan renderiza `FinanceiroPage.jsx` do `src/modules/financeiro` da raiz
  e duas instâncias de React quebrariam hooks/Context.
- **Acoplamento ativo e real com a raiz** (não é só comentário):
  `apps/finan/frontend/src/index.css:27` tem
  `@source "../../../../src/**/*.{js,jsx,ts,tsx}"` (Tailwind varrendo a
  árvore `src/` da raiz) + lazy-imports diretos de páginas de
  `src/modules/**`. **Mover `src/` sem atualizar esse `@source` quebra o
  build do Finan.**
- Migrations: `apps/finan/backend/sql/001`–`039` (prefixo `finan_`,
  schema próprio), aplicadas via `finan_migrations` (tabela própria).
- `.env.example`: `apps/finan/.env.example` (não dentro de
  `backend`/`frontend` — fica na raiz do app), com `FINAN_DATABASE_URL`
  próprio — **banco de fato separado** do Retiradas.
- Nginx/systemd em `apps/finan/ops/*.example`: `finan.retiradas.tech`,
  proxy pra `127.0.0.1:3101`, serviço `finan-api.service`
  (`User=root`), mais 2 timers (`finan-calendar-alerts`,
  `finan-db-backup`, retenção 14 dias — diverge dos 30 dias do
  `.env.production.example`, inconsistência a resolver depois, fora de
  escopo desta reorganização).
- CI: job `deploy-finan-vps` roda só em push pra `finan`/`master` — e o
  próprio YAML documenta em comentário um **incidente real**: um push em
  `master` (carregando `apps/finan/` desatualizado) já sobrescreveu o
  Finan em produção com uma versão antiga. Esse é o principal argumento
  para não deixar cópias de um app em branches de outro.
- Testes de integração usam Postgres isolado via
  `apps/finan/docker-compose.test.yml` (`finan_postgres_test`, porta
  `55432`, tmpfs) + guarda de nome de banco (`testDatabaseGuard.js`) pra
  nunca apontar pra produção. Config Vitest separada
  (`vitest.finan-integration.config.js`, `fileParallelism: false`,
  obrigatório por causa de `TRUNCATE` concorrente).
- `apps/finan/MIGRATION_PLAN.md`/`README.md`: documentam a decisão
  original — banco, login, MFA, permissões e sessões **próprios**,
  reaproveitando só dados financeiros e usuários com permissão financeira
  do Retiradas (via `finan:audit:retiradas` / `finan:migrate:from-retiradas`,
  scripts read-only/carga controlada). Regra explícita: nunca apontar
  `DATABASE_URL` do Finan pro banco do Retiradas.

### 2.3 `adm` (Administrativo/Facilities)

- **Achado mais crítico desta branch**: `apps/adm/backend/src` tem **78
  de 82 arquivos com nome idêntico** aos de `vps/api/src` (master) —
  praticamente uma cópia bruta do backend legado do Retiradas, não um
  backend novo e próprio. Migrations `001`–`044` também têm nomes
  idênticos às migrations normalizadas do `vps/sql` (`030`–`044`
  descritas no `CLAUDE.md`). Só a partir de `062`–`065` aparecem
  migrations genuinamente novas do ADM (`facilities_*`).
- Os docs do próprio ADM (`apps/adm/docs/baseline-arquitetura.md`,
  `apps/adm/docs/recuperacao-vps.md`) confirmam a causa: em 18/09/2026 a
  branch `adm` tinha só 15 arquivos versionados, e foi **recuperada via
  SSH direto da VPS de produção** (`145.223.27.204:/opt/retiradas/apps/adm`),
  trazendo 667 arquivos que não existiam localmente. Não foi um refactor
  incremental — foi uma cópia bruta do estado da VPS.
- **Sem `vite.config.js`** em `apps/adm/frontend` (roda em modo
  zero-config do Vite). **Sem `.env.example`** algum (nem frontend nem
  backend) — único dos 4 sistemas sem template de variáveis documentado.
- **Sem script próprio no `package.json` raiz** (`adm:*` não existe, ao
  contrário de `finan:*`).
- **Push na branch `adm` não dispara CI nenhum hoje** — `adm` não está na
  lista `on.push.branches` de nenhuma cópia do `ci.yml` (nem a da própria
  branch `adm`), e nenhum job do `ci.yml` sequer menciona "adm" (grep
  vazio). É o único dos 4 sistemas completamente fora do pipeline de CI
  atual.
- Testes em `apps/adm/frontend/src/backend/*.test.js` e
  `.../frontend/rotApiSessionCookie.test.js` **na verdade importam e
  executam código de `vps/api/src` e `apps/rot`** (paths relativos tipo
  `../../../../vps/api/src/...`), não código do ADM — são resíduos da
  recuperação via SSH, nunca adaptados. O `vite.config.js` raiz só inclui
  `src/**/*.test.{js,jsx}`, então **esses testes não rodam em lugar
  nenhum hoje** (nem no Vitest raiz, nem em config própria — não existe).
- Nginx/systemd em `apps/adm/ops/`: `adm.retiradas.tech`, proxy pra
  `127.0.0.1:3301`, serviço `adm-api.service` rodando como usuário
  dedicado `svc-adm` (hardening systemd: `ProtectSystem=strict`,
  `NoNewPrivileges`, etc. — mais rigoroso que os outros 3 apps).
- Migrations do ADM parecendo ser as MESMAS migrations normalizadas do
  Retiradas legado é um sinal de que **o ADM pode ainda depender do mesmo
  schema/banco do Retiradas**, não de um banco genuinamente separado —
  isso precisa ser confirmado antes de qualquer decisão de Fase 8 (seção
  6.4 deste documento).

### 2.4 `rot` (Operação: FIELD/ROT/DELIVERY/SST)

- `apps/rot/backend/src`: 43 domínios, incluindo **`sst/`** (confirmado:
  SST já pertence à Operação, não ao ADM) com migrations dedicadas
  (`046`–`056`, faixa `dss`/`seguranca_trabalho`).
- **FIELD e DELIVERY não existem como módulos/domínios nomeados** — não
  há pasta `field/` nem `delivery/` em frontend ou backend. As únicas
  ocorrências de "field"/"delivery" no código são falsos positivos
  (`Field.jsx` componente de UI genérico, `PessoaFields.jsx`). Se
  FIELD/ROT/DELIVERY são domínios de negócio reais, hoje eles estão
  **distribuídos** entre módulos existentes (`technicians`,
  `operationFlows`, `fleet`, `tickets`, `shifts`), não isolados por nome —
  **divergência real entre o prompt e o código, sinalizada conforme
  pedido** (seção 7).
- Migrations: `apps/rot/backend/sql/001_rot_core.sql`–`059_fleet_attachments.sql`,
  schema genuinamente próprio (`rot_migrations`), banco `ROT_DATABASE_URL`
  separado, com sincronização **opcional** de dados legados via
  `RETIRADAS_DATABASE_URL` (se vazio, lê `app_documents` no próprio banco
  da Operação) — isolamento de dados bem mais maduro que o ADM.
- Storage: **S3-compatible (Cloudflare R2)**, não filesystem local — env
  `R2_*`/`AWS_S3_*`, módulo `storage/` dedicado. Diferente dos outros 3
  apps (que usam disco local pra uploads).
- **Nenhum job `deploy-rot-vps` existe no CI** — só há `node --check` +
  `npm audit` + `npm run build` de validação; deploy real é manual (bate
  com a memória já registrada desta sessão: "sempre deploy manual" nesse
  repo, e com o usuário SSH `root@operacao.retiradas.tech` já mencionado
  em conversa anterior).
- Nginx/systemd em `apps/rot/ops/`: exemplo usa `rot.retiradas.tech` e
  proxy pra `127.0.0.1:3201`, serviço `rot-api.service`
  (`Description=Operacao API`, `User=operacao`) — só o **nome do
  serviço/descrição já usa "Operacao"**, mas o domínio público de exemplo
  ainda é `rot.retiradas.tech`; o código tem `operacao.retiradas.tech`
  como valor **default** em alguns lugares (`email/service.js`,
  `sst/routes.js`), sugerindo transição de nome em andamento, não
  finalizada — **não há documentação versionada que fixe qual é o domínio
  real de produção hoje**, precisa confirmação sua antes de qualquer
  renomeação (seção 4 da Fase 4 do seu prompt).
- Contém cópias residuais pequenas de outros apps: **`apps/adm` (15
  arquivos, claramente resquício)** e **`apps/finan` (217 arquivos)** —
  confirmei via diff que a cópia de `apps/finan` dentro de `rot` é um
  **subconjunto estrito e desatualizado** da branch `finan` real (0
  arquivos exclusivos de `rot`, 157 arquivos que só existem na `finan`
  atual) — ou seja, também é resíduo obsoleto, seguro de tratar como tal
  (não precisa ser preservado como fonte de verdade).

## 3. Diferenças entre as branches (achado estrutural mais importante)

### 3.1 Históricos de git **completamente desconectados**

```
master: 323 commits, desde 2026-04-29 — histórico completo e contínuo
adm:      3 commits, desde 2026-09-18 — historico anterior ZERADO
finan:    3 commits, desde 2026-09-18 — historico anterior ZERADO
rot:     11 commits, desde 2026-09-18 — historico anterior ZERADO
```

`git merge-base` entre `master` e qualquer uma das outras 3 retorna
**vazio** — não existe nenhum commit ancestral em comum. Cada uma das 3
branches novas foi criada com um commit "baseline única - histórico
anterior zerado" em 18/09/2026, descartando deliberadamente todo o
histórico anterior a essa data (mensagens confirmam: "alinhados com a
produção (VPS)" pro rot, "recuperação validada (Codex + VPS)" pro adm,
"último estado local válido" pro finan).

**Implicação direta pro seu pedido de "preservar histórico git sempre que
possível" (Fase 2)**: já não há o que preservar além de 1-2 dias de
histórico em `adm`/`finan`/`rot` — o histórico anterior foi perdido antes
desta tarefa começar, não é algo que a reorganização vá causar. `git mv`
dentro de cada branch preserva o que resta (poucos commits); combinar as
4 branches numa só (`refactor/monorepo-quatro-apps`) vai exigir
`git merge --allow-unrelated-histories` ou uma estratégia equivalente
(subtree/read-tree manual), porque não há ancestral comum pra um merge
normal resolver sozinho.

### 3.2 `apps/finan` existe em múltiplas branches, com conteúdo divergente

| Branch | `apps/finan` | Observação |
|---|---|---|
| `finan` | **374 arquivos** | Fonte de verdade |
| `master` | 216 arquivos | Cópia desatualizada — já causou incidente de deploy (ver 2.2) |
| `rot` | 217 arquivos | Subconjunto estrito e desatualizado de `finan` (confirmado por diff) |
| `adm` | não verificado nesta rodada, mas pelo padrão dos outros 2, provavelmente também desatualizado |  |

### 3.3 `apps/adm` e `apps/rot` só existem completos na própria branch

| Branch | `apps/adm` | `apps/rot` |
|---|---|---|
| `adm` | **719 arquivos** (fonte de verdade) | 249 (desatualizado) |
| `rot` | 15 (resíduo, confirmado) | **317 arquivos** (fonte de verdade) |
| `master` | 0 | 0 |
| `finan` | 0 | 0 |

### 3.4 CI (`ci.yml`) diverge por branch, mas não por "app isolado"

Cada branch tem sua própria cópia editável do `ci.yml` (não é um arquivo
compartilhado de verdade) — `adm` e `rot` herdaram o `ci.yml` de `master`
e foram **acrescentando** validação do próprio app em cima, sem nunca
remover os jobs de deploy do Retiradas/Finan (que ficam simplesmente
inertes nessas branches, porque o `if:` deles checa `github.ref`). Isso
funciona, mas é duplicação de config — mexer numa regra de segurança
(`security:` job, por exemplo) precisa ser replicado manualmente nas 4
cópias hoje.

## 4. Dependências entre os quatro sistemas

| De → Para | Tipo de dependência | Real (import ativo) ou só comentário? |
|---|---|---|
| Finan → Retiradas (`src/`) | Tailwind `@source` + lazy-import de `FinanceiroPage.jsx` + módulos administrativos de `src/modules/**` | **Real e ativo** — quebra se `src/` mover sem atualizar o path |
| Finan → Retiradas (dados) | Carga inicial opcional via `finan:migrate:from-retiradas` (script, não runtime) | Real, mas é ferramenta de migração pontual, não acoplamento em produção |
| ADM → Retiradas (`vps/api/src`) | Testes órfãos importando `vps/api/src/*` via path relativo | Real nos testes (mas esses testes não rodam hoje em nenhum pipeline) |
| ADM → Retiradas (schema/dados) | Migrations com nomes idênticos ao `vps/sql` normalizado | **Suspeita forte, não confirmada** — precisa checagem manual antes da Fase 8 |
| ADM → Operação (`apps/rot`) | Testes órfãos importando `apps/rot/backend/src/app.js` e `apps/rot/frontend/src/api/rotApi.js` | Real nos testes órfãos (mesma situação: não rodam hoje) |
| Operação → outros apps | Nenhum import real encontrado — só comentários "mesmo padrão de X" | Comentário apenas |
| Retiradas (master) → Finan | `apps/finan/` inteiro versionado dentro de `master`, mas sem import de código — é cópia de arquivo, não dependência de runtime | Cópia de arquivo (o risco real é o deploy pegar essa cópia por engano, não um import quebrar) |

**Resumo**: a única dependência de runtime/build genuinamente ativa e que
quebra se movida sem cuidado é **Finan → `src/` da raiz**. As demais
"dependências" encontradas são cópias de arquivo obsoletas (risco de
deploy errado, não de import quebrado) ou testes órfãos que já não rodam
(risco de dívida técnica, não de regressão funcional imediata).

## 5. Arquivos e configurações afetados por app (visão prática)

| Sistema | package.json próprio | vite.config.js próprio | .env.example | Migrations próprias | Nginx/systemd próprio | CI dedicado |
|---|---|---|---|---|---|---|
| Retiradas | ✅ (raiz) | ✅ (raiz) | ✅ (raiz, só 2 chaves) | ✅ `vps/sql` (67) | ✅ `vps/nginx`, `vps/systemd` | ✅ `deploy-vps` |
| Finan | ✅ | ✅ | ✅ (`apps/finan/.env.example`) | ✅ `apps/finan/backend/sql` (39) | ✅ `apps/finan/ops` | ✅ `deploy-finan-vps` |
| ADM | ✅ | ❌ **faltando** | ❌ **faltando** | ✅ `apps/adm/backend/sql` (65, mas 44 são cópia do legado) | ✅ `apps/adm/ops` | ❌ **nenhum job, nem trigger** |
| Operação | ✅ | ✅ | ✅ (`apps/rot/.env.example`, único pra frontend+backend) | ✅ `apps/rot/backend/sql` (59) | ✅ `apps/rot/ops` | ⚠️ só validação, **sem deploy** |

## 6. Riscos da migração

### 6.1 Risco alto — quebrar o build do Finan
Mover `src/` pra `apps/retiradas/` sem atualizar
`apps/finan/frontend/src/index.css:27` (`@source`) e os lazy-imports de
`FinanceiroPage.jsx`/páginas administrativas quebra o build do Finan
imediatamente. **Mitigação**: atualizar esses paths no mesmo commit que
move `src/`, nunca em commits separados.

### 6.2 Risco alto — repetir o incidente de deploy do Finan
Já aconteceu uma vez (push em `master` sobrescreveu Finan em produção com
versão antiga porque `master` carrega uma cópia desatualizada de
`apps/finan/`). Qualquer estrutura nova precisa **eliminar cópias
duplicadas de app entre branches**, não só confiar em `if:` no CI. Isso é
justamente um dos objetivos da reorganização (juntar tudo numa branch só,
sem cópias divergentes por branch) — mas até a migração terminar, o risco
antigo continua existindo do jeito que está hoje.

### 6.3 Risco médio — histórico git não é "preservável" além do que já existe
Já coberto na seção 3.1. Não é um risco que a reorganização cria — é uma
limitação pré-existente que precisa ser comunicada como fato, não como
efeito colateral da minha mudança.

### 6.4 Risco médio-alto — ADM pode não ter banco separado de verdade
As migrations do ADM (`001`–`044`) parecem ser cópia literal das
migrations normalizadas do Retiradas. Se o backend do ADM (cópia de
`vps/api/src`) ainda usa a mesma `PGDATABASE=retiradas`/mesmas tabelas do
Retiradas (não confirmado — precisa checar `apps/adm/backend/src/db.js` e
o `.env` real da VPS, que **não vou ler nem imprimir** por ser produção),
qualquer decisão de "banco `adm_db`/`adm_user` separado" (Fase 8 do seu
prompt) pode já estar desalinhada com o que está rodando agora. **Preciso
da sua confirmação sobre isso antes de propor qualquer plano de Fase 8.**

### 6.5 Risco médio — CI duplicado em 4 cópias do mesmo arquivo
Qualquer ajuste de segurança/lint precisa ser replicado manualmente hoje.
Não é um risco que bloqueia a Fase 1, mas planejar a Fase 10 (CI seletivo
por `paths:`) reduz esse risco em vez de perpetuá-lo.

### 6.6 Risco baixo — testes órfãos do ADM
Já não rodam em lugar nenhum hoje, então não há regressão possível ao
mexer neles — mas também significa que **o ADM não tem cobertura de teste
real hoje**, isso é uma lacuna pré-existente, não algo a "consertar" como
parte da reorganização estrutural (você pediu explicitamente pra não
misturar refatoração funcional com estrutural).

### 6.7 Risco baixo — renomear `apps/rot` para `apps/operacao`
Não encontrei nenhum import de código real usando o path `apps/rot`
fora da própria branch `rot` (só comentários e testes órfãos do ADM, que
já não rodam). O maior risco aqui é infraestrutura (nginx/systemd/CI),
não código — coberto no plano de migração (seção 8, Fase 4).

## 7. Divergências entre o prompt e a arquitetura real (conforme pedido)

Meu pedido explícito era não forçar a estrutura proposta se ela divergir
da realidade — aqui estão as divergências encontradas:

1. **"Operação possui três domínios: FIELD, ROT, DELIVERY"** — no código
   atual, esses domínios **não existem como módulos nomeados**. A
   Operação tem 43 domínios técnicos (`fleet`, `technicians`,
   `operationFlows`, `tickets`, `shifts`, `sst`, `apr`, etc.), nenhum
   chamado literalmente `field`, `rot` ou `delivery`. Não vou inventar
   essa separação durante a reorganização estrutural — se você quiser
   que ela exista de fato no código, é uma decisão de produto/arquitetura
   separada, não algo que decorre so de mover pastas.
2. **Portas sugeridas no prompt (3001/3002/3003/3004)** não batem com as
   portas reais: Retiradas **3001** ✅, Finan **3101**, Operação **3201**,
   ADM **3301** — os 4 já seguem um padrão consistente (`N01`), só não é
   o padrão sequencial que você sugeriu. Vou manter as portas reais
   (evita reconfigurar nginx/systemd/firewall à toa) a menos que você
   quera renumerar de propósito.
3. **`packages/` e `infrastructure/`** não existem hoje em nenhuma
   branch — a estrutura proposta pra eles é 100% nova, não uma
   reorganização de algo existente.
4. **Banco separado por sistema** (`retiradas_db`/`finan_db`/`adm_db`/
   `operacao_db`) já é realidade pra Finan e Operação (confirmado, bancos
   e usuários próprios via env), mas **não confirmado pro ADM** (seção
   6.4) — preciso validar antes de tratar isso como já resolvido.
5. **Estrutura `frontend/backend/migrations/package.json` por app**
   (proposta no prompt) já bate exatamente com o que existe em
   Finan/ADM/Operação (`apps/<app>/frontend`, `apps/<app>/backend`,
   `apps/<app>/backend/sql` como migrations) — só falta o Retiradas
   seguir o mesmo padrão (hoje é `src/` + `vps/` na raiz, sem a
   convenção `frontend/backend` explícita).

## 8. Plano de migração por etapas (proposto — aguardando sua confirmação)

Este plano só começa a ser executado após você revisar este diagnóstico e
responder às decisões da seção 10.

| Etapa | O que faz | Branch | Risco |
|---|---|---|---|
| **M0** | Criar branch `refactor/monorepo-quatro-apps` a partir de `master` (branch com histórico completo) | nova | Nenhum (só criação de branch) |
| **M1** | Dentro da branch de migração, `git mv src apps/retiradas/frontend` e `git mv vps apps/retiradas/backend` (nomes exatos a definir — `vps/sql` vira `apps/retiradas/backend/migrations`, ver decisão 10.3) | migração | Médio — precisa atualizar `vite.config.js`, `package.json` scripts, `playwright.config.js`, CI, nginx/systemd refs |
| **M2** | Trazer o conteúdo de `apps/finan` (fonte de verdade = branch `finan`, não a cópia de `master`) pra dentro da branch de migração via `git merge --allow-unrelated-histories finan` (ou subtree), resolvendo o `apps/finan` já presente em `master` a favor da versão da branch `finan` | migração | Alto — precisa comparar arquivo por arquivo onde `master` e `finan` divergem no mesmo path |
| **M3** | Mesmo processo pra `adm` (branch `adm`, 719 arquivos) e `rot` (branch `rot`, 317 arquivos + os 2 stashes pendentes restaurados antes) | migração | Alto — 3 merges de histórico não-relacionado seguidos |
| **M4** | `git mv apps/rot apps/operacao`, atualizar toda referência de infraestrutura (nginx example, systemd example, `.env.example` se citar o path, docs) | migração | Baixo (sem import de código real encontrado) |
| **M5** | Atualizar `apps/finan/frontend/src/index.css` (`@source`) e lazy-imports pra apontar pra `apps/retiradas/frontend/...` | migração | Alto se esquecido — quebra build do Finan |
| **M6** | Adicionar `workspaces` no `package.json` raiz (`["apps/*"]`), validar `npm install` na raiz resolve os 4 apps | migração | Médio — primeira vez que os 4 apps compartilham lockfile/resolução |
| **M7** | Adicionar `vite.config.js` ao ADM (hoje não tem) e `.env.example` ao ADM (hoje não tem) — sem mudar comportamento, só documentar o que já roda implícito | migração | Baixo |
| **M8** | Consolidar `.github/workflows/ci.yml` num único arquivo com `paths:` filter por app (Fase 10 do seu prompt), preservando os jobs de deploy existentes por branch/app | migração | Médio-alto — é o arquivo mais crítico pra não quebrar deploy |
| **M9** | Rodar lint/test/build de cada app isoladamente na branch de migração, validar ausência de referências quebradas a `apps/rot`, `src/`, `vps/` fora dos novos paths | migração | — (validação) |
| **M10** | Você revisa a branch `refactor/monorepo-quatro-apps` (PR ou revisão local), decide quando/como promover pra `master` — **não farei isso sozinho** | migração → master (só com autorização explícita) | — |

Branches antigas (`master` original, `adm`, `finan`, `rot`) **continuam
existindo e intactas** até homologação completa — nenhuma é apagada,
renomeada ou tem merge forçado nesta Fase 1 nem nas etapas M0–M9.

## 9. Estratégia de rollback

- Cada etapa (M1–M8) fica em **commits separados** dentro da branch
  `refactor/monorepo-quatro-apps` — reverter uma etapa específica é
  `git revert` do commit correspondente, sem afetar as demais.
- A branch de migração nunca sobrescreve `master`/`adm`/`finan`/`rot`
  diretamente — enquanto não houver merge pra `master` (que só acontece
  com sua autorização explícita, etapa M10), o rollback total é
  simplesmente **não promover a branch**, sem nenhuma ação destrutiva
  necessária.
- Se algo já promovido precisar reverter, as 4 branches originais
  continuam disponíveis como ponto de retorno conhecido (não serão
  apagadas até você confirmar que a homologação terminou).

## 10. Decisões que dependem da sua confirmação antes de eu prosseguir

1. **Restaurar os 2 stashes pendentes em `rot` antes de tudo?** (seção 0) —
   recomendo sim, antes de qualquer merge envolvendo essa branch.
2. **`vps/sql` (migrations do Retiradas) vira `apps/retiradas/backend/migrations` ou fica `apps/retiradas/migrations` (fora do backend), seguindo o padrão do prompt original?** Finan/ADM/Operação já usam `apps/<app>/backend/sql` (migrations dentro do backend) — sugiro seguir o mesmo padrão pro Retiradas por consistência, mas seu prompt original sugeria `apps/retiradas/migrations/` como pasta irmã de `frontend`/`backend`.
3. **`apps/finan` presente em `master`: apagar de lá assim que a branch de migração existir, ou manter até a promoção final?** Dado o incidente já registrado, recomendo remover assim que possível — mas é uma decisão sua, envolve mexer numa branch que ainda está sendo usada em produção.
4. **Confirmar se o ADM realmente tem banco/schema separado do Retiradas, ou se ainda aponta pro banco legado** (seção 6.4) — preciso que você confirme isso (olhando o `.env` real da VPS, que eu não vou ler) antes de eu tratar "banco `adm_db` separado" como algo a formalizar vs. algo a migrar de fato.
5. **Domínio público real da Operação hoje**: `rot.retiradas.tech` (visto no nginx example) ou `operacao.retiradas.tech` (visto como default em código)? Preciso saber qual é o de produção antes de decidir o que a Fase 4 (renomeação) deve atualizar.
6. **FIELD/DELIVERY como domínios nomeados**: você quer que a reorganização estrutural também crie essa separação dentro de `apps/operacao` (ex.: `apps/operacao/backend/src/field/`, `.../delivery/`), ou isso fica de fora por ser mudança funcional, não estrutural? (Seu prompt pede explicitamente pra não misturar refactor funcional com estrutural — só confirmando que entendi certo.)
7. **Merge de históricos não relacionados** (`git merge --allow-unrelated-histories`) é aceitável pra você, ou prefere outra estratégia pra trazer `adm`/`finan`/`rot` pra dentro da branch de migração (ex.: `git read-tree`/subtree, perdendo ainda mais a ligação de histórico, mas sem o "merge commit" estranho que combina raízes diferentes)?
8. **Prioridade de execução**: quer que eu comece pela Fase 3 (Retiradas pra `apps/retiradas`), ou prefere começar por outro sistema primeiro?

---

*Este documento é só diagnóstico (Fase 1). Nenhuma mudança estrutural foi
aplicada. Aguardando suas respostas na seção 10 antes de criar a branch
`refactor/monorepo-quatro-apps` ou mover qualquer arquivo.*
