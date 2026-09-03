with project_launches as (
	select
		id,
		substring(source_payload->>'observacoes' from 'Dt prev pgto: ([0-9]{4}-[0-9]{2}-[0-9]{2})')::date as due_date
	from financeiro_orcamento_lancamentos
	where source_payload->>'layoutOrigem' = 'FPCP302'
		and source_payload->>'observacoes' ~ 'Dt prev pgto: [0-9]{4}-[0-9]{2}-[0-9]{2}'
		and (
			source_payload->>'nomeCc' ilike any (array[
				'%projeto%',
				'%projetos%',
				'%software%',
				'%nova loja%',
				'%dwdm%',
				'%expans%',
				'%reforma%',
				'%vex%',
				'%swap zte%',
				'%teleporto%',
				'%hps%',
				'%constru%',
				'%novas portas%',
				'%campo belo%',
				'%sete lagoas%'
			])
			or source_payload->>'titulo' ilike any (array[
				'%projeto%',
				'%projetos%',
				'%software%',
				'%nova loja%',
				'%dwdm%',
				'%expans%',
				'%reforma%',
				'%vex%',
				'%swap zte%',
				'%teleporto%',
				'%hps%',
				'%constru%',
				'%novas portas%',
				'%campo belo%',
				'%sete lagoas%'
			])
		)
),
normalized as (
	select
		id,
		due_date,
		extract(year from due_date)::integer as year_value,
		extract(month from due_date)::integer as month_value,
		case extract(month from due_date)::integer
			when 1 then 'Janeiro'
			when 2 then 'Fevereiro'
			when 3 then 'Marco'
			when 4 then 'Abril'
			when 5 then 'Maio'
			when 6 then 'Junho'
			when 7 then 'Julho'
			when 8 then 'Agosto'
			when 9 then 'Setembro'
			when 10 then 'Outubro'
			when 11 then 'Novembro'
			when 12 then 'Dezembro'
			else ''
		end as month_name
	from project_launches
	where due_date is not null
)
update financeiro_orcamento_lancamentos lancamento
set
	data = normalized.due_date,
	ano = normalized.year_value,
	mes = normalized.month_value,
	source_payload = coalesce(lancamento.source_payload, '{}'::jsonb) || jsonb_build_object(
		'data', normalized.due_date::text,
		'ano', normalized.year_value,
		'numMes', normalized.month_value,
		'mes', normalized.month_name,
		'periodoCorrigidoPor', '052_financeiro_projetos_fpcp302_periodo'
	),
	updated_at = now()
from normalized
where lancamento.id = normalized.id
	and (
		lancamento.data is distinct from normalized.due_date
		or lancamento.ano is distinct from normalized.year_value
		or lancamento.mes is distinct from normalized.month_value
	);
