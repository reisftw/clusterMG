update finan_roles
set permissions = (
	select jsonb_agg(distinct permission order by permission)
	from jsonb_array_elements_text(
		permissions ||
		case
			when id in ('admin', 'coordenador_financeiro') then
				'["relatorios_financeiros:visualizar","relatorios_financeiros:gerenciar"]'::jsonb
			when id = 'analista_financeiro' then
				'["relatorios_financeiros:visualizar"]'::jsonb
			else
				'[]'::jsonb
		end
	) as merged(permission)
)
where id in ('admin', 'coordenador_financeiro', 'analista_financeiro');
