# Etapa 1 - Diagnostico

## Classificacao da evidencia

- **Medido:** agregado de producao, plano PostgreSQL ou teste deterministico.
- **Estatico:** comportamento confirmado pela leitura do codigo.
- **Hipotese:** explicacao plausivel ainda sem medicao suficiente.

## Endpoints prioritarios

### `/api/integrations/sempre/equipment/serial`

Fluxo: rota Express -> `equipmentSerialLookup.lookupBySerial` -> AutoISP ->
HubSoft web API -> fallback Playwright.

- **Estatico:** a API HubSoft nao possuia timeout explicito no `fetch`.
- **Estatico:** duas consultas simultaneas do mesmo serial executavam todo o
  fluxo novamente.
- **Estatico:** duas consultas simultaneas com token vencido podiam abrir dois
  logins Playwright para o mesmo usuario HubSoft.
- **Estatico:** sessoes AutoISP e HubSoft ja tinham reaproveitamento por 20 min.
- **Medido:** nao houve chamada desta rota na janela de 24 horas; latencia real
  e taxa de fallback nao podem ser afirmadas.

Causa confirmada de risco: ausencia de limite no `fetch` e falta de single-flight
na renovacao de autenticacao e na mesma consulta. Correcao aplicada sem cachear
resultado operacional.

### `/api/acompanhamento/resumo`

Fluxo: rota publica -> cache de 60 s -> sete leituras paralelas -> compactacao ->
serializacao JSON.

- **Medido:** 2.474 chamadas/24h, media 523,85 ms e P95 aproximado <=2,5 s.
- **Medido:** payload de 463.588 bytes; MISS 2,002 s e HITs de 0,121/0,151 s.
- **Estatico:** backend ja possui cache e single-flight corretos.
- **Estatico:** o hook fazia uma carga inicial e outra carga forcada 750 ms
  depois, mesmo sem mudanca de versao.

Causa confirmada de trabalho redundante: uma montagem da tela gerava duas
requisicoes. A segunda foi removida; atualizacao por realtime, `refreshKey` e o
intervalo configurado de 60 s permanecem.

### `/api/agendamentos/`

Fluxo: autenticacao/RBAC -> listagem paginada em blocos de 1.000 -> tabela
normalizada `agendamentos` -> mapeamento para contrato legado.

- **Medido:** 3.127 chamadas/24h, media 150,59 ms e P95 <=500 ms.
- **Medido:** a tabela atual possui 606 linhas e a consulta completa levou
  2,249 ms; a consulta diaria levou 0,062 ms com indice.
- **Estatico:** a UI solicita o conjunto completo para telas que calculam
  indicadores e detectam novos agendamentos.

Conclusao: a ordenacao SQL nao e o gargalo atual. A paginacao sequencial pode
virar custo quando ultrapassar 1.000 linhas, mas alterar contrato ou cachear
status de agendamento seria risco operacional. Nenhuma mudanca foi aplicada.

### `/api/documents`

Fluxo: autenticacao/RBAC -> repositorio de dominio ou `app_documents` -> filtros
de regional/empresa/gestao -> contrato legado.

- **Medido:** 3.167 chamadas/24h, media 102,82 ms e P95 <=500 ms.
- **Medido:** planos SELECT avaliados variaram de 2,137 ms a 36,230 ms.
- **Estatico:** ja existe cache curto de 5 s e single-flight por consulta.
- **Estatico:** a rota agrega colecoes distintas, portanto sua metrica nao
  identifica qual colecao gerou os outliers.

Conclusao: nao ha evidencia suficiente para um indice ou cache adicional. A
Etapa 2 deve acrescentar rotulo de colecao com cardinalidade controlada ou uma
medicao temporaria antes de otimizar esta rota.

## Rotas criticas adicionais

Medidas desde a Onda 0:

| Rota | Chamadas | Media | Maximo | SQL/chamada |
|---|---:|---:|---:|---:|
| `/api/tentativas/admin/analytics` | 5 | 4.878,55 ms | 6.239,21 ms | 54,8 |
| `/api/tentativas/admin/distribuicao` | 3 | 3.414,91 ms | 3.583,88 ms | 10,3 |
| `/api/webhooks/evolution` | 100 | 2.210,89 ms | 5.152,11 ms | 17,3 |
| `/api/public/static/dashboard` | 25 | 1.503,50 ms | 2.795,22 ms | 7,4 |
| `/api/maps/admin/monitoring/overview` | 260 | 662,18 ms | 7.746,49 ms | 15,7 |
| `/api/acompanhamento/operational-summary` | 501 | 418,14 ms | 3.876,12 ms | 31,4 |

Essas rotas possuem impacto maior, mas mudar Tentativas, Evolution ou Maps junto
com a Etapa 1 aumentaria o raio de regressao. Elas ficam priorizadas para a
Etapa 2 com benchmark proprio.

## Pool e estabilidade

- Pool configurado com maximo padrao 10, timeout de aquisicao 5 s e handler de
  erro em conexao ociosa.
- Espera media medida de 1,02 ms, sem timeout: nao ha evidencia para aumentar o
  pool.
- Transacoes RLS tiveram media 77,03 ms e maximo anomalo de 213 s. O agregado
  nao permite ligar o outlier a uma query; investigar por job/rota antes de
  alterar seguranca ou contexto.

## Hipoteses nao implementadas

- indice composto em `app_documents(collection_path, document_id)`;
- indice de ordenacao em `agendamentos`;
- cache adicional de agendamentos/status;
- paralelizacao de AutoISP e HubSoft, pois a segunda consulta depende do login
  radius retornado pela primeira;
- aumento do pool PostgreSQL.

Faltou evidencia para justificar essas mudancas com seguranca.
