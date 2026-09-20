\echo '--- Preflight 039: dre_lancamentos ---'

\echo '--- Tabela alvo ja existe? (esperado: nenhuma linha) ---'
select table_name from information_schema.tables where table_name = 'dre_lancamentos';

\echo '--- touch_updated_at() existe (esperado: 1 linha, criada em 006)? ---'
select proname from pg_proc where proname = 'touch_updated_at';

\echo '--- Espaco livre estimado (so informativo) ---'
select pg_size_pretty(pg_database_size(current_database())) as db_size_atual;

\echo '--- Fim do preflight 039 ---'
