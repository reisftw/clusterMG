\echo '--- Preflight 028: finan_anexos ---'

\echo '--- Tabela alvo ja existe? (esperado: nenhuma linha) ---'
select table_name from information_schema.tables where table_name = 'finan_anexos';

\echo '--- Espaco livre estimado (so informativo) ---'
select pg_size_pretty(pg_database_size(current_database())) as db_size_atual;

\echo '--- Fim do preflight 028 ---'
