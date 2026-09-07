-- Pre-flight para 014_finan_calendario_cargos_avisados.sql
-- SOMENTE LEITURA. Aditiva (colunas novas com default), risco baixo.

\echo '=== 1. Coluna notify_role_ids ja existe em finan_financial_events? (esperado: 0 linhas) ==='
select column_name from information_schema.columns
where table_name = 'finan_financial_events' and column_name = 'notify_role_ids';

\echo '=== 2. Coluna notify_role_ids ja existe em finan_calendar_event_rules? (esperado: 0 linhas) ==='
select column_name from information_schema.columns
where table_name = 'finan_calendar_event_rules' and column_name = 'notify_role_ids';
