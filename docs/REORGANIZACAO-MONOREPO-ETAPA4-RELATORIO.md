# Reorganização do monorepo — Etapa 4 (estabilizar lint, testes, CI)

> Quarta etapa controlada, conforme escopo autorizado. Branch de trabalho
> `refactor/monorepo-quatro-apps`. Nenhuma branch original foi alterada,
> nenhum push/deploy/migration foi executado.

## 1. Estado Git inicial e final

| | Inicial | Final |
|---|---|---|
| Branch ativa | `refactor/monorepo-quatro-apps` | idêntica |
| Working tree | 1 arquivo não rastreado (relatório da Etapa 3) | limpo |
| `master` | `a594f54aec8d905255d68a4864e4b9eedc045a23` | idêntico |
| `finan` | `b5424c2c7f65ce32981be2629f5e86325487a847` | idêntico |
| `adm` | `41da07210b996cd2d4e2253b3b3f34abf04dd173` | idêntico |
| `rot` | `a746f589e92f07d69ef0653e7a0a88714bf81e84` | idêntico |
| stashes | 2 da Operação (entre outros) | os mesmos 2, intactos |

## 2. SHA do checkpoint

`backup/pre-tooling-hardening` → `635c86b10e73b1348d1690d18cef1ad7d0570e61`

## 3. Cobertura anterior e nova do ESLint

**Antes** (diagnóstico por diretório, Fase 2): `eslint.config.js` só
tinha blocos `files` escopados a `apps/retiradas/**`. Rodar
`npx eslint apps/finan/frontend`, `apps/finan/backend`,
`apps/adm/backend` e `apps/operacao/frontend` retornava **0 problemas**
— mas não porque o código estivesse limpo: nenhum bloco `files` casava
com esses caminhos, então nenhuma regra customizada (`no-unused-vars`,
React Hooks, etc.) era aplicada. `npx eslint apps/finan/backend` e
`apps/operacao/backend` retornavam warnings de "unused eslint-disable
directive" — prova de que os arquivos eram processados, mas com um
conjunto de regras vazio (esse check é interno do linter, não depende
de nenhum bloco de config). `apps/adm/frontend` era o único com
**erros reais visíveis** (14, todos "Parsing error: Unexpected token <"
em `.test.jsx`), porque o bloco catch-all de testes (`**/*.test.{js,jsx}`)
casava globalmente mas não habilitava `ecmaFeatures.jsx`.

**Depois**: todos os 8 diretórios (`apps/{retiradas,finan,adm,operacao}/{frontend,backend}`)
têm blocos `files` explícitos. Rodando `npx eslint <dir>` em cada um
agora retorna resultado real:

| Diretório | Antes | Depois |
|---|---|---|
| `apps/retiradas/frontend` | 1 warning | 1 warning (inalterado) |
| `apps/retiradas/backend` | 0 (coberto) | 0 (inalterado) |
| `apps/finan/frontend` | 0 (**não coberto**) | 0 erros reais |
| `apps/finan/backend` | 19 warnings (**não coberto**, só unused-directive) | 31 erros, 22 warnings |
| `apps/adm/frontend` | 7 erros de parsing (**parcialmente coberto**, só testes) | 36 erros, 2 warnings |
| `apps/adm/backend` | 0 (**não coberto**) | 0 erros reais |
| `apps/operacao/frontend` | 0 (**não coberto**) | 86 erros, 17 warnings |
| `apps/operacao/backend` | 8 warnings (**não coberto**, só unused-directive) | 0 erros reais (backend limpo) |

## 4. Configurações de frontend, backend e testes

`eslint.config.js` reestruturado com 8 blocos (era 6):

1. **Frontend dos 4 apps** (`apps/*/frontend/**/*.{js,jsx}` + `docs/**/*.js`): `js.configs.recommended` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`, JSX habilitado, globals de browser, `no-unused-vars` customizado.
2. **Backend dos 4 apps** (`apps/*/backend/**/*.js`): `js.configs.recommended`, CommonJS, globals Node.
3. `functions/**/*.js` (inalterado, sem arquivos reais hoje).
4. **Testes de frontend** (`apps/*/frontend/**/*.test.{js,jsx}` + `.spec.{js,jsx}` + `src/test/**`): camada aditiva só com globals (browser+node+vitest) — o parsing JSX já vem do bloco 1.
5. **Testes de backend** (`apps/*/backend/**/*.test.js` + `.spec.js`): globals Node + Vitest — convivem porque quem usa `node:test` explícito (`require("node:test")`) não depende de globals nenhum, e quem usa Vitest importa explicitamente também.
6. **Testes de contrato** (`tests/contracts/**/*.js`): bloco próprio, ESM (raiz é `"type": "module"`), Node puro.
7. Playwright/E2E do Retiradas (inalterado).
8. Exceção de `react-refresh` pro `context/` do Retiradas (inalterado).

## 5. Os 14 erros do ADM e como foram resolvidos

Resolvidos **inteiramente como efeito colateral** do bloco 1 acima — os
`.test.jsx` do ADM passaram a casar com o bloco de frontend (que já
habilita `ecmaFeatures.jsx: true`), então o parser para de ver `<` como
token inesperado. Confirmado: `grep -c "Parsing error"` no lint completo
= **0**.

**Erros novos que ficaram visíveis** (não são regressão desta etapa —
são cobertura nova, classificados conforme pedido):

| Sistema | Total | Principais regras |
|---|---|---|
| Finan | 31 erros / 22 warnings | `react-refresh/only-export-components` (20), `jsx-a11y/no-autofocus` (2), `jsx-a11y/no-static-element-interactions` (1), outros |
| ADM | 36 erros / 2 warnings | `no-unused-vars` (16), `react-hooks/set-state-in-effect` e outros (15), `react-refresh/only-export-components` (5) |
| Operação | 86 erros / 17 warnings | `react-hooks/rules-of-hooks` (30 — **erro real**, hooks chamados condicionalmente), `no-unused-vars` (21), `no-undef` (12 — **erro real**, variável `payload` não definida em `RompimentosPage.jsx`), `react-refresh/only-export-components` (10) |

Classificação por tipo: a maioria é **variável não utilizada**
(mecânico, baixo risco) e **`react-refresh/only-export-components`**
(estilo de organização de arquivo, zero risco funcional). Uma parte é
**erro real com risco de bug**: os 30 `rules-of-hooks` em Operação
(hooks chamados depois de `return` condicional — pode quebrar em runtime
dependendo da condição) e os 12 `no-undef` (variável `payload`
inexistente em 4 pontos de `RompimentosPage.jsx` — provavelmente typo
de refactor anterior). **Não corrigi nenhum desses 153** — corrigir os
`rules-of-hooks`/`no-undef` exige entender o comportamento pretendido de
cada componente (refatoração funcional, fora do escopo desta etapa,
risco real de quebrar UI se feito às pressas). Ver seção 21 pra proposta
de baseline.

## 6. Classificação individual dos seis testes órfãos

| Arquivo original | O que testa | Dono real | Classificação | Destino |
|---|---|---|---|---|
| `cspConfig.test.js` | Conteúdo de 2 arquivos nginx (Retiradas + Operação) | Nenhum um só — infraestrutura de 2 sistemas | Teste de contrato entre sistemas | `tests/contracts/cspConfig.test.js` |
| `rotAuthSessions.test.js` | `apps/operacao/backend/src/auth/middleware.js` (sign/revoke de sessão) | Operação | Teste legítimo da Operação | `apps/operacao/backend/src/auth/authSessions.test.js` |
| `rotBodyValidation.test.js` | `apps/operacao/backend/src/security/bodyValidation.js` | Operação | Teste legítimo da Operação | `apps/operacao/backend/src/security/bodyValidation.test.js` |
| `rotPayloadLimits.test.js` | `apps/operacao/backend/src/security/errors.js` + `app.js` (limite de JSON) | Operação | Teste legítimo da Operação | `apps/operacao/backend/src/security/payloadLimits.test.js` |
| `rotUploadFilters.test.js` | `apps/operacao/backend/src/security/uploadFilters.js` | Operação | Teste legítimo da Operação | `apps/operacao/backend/src/security/uploadFilters.test.js` |
| `rotApiSessionCookie.test.js` | `apps/operacao/frontend/src/api/rotApi.js` (cliente HTTP) | Operação | Teste legítimo da Operação | `apps/operacao/frontend/src/api/rotApiSessionCookie.test.js` |

Nenhum foi classificado como "resíduo duplicado sem valor" — os 6
testavam comportamento real e atual (confirmado lendo o código-fonte de
cada função testada antes de mover, não só pelo diretório).

**Achado durante a movimentação**: `authSessions.test.js` presumia que
`ROT_ALLOW_LEGACY_BEARER` era `true` por padrão (autenticação via
`Authorization: Bearer` funcionando sem configuração extra). O código
atual tem esse flag `false` por padrão (só cookie `HttpOnly`) — mudança
de comportamento real que aconteceu em algum commit anterior, sem o
teste (que nem rodava) ser atualizado junto. Corrigido habilitando o
flag explicitamente no `beforeEach` do teste (continua cobrindo o
transporte legado de propósito), sem tocar no middleware real.

## 7. Arquivos movidos

6 arquivos de teste (seção 6) + nenhum outro — não foi necessário mover
código de produção nesta etapa.

## 8. Imports corrigidos

- 4 arquivos de backend da Operação: `createRequire(path.join(process.cwd(), "apps/rot/backend/package.json"))` removido inteiramente — agora usam `require("./arquivo.js")` direto, já que ficaram colocalizados com o próprio backend (o bridge via `process.cwd()` só era necessário porque viviam fisicamente dentro do ADM).
- `rotApiSessionCookie.test.js`: import relativo `"../../apps/rot/frontend/src/api/rotApi.js"` (4 níveis, atravessando pra outro app) virou `"./rotApi.js"` (colocalizado).
- `cspConfig.test.js`: os 2 caminhos de config (`apps/rot/ops/nginx-rot.conf.example`, `vps/nginx/retiradas.conf`) atualizados pros caminhos atuais.

## 9. Runners configurados

| Teste(s) | Runner antes | Runner depois |
|---|---|---|
| 4 backend da Operação (auth/security) | Vitest (sem config nenhuma disponível — nunca rodavam) | Node Test Runner nativo (`node:test`), mesmo runner já usado pelos outros testes do backend da Operação |
| `rotApiSessionCookie.test.js` | Vitest + jsdom (nenhum dos dois disponível no frontend da Operação) | Node Test Runner nativo, com stub manual de `window`/`localStorage` (Node 24 já tem `fetch`/`Response` nativos; só faltava o objeto `window`) |
| `cspConfig.test.js` | Vitest (não disponível em `tests/contracts/`, pasta nova) | Node Test Runner nativo, ESM |
| ~60 testes do ADM (já existiam, nunca tinham runner) | Nenhum | Vitest reaproveitado da raiz via `apps/adm/frontend/vitest.config.js` novo (sem adicionar dependência) |

## 10. Scripts adicionados

`package.json` raiz ganhou 21 scripts novos: `lint:{retiradas,finan,adm,operacao}`,
`test:{retiradas,finan,adm,operacao,contracts}`,
`build:{retiradas,finan,adm,operacao}`,
`verify:{retiradas,finan,adm,operacao}`, `verify:all`. Além de
`scripts/check-backend-syntax.mjs` (novo, `node --check` recursivo —
usado por `test:finan` sozinho e como complemento em `test:adm`, já que
Finan não tem nenhum arquivo de teste versionado hoje).

## 11. Resultado de cada `lint:<app>`

| Comando | Resultado |
|---|---|
| `lint:retiradas` | ✅ 0 erros (1 warning pré-existente, `react-hooks/exhaustive-deps`) |
| `lint:finan` | ❌ 31 erros, 22 warnings (debito pré-existente, seção 5) |
| `lint:adm` | ❌ 36 erros, 2 warnings (idem) |
| `lint:operacao` | ❌ 86 erros, 17 warnings (idem, inclui os 30 `rules-of-hooks` + 12 `no-undef` reais) |

## 12. Resultado de cada `test:<app>`

| Comando | Resultado |
|---|---|
| `test:retiradas` | ⚠️ 352-353/353 (1 teste com timeout intermitente, pré-existente, não relacionado — variou entre execuções nesta mesma sessão) |
| `test:finan` | ✅ `node --check`: 118 arquivos, 0 erro de sintaxe (não é teste de comportamento — Finan não tem nenhum, documentado explicitamente, não inventado) |
| `test:adm` | ⚠️ Vitest: 71/113 passam, 42 falham por React duplicado (versões diferentes, 19.3.0 vs 19.2.8 da raiz — `resolve.dedupe` não resolve 100% quando as versões instaladas realmente divergem); `node --check` do backend: 0 erros |
| `test:operacao` | ✅ 30/30 (8 arquivos de backend + 1 de frontend, incluindo os 5 recém-ativados) |
| `test:contracts` | ✅ 2/2 |

## 13. Resultado de cada `build:<app>`

| Comando | Resultado |
|---|---|
| `build:retiradas` | ✅ OK |
| `build:finan` | ✅ OK |
| `build:adm` | ✅ OK |
| `build:operacao` | ✅ OK |

Todos os 4 builds de produção passam sem erro — o débito de lint e os
42 testes do ADM não afetam a capacidade de gerar build funcional de
nenhum dos 4 sistemas.

## 14. Resultado de `verify:<app>` / `verify:all`

Como `verify:<app>` encadeia `lint && test && build`, e `lint:{finan,adm,operacao}`
falha (seção 11), `verify:finan`, `verify:adm` e `verify:operacao`
**falham no primeiro passo** (lint) — comportamento esperado e correto
do encadeamento `&&`, não um bug do script. `verify:retiradas` passa
(exceto pelo teste intermitente já conhecido). `verify:all` portanto
também falha hoje, pelo mesmo motivo em cascata — documentado como
baseline pendente (seção 21), não mascarado.

## 15. Jobs adicionados ao CI

3 jobs novos, todos independentes (nenhum `needs:` em job de deploy nem
é `needs:`-alvo de nenhum): `validate-finan`, `validate-adm`,
`validate-operacao` — cada um faz checkout, instala as deps do próprio
app (+ raiz, já que `lint:*`/`vitest` do ADM rodam via node_modules da
raiz), e roda `npm run verify:<app>`.

**Correção necessária num job já existente** (`build-and-test`, gate
real do deploy do Retiradas): `Run lint` trocado de `npm run lint`
(repo inteiro) pra `npm run lint:retiradas` (escopado) — sem essa troca,
o `eslint.config.js` mais abrangente desta etapa faria esse job passar a
falhar por causa do débito de lint de finan/adm/operação, bloqueando o
deploy do Retiradas por um problema que nunca foi dele. Foi o único
ponto onde uma mudança desta etapa ameaçava um job de deploy existente —
identificado e corrigido antes de prosseguir, conforme instruído.

## 16. Confirmação de que os deploys não mudaram

`deploy-vps`, `deploy-homolog-vps`, `deploy-finan-vps`,
`detect-finan-changes`: **zero linhas alteradas** nesta etapa (conferido
lendo o conteúdo completo de cada um após as mudanças — secrets, hosts,
portas, nomes de serviço, condições de branch, comandos de migration e
health checks idênticos). Nenhum deploy de ADM ou Operação foi
adicionado.

## 17. Resultado da validação YAML

`python3 -c "import yaml; yaml.safe_load(...)"` → válido, sem erro de
sintaxe. `actionlint` não estava instalado e não foi instalado (conforme
instrução de não instalar ferramenta global sem necessidade) —
verificação manual feita: 11 chaves de job únicas (`security`,
`build-and-test`, `validate-finan`, `validate-adm`, `validate-operacao`,
`detect-finan-changes`, `deploy-finan-vps`, `deploy-vps`,
`deploy-homolog-vps`, `e2e-smoke-homolog`, `e2e-smoke-prod`), todos os 6
lockfiles referenciados existem no caminho indicado, versão do Node
(`24`) confere com o ambiente local (`v24.11.1`), todos os scripts npm
chamados (`verify:finan`, `verify:adm`, `verify:operacao`,
`lint:retiradas`) existem no `package.json`. Os 3 jobs novos não usam
nenhuma expressão `${{ }}` (só `steps`/`run` simples), então não podem
ter introduzido erro de sintaxe de expressão.

## 18. Resultado da verificação de secrets

Nenhum segredo real, `.env` real ou padrão de chave privada foi
encontrado no diff desta etapa (`git diff --cached` contra os padrões
`BEGIN PRIVATE KEY`, `APP_AUTH_SECRET=`, `*_PASSWORD=`,
`DATABASE_URL=postgres`, `AWS_SECRET_ACCESS_KEY=`,
`R2_SECRET_ACCESS_KEY=`, todos com valor — vazio). Nenhum arquivo
`.env`/`.env.*` (fora de `.example`) foi staged em nenhum commit desta
etapa.

## 19. Commits criados

| Commit | Mensagem | Escopo |
|---|---|---|
| `b0c2eac` | `chore(lint): configure ESLint for all monorepo applications` | Só `eslint.config.js` |
| `5032983` | `test(monorepo): classify and activate orphaned application tests` | 6 testes movidos/reescritos + `tests/contracts/` + `apps/adm/frontend/vitest.config.js` |
| `eb7fac8` | `chore(monorepo): add per-application verification commands` | `package.json` (scripts) + `scripts/check-backend-syntax.mjs` |
| `4d0cd93` | `ci(monorepo): validate all applications without changing deploys` | Só `.github/workflows/ci.yml` |

(mais `635c86b`, documental, criado na Fase 0 desta etapa pra resolver o
relatório pendente da Etapa 3).

## 20. Falhas ou pendências

- **153 erros de lint pré-existentes** em finan/adm/operação (seção 5) —
  não corrigidos, proposta de baseline na seção 21.
- **42 testes do ADM falhando** por React duplicado entre a raiz
  (19.2.8) e o próprio ADM (19.3.0) — `resolve.dedupe` não resolve
  100% quando as versões realmente divergem. Corrigir de verdade exige
  alinhar a versão do React do ADM com a raiz (mudança de dependência,
  fora do escopo) ou dar ao ADM sua própria instalação completa de
  vitest/jsdom/testing-library (idem).
- **1 teste intermitente pré-existente** em `apps/retiradas` (timeout,
  não relacionado a esta etapa — já documentado nas Etapas 1 e 2).
- **`verify:*` e `verify:all` falham hoje** pra finan/adm/operação, em
  cascata a partir do lint — comportamento correto do encadeamento, não
  um bug, mas significa que esses comandos não estão "verdes" ainda.

## 21. Ausências de cobertura ainda existentes / proposta de baseline

O lint global **não pôde ficar verde** sem uma refatoração funcional
ampla (153 erros reais, muitos exigindo entender a intenção de cada
componente). Conforme instruído, não tentei mascarar isso. Proposta de
baseline explícita:

| Fase futura | Escopo | Risco |
|---|---|---|
| **B-1** | Os 12 `no-undef` (`payload` indefinido) em `RompimentosPage.jsx` (Operação) — provável bug real, corrigir isolado com teste manual da tela | Baixo, alto valor |
| **B-2** | Os 30 `react-hooks/rules-of-hooks` (Operação) — hooks condicionais, cada ocorrência exige entender o fluxo do componente antes de mover o hook pra fora do condicional | Médio, maior risco de regressão visual |
| **B-3** | `no-unused-vars` (37 no total, 3 sistemas) — mecânico, lote único por sistema com teste depois | Baixo |
| **B-4** | `react-refresh/only-export-components` (35 no total) — mover constantes/funções compartilhadas pra arquivo próprio, mecânico mas manual arquivo a arquivo | Baixo-médio |
| **B-5** | `react-hooks/set-state-in-effect` e regras menores (jsx-a11y, etc.) | Baixo |
| **B-6** | Resolver a duplicação de React do ADM (devDependency própria ou alinhamento de versão) pra destravar os 42 testes restantes | Médio (mexe em dependências) |

Até essas fases acontecerem, `lint:finan`/`lint:adm`/`lint:operacao` e
`verify:finan`/`verify:adm`/`verify:operacao` continuam **vermelhos por
design conhecido**, e os 3 jobs novos de CI (`validate-*`) vão aparecer
como falha em todo PR/push — isso é intencional e visível, não foi
escondido com `continue-on-error` nem "warning em vez de erro" (ambos
proibidos explicitamente nesta etapa). Fica registrado aqui como decisão
que precisa da sua confirmação: se preferir os jobs `validate-*` não
apareçam como falha até a Fase B-1..B-5 avançar, é uma mudança de
configuração do CI (ex.: `continue-on-error: true` temporário,
documentado) que eu não apliquei por não ter certeza de que você
preferia isso a ver o estado real.

## 22. Confirmação: branches e stashes originais permaneceram intactos

Confirmado (seção 1) — `master`, `finan`, `adm`, `rot` seguem nos mesmos
SHAs do início desta etapa. `git stash list` idêntica.

## 23. Confirmação: nenhum push, deploy ou migration foi realizado

Confirmado. Todas as operações foram locais (`git mv`, edição de
arquivos, `git commit` ×5, `npm run lint/test/build` por app, `node --test`,
`node --check`). Nenhum `git push`. Nenhuma migration executada. Nenhuma
conexão a banco real. CI foi editado mas não executado nem publicado.

---

## Estado final — onde tudo ficou

- Branch ativa: `refactor/monorepo-quatro-apps` (5 commits à frente do
  checkpoint desta etapa).
- ESLint cobre os 4 apps de verdade pela primeira vez. Os 14 erros de
  parsing do ADM resolvidos; 153 erros reais (pré-existentes, agora
  visíveis) documentados com proposta de baseline, não corrigidos.
- 6 testes órfãos classificados, movidos e rodando (5 na Operação, 1 em
  `tests/contracts/`). ~60 testes do ADM ganharam runner pela primeira
  vez (71/113 passam; 42 falham por causa documentada, não corrigida).
- 21 scripts novos de validação por app + `verify:all`, todos executando
  verificação real (nenhum sucesso falso).
- CI valida os 4 sistemas; nenhum deploy existente foi alterado; 1 risco
  real a um job de deploy identificado e corrigido antes de causar dano.
- Branches originais e stashes intactos. Nada publicado.

**Aguardando sua revisão** — em especial a decisão da seção 21 (deixar
os `validate-*` vermelhos e visíveis, ou suavizar temporariamente até a
dívida ser paga) — antes de qualquer promoção para `master` ou próxima
etapa de workspaces.
