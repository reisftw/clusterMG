# Etapa 2 - APIs

## Alteracoes

### Gestao de Tentativas

`listDistribution` preserva o contrato e os filtros, mas usa a consulta
pre-agregada documentada em `etapa-2-sql.md`. O ganho principal ocorre no banco
e reduz o tempo em que uma conexao fica ocupada.

### Resumo operacional

`GET /api/acompanhamento/operational-summary` executava cerca de 15,57
consultas por chamada. Chamadas simultaneas da mesma data agora compartilham a
mesma Promise e o resultado recebe cache local de 15 segundos.

O cache:

- usa a data como chave;
- nao mistura usuarios ou dados privados (a resposta e um indicador global);
- nao altera o contrato;
- expira rapidamente, antes do intervalo normal de atualizacao do mapa;
- nao persiste entre processos ou reinicios.

### Etapa 1 incorporada

Como `412eb7f` ainda nao estava em producao, esta release tambem inclui:

- remocao da requisicao duplicada no acompanhamento;
- consolidacao de consultas simultaneas ao mesmo serial;
- consolidacao da autenticacao HubSoft concorrente;
- timeout HTTP de 30 segundos no HubSoft.

## Sem alteracao

Nao houve mudanca de payload, RBAC, autenticacao, regra de O.S., regionalizacao,
agendamento, recuperacao de ativos ou periodicidade de job. Nao houve ajuste do
pool porque as medicoes nao mostraram saturacao.
