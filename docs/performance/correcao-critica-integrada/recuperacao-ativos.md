# Recuperacao de ativos

## Consultas

- Removida a conciliacao sincrona das cinco rotas GET.
- A conciliacao passa a executar em job incremental persistido, com alvo de ate cinco minutos.
- A pagina informa separadamente a ultima sincronizacao HubSoft e a ultima conciliacao concluida.
- Snapshots e associacoes de movimentacao sao gravados em lotes.

## Tecnicos

- Paginacao SQL real, inicial em 25 registros.
- Limites aceitos: 25, 50 e 100.
- Pesquisa por nome no PostgreSQL.
- Ordenacao estavel por metrica, nome e chave.
- Total e quantidade de paginas retornados pela API.
- A busca de tecnicos nao recarrega os outros cinco blocos da pagina.
- Rankings locais estao identificados como referentes a pagina visivel.

O contrato da rota `/api/equipment-recovery/technicians` agora retorna `items`, `page`, `limit`, `total` e `totalPages`.
