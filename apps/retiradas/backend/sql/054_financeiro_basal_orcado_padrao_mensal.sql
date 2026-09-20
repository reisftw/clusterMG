with current_meta as (
	select coalesce(data, '{}'::jsonb) as data
	from financeiro_config_meta
	where config_id = 'orcamento_centros_custo'
),
basal_august as (
	select jsonb_agg(
		(item - 'year' - 'ano' - 'month' - 'mes' - 'numMes' - 'referenceYear' - 'referenceMonth')
		|| jsonb_build_object(
			'periodScope', 'monthly_default',
			'source', '054_financeiro_basal_orcado_padrao_mensal'
		)
		order by item->>'categoryName', item->>'accountName'
	) as items
	from current_meta
	cross join lateral jsonb_array_elements(
		coalesce(current_meta.data #> '{settings,financialCategoryBudgets}', '[]'::jsonb)
	) as source_items(item)
	where coalesce(item->>'source', '') = '053_financeiro_basal_agosto_2026_orcado'
		and coalesce(item->>'classType', item->>'categoriaClasse') = 'basal'
		and coalesce(item->>'year', item->>'ano') = '2026'
		and coalesce(item->>'month', item->>'mes', item->>'numMes') = '8'
),
prepared_meta as (
	select jsonb_set(
		current_meta.data,
		'{settings,financialCategoryBudgets}',
		(
			select coalesce(jsonb_agg(item), '[]'::jsonb)
			from jsonb_array_elements(
				coalesce(current_meta.data #> '{settings,financialCategoryBudgets}', '[]'::jsonb)
			) as preserved(item)
			where coalesce(item->>'source', '') <> '054_financeiro_basal_orcado_padrao_mensal'
		) || coalesce(basal_august.items, '[]'::jsonb),
		true
	) as data
	from current_meta
	cross join basal_august
)
update financeiro_config_meta
set
	data = prepared_meta.data,
	source_payload = prepared_meta.data,
	updated_at = now()
from prepared_meta
where financeiro_config_meta.config_id = 'orcamento_centros_custo'
	and coalesce(jsonb_array_length(coalesce(prepared_meta.data #> '{settings,financialCategoryBudgets}', '[]'::jsonb)), 0) > 0;
