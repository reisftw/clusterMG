# Auditoria PostgreSQL

Baseline reaproveitado da coleta segura de 2026-11-03: PostgreSQL 16.15, banco com 7.269 MB, pool máximo 10, espera média de 0,95 ms e nenhum timeout na janela original.

Achados que não serão alterados nesta publicação:

- `audit_logs`: aproximadamente 5,2 GB, dos quais cerca de 5,1 GB são TOAST. Há 47.924 registros e payloads individuais grandes. Nenhum registro será apagado, truncado, reescrito ou substituído por hash nesta entrega.
- `app_sessions`: aproximadamente 625 mil sessões ativas para 25 usuários. A revogação exige desenho por dispositivo, abas concorrentes e período de tolerância; foi adiada.
- `pg_stat_statements` não está instalado. Não haverá reinício ou alteração global do PostgreSQL nesta entrega.

Qualquer retenção futura de auditoria exige backup restaurável verificado, regra de retenção aprovada e ensaio de restauração.
