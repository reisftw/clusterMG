\echo '--- Preflight 024: indices em finan_documentos_entrada(status) e finan_contas_pagar(nota_id) ---'
\echo 'Confirma que as tabelas existem e os indices ainda NAO existem (create index if not exists e idempotente, mas confirmamos mesmo assim).'

\echo '--- Tabelas alvo existem? ---'
select table_name from information_schema.tables
where table_name in ('finan_documentos_entrada', 'finan_contas_pagar')
order by table_name;

\echo '--- Indices ja existentes nessas tabelas (esperado: nenhum com esses 2 nomes ainda) ---'
select indexname, tablename from pg_indexes
where tablename in ('finan_documentos_entrada', 'finan_contas_pagar')
order by tablename, indexname;

\echo '--- Volume atual (so pra referencia, indice e barato de qualquer forma) ---'
select 'finan_documentos_entrada' as tabela, count(*) from finan_documentos_entrada
union all
select 'finan_contas_pagar', count(*) from finan_contas_pagar;

\echo '--- Fim do preflight 024 ---'
