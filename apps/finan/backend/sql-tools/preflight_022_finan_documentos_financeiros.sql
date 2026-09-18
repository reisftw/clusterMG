-- Pre-flight para 022_finan_documentos_financeiros.sql
-- SOMENTE LEITURA. Quatro tabelas novas, aditivas, risco baixo.

\echo '=== 1. Tabelas ja existem? (esperado: 0 linhas) ==='
select table_name from information_schema.tables
where table_name in ('finan_notas_fiscais', 'finan_contas_pagar', 'finan_contas_receber', 'finan_documentos_entrada');

\echo '=== 2. finan_fornecedores existe (referencia, nao FK)? ==='
select count(*)::int as total_fornecedores from finan_fornecedores;
