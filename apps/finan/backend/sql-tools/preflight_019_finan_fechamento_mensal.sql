-- Pre-flight para 019_finan_fechamento_mensal.sql
-- SOMENTE LEITURA. Uma tabela nova, aditiva, risco baixo.

\echo '=== 1. Tabela finan_fechamentos_mensais ja existe? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name = 'finan_fechamentos_mensais';
