# Reorganização do monorepo — Etapa 1 (branch de migração segura)

> Execução da primeira etapa controlada, conforme escopo autorizado.
> Nenhuma branch original foi alterada, nenhum push/deploy/migration foi
> executado. Todas as operações abaixo são locais e reversíveis.

## 1. Branch inicial

`finan` (limpa, commit `b5424c2` já publicado localmente antes desta
etapa).

## 2. Working tree inicial

Limpo, exceto 1 arquivo não rastreado (`docs/REORGANIZACAO-MONOREPO-DIAGNOSTICO.md`,
o próprio relatório da Fase 1 desta sessão — não colide com nenhum path
de nenhuma branch, não bloqueou nenhuma operação). Sem merge/rebase em
andamento. Confirmado antes de qualquer alteração.

## 3. SHAs das quatro fontes (no momento da execução)

| Fonte | SHA completo | Data do commit |
|---|---|---|
| `master` | `a594f54aec8d905255d68a4864e4b9eedc045a23` | 2026-09-19 14:27:45 -0300 |
| `finan` | `b5424c2c7f65ce32981be2629f5e86325487a847` | 2026-09-19 21:05:01 -0300 |
| `adm` | `41da07210b996cd2d4e2253b3b3f34abf04dd173` | 2026-09-19 14:16:45 -0300 |
| `rot` | `a746f589e92f07d69ef0653e7a0a88714bf81e84` | 2026-09-19 14:30:53 -0300 |

## 4. Referências de segurança criadas (backups)

| Referência | Aponta para | SHA | Arquivos (aprox.) |
|---|---|---|---|
| `backup/pre-monorepo-master` | `master` | `a594f54a...` | 988 |
| `backup/pre-monorepo-finan` | `finan` | `b5424c2c...` | 1230 |
| `backup/pre-monorepo-adm` | `adm` | `41da0721...` | 1924 |
| `backup/pre-monorepo-rot` | `rot` | `a746f589...` | 1288 |

Todas locais, nenhum push realizado. Servem como ponto de retorno exato
caso qualquer etapa futura precise reverter.

## 5. Inventário dos stashes (Operação)

Nenhum stash foi aplicado (`git stash pop`/`apply` nunca executado). Ambos
preservados na lista original e agora também referenciados por branches
locais dedicadas, sem alterar `refs/stash`.

### `stash@{0}` — `wip-rot-antes-de-ir-pra-adm-2026-09-19`
- SHA: `37f786ebf1461c3d9d5ac40a2712f7d0cf2d2a30`
- Referência de segurança: `backup/stash-rot-wip-antes-adm`
- 7 arquivos, 3.774 inserções:

| Arquivo | Classificação | Observação |
|---|---|---|
| `CLAUDE.md` (+71 linhas) | Documentação global | Versão com "Behavioral guidelines" genéricas adicionadas no topo do arquivo original |
| `DIAGNOSTICO_ECOSSISTEMA_4_SISTEMAS.md` | Documentação global | Relatório de sessão anterior, na raiz |
| `RELATORIO_DIAGNOSTICO_ARQUITETURAL.md` | Documentação global | Relatório de sessão anterior, na raiz |
| `apps/rot/backend/src/email/service.js.bak.20260917233730` | Operação | Cópia de backup de um arquivo já versionado (não é diff — o `email/service.js` real não foi tocado neste stash) |
| `apps/rot/backend/src/sst/routes.js.bak.20260917233730` | Operação (SST) | idem |
| `apps/rot/backend/src/sst/routes.js.bak.20260917235144` | Operação (SST) | idem (segunda versão de backup, ~2h depois) |
| `docs/SONARQUBE-MAP-4-SISTEMAS.md` | Documentação global | Relatório gerado nesta própria sessão (Sonar) |

**Mudança funcional não versionada dentro de `apps/rot`**: **nenhuma**.
Os 3 arquivos `.bak.*` são cópias de segurança de `email/service.js` e
`sst/routes.js` feitas antes de alguma edição anterior — não há diff
desses 2 arquivos reais neste stash, só as cópias extras. Não incorporei
nada automaticamente; ficam documentados aqui para decisão futura (podem
ser descartados com segurança quando você confirmar que não precisa mais
deles, ou comparados manualmente contra os arquivos atuais se quiser
confirmar que não representam uma versão mais recente perdida).

### `stash@{1}` — `wip-claude-md-nova-versao-concorrente-2026-09-19`
- SHA: `5283eed8e14a2957da18c40011ad16b91e976b5e`
- Referência de segurança: `backup/stash-rot-claude-md-concorrente`
- 1 arquivo, 476 inserções / 306 remoções:

| Arquivo | Classificação | Observação |
|---|---|---|
| `CLAUDE.md` (reescrita completa) | Documentação global / origem desconhecida | Versão bem mais organizada e específica ao projeto (4 sistemas, branches, regras de domínio), aparentemente produzida por outra sessão/agente rodando em paralelo nesta mesma pasta durante a sessão anterior — nunca commitada |

Nenhum segredo ou valor de `.env` foi impresso ao inspecionar esses
stashes (só nomes de arquivo e estatísticas `--stat`).

## 6. Estratégia utilizada para os subtrees

`git subtree split --prefix=apps/<app> <branch-canonica> -b import/<nome>`
para cada um dos 3 apps, direto das branches canônicas (sem checkout
delas). Resultado:

| Branch temporária | Fonte | Split de | SHA |
|---|---|---|---|
| `import/finan` | branch `finan` | `apps/finan` | `14c61d2d5a2202a183998a69407d0281c868544c` |
| `import/adm` | branch `adm` | `apps/adm` | `7333d10f69bebba11ed657f7abae0d7bcac2f790` |
| `import/operacao` | branch `rot` | `apps/rot` | `126c99f076f5456deb4db767375320c545313e38` |

Validado antes de qualquer importação: nenhuma das 3 continha raiz
completa do repositório, `src/`, `vps/`, `.github/` ou arquivo de outro
app — cada uma tinha só o conteúdo do próprio app na raiz da branch
extraída (ver seção 9).

A importação de cada uma pra dentro de `refactor/monorepo-quatro-apps`
foi feita com `git subtree add --prefix=apps/<app> import/<nome>`, que
internamente faz um merge escopado só àquele prefixo (não um merge geral
de árvores completas — é a continuação natural do fluxo `split`+`add` do
próprio `git subtree`, não a proibida `git merge --allow-unrelated-histories`
de branches inteiras). Isso preserva o histórico de commits de cada app
dentro da branch de migração (visível em `git log`), diferente de um
squash.

**Obstáculo encontrado e resolvido**: `git subtree add` recusou rodar nas
3 vezes com `fatal: prefix '...' already exists`, porque cada branch
canônica tinha arquivos não rastreados no disco (`node_modules`, `dist`,
e pastas `tmp/` com backups de recuperação da VPS de 18/09 — ver seção
14) ocupando o path de destino, mesmo já removidos do índice do git. Em
cada caso, movi esses arquivos não rastreados pra uma pasta temporária no
scratchpad da sessão, rodei o `subtree add`, e devolvi os arquivos pro
lugar depois — sem apagar nada, sem tocar em conteúdo versionado.

## 7. Commits criados na branch `refactor/monorepo-quatro-apps`

Em ordem cronológica, a partir do topo de `master`:

| Commit | Mensagem | Escopo |
|---|---|---|
| `8cc3c50` | `refactor(monorepo): remove desatualizada apps/finan herdada de master` | Só `apps/finan` (216 arquivos removidos) |
| `740ce0b` | `refactor(monorepo): import canonical Finan application` (merge) | Só `apps/finan` (374 arquivos, fonte `import/finan`) |
| `eb9b68b` | `refactor(monorepo): import canonical ADM application` (merge) | Só `apps/adm` (719 arquivos, fonte `import/adm`) |
| `7a86d20` | `refactor(monorepo): import canonical Operacao application` (merge) | Só `apps/rot` (317 arquivos, fonte `import/operacao`) |

Cada commit confirmado isoladamente via `git diff --name-only HEAD~1 HEAD`
não tocando em nenhum arquivo fora do seu próprio prefixo. `master` não
foi alterada em nenhum momento (branch separada, só lida via `git show`/
`git rev-parse`).

## 8. Arquivos exclusivos encontrados nas cópias antigas

**`apps/finan` desatualizado herdado de `master`** (216 arquivos) vs
fonte canônica (374 arquivos, branch `finan`):
- **Arquivos exclusivos da cópia de `master`**: **0** (nenhum).
- Todos os 216 arquivos da cópia antiga também existem na fonte canônica
  (mesmo nome/path). 155 têm conteúdo idêntico; os outros ~61 têm
  conteúdo diferente — mas confirmado que é a cópia de `master` que está
  **atrasada**, não à frente: o último commit que tocou
  `apps/finan/backend/src/app.js` em `master` foi em **2026-09-07**
  (`fix(ci): deploy do Finan nunca mais dispara a partir de
  master/homolog-dev`), e o único commit tocando `apps/finan` em `master`
  depois disso foi conversão de imagens PNG→WebP (não lógica de negócio).
  Nenhuma mudança válida mais recente foi identificada na cópia antiga.

**`apps/adm`**: não havia cópia residual em `refactor/monorepo-quatro-apps`
antes da importação (herdado de `master`, que não tem `apps/adm` — 0
arquivos). Nada a comparar.

**`apps/rot`**: mesma situação — 0 arquivos herdados de `master`. Nada a
comparar.

## 9. Estrutura consolidada (resultado final desta etapa)

```
retiradas/                    <- branch refactor/monorepo-quatro-apps
├── src/                      <- Retiradas, inalterado (raiz, temporário)
├── vps/                      <- Retiradas, inalterado (raiz, temporário)
├── apps/
│   ├── adm/                  <- 719 arquivos, fonte: branch adm
│   ├── finan/                <- 374 arquivos, fonte: branch finan
│   └── rot/                  <- 317 arquivos, fonte: branch rot (NÃO renomeado ainda)
├── .github/workflows/ci.yml  <- herdado de master, não modificado
├── package.json               <- herdado de master, sem workspaces (não adicionados)
├── vite.config.js             <- herdado de master, não modificado
└── demais arquivos globais    <- herdados de master, inalterados
```

Confirmado (seção 10) que não há `apps/finan/apps/finan`,
`apps/adm/apps/adm` nem `apps/rot/apps/rot`, e nenhum arquivo de um app
dentro da pasta de outro.

## 10. Resultado da comparação entre fonte e destino

Comparação por **hash de árvore Git** (`git rev-parse HEAD:apps/<app>` vs
`git rev-parse import/<nome>^{tree}`) — cobre recursivamente todo o
conteúdo de cada diretório, ignorando só metadados de commit:

| App | Hash em `refactor/monorepo-quatro-apps` | Hash na fonte canônica | Idêntico? |
|---|---|---|---|
| Finan | `b47cf0b843c32bf7a6f97f392f915ef58b8646b7` | `b47cf0b843c32bf7a6f97f392f915ef58b8646b7` | ✅ Sim |
| ADM | `2e0fa5a6e4c14be33ffe189d2f60f309448bba43` | `2e0fa5a6e4c14be33ffe189d2f60f309448bba43` | ✅ Sim |
| Operação | `dfcfbf568a5f178299de37124546b1e6cf910682` | `dfcfbf568a5f178299de37124546b1e6cf910682` | ✅ Sim |

Contagem de arquivos também confere exatamente (374/719/317 nos dois
lados). Nenhum aninhamento incorreto ou vazamento de arquivo entre apps
foi encontrado (`grep` cruzado vazio em todos os casos).

## 11. Comandos executados (resumo)

Git (plumbing/branch, todos locais): `git branch backup/...` (×4),
`git branch backup/stash-...` (×2, apontando pros SHAs dos stashes),
`git branch refactor/monorepo-quatro-apps master`, `git checkout
refactor/monorepo-quatro-apps`, `git subtree split --prefix=apps/<app>
<branch> -b import/<nome>` (×3), `git rm -r apps/finan` + commit, `git
subtree add --prefix=apps/<app> import/<nome>` (×3, cada um com commit
próprio).

Validação técnica: `npm run lint -- --quiet`, `npm test -- --run`, `npm
run build` (raiz); `npm run build` (`apps/finan/frontend`); `node --check`
em todos os `.js` de `apps/finan/backend/src` (arquivos-chave) e
`apps/adm/backend/src` (todos); `npm install` + `npm run build`
(`apps/adm/frontend`); `npm install` (`apps/adm/backend`); `timeout 8
node src/index.js` (`apps/adm/backend`, startup controlado); `node --test`
nos 4 arquivos de teste de `apps/rot/backend`; `npm run build`
(`apps/rot/frontend`).

Segurança: `git grep` por padrões de segredo (chave privada, `*_SECRET=`,
`*_DATABASE_URL=`, `AWS_SECRET_ACCESS_KEY=`, `R2_SECRET_ACCESS_KEY=`)
restrito a conteúdo **versionado** dentro de `apps/`; busca por `.env`
reais, `.tar.gz`/`.zip`, dumps de banco, chaves SSH e uploads versionados;
`find`/`git check-ignore` pra confirmar que os backups não versionados em
`apps/*/tmp/` estão corretamente ignorados.

Nenhum comando de `push`, `deploy`, `migrate` (exceto verificação de
scripts existentes, nunca executados) ou conexão a banco real foi
executado.

## 12. Lint, testes e builds por sistema

| Sistema | Instalação | Lint | Testes | Build |
|---|---|---|---|---|
| Retiradas (raiz) | node_modules já presente (não reinstalado) | ⚠️ 14 erros — todos em `apps/adm/**/*.test.jsx` (ver seção 13) | ⚠️ 352/353 passaram — 1 falha por timeout em teste pré-existente não relacionado (`useDashboardData.test.js`) | ✅ OK (11.87s) |
| Finan | node_modules já presente | Sem lint próprio (usa o da raiz, mesmo achado) | Sem test runner isolado sem Docker (fora do escopo desta etapa) | ✅ OK, frontend (16.95s) — confirma que a dependência do `src/` raiz ainda resolve normalmente |
| ADM | ✅ `npm install` OK (254 pacotes frontend, 417 backend) | Idem (achado da raiz) | Testes órfãos existentes, não executados (ver seção 13) — não inventei nem apaguei nada | ✅ OK, frontend (6.29s) |
| Operação | node_modules já presente | Idem (achado da raiz) | ✅ 19/19 passaram (`apr`, `security`, `storage`, `warlinho`) | ✅ OK, frontend (21.19s) |

Sintaxe (`node --check`): **100% OK** em todos os `.js` verificados de
`apps/finan/backend/src` (arquivos-chave), `apps/adm/backend/src`
(todos), `apps/rot/backend/src` (todos).

Startup controlado do backend do ADM: falhou de forma **segura e
esperada** por falta de `DATABASE_URL`/`PGPASSWORD` — não tentou e não
conseguiria conectar em produção sem essas variáveis (ver seção 18).

## 13. Falhas encontradas (documentadas, nenhuma mascarada)

1. **Lint raiz não cobre `apps/**` de forma consistente**: o
   `eslint.config.js` só declara blocos `files:` para `src/**`, `vps/**`,
   `functions/**` e `tests/e2e/**`. Não há bloco para `apps/**`, então
   arquivos `.jsx`/`.js` normais dentro de `apps/adm`, `apps/finan` e
   `apps/rot` **não são lintados nem geram erro** (silenciosamente
   ignorados). A única exceção é o bloco catch-all `files:
   ["**/*.test.{js,jsx}", ...]` (linha 70 do `eslint.config.js`), que
   casa com `.test.jsx` de **qualquer lugar do repo** só pra adicionar
   globals (`vitest`/`node`/`browser`), sem habilitar
   `parserOptions.ecmaFeatures.jsx`. Como o ADM é o único app com
   arquivos `.test.jsx` versionados (7 arquivos reais + 7 duplicados
   dentro do backup não versionado `apps/adm/tmp/.../source/`), é o
   único que produz os 14 erros de parsing (`Unexpected token <`). Não é
   um bug introduzido por esta etapa — é uma lacuna de configuração que
   só ficou visível agora que os apps coexistem na mesma árvore.
   **Não corrigi**, por ser mudança de tooling/CI, fora do escopo
   autorizado desta etapa.
2. **1 teste falho em `src/pages/PainelPublico/hooks/useDashboardData.test.js`**
   por timeout de 5s — não relacionado a nenhuma mudança desta etapa
   (arquivo não tocado, módulo isolado). Pré-existente.
3. **Testes órfãos do ADM** (`apps/adm/frontend/src/backend/*.test.js`,
   `.../frontend/rotApiSessionCookie.test.js`) continuam não sendo
   executados por nenhum runner (já documentado no diagnóstico da Fase
   1) — confirmado novamente aqui, nada foi apagado ou "consertado".
4. **Finan e Operação não têm test runner de unidade configurado fora do
   root** (Finan depende de Docker pra testes de integração; Operação
   usa `node --test` só em 4 arquivos específicos, sem cobrir o resto do
   backend/frontend) — situação pré-existente, documentada, não é uma
   regressão desta etapa.

## 14. Segredos ou arquivos sensíveis detectados

**Nenhum segredo real, `.env` real, arquivo `.tar.gz`/`.zip`, dump de
banco, chave SSH ou upload de usuário está commitado** em nenhuma das
branches `import/*` nem na `refactor/monorepo-quatro-apps` (busca
restrita a conteúdo versionado via `git grep`/`git ls-tree`).

Achados em **disco, não versionados, corretamente ignorados** pelo
`.gitignore` (padrão `tmp`):

| Caminho | Tipo provável | Versionado? | Ação recomendada |
|---|---|---|---|
| `apps/finan/tmp/sync-production-2026-09-18T15-03-44-643Z/` (inclui `source.tar.gz`) | Snapshot de código (não dump de banco) de uma sincronização com a VPS em 18/09 | Não — ignorado (`tmp`) | Revisar manualmente se ainda é necessário; se não, pode ser apagado localmente (nunca foi versionado, sem risco de perder histórico) |
| `apps/adm/tmp/sync-production-2026-09-18T15-03-44-643Z/` + `apps/adm/tmp/before-recovery-2026-09-18T14-59-02-655Z/` + `apps/adm/tmp/production-audit-20260918/` | Mesma natureza — snapshots/relatórios da recuperação via SSH do ADM | Não — ignorado | Idem |
| `apps/rot/tmp/sync-production-2026-09-18T15-03-44-643Z/` + `apps/rot/tmp/vps-recovery-2026-09-18T14-59-52-304Z/` (inclui `rot-source.tar.gz`) | Mesma natureza | Não — ignorado | Idem |
| `apps/adm/.env.production.example` | Template de variáveis (nome sugere produção, mas é `.example`) | Não versionado nesta pasta local (confirmar se é rastreado na branch `adm` — não abri o conteúdo pra não arriscar exibir valor sensível por engano) | Revisar manualmente que contém só placeholders antes de qualquer commit futuro que o inclua |

Nenhum valor de secret foi impresso em nenhum momento desta etapa — só
nomes de variável, caminhos de arquivo e presença/ausência.

## 15. Dívidas técnicas confirmadas nesta etapa

- Lint raiz não escopado pra `apps/**` (seção 13.1) — vai precisar de
  ajuste no `eslint.config.js` numa etapa futura de consolidação de CI
  (Fase 10 do plano original), não nesta.
- Testes órfãos do ADM continuam sem rodar em lugar nenhum.
- ADM não tem `.env.example` nem `vite.config.js` próprio (já
  documentado na Fase 1, reconfirmado aqui).
- ADM não tem variável de banco dedicada (`ADM_DATABASE_URL`) — usa as
  mesmas genéricas do Retiradas legado, só com nome de banco default
  diferente (`"adm"` vs `"retiradas"`) — ver seção 18.

## 16. Pendências para mover o Retiradas (`src`/`vps` → `apps/retiradas`)

Conforme já registrado no diagnóstico da Fase 1 e nas decisões técnicas
para etapas futuras informadas por você:
- `src` → `apps/retiradas/frontend`, `vps` → `apps/retiradas/backend`,
  migrations continuam em `apps/retiradas/backend/sql` (sem renomear pra
  `migrations`).
- Precisa acontecer no **mesmo commit atômico** que a correção do
  `@source` do Tailwind e dos lazy-imports do Finan
  (`apps/finan/frontend/src/index.css:27` e imports de
  `FinanceiroPage.jsx`/páginas administrativas) — confirmado nesta etapa
  que o Finan **ainda depende ativamente** do `src/` na raiz (o build só
  funcionou porque `src/` continua lá).
- Precisa atualizar `vite.config.js`, `package.json` (scripts), `playwright.config.js`,
  `.github/workflows/ci.yml`, referências de nginx/systemd — nenhuma
  dessas mudanças foi feita nesta etapa (fora do escopo autorizado).

## 17. Pendências para renomear Operação (`apps/rot` → `apps/operacao`)

Não executada nesta etapa (conforme instrução explícita). Pontos a
mapear antes, já sinalizados na Fase 1:
- Domínio público real de produção ainda incerto entre
  `rot.retiradas.tech` (visto no nginx example) e
  `operacao.retiradas.tech` (default em código) — precisa confirmação
  sua antes de decidir o que atualizar.
- `apps/rot/ops/rot-api.service.example` (`WorkingDirectory`,
  `EnvironmentFile`), CORS, cookies, CI, `.env.example`, manifests PWA,
  scripts de backup e storage R2 — nenhum touched ainda.
- FIELD/DELIVERY continuam fora de qualquer estrutura de pasta nova
  (conforme decisão 11 do seu prompt) — domínio interno ROT preservado
  como está.

## 18. Situação do banco do ADM

Baseado só em inspeção de metadados não sensíveis do código-fonte
(`apps/adm/backend/src/db.js`), **sem imprimir nenhum valor real**:

- Variáveis usadas: `DATABASE_URL` (se definida, usa connection string
  completa) ou, senão, `PGHOST` (default `127.0.0.1`), `PGUSER` (default
  `retorninho` — **mesmo usuário default do Retiradas legado**),
  `PGPASSWORD` (obrigatória, sem default), `PGDATABASE` (default `"adm"`
  — diferente de `"retiradas"`).
- **Não existem** variáveis prefixadas `ADM_*` (ao contrário de
  `FINAN_DATABASE_URL`/`ROT_DATABASE_URL`, que Finan e Operação usam).
- Startup controlado sem env real falhou de forma segura e esperada
  (`Defina DATABASE_URL ou as variaveis PGHOST, PGUSER, PGPASSWORD e
  PGDATABASE.`) — confirma que não há fallback silencioso que aponte
  sozinho pra produção.
- **Conclusão**: há intenção de separação (nome de banco default
  diferente), mas **não há isolamento garantido por variável de
  ambiente dedicada** como os outros dois apps têm. Se o `.env` real da
  VPS (que não foi lido nesta etapa) não sobrescrever `PGDATABASE`
  explicitamente pra `"adm"`, o processo herdaria qualquer valor de
  `PGDATABASE` já presente no ambiente do sistema — risco real, mas que
  só pode ser confirmado ou descartado olhando a configuração real da
  VPS, fora do escopo desta tarefa (decisão 13 do seu prompt: banco do
  ADM não é alterado nesta etapa, e eu não acessei a VPS pra verificar
  isso).

## 19. Confirmação: branches e stashes originais permanecem intactos

- `master`, `adm`, `finan`, `rot` (a branch, não a pasta) seguem
  apontando exatamente para os mesmos SHAs registrados na seção 3 —
  verificado após todas as operações.
- `git stash list` segue idêntica, com os 2 stashes da Operação nas
  mesmas posições (`stash@{0}`, `stash@{1}`), nenhum `pop`/`apply`/`drop`
  executado.
- Nenhuma branch foi apagada — o repositório foi só **acrescido** de 9
  referências novas (4 `backup/pre-monorepo-*`, 2 `backup/stash-*`, 3
  `import/*`) mais a branch de trabalho `refactor/monorepo-quatro-apps`.

## 20. Confirmação: nenhum push, deploy ou migration foi realizado

Confirmado. Todas as operações desta etapa foram locais
(`git branch`, `git subtree`, `git commit`, `npm install`/`build`/`lint`/
`test`, `node --check`, 1 startup controlado do ADM que falhou por
design antes de qualquer tentativa de rede). Nenhum `git push` foi
executado em nenhum momento. Nenhum `npm run migrate`/`migrate:sql`/
equivalente foi executado em nenhum dos 4 apps. Nenhuma conexão a banco
de dados real (local ou produção) foi estabelecida.

---

## Estado final — onde tudo ficou

- Branch ativa: `refactor/monorepo-quatro-apps` (16 commits à frente de
  `master`, incluindo o histórico real de commits de cada app trazido
  pelo `subtree add`).
- `apps/adm`, `apps/finan`, `apps/rot` consolidados, bit-a-bit idênticos
  às fontes canônicas.
- `src/`, `vps/` continuam na raiz — Retiradas segue 100% funcional sem
  nenhuma alteração.
- Branches `master`, `adm`, `finan`, `rot` (originais) intocadas.
- 9 referências de segurança novas, todas locais.
- Nada publicado.

**Aguardando sua revisão e autorização explícita antes de qualquer etapa
seguinte** (mover `src`/`vps`, renomear `apps/rot`, adicionar workspaces,
consolidar CI, ou promover esta branch pra `master`).
