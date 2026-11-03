# Etapa 2 - SQL

## Distribuicao de Tentativas

A consulta antiga cruzava 516 locks de bairro com 14.222 oportunidades antes
de aplicar a igualdade do bairro normalizado. O plano removia 7.348.870 linhas
no filtro e executava em 3.760,8 ms.

A consulta nova normaliza e agrega as oportunidades uma unica vez por cidade e
bairro em uma CTE materializada. O join final trabalha com 516 locks e 2.022
grupos agregados.

Plano medido no mesmo banco:

| Versao | Tempo | Linhas descartadas no join |
|---|---:|---:|
| Anterior | 3.760,8 ms | 7.348.870 |
| Otimizada | 188,3 ms | 96 |

Reducao observada nessa execucao: 95,0%. Ela nao e extrapolada para a latencia
HTTP antes de amostra de producao equivalente.

## Equivalencia

Os resultados foram comparados em uma transacao `READ ONLY` com `EXCEPT ALL`
nas duas direcoes:

- anterior menos nova: 0 linhas;
- nova menos anterior: 0 linhas.

Os filtros de ativo, telefone valido, status, cidade, bairro e proprietario
foram preservados. A resposta da API e seus nomes de campo nao mudaram.

## Consultas sem alteracao

- Agendamentos completo: plano medido em 2,249 ms.
- Agendamentos do dia: 0,062 ms usando indice existente.
- Documentos prioritarios: cache e singleflight ja existentes.
- Busca de serial: sem amostra produtiva; a Etapa 1 adiciona timeout e
  consolidacao concorrente.

Criar mais SQL ou indices nesses caminhos sem evidencia aumentaria custo de
escrita sem ganho demonstrado.
