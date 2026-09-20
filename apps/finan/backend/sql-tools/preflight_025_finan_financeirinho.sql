\echo '--- Preflight 025: finan_financeirinho_conversas + finan_financeirinho_mensagens ---'

\echo '--- Tabelas alvo ja existem? (esperado: nenhuma linha) ---'
select table_name from information_schema.tables
where table_name in ('finan_financeirinho_conversas', 'finan_financeirinho_mensagens');

\echo '--- finan_users existe (FK de conversas.user_id)? ---'
select count(*) from finan_users;

\echo '--- Fim do preflight 025 ---'
