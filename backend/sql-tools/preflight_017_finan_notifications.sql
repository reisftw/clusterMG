-- Pre-flight para 017_finan_notifications.sql
-- SOMENTE LEITURA. Duas tabelas novas, aditivas, risco baixo.

\echo '=== 1. Tabelas finan_notifications / finan_notification_preferences ja existem? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name in ('finan_notifications', 'finan_notification_preferences');

\echo '=== 2. finan_users existe e tem linhas (necessario para a FK de finan_notification_preferences)? ==='
select count(*)::int as total_usuarios from finan_users;
