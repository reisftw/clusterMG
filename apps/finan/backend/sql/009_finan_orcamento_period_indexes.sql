create index if not exists idx_finan_lancamentos_periodo_dimensoes
	on finan_orcamento_lancamentos (
		ano,
		mes,
		centro_custo_id,
		conta_id,
		empresa_id,
		filial_id
	);

create index if not exists idx_finan_matriz_periodo_dimensoes
	on finan_orcamento_matriz (
		ano,
		mes,
		centro_custo_id,
		conta_id
	);
