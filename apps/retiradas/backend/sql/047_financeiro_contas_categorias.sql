alter table if exists financeiro_contas
	add column if not exists categoria_mae text,
	add column if not exists categoria_classe text;

create index if not exists idx_financeiro_contas_categoria_mae
	on financeiro_contas (categoria_mae);

create index if not exists idx_financeiro_contas_categoria_classe
	on financeiro_contas (categoria_classe);
