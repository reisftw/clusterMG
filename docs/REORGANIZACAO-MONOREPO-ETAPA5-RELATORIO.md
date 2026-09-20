# Etapa 5 — Eliminação de débito técnico e baseline verde (relatório final)

## 1. Objetivo da etapa

Eliminar o débito técnico documentado em `docs/REORGANIZACAO-MONOREPO-ETAPA4-RELATORIO.md` (153 erros de lint deixados deliberadamente como baseline não corrigido) e alcançar, na medida do possível sem refatoração funcional ampla ou decisão de negócio unilateral:

```
lint:retiradas   -> verde
lint:finan       -> verde
lint:adm         -> verde
lint:operacao    -> verde
test:retiradas   -> verde e estável
test:finan       -> validação honesta
test:adm         -> verde
test:operacao    -> verde
test:contracts   -> verde
build dos 4 apps -> verde
verify:all       -> verde
```

## 2. Estado Git inicial

- Branch de trabalho: `refactor/monorepo-quatro-apps` (única branch usada do início ao fim da etapa).
- Checkpoint de segurança: commit `51f2e2a` (`docs(monorepo): record Etapa 4 tooling baseline`), marcado como `backup/pre-quality-remediation` antes de qualquer correção.
- Working tree limpo, sem alterações pendentes, no início da etapa.

## 3. Estado Git final

- Branch: `refactor/monorepo-quatro-apps` (inalterada, sem criação de branches novas).
- Working tree limpo (`git status --porcelain` vazio).
- Nenhum push, deploy ou migração executados.
- 15 commits novos desde o checkpoint, cada um isolado por categoria de correção (ver seção 16).

## 4. Ordem de execução seguida

1. Isolamento dos testes do ADM.
2. Correção do `no-undef` da Operação.
3. Correção de Rules of Hooks da Operação.
4. Erros mecânicos por sistema (`no-unused-vars` e afins).
5. Extração de exports não-componente (`react-refresh/only-export-components`) nos 3 apps.
6. Resolução de `react-hooks/set-state-in-effect` nos 3 apps.
7. Estabilização do teste intermitente do Retiradas.
8. Green final (`react-hooks/preserve-manual-memoization` do ADM).
9. Revisão dos gates do CI.
10. Scan final de segredos.
11. Este relatório.

## 5. Isolamento do ambiente de teste do ADM

**Causa raiz:** o ADM tinha sua própria versão de React (`19.3.0`) instalada em `apps/adm/frontend/node_modules`, diferente da versão na raiz do monorepo (`19.2.8`). Quando os testes do ADM rodavam sob o Vitest compartilhado da raiz, o bundler resolvia dois módulos React fisicamente distintos no mesmo grafo de execução — um componente renderizado por um React tentava usar hooks (`useState`) do outro React, resultando em `Cannot read properties of null (reading 'useState')`. Isso derrubava 42 dos 113 testes.

**Tentativa insuficiente:** `resolve.dedupe: ["react", "react-dom"]` no Vitest da raiz não resolveu — os `node_modules` físicos continuavam sendo diretórios diferentes com versões diferentes, dedupe não força uma versão inexistente a aparecer no outro lugar.

**Correção definitiva:** o ADM ganhou devDependencies próprias e isoladas (`vitest@4.1.10`, `jsdom@^29.1.1`, `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^6.9.1`, `@testing-library/user-event@^14.6.1`), todas verificadas contra `npm view <pkg> peerDependencies` antes de instalar (sem cópia cega de versões da raiz). `apps/adm/frontend/vitest.config.js` foi reescrito para rodar com `root` próprio e resolver tudo a partir do `node_modules` local do app. `package-lock.json` do ADM foi regenerado do zero.

**Resultado:** 113/113 testes passando após a correção (1 bug real de fixture corrigido no processo: `EditarUsuarioModal.test.jsx` usava `role: "backoffice_retirada"`, um cargo que pertence ao sistema Retiradas e não existe em `CARGOS_ADM`; corrigido para `"supervisor_administrativo"`).

## 6. Causa dos payloads indefinidos (Operação)

`apps/operacao/frontend/src/pages/admin/RompimentosPage.jsx`: a variável `payload` era declarada **dentro** do bloco `try {}` mas usada em outro escopo em caso de falha de rede (fallback offline). Isso gerava 12 erros `no-undef` e, mais grave, um **bug real de produção**: em caso de falha de rede durante a criação de um rompimento, o código que tentava enfileirar o registro offline referenciava uma variável fora de escopo, lançando `ReferenceError` e perdendo silenciosamente o registro que deveria ter sido salvo para sincronização posterior.

**Correção:** a construção do payload foi extraída para uma função pura (`buildRompimentoPayload`, em `rompimentoPayload.js`), chamada antes do `try`, eliminando o problema de escopo e adicionando cobertura de teste (5 casos em `rompimentoPayload.test.js`).

## 7. Rules of Hooks corrigidas

`apps/operacao/frontend/src/pages/admin/RompimentosPage.jsx` (`FleetVehicleDetailPage.jsx` correlato já havia sido corrigido em commit anterior à etapa, `dbb155d`): o componente `ActionModals` continha 13 blocos `if (modal.type === "x") { const [...] = useState(...); return <JSX/>; }` — chamando hooks condicionalmente, violação clássica das Rules of Hooks que pode causar comportamento indefinido dependendo da ordem de renderização.

**Correção:** os 13 blocos foram extraídos para 13 componentes independentes (`TransferModal`, `ConfirmModal`, `CancelModal`, `ReturnModal`, `RetrieveModal`, `KmModal`, `KmCorrectModal`, `MaintenanceStartModal`, `MaintenanceFinishModal`, `ClaimModal`, `BlockModal`, `UnblockModal`, `InactivateModal`), cada um com seus próprios hooks incondicionais. `ActionModals` passou a despachar para o componente certo via `if (modal.type === "x") return <XModal {...shared} />`. Nenhuma lógica de negócio, estilo ou chamada de API foi alterada — só a estrutura dos hooks.

## 8. Erros mecânicos por sistema (`no-unused-vars` e correlatos)

Cada ocorrência foi investigada individualmente (grep de uso real, verificação de exports/reexports) antes de decidir entre remoção de código morto confirmado ou renomeação com prefixo `_` quando o setter/efeito colateral ainda estava em uso:

- **ADM**: ~40% do backlog resolvido nesta etapa (commit `de2dbb8`), incluindo imports mortos (`db`, `fsSync`), funções mortas (`isLowStock`, `countInvoiceFiles`, `countTecnicosByArea`, `dataUrlFormat`, `normalizePlacas`), variáveis de estado com getter nunca lido mas setter genuinamente chamado (renomeadas com `_`).
- **Operação**: 16 ocorrências resolvidas (commit `7b2eba2`), incluindo dois achados de funcionalidade incompleta documentados em comentário no próprio código (`themes`/filtro por tema no `DssReportsPage.jsx` sem `<Select>` correspondente; `timeline`/`workload` buscados mas nunca renderizados no relatório exportado de SST) — preservados como estado morto documentado, não removidos, por serem prováveis funcionalidades pendentes de implementação de UI, não erros.
- **Finan**: já estava zerado antes desta etapa (confirmado, sem commit necessário).

## 9. Extração de exports não-componente (`react-refresh/only-export-components`)

35 ocorrências resolvidas nos 3 apps (Finan `e82e1c4`, ADM `cfc429a`, Operação `9a9be2c`), todas pelo mesmo padrão: separar o(s) export(s) não-componente de um arquivo que também exporta um componente React, sem alterar comportamento algum.

- **Finan (20 ocorrências)**: `navigationConfig.jsx` → `navigationIcons.jsx`; `FinanceiroSharedHelpers.jsx` → `FinanceiroSharedModals.jsx` (6 importadores atualizados); `DashboardPrimitives.jsx` → `chartOptions.js` (2 importadores); `FinanAuthContext.jsx`/`FinanPinLockContext.jsx`/`FinanToastContext.jsx` — padrão Context+Provider+hook separado em `<nome>ContextObject.js` (objeto de contexto puro) + `use<Nome>.js` (hook), Provider ficou no arquivo original. Ao todo 32 importadores de `useFinanAuth` atualizados via busca ampla por profundidade de path (`grep` sem prefixo fixo de `../`).
- **ADM (5 ocorrências)**: mesmo padrão Context+hook aplicado a `AuthContext.jsx` (46 importadores), `LayoutModeContext.jsx` (3), `SystemContext.jsx` (sem consumidores reais), `ThemeContext.jsx` (sem consumidores reais fora de um mock de teste, corrigido também).
- **Operação (10 ocorrências)**: `Shell.jsx` → `operationMenuConfig.js`; `AprPage.jsx` → `aprStatusLabels.js`; `DssThemesPage.jsx` → `dssThemeConstants.js`; `SstProtocolsPage.jsx` → `sstProtocolConstants.js`; `RotAuthContext.jsx` → padrão Context+hook (40 importadores atualizados).

**Erro de processo autocorrigido:** na primeira passada pelo ADM, um `grep` com profundidade de path fixa (`../../context/AuthContext`) deixou 40 importadores de `useAuthContext` em profundidades diferentes (`../../../context/AuthContext`) sem atualizar — detectado antes do commit ao rodar o lint de verificação (que teria acusado import quebrado) e corrigido com uma busca ampla (`grep` sem prefixo de `../`) cobrindo todas as profundidades de uma vez, replicada como prática padrão nos apps seguintes.

## 10. `react-hooks/set-state-in-effect`

32 ocorrências resolvidas nos 3 apps (Finan `958309c`, ADM `4f3906a`, Operação `dc286b6`), cada uma analisada individualmente segundo dois padrões:

**Padrão A — código morto/no-op, removido de verdade:**
- `setState` síncrono cujo valor nunca é observável no render por causa de um guard/early-return logo depois (ex.: componente retorna `null` antes de usar o estado, ou a UI só renderiza o estado quando outra condição — como tamanho mínimo da busca — já é verdadeira, tornando o reset redundante).
- `setState(valorInicial)` chamado num efeito que só roda uma vez no mount, quando o estado já foi inicializado com esse mesmo valor via `useState(valorInicial)`.

Exemplos: `FinanAuditLogsSection.jsx`, `FinanCommandPalette.jsx`, `FinanModulePage.jsx` (Finan); `SafetyPropertySearch`, `SupplierLookup`, `ContractPropertyLookup`, `PropertyConsumptionLookup`, `ImoveisSpacesPanel`, `FacilitiesDashboardPage.jsx` (ADM).

**Padrão B — reset genuinamente observável, documentado com `eslint-disable-next-line` justificado:**
- Sincronização intencional de UI com prop/rota (abrir item de menu ativo, corrigir página fora dos limites após filtrar, resetar formulário ao abrir modal).
- `setLoading(true)` antes de um fetch assíncrono quando o estado de loading é genuinamente necessário (efeito com dependência que muda, ou função compartilhada com um botão de "tentar de novo"/"atualizar").

Cada ocorrência do padrão B recebeu um comentário de uma ou duas linhas explicando por que o reset é intencional, imediatamente acima da linha exata da chamada `setState` (nunca acima de um `if()` que a contém — erro de posicionamento cometido e corrigido uma vez no Finan, replicado como cuidado padrão depois). A causa raiz de fundo (o padrão "efeito dispara fetch, chama setState antes e depois do fetch" é incompatível com o React Compiler) só se resolveria de verdade migrando para uma lib de data-fetching como TanStack Query — decisão avaliada e descartada por ser refatoração funcional ampla, fora do escopo desta etapa.

## 11. Teste intermitente do Retiradas — causa e resultado

**Arquivo:** `apps/retiradas/frontend/src/pages/PainelPublico/hooks/useDashboardData.test.js`

**Causa raiz:** o hook `useDashboardData.js` agenda, a cada montagem, um `window.setTimeout(..., 750)` real para um refresh silencioso em segundo plano que ignora o cache (`force: true`) e dispara um novo `fetch`. O arquivo de teste não usa fake timers. Isolado, o teste sempre termina em bem menos de 750ms (confirmado: 20/20 execuções isoladas passaram antes mesmo da correção). Rodando a suíte completa do Retiradas (63 arquivos, workers do Vitest em paralelo, contenção de CPU), o teste ocasionalmente demorava tempo real suficiente para os 750ms se esgotarem antes das asserções, disparando um fetch extra e quebrando `expect(global.fetch).toHaveBeenCalledTimes(1)`.

**Correção:** interceptação cirúrgica do delay de 750ms no `beforeEach`, via `vi.spyOn(window, "setTimeout")`, repassando qualquer outro delay para a implementação real capturada antes do mock. Isso preserva o funcionamento do `waitFor` da Testing Library (que depende de outros `setTimeout` reais para seu polling interno) sem usar fake timers globais e sem aumentar nenhum timeout de asserção — a correção remove a corrida, não maquia o sintoma.

**Validação:** 43 execuções verdes no total — 20 isoladas antes da correção (confirmando que raramente falha sozinho), 3 execuções completas da suíte (353/353 cada) com a correção aplicada, e 20 execuções isoladas de reconfirmação depois.

## 12. Green final (Fase 12) e achados documentados como bloqueio

Depois de todas as correções acima, restaram 3 erros de lint no ADM: 1 `no-constant-condition` e 2 `react-hooks/preserve-manual-memoization`.

**Corrigidos:** os 2 `preserve-manual-memoization` em `FacilitiesPage.jsx` (componente `PropertyLookup`) — o React Compiler não conseguia preservar a memoização de `visible` porque a dependência `imoveis` (array recebido via prop) pode ser mutada depois de passada. A computação é uma filtragem barata de lista, sem necessidade real de memoização manual; virou um `const` derivado direto no corpo do componente, comportamento idêntico.

**Não corrigido — bloqueador formal documentado:** `no-constant-condition` em `EmpresasTecnicosPage.jsx:1411` (`{false ? <div className="xl:col-span-12">...139 linhas...</div> : null}`). Investigado: `addTecnico`/`removeTecnico` só são referenciados dentro desse bloco morto, mas `form.tecnicos` continua sendo lido no submit do formulário — indício de que a UI de gestão de técnicos dentro deste formulário específico foi deliberadamente desativada (possivelmente substituída por outro fluxo, já que o módulo se chama "empresasTecnicos" e há telas de técnicos em outros lugares do app), não esquecida por acidente. Remover 139 linhas de UI funcional — mesmo que hoje inacessível — é uma decisão de produto, não uma correção mecânica de lint, e está fora do escopo desta etapa (que proíbe explicitamente "alteração proposital de regra de negócio" e "refatoração funcional ampla" sem confirmação). **Recomendação:** o time de produto deve decidir entre (a) remover o bloco definitivamente, (b) reativá-lo, ou (c) documentar formalmente por que fica desligado — qualquer uma dessas decisões é trivial de implementar depois que tomada.

## 13. Resultado final de cada comando

| Comando | Resultado |
|---|---|
| `lint:retiradas` | **Verde** — 0 erros, 1 warning pré-existente (`react-hooks/exhaustive-deps` em `MovimentacoesPage.jsx`, fora do escopo desta etapa) |
| `test:retiradas` | **Verde e estável** — 353/353 testes, 63 arquivos, validado com 43 execuções da suíte específica antes flaky |
| `build:retiradas` | **Verde** |
| `lint:finan` | **Verde** — 0 erros, 22 warnings pré-existentes (`no-await-in-loop`/`global-require`/`no-continue` com `eslint-disable` órfão, fora do escopo desta etapa) |
| `test:finan` | Validação honesta — checagem de sintaxe de 118 arquivos do backend, 0 erros (Finan não tem suíte de testes de frontend real) |
| `build:finan` | **Verde** |
| `lint:adm` | **1 erro restante** (bloqueador formal documentado na seção 12), 2 warnings pré-existentes de `react-hooks/exhaustive-deps` |
| `test:adm` | **Verde** — 113/113 testes, 81 arquivos de backend com sintaxe validada |
| `build:adm` | **Verde** |
| `lint:operacao` | **1 erro restante** (`no-unreachable` em `rompimentos/routes.js`, ver seção 12b abaixo), 17 warnings pré-existentes |
| `test:operacao` | **Verde** — 37 testes de backend + 7 de frontend |
| `build:operacao` | **Verde** |
| `test:contracts` | **Verde** — 2/2 |
| `verify:all` | Encadeado; para nos 2 pontos acima (ADM e Operação) pelo motivo documentado, não por regressão |

### 12b. Segundo achado documentado como bloqueio (Operação)

`apps/operacao/backend/src/rompimentos/routes.js:212-238` — o handler `POST /` de criação de rompimento tem um `return` incondicional logo após uma resposta 400 ("Abra uma tratativa e anexe pelo menos 1 imagem..."), seguido de ~25 linhas de lógica de `INSERT` agora inalcançável. Investigado no início da etapa (ver histórico): pode ser um bug genuíno ou uma migração incompleta e deliberada para um fluxo de duas etapas (rascunho + upload de imagem). Ambíguo o suficiente para exigir confirmação de produto antes de decidir entre religar o insert ou remover o código morto — **não foi tocado**, mesma lógica de cautela da seção 12.

## 14. Warnings restantes (não bloqueiam, documentados para referência futura)

- Retiradas: 1 (`react-hooks/exhaustive-deps`)
- Finan: 22 (todos `Unused eslint-disable directive` — comentários `eslint-disable` que suprimiam regras que já não disparam mais, de regras como `no-await-in-loop`/`global-require`/`no-continue`; seguros de limpar com `--fix` numa etapa futura dedicada a isso)
- ADM: 2 (`react-hooks/exhaustive-deps`)
- Operação: 17 (mistura de `Unused eslint-disable directive` e `react-hooks/exhaustive-deps`)

Nenhum destes foi tratado nesta etapa — não bloqueiam CI (warnings não retornam exit code de erro) e corrigi-los em massa é candidato a uma etapa própria e focada.

## 15. Gates do CI revisados

- `deploy-vps` (Retiradas → produção): já dependia de `[security, build-and-test]`, onde `build-and-test` roda `lint:retiradas`/`npm test`/`npm run build` — já satisfazia "deploy do Retiradas depende da validação do Retiradas". Nenhuma mudança necessária.
- `deploy-finan-vps` (Finan → produção): **corrigido**. Antes desta etapa, `validate-finan` existia mas não bloqueava nada (só dava visibilidade, com um comentário explícito dizendo que a falha ali era esperada por causa do débito de lint). Como `lint:finan`/`test:finan`/`build:finan` ficaram 100% verdes nesta etapa, `validate-finan` foi adicionado ao `needs:` de `deploy-finan-vps` — agora o deploy do Finan é bloqueado se a validação falhar.
- `validate-adm`/`validate-operacao`: continuam como jobs de validação apenas, sem job de deploy próprio referenciando-os (nenhuma mudança necessária, comentários desatualizados sobre débito de lint já pago foram atualizados).
- Nenhum comando de deploy, secret, host, porta ou condição de branch foi alterado.

## 16. Dependências adicionadas

| App | Pacote | Versão | Motivo |
|---|---|---|---|
| ADM frontend | `vitest` | `4.1.10` | Isolamento do ambiente de teste (verificado contra a versão da raiz) |
| ADM frontend | `jsdom` | `^29.1.1` | Idem |
| ADM frontend | `@testing-library/react` | `^16.3.2` | Idem |
| ADM frontend | `@testing-library/jest-dom` | `^6.9.1` | Idem |
| ADM frontend | `@testing-library/user-event` | `^14.6.1` | Idem |
| Operação frontend | `vitest` | `4.1.10` | Rodar os 2 arquivos de teste puro criados nesta etapa (sem jsdom, componentes não são renderizados) |
| raiz | `eslint-plugin-jsx-a11y` | `6.10.2` | Registrar regras `jsx-a11y/no-autofocus`/`no-static-element-interactions` já referenciadas por comentários `eslint-disable` órfãos no Finan (o plugin nunca tinha sido instalado) |

Todas verificadas via `npm view <pacote> peerDependencies` antes da instalação, sem cópia cega de versão.

## 17. Ajustes de acessibilidade

`eslint-plugin-jsx-a11y` foi instalado e escopado **somente** a `apps/finan/frontend/**/*.{js,jsx}` (onde 3 comentários `eslint-disable-next-line` pré-existentes já documentavam a decisão consciente de suprimir essas regras). Uma tentativa inicial de aplicar as regras globalmente a todos os apps foi revertida antes do commit, ao notar que quebraria `lint:retiradas` (antes verde) e introduziria dezenas de novos erros em ADM/Operação nunca auditados sob essa lente — fora do escopo desta etapa (auditoria de acessibilidade ampla).

## 18. Commits criados (ordem cronológica)

```
de2dbb8 chore(adm): remove unused code reported by lint
108edba fix(finan): register missing eslint-plugin-jsx-a11y
7b2eba2 chore(operacao): remove unused code reported by lint
e82e1c4 refactor(finan): extract non-component exports for fast refresh
cfc429a refactor(adm): extract non-component exports for fast refresh
9a9be2c refactor(operacao): extract non-component exports for fast refresh
958309c refactor(finan): resolve set-state-in-effect findings
4f3906a refactor(adm): resolve set-state-in-effect findings
dc286b6 refactor(operacao): resolve set-state-in-effect findings
5d3e8ed test(retiradas): stabilize intermittent useDashboardData test
3766e43 fix(adm): remove unpreservable useMemo in PropertyLookup
e909b2c chore(ci): wire deploy-finan-vps to validate-finan gate
```

(`dbb155d` e `1a07922` — correções de Rules of Hooks e do bug de payload da Operação — foram commitados no início da etapa, antes deste checkpoint de relatório ser escrito, mas já fazem parte do trabalho descrito nas seções 6 e 7.)

Cada commit é isolado por categoria de correção, por sistema, conforme instruído — nenhum commit mistura mais de uma categoria de mudança ou mais de um app (exceto o commit único de CI, que por natureza toca o workflow compartilhado).

## 19. Confirmações de segurança

- Nenhuma credencial, token, chave privada ou string de conexão de banco foi versionada nesta etapa (scan de padrões `BEGIN PRIVATE KEY`, `APP_AUTH_SECRET=`, `DATABASE_URL=`, `FINAN_DATABASE_URL=`, `ROT_DATABASE_URL=`, `AWS_SECRET_ACCESS_KEY=`, `R2_SECRET_ACCESS_KEY=` no diff completo da etapa: nenhuma ocorrência).
- Nenhum arquivo `.env` real foi adicionado ao controle de versão.
- Nenhuma das 12 stashes pré-existentes foi aplicada, removida ou alterada.
- Nenhuma branch foi criada, renomeada ou deletada.
- Nenhum `git push`, deploy ou migração de banco foi executado.
- NPM Workspaces não foi introduzido (fora de escopo, conforme instruído).
- Nenhuma promoção para `master`/`homolog-dev` foi feita.

## 20. O que ficou fora do escopo (por instrução explícita ou por exigir decisão de produto)

- Migração para NPM Workspaces.
- Promoção de `refactor/monorepo-quatro-apps` para `master`.
- Push, deploy manual ou migração de banco de dados.
- Renomeação de variáveis `ROT_*`.
- Alteração de tabelas do banco de dados.
- Aplicação ou remoção de stashes.
- Refatoração visual ampla, novas funcionalidades ou mudança deliberada de regra de negócio.
- Os 2 achados documentados nas seções 12 e 12b (bloco de UI de técnicos desativado, handler de rompimentos com código inalcançável).
- Limpeza em massa dos 42 warnings pré-existentes listados na seção 14.
- Correção do warning único do Retiradas.

## 21. Recomendação para a próxima etapa

1. Levar os 2 achados das seções 12/12b para decisão de produto (times responsáveis pelo ADM e pela Operação).
2. Uma etapa focada e curta para limpar os 42 warnings pré-existentes (`eslint --fix` resolve a maioria dos "Unused eslint-disable directive" automaticamente).
3. Avaliar, fora desta etapa, se vale migrar os padrões de `useEffect` + `fetch` + `setState` repetidos nos 3 apps para uma lib de data-fetching (TanStack Query ou similar) — resolveria a causa raiz de fundo do `set-state-in-effect` em vez do tratamento caso a caso aplicado aqui.
