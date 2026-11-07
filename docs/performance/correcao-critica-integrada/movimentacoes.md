# Movimentacoes

## Implementado

- Normalizacao de inicio e fim de datas no fuso `America/Sao_Paulo`.
- Intervalos diarios, semanais, mensais, anuais e personalizados atravessando meses.
- Janela incremental padrao de 48 horas para sobreposicao segura.
- Janelas historicas de 15 dias com paginacao completa.
- Checkpoint persistente por janela e retomada de job falho para o mesmo periodo.
- Upsert idempotente que tambem atualiza dados de origem alterados.
- Contadores separados de notas processadas, ignoradas e rejeitadas.
- Job truncado por limite de paginas passa a falhar, nunca a concluir falsamente.
- Recuperacao controlada de 01/10/2026 ate o dia atual de novembro, executada uma unica vez e sem sobreposicao.
- A rotina diaria so grava sucesso depois da conclusao real.

## Caso obrigatorio

O intervalo `28/10/2026` a `03/11/2026` e normalizado para `2026-10-28T00:00:00-03:00` ate `2026-11-03T23:59:59.999-03:00`, coberto por teste automatizado.

Nao ha `DELETE` ou `TRUNCATE`; a chave existente continua sendo usada para impedir duplicacao.
