-- Cadastra a BrasilAPI como mais um provider monitorado na tela de
-- Integrações (mesmo padrão de Hubsoft/Cvortex/Sênior — status
-- online/offline via "Testar conexão", ver integrations/routes.js). Sem
-- credenciais (API publica, sem chave), so baseUrl + endpoint de teste.
insert into finan_integration_configs (id, provider, name, status, config)
values (
	'brasilapi',
	'brasilapi',
	'BrasilAPI',
	'ativo',
	'{"baseUrl":"https://brasilapi.com.br/api","statusEndpoint":"/taxas/v1"}'::jsonb
)
on conflict (id) do nothing;
