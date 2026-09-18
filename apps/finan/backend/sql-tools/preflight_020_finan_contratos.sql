-- Pre-flight para 020_finan_contratos.sql
-- SOMENTE LEITURA. Duas tabelas novas, aditivas, risco baixo.

\echo '=== 1. Tabelas finan_contratos / finan_contrato_reajustes ja existem? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name in ('finan_contratos', 'finan_contrato_reajustes');

\echo '=== 2. finan_fornecedores existe e tem linhas (referencia, nao FK)? ==='
select count(*)::int as total_fornecedores from finan_fornecedores;
