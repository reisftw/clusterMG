# Reorganização do monorepo — Etapa 3 (renomear ROT para Operação)

> Terceira etapa controlada, conforme escopo autorizado. Branch de
> trabalho `refactor/monorepo-quatro-apps`. Nenhuma branch original foi
> alterada, nenhum push/deploy/migration foi executado, nenhum recurso
> de produção (DNS, certificado, Nginx ativo, systemd ativo, banco,
> usuário Linux, R2) foi tocado.

## 1. Estado Git inicial e final

| | Inicial | Final |
|---|---|---|
| Branch ativa | `refactor/monorepo-quatro-apps` | idêntica |
| Working tree | 1 arquivo não rastreado (relatório da Etapa 2) | limpo |
| `master` | `a594f54aec8d905255d68a4864e4b9eedc045a23` | idêntico |
| `finan` | `b5424c2c7f65ce32981be2629f5e86325487a847` | idêntico |
| `adm` | `41da07210b996cd2d4e2253b3b3f34abf04dd173` | idêntico |
| `rot` | `a746f589e92f07d69ef0653e7a0a88714bf81e84` | idêntico |
| stashes | 2 da Operação (entre outros de sessões anteriores) | os mesmos 2, intactos |

Antes de prosseguir, resolvido o único arquivo pendente
(`docs/REORGANIZACAO-MONOREPO-ETAPA2-RELATORIO.md`): verificado sem
segredos e commitado como documentação (`586e603`).

## 2. SHA do checkpoint

`backup/pre-rename-operacao` → `586e603ee27ab5d7a2610395e4358b28684e1a97`

## 3. Inventário de ocorrências antes da mudança

| Padrão buscado | Ocorrências | Classificação predominante |
|---|---|---|
| `apps/rot` fora de `apps/rot` | `CLAUDE.md` (2), 6 testes órfãos do ADM, `apps/finan/backend/src/auth/middleware.js` (comentário), 3 relatórios em `docs/` | Mista — ver seção 4 |
| `rot.retiradas.tech` | `apps/rot/.env.example`, `apps/rot/backend/src/auth/routes.js`, `apps/rot/ops/nginx-rot.conf.example`, 2 relatórios em `docs/` | Domínio público antigo |
| `operacao.retiradas.tech` | `apps/rot/backend/src/{email/service.js, security/securityControls.test.js, sst/routes.js, users/routes.js}`, 2 relatórios em `docs/` | Já usavam o canônico (transição parcial pré-existente) |
| `README.md`/`DOCUMENTATION.md`/`CONTEXT.md` com `vps/` local | 4 linhas (pendência documentada na Etapa 2) | Documentação operacional atual — corrigidas nesta etapa |

## 4. Caminhos alterados

**319 arquivos renomeados** via `git mv apps/rot apps/operacao` — git
reconheceu 100% (ou próximo) de similaridade em praticamente todos; só 4
tiveram similaridade menor por causa de edição de conteúdo no mesmo
commit (`.env.example` 87%, `auth/routes.js` 99%, `WarlinhoLauncher.jsx`
99%, `nginx-rot.conf.example → nginx-operacao.conf.example` 75%, este
último também renomeado).

Referências locais fora do próprio diretório também atualizadas:
`CLAUDE.md` (mapa de branches/apps), `sonar-project.properties`
(exclusão), `apps/finan/backend/src/auth/middleware.js` (comentário de
proveniência).

## 5. Identificadores internos preservados

Confirmado sem nenhuma alteração: `ROT_DATABASE_URL`, todas as demais
`ROT_*` (nomes de variável), todas as tabelas/migrations `rot_*` (59
arquivos SQL renomeados de diretório mas com conteúdo interno
intocado — nomes de tabela, enum, FK, índice dentro dos `.sql` não
tocados), `rot_migrations` (tabela de controle), branch `rot` (não
renomeada, `git rev-parse rot` confirma mesmo SHA), domínio interno ROT
(continua sendo o nome usado internamente pro domínio de negócio, ex.:
`RotCalendar.jsx`, `RotAuthContext.jsx`, `offlineRotQueue.js` — nomes de
arquivo não tocados), `rot-api.service` (nome do serviço, arquivo
`.example` preservado sem qualquer alteração de nome ou conteúdo),
usuário Linux `operacao` (já estava correto antes, não precisou mudar),
porta `3201` (preservada).

## 6. Arquivos de infraestrutura atualizados

| Arquivo | Mudança |
|---|---|
| `apps/operacao/ops/nginx-rot.conf.example` → `nginx-operacao.conf.example` | Renomeado. `server_name` passa a aceitar `operacao.retiradas.tech rot.retiradas.tech` (os dois, como alias ativo). Redirect HTTP→HTTPS idem. Adicionado comentário com proposta futura (não aplicada) de trocar pra redirect 301 dedicado quando o alias for aposentado. `root`/`proxy_pass` (caminhos remotos) **preservados sem alteração**. |
| `apps/operacao/ops/rot-api.service.example` | **Não alterado** — nome do arquivo e todo o conteúdo (`WorkingDirectory`, `EnvironmentFile`, `ReadWritePaths`, todos `/opt/retiradas/apps/rot/...`) preservados por decisão explícita. |

## 7. Caminhos remotos preservados

Nenhum caminho remoto foi alterado nesta etapa:

- `/opt/retiradas/apps/rot/frontend/dist` (root do Nginx)
- `/opt/retiradas/apps/rot/backend` (`WorkingDirectory` do systemd)
- `/opt/retiradas/apps/rot/.env` (`EnvironmentFile` do systemd)
- `/opt/retiradas/apps/rot/backend/uploads`, `/backend/logs` (`ReadWritePaths`)
- `/opt/retiradas/vps`, `/var/www/retiradas` (Retiradas, tocados na Etapa 2 — reconfirmados intocados nesta etapa)

Todos classificados como "infraestrutura legada compatível" — mudá-los
exigiria replanejar o deploy real da Operação, fora do escopo desta
etapa estrutural.

## 8. Alterações de domínio e branding

- `apps/operacao/.env.example`: `ROT_PUBLIC_URL` e `ROT_CORS_ORIGINS`
  (nomes de variável preservados) passam a ter
  `https://operacao.retiradas.tech` como valor default de exemplo.
  `ROT_CORS_ORIGINS` no exemplo lista os dois domínios
  (`operacao.retiradas.tech,rot.retiradas.tech`) pra não sugerir remoção
  do alias.
- `apps/operacao/backend/src/auth/routes.js`: fallback do link de reset
  de senha alinhado ao mesmo default — os outros 3 arquivos do backend
  (`email/service.js`, `sst/routes.js`, `users/routes.js`) já usavam
  `operacao.retiradas.tech` como fallback **antes** desta etapa
  (confirma que a transição já estava parcialmente em andamento; esta
  etapa só terminou de alinhar o quinto arquivo que ainda divergia).
- Nginx de exemplo: ver seção 6.

## 9. Situação do alias `rot.retiradas.tech`

Documentado (não aplicado) como alias temporário ativo:
- No `.env.example`, mantido na allowlist de CORS.
- No Nginx de exemplo, mantido no `server_name` (serve o mesmo conteúdo
  que `operacao.retiradas.tech`, não redireciona — é o comportamento
  mais seguro/conservador pra um alias que ainda pode estar em uso real).
- Proposta de redirect 301 futuro documentada em comentário no próprio
  arquivo de exemplo, explicitamente marcada como "não aplicar nesta
  etapa".
- **Nenhuma ação foi tomada na VPS real** — DNS, certificado e Nginx
  ativo continuam exatamente como estavam antes desta etapa.

## 10. Situação dos stashes

`git stash list` confirmada **idêntica** antes e depois (2 stashes da
Operação nas mesmas posições, entre outros de sessões anteriores).
Nenhum `pop`/`apply`/`drop` executado.

Documentado conforme pedido:
- Os 2 stashes (`wip-rot-antes-de-ir-pra-adm-2026-09-19`,
  `wip-claude-md-nova-versao-concorrente-2026-09-19`) foram criados
  **antes** desta renomeação — o conteúdo deles (CLAUDE.md e arquivos
  `.bak.*` dentro do que então era `apps/rot/backend/src/`) referencia
  o caminho antigo.
- Se algum dia forem aplicados, isso deve acontecer numa **branch
  descartável**, nunca direto em `refactor/monorepo-quatro-apps` ou nas
  branches originais.
- Os caminhos internos aos `.bak.*` (`apps/rot/backend/src/email/...`,
  `apps/rot/backend/src/sst/...`) precisarão ser remapeados manualmente
  pra `apps/operacao/backend/src/...` antes de qualquer reaproveitamento.
- Os `.bak.*` continuam **não incorporados automaticamente** — só
  existem dentro do stash, preservados como estavam.

## 11. Commits criados

| Commit | Mensagem | Tipo |
|---|---|---|
| `586e603` | `docs(monorepo): record Etapa 2 final report` | Documental (Fase 0) |
| `b50f224` | `refactor(monorepo): rename ROT application directory to Operacao` | Estrutural principal — 319 arquivos, git detectou majoritariamente como rename |
| `86b879f` | `docs(monorepo): update application paths after Operacao rename` | Documental (CLAUDE.md, README.md, DOCUMENTATION.md, CONTEXT.md) |

`git diff --summary backup/pre-rename-operacao..HEAD` confirma
predominância de renames (319 de 325 entradas totais, sem nenhuma
exclusão total seguida de recriação sem justificativa — os 4 arquivos
não-100%-rename têm a mudança de conteúdo explicada na seção 8).

## 12. Hash anterior de `apps/rot`

`dfcfbf568a5f178299de37124546b1e6cf910682` (registrado em
`backup/pre-rename-operacao:apps/rot`)

## 13. Hash final de `apps/operacao`

`8df2cbf4ce81269a9d9b39d0c220c5dead3e2f4a`

Diferente do hash anterior — esperado, já que 4 arquivos tiveram
conteúdo alterado (branding/domínio). Ver seção 14 para a lista exata.

## 14. Conteúdos internos modificados

Comparação arquivo-por-arquivo entre `apps/rot` (checkpoint) e
`apps/operacao` (HEAD), por caminho relativo — **apenas 4 arquivos
divergem em conteúdo**, confirmando que a movimentação foi limpa:

| Arquivo | Hash antes | Hash depois | Justificativa |
|---|---|---|---|
| `.env.example` | `36b62d9e...` | `3faa4033...` | `ROT_PUBLIC_URL`/`ROT_CORS_ORIGINS` alinhados ao domínio canônico (seção 8) |
| `backend/src/auth/routes.js` | `7f505160...` | `d7102b10...` | Fallback de reset de senha alinhado ao mesmo default dos outros 3 arquivos do backend |
| `frontend/src/components/WarlinhoLauncher.jsx` | `37b4c57b...` | `7b37d599...` | Comentário de auto-referência apontando pro path antigo (`apps/rot/backend/src/warlinho/`) |
| `ops/nginx-rot.conf.example` → `ops/nginx-operacao.conf.example` | `d80f72b9...` | `38619fa2...` | Renomeado + `server_name` passa a incluir o domínio canônico como alias ativo, com proposta de redirect futuro documentada |

Todos os outros 315 arquivos são renames puros, byte-idênticos.

## 15. Resultado do build da Operação

```
npm run build   (apps/operacao/frontend)
```
✅ OK, 13.38s, sem erro.

## 16. Resultado dos testes da Operação

```
node --test src/apr/validation.test.js src/security/securityControls.test.js src/storage/storage.test.js src/warlinho/permissions.test.js
```
✅ **19/19 testes passaram** (0 falhas).

## 17. Resultado dos testes de SST

Não há arquivo de teste automatizado dedicado a SST nesta branch (mesma
lacuna já documentada na Fase 1 do diagnóstico original — SST tem rotas
e migrations, mas não testes de unidade próprios). Confirmado por
inspeção: `apps/operacao/backend/src/sst/routes.js` presente, sintaxe
válida (`node --check`), migrations `046`–`056` (seguranca_trabalho/dss)
presentes e renomeadas de diretório sem alteração de conteúdo.

## 18. Resultado das validações de storage

```
node --test src/storage/storage.test.js
```
✅ Incluído no lote de 19 testes da seção 16 — inclui especificamente
"provider registry resolves r2 without exposing credentials" (passou).
Nenhuma credencial R2 real foi usada; nenhum objeto foi lido, escrito ou
excluído no bucket real. Confirmado por busca (`git grep`) que nenhum
script local ou import ficou apontando pra `apps/rot` dentro do módulo
de storage.

## 19. Resultado do Retiradas

```
npm run build    → ✅ OK (3.40s)
npm test -- --run → ✅ 353/353 testes passaram
```

## 20. Resultado do Finan

```
npm run build   (apps/finan/frontend)
```
✅ OK (1.71s). Único arquivo do Finan tocado nesta etapa foi um
comentário (`auth/middleware.js`), sem impacto funcional.

## 21. Resultado do ADM

```
npm run build           (apps/adm/frontend) → ✅ OK
node --check (todos os .js do backend)      → ✅ OK, sem erro
```

Lint global: **ainda exatamente 14 erros**, todos pré-existentes em
`apps/adm/**/*.test.jsx` — confirmado que a renomeação da Operação **não
introduziu nenhum erro novo** (mesma contagem antes e depois desta
etapa). Não foi feita nenhuma tentativa de corrigir essa dívida
pré-existente, conforme instruído.

## 22. Referências restantes a ROT, classificadas

| Referência | Onde | Classificação |
|---|---|---|
| `apps/rot` (path) | 6 testes órfãos do ADM (`apps/adm/frontend/src/backend/*.test.js`, `.../frontend/rotApiSessionCookie.test.js`) | **Dívida pré-existente, fora de escopo** — esses testes já não rodavam em nenhum pipeline antes desta etapa (confirmado na Etapa 1); deixar o path desatualizado não piora nem melhora a situação real |
| `apps/rot` (path) | `docs/REORGANIZACAO-MONOREPO-DIAGNOSTICO.md`, `ETAPA1-RELATORIO.md`, `ETAPA2-RELATORIO.md` | **Documentação histórica** — registros de diagnóstico de um momento anterior a esta etapa, não reescritos |
| `rot.retiradas.tech` | `.env.example`, Nginx de exemplo (seção 8/9) | **Domínio público antigo, preservado como alias documentado** |
| `ROT_DATABASE_URL`, `ROT_*` | `.env.example`, todo o backend | **Variável de ambiente preservada** (esperado) |
| `rot_*` (tabelas/migrations) | 59 arquivos SQL, tabela `rot_migrations` | **Schema/migration preservado** (esperado) |
| `rot-api.service` | `apps/operacao/ops/rot-api.service.example` | **Nome de serviço de produção preservado** (esperado) |
| `branch rot` | `CLAUDE.md`, git | **Branch preservada** (esperado, não renomeada) |
| Domínio interno ROT (nomes de arquivo/componente: `RotCalendar.jsx`, `RotAuthContext.jsx`, `offlineRotQueue.js`, `rotApi.js`, etc.) | `apps/operacao/frontend/src/**` | **Domínio interno preservado** (esperado, decisão explícita) |

Nenhuma ocorrência restante representa um caminho **funcional** que o
código ainda tenta resolver via `apps/rot` — todas as referências que
importavam pra funcionamento real (scripts, configs, builds, testes
executáveis) foram corrigidas e validadas.

## 23. Falhas ou pendências

- Nenhuma falha encontrada durante a validação — build, testes e
  sintaxe passaram em todas as tentativas, sem retrabalho necessário
  (diferente da Etapa 2, que teve os 29 testes quebrados por corrigir).
- Pendência já conhecida e não tratada nesta etapa (fora de escopo,
  reafirmada explicitamente pelo pedido): lint do ADM com 14 erros
  pré-existentes.
- Pendência documentada: os 6 testes órfãos do ADM que referenciam
  `apps/rot` continuam quebrados/não-executados — não fazem parte desta
  etapa nem da anterior, são dívida técnica do próprio ADM.
- `rot.retiradas.tech` → `operacao.retiradas.tech`: a migração de fato
  (DNS, certificado, redirect ativo na VPS) **não foi feita e não estava
  no escopo** — só a documentação/exemplo local foram preparados.

## 24. Confirmação: branches originais permaneceram intactas

Confirmado (seção 1) — `master`, `finan`, `adm`, `rot` seguem nos mesmos
SHAs registrados no início desta etapa. `git stash list` idêntica.

## 25. Confirmação: nenhum push, deploy ou migration foi realizado

Confirmado. Todas as operações foram locais (`git mv`, edição de 4
arquivos, `git commit` ×2, `npm run build`/`lint`, `node --check`,
`node --test`). Nenhum `git push`. Nenhuma migration executada. Nenhuma
conexão a banco real. Nenhuma credencial R2 real usada, nenhum objeto
lido/escrito/excluído no storage real. Nenhum serviço, Nginx, systemd,
DNS ou certificado ativo foi tocado.

---

## Estado final — onde tudo ficou

- Branch ativa: `refactor/monorepo-quatro-apps` (3 commits à frente do
  checkpoint da Etapa 2).
- `apps/rot` não existe mais. `apps/operacao` existe, builda, testa.
  SST presente e inalterado.
- `apps/retiradas` e `apps/adm`: hash de árvore **idêntico**, zero
  alteração. `apps/finan`: só 1 comentário mudou (hash diferente,
  justificado).
- Domínio canônico `operacao.retiradas.tech` documentado; alias
  `rot.retiradas.tech` preservado, nada removido na VPS real.
- Identificadores internos ROT (branch, env vars, tabelas, serviço,
  domínio de negócio) 100% preservados.
- Branches originais e stashes intactos. Nada publicado.

**Aguardando sua revisão antes de qualquer próxima etapa** (workspaces,
separação de bancos, promoção pra `master`, ou migração real de DNS).
