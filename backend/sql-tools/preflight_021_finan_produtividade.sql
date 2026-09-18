-- Pre-flight para 021_finan_produtividade.sql
-- SOMENTE LEITURA. Tres tabelas novas, aditivas, risco baixo.

\echo '=== 1. Tabelas ja existem? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name in ('finan_metas', 'finan_user_preferences', 'finan_indicadores');

\echo '=== 2. finan_users existe e tem linhas (FK de finan_user_preferences)? ==='
select count(*)::int as total_usuarios from finan_users;
