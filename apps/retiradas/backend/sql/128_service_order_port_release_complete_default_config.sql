update service_order_port_release_config
set
	company_name = case
		when nullif(btrim(company_name), '') is null then 'Padrao'
		else company_name
	end,
	source_types = case
		when coalesce(jsonb_typeof(source_types), 'null') <> 'array' or jsonb_array_length(source_types) = 0 then
			'[{"id":1487,"name":"CANCELAMENTO FTTH"},{"id":1488,"name":"CANCELAMENTO LOJA"},{"id":1495,"name":"RETIRADA & CANCELAMENTO - SEGUNDA TENTATIVA"},{"id":5,"name":"RETIRADA FTTH"},{"id":1493,"name":"RETIRADA - OUTROS"},{"id":1496,"name":"CANCELAMENTO - OUTROS"}]'::jsonb
		else source_types
	end,
	target_type = case
		when coalesce(target_type->>'id', '') !~ '^[1-9][0-9]*$' then
			'{"id":1490,"name":"LIBERACAO DE PORTAS"}'::jsonb
		else target_type
	end,
	open_statuses = case
		when coalesce(cardinality(open_statuses), 0) = 0 then
			array['aguardando_agendamento', 'pendente']
		else open_statuses
	end,
	updated_at = now(),
	updated_by = 'system:migration-128'
where company_key = 'DEFAULT'
	and (
		nullif(btrim(company_name), '') is null
		or coalesce(jsonb_typeof(source_types), 'null') <> 'array'
		or jsonb_array_length(source_types) = 0
		or coalesce(target_type->>'id', '') !~ '^[1-9][0-9]*$'
		or coalesce(cardinality(open_statuses), 0) = 0
	);
