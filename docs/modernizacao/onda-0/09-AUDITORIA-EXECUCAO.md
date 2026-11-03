# Auditoria de execucao da Onda 0

Data da auditoria: 2026-11-02  
Produto: Retiradas  
Branch examinada: `modernizacao/onda-0-observabilidade`  
Escopo: verificacao de execucao, sem implementacao, migration ou deploy

## Resumo executivo

A Onda 0 nao ficou apenas em planejamento: existe um conjunto relevante de codigo de observabilidade no worktree. Entretanto, nada desse conjunto foi commitado na branch, a migration necessaria nao foi executada e nao ha amostras representativas de producao. Portanto, a Onda 0 esta **parcialmente implementada e nao concluida**.

Foram avaliados 55 requisitos atomicos. Destes, 32 (58,2%) possuem implementacao integral aparente no codigo, mas somente 1 foi validado diretamente por teste especifico. Outros 14 (25,5%) estao parcialmente implementados e 9 (16,4%) nao foram implementados. Nao existe baseline real de P95, erros, payloads, pool ou integracoes que permita comparar antes e depois.

A decisao desta auditoria e **NAO APROVADO** para iniciar a Onda 1. O principal bloqueio funcional e que o coletor grava colunas adicionadas pela migration `113`, mas o bootstrap em runtime apenas cria a tabela se ela nao existir e nao atualiza uma tabela antiga. Sem aplicar e validar a migration, o flush agregado pode falhar (`metrics.js:435-500`; `113_observability_wave0.sql:4-12`).

## Historico e estado do Git

| Item | Resultado |
|---|---|
| Branch atual | `modernizacao/onda-0-observabilidade` |
| Commit atual | `4a7e26300da9547b20a1deee0297a0d426793949` |
| Commit inicial identificavel | Nao ha commit marcando o inicio. O melhor ponto de referencia e o proprio `4a7e263`, pois todo o codigo da Onda 0 esta sem commit sobre esse HEAD. |
| Commits da Onda 0 | Nenhum encontrado por historico, mensagem ou diferenca da branch. |
| Distancia de `master` | 0 commits a frente e 2 atras no momento da auditoria. |
| Arquivos criados | `apps/retiradas/backend/sql/113_observability_wave0.sql` (nao rastreado). |
| Arquivos modificados | 8 arquivos rastreados, listados abaixo. |
| Arquivos removidos | Nenhum. |
| Alteracoes sem commit | 486 adicoes e 20 remocoes nos 8 arquivos rastreados, alem da migration nao rastreada. |
| Documentacao anterior | `docs/modernizacao/onda-0/` nao existia antes deste relatorio; nao havia documentos 01-08 para confrontar. |

Arquivos modificados sem commit:

- `apps/retiradas/backend/api/src/app.js`
- `apps/retiradas/backend/api/src/db.js`
- `apps/retiradas/backend/api/src/equipmentRecovery/equipmentRecoveryService.js`
- `apps/retiradas/backend/api/src/equipmentSerialLookup.js`
- `apps/retiradas/backend/api/src/hubsoftSyncProfiles.js`
- `apps/retiradas/backend/api/src/maintenanceService.js`
- `apps/retiradas/backend/api/src/metrics.js`
- `apps/retiradas/frontend/src/modules/maintenance/components/MaintenancePortal.jsx`

## Implementacoes confirmadas

### HTTP e agregacao

- O middleware e inicializado e registrado globalmente em `app.js:2470-2473`.
- O contexto por requisicao gera ou reaproveita um identificador valido e devolve `X-Request-Id` em `metrics.js:641-660`.
- Rotas dinamicas sao normalizadas em `metrics.js:73-91`, com teste unitario em `metrics.test.js:8-23`.
- Contagens, erros 4xx/5xx, histogramas de latencia, queries, bytes e espera de pool sao agregados em `metrics.js:188-218`.
- P50, P95 e P99 sao derivados de histogramas em `metrics.js:785-843`.
- A cardinalidade e limitada por rota e operacao em `metrics.js:193-196` e `metrics.js:243-246`.
- A retencao agregada e fixa em 31 dias em `metrics.js:557-566`.

### PostgreSQL

- O pool possui limites explicitos em `db.js:18-46` e estatisticas de total, ociosas, em uso e aguardando em `db.js:237-244`.
- A espera de `pool.connect()` e medida em `db.js:107-116`.
- Queries e transacoes sao cronometradas em `db.js:92-100`, `db.js:151-180` e `db.js:184-233`.
- A leitura estatica mostra que o caminho com RLS conserva `BEGIN`, aplicacao do contexto, query, `COMMIT` e `ROLLBACK` em `db.js:151-172`. Nao houve teste especifico desse comportamento.

### Integracoes e jobs

- AutoISP e HubSoft possuem spans externos distintos em `equipmentSerialLookup.js:733-747`.
- Fallbacks selecionados sao contabilizados em `equipmentSerialLookup.js:329`, `341`, `348` e `631`.
- O job de sincronizacao HubSoft e envolvido por observacao em `hubsoftSyncProfiles.js:2773-2777`.
- O reprocessamento de recuperacao de ativos e observado em `equipmentRecoveryService.js:819-823`.
- O agregador de operacoes registra chamadas, sucesso, falha, timeout, fallback, duracao, queries e contadores de processamento em `metrics.js:227-262`.

### Painel tecnico

- A rota frontend real existe em `router/AppRouter.jsx:19-20` e `router/AppRouter.jsx:485`.
- O backend monta `/api/maintenance` em `app.js:2509` e protege `/dashboard` com autenticacao e papel `admin` em `maintenance/routes/maintenanceRoutes.js:16` e `65`.
- O frontend consome o endpoint real em `modules/maintenance/services/maintenanceService.js:20`.
- O painel usa dados de requisicoes, pool, integracoes e jobs em `MaintenancePortal.jsx:104-161` e atualiza a cada 30 segundos em `MaintenancePortal.jsx:346`.
- Ha estados de login, carregamento, vazio e erro no componente; a folha de estilo inclui breakpoints em `maintenance.css:5-6`.

## Implementacoes pendentes ou incompletas

1. A migration `113` nao foi executada nem validada contra um schema existente. Isso impede afirmar que os agregados podem ser persistidos.
2. Nao ha telemetria completa das etapas de autenticacao, Playwright, espera e tempo total da consulta de serial.
3. `rawQuery()` usa `pool.query()` e nao mede a espera de checkout (`db.js:103-105`), portanto a visibilidade do pool e incompleta.
4. O tamanho da resposta depende apenas de `Content-Length` (`metrics.js:663`); respostas chunked ou streaming podem aparecer como zero.
5. Nao ha instrumentacao especifica de polling, requisicoes duplicadas, eventos realtime, carregamento de pagina ou custo de telas permanentes.
6. Apenas dois jobs receberam o novo wrapper; nao existe cobertura sistematica dos demais jobs criticos.
7. Nao ha baseline real, amostragem representativa, comparacao antes/depois ou validacao de custo.
8. Os valores efetivos das flags e limites em producao nao estavam disponiveis.

## Matriz de implementacao

Legenda resumida: **IV** = implementado e validado; **IN** = implementado, nao validado; **PI** = parcialmente implementado; **AD** = apenas documentado; **NI** = nao implementado; **NV** = nao verificavel.

| Requisito | Estado | Evidencia no codigo | Teste realizado | Pendencia |
|---|---|---|---|---|
| A1 Middleware centralizado | IN | `app.js:2470-2473`; `metrics.js:635-684` | Build e sintaxe | Sem teste HTTP real |
| A2 Correlation ID | IN | `metrics.js:641-657` | Build e sintaxe | Sem teste de propagacao |
| A3 Header de rastreamento | IN | `metrics.js:659-660` | Build e sintaxe | Sem teste de resposta |
| A4 Normalizacao de rotas | IV | `metrics.js:73-91` | `metrics.test.js:8-23` aprovado | Cobertura limitada a ID numerico/UUID |
| A5 Contagem de requisicoes | IN | `metrics.js:201`; `467-500` | Build e sintaxe | Sem persistencia validada |
| A6 P50/P95/P99 | PI | `metrics.js:785-843` | P95 testado em `metrics.test.js:25-63` | P50/P99 e precisao nao testados |
| A7 Erros 4xx/5xx | IN | `metrics.js:202-203` | Build e sintaxe | Sem amostra executada |
| A8 Tamanho de resposta | PI | `metrics.js:663-674` | Build e sintaxe | Nao cobre chunked/streaming |
| A9 Agregacao temporal | IN | `metrics.js:127-130`; `435-553` | Build e sintaxe | Migration e flush nao validados |
| A10 Retencao limitada | IN | `metrics.js:557-566` | Build e sintaxe | Fixa em 31 dias; sem teste |
| A11 Controle de cardinalidade | IN | `metrics.js:193-196`; `243-246` | Build e sintaxe | Sem teste de saturacao |
| A12 Habilitacao por configuracao | IN | `metrics.js:7-14`; `23-29` | Inspecao de ambiente local | Valores de producao NV |
| B1 Tempo de aquisicao | PI | `db.js:107-116` | Build e sintaxe | Nao cobre `pool.query()` |
| B2 Espera no pool | PI | `db.js:107-116`; `metrics.js:1010-1017` | Build e sintaxe | Subnotifica caminhos raw |
| B3 Total de conexoes | IN | `db.js:237-244` | Build e sintaxe | Sem endpoint executado |
| B4 Conexoes ociosas | IN | `db.js:237-244` | Build e sintaxe | Sem endpoint executado |
| B5 Conexoes aguardando | IN | `db.js:237-244` | Build e sintaxe | Sem endpoint executado |
| B6 Duracao das queries | IN | `db.js:92-100`; `151-180` | Build e sintaxe | Sem integracao com PostgreSQL |
| B7 Queries por requisicao | IN | `metrics.js:647-651`; `704-734` | Build e sintaxe | Sem request real |
| B8 Consultas lentas seguras | PI | `metrics.js:103-124`; `311-321` | Build e sintaxe | Texto SQL nao mascara literais |
| B9 Timeouts | PI | `metrics.js:691-734` | Build e sintaxe | Classificacao por texto de erro |
| B10 Transacoes | IN | `db.js:151-172`; `184-233` | Sintaxe e regressao geral | Sem teste RLS/commit/rollback |
| C1 Metrica AutoISP | IN | `equipmentSerialLookup.js:329-348`; `733-734` | Testes gerais aprovados | Sem execucao externa |
| C2 Metrica HubSoft | IN | `equipmentSerialLookup.js:631`; `746-747` | Testes gerais aprovados | Sem execucao externa |
| C3 Fallback Playwright | PI | Marcadores de fallback em `329-348`, `631` | Testes gerais aprovados | Sem span Playwright dedicado |
| C4 Tempo de autenticacao | NI | Nenhum span dedicado localizado | Busca estatica | Implementar etapa separada |
| C5 Duracao das chamadas | IN | `equipmentSerialLookup.js:733-747` | Build e testes gerais | Somente spans externos principais |
| C6 Tempo de espera | NI | Nenhuma metrica dedicada localizada | Busca estatica | Instrumentar esperas/rede |
| C7 Falhas e timeouts | PI | `metrics.js:249-253`; `755-776` | Build e sintaxe | Nem todas as etapas classificam timeout |
| C8 Taxa de fallback | PI | `metrics.js:253`; `1030-1058` | Build e sintaxe | Dado derivavel, nao validado/exibido claramente |
| C9 Tempo total por serial | NI | Nenhum span total localizado | Busca estatica | Envolver o fluxo completo |
| D1 Duracao de jobs | IN | `hubsoftSyncProfiles.js:2773`; `equipmentRecoveryService.js:819` | 22 testes direcionados aprovados | Somente dois jobs |
| D2 Registros processados | IN | `metrics.js:260`; wrappers dos jobs | 22 testes direcionados aprovados | Sem persistencia validada |
| D3 Registros com erro | PI | Falha da operacao em `metrics.js:251` | Build e testes gerais | Sem contador por registro |
| D4 Queries SQL por job | IN | ALS + `metrics.js:257-259`; wrappers | Build e testes gerais | Sem execucao DB |
| D5 Concorrencia entre jobs | PI | Historico/locks preexistentes; sem metrica nova | Testes gerais | Sem espera/contencao agregada |
| D6 Historico de execucao | IN | Historicos existentes nos dois servicos | 22 testes direcionados | Nao auditado para todos os jobs |
| D7 Metricas de falha | IN | `metrics.js:249-253`; wrappers | Build e testes gerais | Sem amostra real |
| E1 Tamanho dos payloads | PI | `metrics.js:663-674` | Build e sintaxe | Apenas resposta com Content-Length |
| E2 Frequencia de atualizacao | NI | Pollings existem, sem coletor | Busca em Acompanhamento/Topbar | Instrumentar custo e cadencia |
| E3 Requisicoes duplicadas | NI | Nenhum detector localizado | Busca estatica | Ausente |
| E4 Polling | NI | Polling em `Topbar.jsx:187-188` e `useDashboardData.js:233` | Busca estatica | Nao medido |
| E5 Eventos realtime | NI | Infra em `services/realtimeEvents.js:3` | Busca estatica | Nao medido |
| E6 Tempo de carregamento | NI | Nenhum coletor de navegacao/Web Vitals | Busca estatica | Ausente |
| E7 Falhas de atualizacao | PI | Erros HTTP agregados no backend | Build e sintaxe | Sem dimensao frontend/refresh |
| E8 Custo de telas permanentes | NI | Nenhuma metrica dedicada | Busca em Acompanhamento | Ausente |
| F1 Rota real | IN | `router/AppRouter.jsx:485` | Build aprovado | Sem navegacao em browser |
| F2 Componente frontend | IN | `MaintenancePortal.jsx:319-372` | Vitest/build aprovados | Sem teste visual |
| F3 Endpoint backend | IN | `maintenanceRoutes.js:65` | Testes gerais aprovados | Sem request com DB real |
| F4 Origem real das metricas | PI | `maintenanceService.js`; `metrics.js:1022-1062` | Build e sintaxe | Migration/flush nao validados |
| F5 Controle de acesso | IN | `maintenanceRoutes.js:16`, `65`; frontend `:358` | Suite geral aprovada | Sem teste direcionado do endpoint |
| F6 Responsividade | IN | `maintenance.css:5-6` | Build aprovado | Sem viewport/visual QA |
| F7 Atualizacao de dados | IN | `MaintenancePortal.jsx:346` | Build aprovado | Sem teste temporal/browser |
| F8 Estados vazios | IN | `MaintenancePortal.jsx:161`, `368` | Build aprovado | Sem teste de renderizacao |
| F9 Tratamento de falhas | IN | `MaintenancePortal.jsx:334-369` | Build/Vitest aprovados | Sem falha real de backend |

### Contagem da matriz

| Categoria | Quantidade | Percentual |
|---|---:|---:|
| Implementado e validado | 1 | 1,8% |
| Implementado, nao validado | 31 | 56,4% |
| Totalmente implementado (IV + IN) | 32 | 58,2% |
| Parcialmente implementado | 14 | 25,5% |
| Apenas documentado | 0 | 0,0% |
| Nao implementado | 9 | 16,4% |
| Nao verificavel na matriz funcional | 0 | 0,0% |
| Total | 55 | 100,0% |

O percentual de implementacao integral e `32 / 55 = 58,2%`. Requisitos parciais nao foram somados a esse percentual. A cobertura de codigo integral ou parcial e `46 / 55 = 83,6%`, mas isso nao representa conclusao nem validacao.

## Configuracoes

| Configuracao | Padrao no codigo | Valor efetivo examinado | Conclusao |
|---|---|---|---|
| `METRICS_ENABLED` | `false` (`metrics.js:7-8`) | Nao definida no processo local | Coleta detalhada desativada por padrao; producao NV |
| `MAINTENANCE_METRICS_ENABLED` | `true` (`metrics.js:9-11`) | Nao definida no processo local | Agregacao habilitada por padrao; producao NV |
| `OBSERVABILITY_ENABLED` | `true`, condicionada a maintenance metrics (`metrics.js:12-14`) | Nao definida no processo local | Operacoes habilitadas por padrao; producao NV |
| Cardinalidade de rotas | 500 (`metrics.js:23-25`) | Sem override local | Configuravel; producao NV |
| Cardinalidade de operacoes | 200 (`metrics.js:27-29`) | Sem override local | Configuravel; producao NV |
| Retencao | 31 dias (`metrics.js:557-566`) | Hard-coded | Limitada, mas nao configuravel |
| Amostragem | Nao existe | N/A | Ausente |
| Logs | Somente `LOG_FORMAT` estava presente no processo; valor nao registrado | Producao NV | Nao houve verificacao de nivel/volume efetivo |
| Pool PostgreSQL | max 10, idle 30 s, checkout 5 s (`db.js:18-22`) | Sem override local | Producao NV |

Nenhum valor sensivel foi lido ou registrado. A configuracao efetiva de producao nao estava disponivel nesta auditoria.

## Testes e validacoes

Comandos executados no worktree isolado:

| Comando | Resultado |
|---|---|
| `git diff --check` | Aprovado |
| `node --check` nos 6 arquivos backend modificados | Aprovado |
| `node --test apps/retiradas/backend/api/src/metrics.test.js` | 5/5 testes aprovados |
| `npm exec vitest run -- apps/retiradas/frontend/src/backend/maintenanceService.test.js apps/retiradas/frontend/src/backend/hubsoftSyncProfiles.test.js apps/retiradas/frontend/src/backend/equipmentRecoveryService.test.js` | 3 arquivos, 22/22 testes aprovados |
| `npm run verify:retiradas` | Lint aprovado; 98 arquivos e 573 testes aprovados; build aprovado |
| `npm run test:contracts` | 11/11 testes aprovados |

As primeiras tentativas de Node/Vitest falharam porque o worktree isolado nao tinha dependencias instaladas (`pg` e executavel Vitest ausentes). Para repetir a validacao sem instalar nem alterar lockfiles, foram criadas junctions locais ignoradas apontando para os `node_modules` do checkout principal. Depois disso, as suites acima passaram.

Limitacoes:

- A migration `113` nao foi executada, conforme a restricao da tarefa e do repositorio.
- Nao houve PostgreSQL descartavel disponivel para teste de upgrade, flush, RLS ou rollback.
- Nao houve chamada a AutoISP, HubSoft ou Playwright.
- Nao houve teste de navegador, responsividade visual, carga ou producao.
- O build emitiu avisos preexistentes de chunks acima de 500 kB e `eval` em `exceljs`; nao foram atribuidos a Onda 0.

## Diagnostico de performance

| Pergunta | Resposta | Evidencia |
|---|---|---|
| 1. A consulta de serial possui telemetria por etapa? | PARCIALMENTE | Ha spans AutoISP/HubSoft e marcadores de fallback (`equipmentSerialLookup.js:329-348`, `631`, `733-747`), mas faltam autenticacao, espera, Playwright e total. |
| 2. AutoISP e HubSoft podem ser separados? | SIM, no codigo | `name: autoisp` e `name: hubsoft` sao dimensoes distintas em `equipmentSerialLookup.js:733-747`; nao houve validacao externa. |
| 3. O sistema mede espera por conexoes PostgreSQL? | PARCIALMENTE | `acquireClient()` mede `pool.connect()` (`db.js:107-116`), mas `rawQuery()` usa `pool.query()` sem checkout observado (`db.js:103-105`). |
| 4. Conseguimos identificar N+1 com evidencias? | NAO | O contador por requisicao pode indicar suspeitas no futuro, mas nao ha amostras, fingerprint agregado ou baseline real. |
| 5. Sabemos quais endpoints geram maiores payloads? | PARCIALMENTE | Existe `response_bytes`, mas depende de `Content-Length`, a migration nao foi aplicada e nao ha dados reais. |
| 6. Dashboards possuem indicadores de custo/atualizacao? | NAO | Pollings e realtime existem, mas nao sao instrumentados. |
| 7. Existe monitoramento dos jobs? | PARCIALMENTE | Somente sincronizacao HubSoft e recuperacao de ativos foram envolvidos pelo novo observador. |
| 8. Existe baseline real de P95 e erros? | NAO | Nao existem amostras representativas do ambiente produtivo. |
| 9. E possivel comparar antes e depois? | NAO | Nao ha baseline anterior nem periodo posterior validado. |
| 10. Ha dados suficientes para otimizar com seguranca? | NAO | Os coletores ainda dependem de migration, possuem lacunas e nao geraram baseline. |

## Riscos de seguranca e impacto

| Risco | Natureza | Severidade | Probabilidade | Evidencia/avaliacao |
|---|---|---:|---:|---|
| Flush agregado falhar por schema antigo | Demonstrado no codigo | Alta | Alta se o codigo iniciar sem migration | `flushAggregates()` exige colunas de `113`; `ensureTables()` nao altera tabela existente (`metrics.js:332-381`, `435-500`). |
| Texto SQL com literais persistido | Demonstrado no codigo, condicionado a flag | Alta | Baixa a media | `normalizeQuery()` apenas compacta/trunca (`metrics.js:103-115`) e `query_text` e gravado (`311-321`, `428-430`). A flag detalhada e false por padrao. |
| `last_error_code=unknown` em sucesso | Demonstrado no codigo | Media | Alta | `sanitizeLabel("")` retorna `unknown`, usado incondicionalmente em `metrics.js:217-224`. |
| Subnotificacao da espera do pool | Demonstrado no codigo | Media | Alta | `rawQuery()` nao passa por `acquireClient()` (`db.js:103-116`). |
| Aumento de escrita/consultas no banco | Potencial | Media | Media | Flush periodico, agregados, limpeza e painel a cada 30 s; sem medicao de custo. |
| Vazamento de metricas sem autorizacao | Controlado | Alta | Baixa | Dashboard backend exige autenticacao e papel admin (`maintenanceRoutes.js:16`, `65`). |
| Memoria ilimitada | Controlado | Alta | Baixa | Buffers e cardinalidade possuem limites; ainda falta teste de saturacao. |
| Alteracao de RLS/transacoes | Nao demonstrado | Alta | Baixa a media | Ordem estatica preservada em `db.js:151-172`, mas sem teste direcionado. |
| DDL em bootstrap exigir privilegios de owner | Potencial | Media | Media | `ensureTables()` executa DDL no startup (`metrics.js:290-384`); permissao do usuario produtivo e NV. |
| Jobs ou APIs degradarem por instrumentacao | Potencial | Media | Media | Wrappers adicionam ALS e agregacao, sem teste de carga ou integracao real. |

## Estado da observabilidade

O sistema possui uma base tecnica promissora para observabilidade agregada: middleware HTTP, contexto de requisicao, histogramas, dados do pool, spans de duas integracoes e dois jobs, alem de um painel administrativo. Essa base compila e nao quebrou as suites existentes.

Contudo, a capacidade atual de medir performance real e insuficiente. A persistencia depende de uma migration nao validada, o ambiente produtivo nao foi medido, o frontend nao e observado e integracoes/jobs estao apenas parcialmente cobertos. Assim, os numeros que o painel pretende exibir ainda nao podem ser considerados confiaveis.

## Decisao sobre a proxima onda

**NAO APROVADO.**

Os criterios minimos nao foram atendidos como conjunto. Ha codigo para metricas HTTP e visibilidade parcial do PostgreSQL, mas nao ha validacao do schema, baseline de producao, rastreamento completo das integracoes, cobertura basica dos jobs criticos nem evidencia de custo controlado. Iniciar otimizacoes agora faria a Onda 1 operar sobre dados incompletos e potencialmente incorretos.

## Plano de fechamento

1. **Validar a migration `113` em PostgreSQL descartavel.** Testar upgrade de schema existente, flush agregado, indices, permissoes e rollback operacional. Dependencia: banco de teste representativo. Risco: alto.
2. **Adicionar testes direcionados dos coletores.** Cobrir middleware, `X-Request-Id`, P50/P99, cardinalidade, flush, pool, timeout e preservacao de RLS/BEGIN/COMMIT/ROLLBACK. Dependencia: passo 1. Risco: alto.
3. **Eliminar riscos de dados antes de habilitar.** Mascarar literais SQL, corrigir `last_error_code`, cobrir respostas sem `Content-Length` e definir politica configuravel de retencao/amostragem. Dependencia: testes. Risco: alto.
4. **Completar a instrumentacao critica.** Adicionar spans de autenticacao/Playwright/espera/total do serial, demais jobs e frontend (polling, realtime, duplicidade, carga e telas permanentes). Dependencia: modelo de metricas validado. Risco: medio.
5. **Executar ativacao controlada e formar baseline.** Aplicar sob revisao, coletar janela representativa, medir custo da propria instrumentacao e registrar baseline de P50/P95/P99, erros, payloads, pool, integracoes e jobs antes de reconsiderar a Onda 1. Dependencia: passos 1-4 e plano de rollback. Risco: alto.

## Respostas obrigatorias

### 1. A Onda 0 foi implementada ou apenas documentada?

Foi **parcialmente implementada em codigo**, nao apenas documentada. Porem, esta sem commit, sem migration validada, sem configuracao produtiva comprovada e sem evidencias de execucao representativas.

### 2. Qual percentual dos requisitos esta implementado?

`32 / 55 = 58,2%` estao integralmente implementados no codigo: 1 validado e 31 nao validados. Outros `14 / 55 = 25,5%` sao parciais e nao entram no percentual de implementacao integral. `9 / 55 = 16,4%` nao foram implementados.

### 3. O que ja funciona de verdade?

A normalizacao de rotas foi comprovada por teste unitario. O restante compila e passa pelas suites existentes: middleware e agregadores, instrumentacao do pool/queries, wrappers de duas integracoes e dois jobs e ampliacao do painel de manutencao. Isso comprova integridade estatica e ausencia de regressao nas suites, nao operacao real dos coletores.

### 4. O que esta faltando?

Validar schema e flush; obter baseline real; completar etapas da consulta de serial; cobrir todos os caminhos do pool e jobs criticos; instrumentar polling/realtime/frontend; corrigir riscos de dados; e comprovar acesso, responsividade e custo em execucao.

### 5. Quais testes foram executados e aprovados?

`git diff --check`, `node --check` dos arquivos backend, 5 testes de `metrics.test.js`, 22 testes direcionados em 3 arquivos, `npm run verify:retiradas` com 573 testes e build/lint, e `npm run test:contracts` com 11 testes. Todos passaram apos disponibilizar as dependencias ao worktree.

### 6. Ja conseguimos medir a performance real das APIs?

**Nao.** Existe infraestrutura de medicao no codigo, mas a migration, a persistencia e a configuracao de producao nao foram validadas, e nao ha amostras reais representativas.

### 7. Podemos comecar a Onda 1?

**NAO APROVADO.** Faltam confiabilidade dos dados, cobertura critica e baseline. Os riscos de schema e dados precisam ser resolvidos antes de otimizar com seguranca.

### 8. Proximos cinco passos

1. Validar migration e rollback em banco descartavel.
2. Criar testes de coletores, pool e RLS.
3. Corrigir riscos de SQL/erro/resposta e definir retencao/amostragem.
4. Completar integracoes, jobs e frontend.
5. Ativar de forma controlada, medir custo e formar baseline antes da Onda 1.
