with official_project_budgets as (
	select jsonb_agg(
		jsonb_build_object(
			'classType', 'projetos',
			'categoriaClasse', 'projetos',
			'categoryName', project_name,
			'categoriaMae', project_name,
			'accountName', 'Orçamento do projeto',
			'contaNome', 'Orçamento do projeto',
			'startYear', 2026,
			'anoInicio', 2026,
			'startMonth', 8,
			'mesInicio', 8,
			'periodScope', 'project_range',
			'planned', planned,
			'orcado', planned,
			'source', '059_financeiro_projetos_orcado_oficial'
		)
		order by ord
	) as items
	from (
		values
			(1, 'Ecossistema de softwares', 0.00::numeric),
			(2, 'Nova Loja Sete Lagoas', 0.00::numeric),
			(3, 'Ampliação DWDM Rio X São Paulo', 0.00::numeric),
			(4, 'Expansão de Rede 2025 (40.000 HP)', 0.00::numeric),
			(5, 'Desenvolvimento de Software', 0.00::numeric),
			(6, 'Projeto Seplag', 460000.00::numeric),
			(7, 'Reforma Filial de Campo Belo', 0.00::numeric),
			(8, 'Projeto VEX', 0.00::numeric),
			(9, 'Swap ZTE - 2025', 0.00::numeric),
			(10, 'Adequação Teleporto 2025', 0.00::numeric),
			(11, 'Fase 1 HPs 2026', 1200000.00::numeric),
			(12, 'Construção de Novas Portas 2026', 2400000.00::numeric)
	) as values_list(ord, project_name, planned)
),
existing_meta as (
	select coalesce(data, '{}'::jsonb) as data
	from financeiro_config_meta
	where config_id = 'orcamento_centros_custo'
	union all
	select '{}'::jsonb
	where not exists (
		select 1
		from financeiro_config_meta
		where config_id = 'orcamento_centros_custo'
	)
),
prepared_meta as (
	select jsonb_set(
		jsonb_set(data, '{settings}', coalesce(data->'settings', '{}'::jsonb), true),
		'{settings,financialCategoryBudgets}',
		(
			select coalesce(jsonb_agg(item), '[]'::jsonb)
			from jsonb_array_elements(
				coalesce(data #> '{settings,financialCategoryBudgets}', '[]'::jsonb)
			) as preserved(item)
			where coalesce(item->>'classType', item->>'categoriaClasse') <> 'projetos'
		) || official_project_budgets.items,
		true
	) as data
	from existing_meta
	cross join official_project_budgets
	limit 1
)
insert into financeiro_config_meta (
	config_id,
	data,
	legacy_path,
	legacy_document_id,
	source_payload
)
select
	'orcamento_centros_custo',
	data,
	'financeiro_config/orcamento_centros_custo',
	'orcamento_centros_custo',
	data
from prepared_meta
on conflict (config_id) do update set
	data = excluded.data,
	legacy_path = excluded.legacy_path,
	legacy_document_id = excluded.legacy_document_id,
	source_payload = excluded.source_payload,
	updated_at = now();
