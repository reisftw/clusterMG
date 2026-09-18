-- Pre-flight para 018_finan_import_layouts.sql
-- SOMENTE LEITURA. Uma tabela nova, aditiva, risco baixo.

\echo '=== 1. Tabela finan_import_layouts ja existe? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name = 'finan_import_layouts';

\echo '=== 2. finan_orcamento_lancamentos existe e tem linhas (referencia, nao FK)? ==='
select count(*)::int as total_lancamentos from finan_orcamento_lancamentos;
