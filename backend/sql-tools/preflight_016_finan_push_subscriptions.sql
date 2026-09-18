-- Pre-flight para 016_finan_push_subscriptions.sql
-- SOMENTE LEITURA. Tabela nova, aditiva, risco baixo.

\echo '=== 1. Tabela finan_push_subscriptions ja existe? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name = 'finan_push_subscriptions';
