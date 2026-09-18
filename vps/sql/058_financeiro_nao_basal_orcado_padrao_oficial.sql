with official_non_basal_budgets as (
	select jsonb_agg(
		jsonb_build_object(
			'classType', 'nao_basal',
			'categoriaClasse', 'nao_basal',
			'categoryName', category_name,
			'categoriaMae', category_name,
			'accountName', account_name,
			'contaNome', account_name,
			'periodScope', 'monthly_default',
			'planned', planned,
			'orcado', planned,
			'source', '058_financeiro_nao_basal_orcado_padrao_oficial'
		)
		order by ord
	) as items
	from (
		values
			(1, 'Aquisições', 'Veículos', 34000.00::numeric),
			(2, 'Financeiro', 'Consórcio', 33000.00::numeric),
			(3, 'Financeiro', 'Empréstimos bancários', 1600000.00::numeric),
			(4, 'Financeiro', 'Empréstimos c/ partes relacionadas', 0.00::numeric),
			(5, 'Impostos Parcelamento', 'COFINS parcelamento', 9000.00::numeric),
			(6, 'Impostos Parcelamento', 'CSLL parcelamento', 12500.00::numeric),
			(7, 'Impostos Parcelamento', 'ICMS parcelamento', 12000.00::numeric),
			(8, 'Impostos Parcelamento', 'IRPJ parcelamento', 51000.00::numeric),
			(9, 'Impostos Parcelamento', 'PIS parcelamento', 2000.00::numeric)
	) as values_list(ord, category_name, account_name, planned)
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
			where coalesce(item->>'classType', item->>'categoriaClasse') <> 'nao_basal'
		) || official_non_basal_budgets.items,
		true
	) as data
	from existing_meta
	cross join official_non_basal_budgets
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
