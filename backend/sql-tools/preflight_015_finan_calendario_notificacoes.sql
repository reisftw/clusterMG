-- Pre-flight para 015_finan_calendario_notificacoes.sql
-- SOMENTE LEITURA. Tabela nova, aditiva, risco baixo.

\echo '=== 1. Tabela finan_calendar_event_notifications ja existe? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name = 'finan_calendar_event_notifications';
