\echo '--- Preflight 026: fornecedor_nome em finan_notas_fiscais ---'
select column_name from information_schema.columns
where table_name = 'finan_notas_fiscais' and column_name = 'fornecedor_nome';

\echo '--- Preflight 027: seed da integracao brasilapi (esperado: 0 linhas, ainda nao existe) ---'
select id, provider, name, status from finan_integration_configs where id = 'brasilapi';

\echo '--- Confirma que finan_integration_configs existe e tem as colunas esperadas ---'
select count(*) from finan_integration_configs;

\echo '--- Fim ---'
