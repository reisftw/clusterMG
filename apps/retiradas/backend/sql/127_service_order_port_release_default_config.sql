insert into service_order_port_release_config (
	company_key,
	company_name,
	source_types,
	target_type,
	open_statuses,
	batch_limit,
	concurrency,
	updated_by
)
select
	'DEFAULT',
	'Padrao',
	'[{"id":1487,"name":"RETIRADA FTTH"},{"id":1488,"name":"RETIRADA & CANCELAMENTO - SEGUNDA TENTATIVA"},{"id":1495,"name":"CANCELAMENTO FTTH"},{"id":5,"name":"CANCELAMENTO LOJA"},{"id":1493,"name":"RETIRADA - OUTROS"},{"id":1496,"name":"CANCELAMENTO - OUTROS"}]'::jsonb,
	'{"id":1490,"name":"LIBERACAO DE PORTAS"}'::jsonb,
	array['aguardando_agendamento', 'pendente'],
	500,
	2,
	'system:migration-127'
where not exists (select 1 from service_order_port_release_config);
