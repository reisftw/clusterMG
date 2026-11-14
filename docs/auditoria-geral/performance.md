# Performance

## Melhorias aplicadas

- Maps ignora respostas obsoletas e cancela navegacoes antigas.
- Recalculo de rota exige deslocamento de 15 m ou intervalo de 10 s.
- Runner de migrations abandona rapidamente locks concorrentes em vez de manter publicacao presa.

## Baseline verificavel

O build produz chunks grandes ja existentes, incluindo ExcelJS acima de 1 MB, e alerta para chunks acima de 500 kB. Nao houve divisao artificial nesta entrega porque faltava medicao de uso e risco funcional.

## Validacao em producao

Comparar por janela equivalente: P50/P95/P99 e 5xx de Maps, espera do pool, chamadas de navegacao por tecnico e duracao do deploy. O objetivo e reduzir chamadas redundantes sem mudar a idade dos snapshots ou a frequencia dos jobs.

Pendencias com maior retorno: atualizacao incremental de marcadores e paginacao SQL real em leituras que hoje carregam um conjunto amplo antes de cortar.

