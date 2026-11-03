# Etapa 1 - Alteracoes

## Implementado

### Uma requisicao inicial no acompanhamento

Removida a atualizacao forcada executada 750 ms depois da primeira carga do
`useAcompanhamentoResumoData`.

Permanecem ativos:

- primeira carga da tela;
- atualizacao via realtime;
- atualizacao por `refreshKey`;
- intervalo de atualizacao explicitamente configurado pela pagina.

Resultado deterministico: uma montagem sem evento externo passou de duas para
uma requisicao (`-50%` de chamadas iniciais).

### Single-flight na consulta por serial

Consultas simultaneas para o mesmo serial agora compartilham a mesma Promise.
Renovacoes simultaneas da mesma autenticacao HubSoft tambem compartilham um
unico login. O resultado nao e armazenado depois da conclusao, portanto nao ha
risco de exibir status antigo.

Resultado deterministico: duas chamadas concorrentes da mesma chave executam
um loader externo em vez de dois (`-50%` de trabalho externo nesse cenario).

### Timeout HubSoft

O `fetch` da API web HubSoft agora usa timeout de 30 segundos. O fallback
existente para a interface web continua sendo executado em caso de falha.

## Nao alterado

- contratos HTTP, payloads e codigos de status;
- autenticacao, autorizacao e RBAC;
- regras de agendamento, OS, estoque e recuperacao;
- TTLs de dados operacionais;
- schema PostgreSQL e migrations;
- configuracao de pool;
- jobs MATCH/MAPA;
- deploy e producao.

## Arquivos modificados

- `apps/retiradas/backend/api/src/equipmentSerialLookup.js`
- `apps/retiradas/frontend/src/pages/Acompanhamento/hooks/useAcompanhamentoResumoData.js`
- `apps/retiradas/frontend/src/backend/equipmentSerialLookup.test.js`
- `apps/retiradas/frontend/src/pages/Acompanhamento/hooks/useAcompanhamentoResumoData.test.jsx`
- `docs/performance/etapa-1-*.md`

## Impacto por modulo

Somente Retiradas. Mercado compartilha backend, mas os endpoints e a tela
alterados nao pertencem ao portal Mercado. Operacao, ADM e Financeiro nao foram
modificados.
