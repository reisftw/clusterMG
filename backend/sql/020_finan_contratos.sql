-- Roteiro Finan #6 (Contratos recorrentes) e #7 (Controle de reajustes):
-- cadastro proprio de compromissos financeiros recorrentes (aluguel,
-- softwares, links, seguros...), com historico de reajuste por contrato.
-- Duas tabelas novas, aditivas. fornecedor_id referencia
-- finan_fornecedores mas sem FK dura (mesmo padrao ja usado em
-- finan_orcamento_lancamentos.fornecedor_id — fornecedor pode nao existir
-- ainda no catalogo quando o contrato e cadastrado manualmente).
create table if not exists finan_contratos (
	id text primary key,
	fornecedor_id text,
	nome text not null,
	valor numeric(14, 2) not null default 0,
	periodicidade text not null default 'mensal',
	data_inicio date,
	data_renovacao date,
	indice_reajuste text,
	responsavel_id text,
	responsavel_nome text,
	ativo boolean not null default true,
	observacoes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by_id text,
	created_by_nome text
);

create index if not exists finan_contratos_data_renovacao_idx on finan_contratos (data_renovacao);

create table if not exists finan_contrato_reajustes (
	id text primary key,
	contrato_id text not null references finan_contratos(id) on delete cascade,
	valor_anterior numeric(14, 2) not null,
	valor_novo numeric(14, 2) not null,
	indice text,
	data date not null default current_date,
	criado_por_id text,
	criado_por_nome text,
	created_at timestamptz not null default now()
);

create index if not exists finan_contrato_reajustes_contrato_idx on finan_contrato_reajustes (contrato_id, data desc);
