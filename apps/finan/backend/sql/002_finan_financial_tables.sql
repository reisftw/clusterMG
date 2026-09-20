create table if not exists finan_contas (
	id text primary key,
	codigo text,
	nome text not null,
	tipo text,
	grupo text,
	status text,
	parent_id text,
	categoria_mae text,
	categoria_classe text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists finan_diretorias (
	id text primary key,
	nome text not null,
	diretor_nome text,
	diretor_email text,
	diretor_numero text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists finan_centros_custo (
	id text primary key,
	codigo text,
	nome text not null,
	tipo_centro text,
	parent_id text,
	diretoria_id text,
	status text,
	tipo_despesa text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists finan_fornecedores (
	id text primary key,
	codigo text,
	nome text not null,
	cnpj text,
	status text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists finan_matrizes (
	id text primary key,
	nome text not null,
	nome_fantasia text,
	cidade text,
	cnpj text,
	status text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists finan_filiais (
	id text not null,
	matriz_id text not null,
	nome text not null,
	nome_fantasia text,
	cidade text,
	cnpj text,
	status text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb,
	primary key (matriz_id, id)
);

create table if not exists finan_orcamento_matriz (
	id uuid primary key,
	ano integer not null,
	mes integer not null,
	conta_id text,
	centro_custo_id text,
	versao_id text not null default 'budget',
	orcado numeric(14, 2) not null default 0,
	realizado numeric(14, 2) not null default 0,
	comprometido numeric(14, 2) not null default 0,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb,
	unique (ano, mes, conta_id, centro_custo_id, versao_id)
);

create table if not exists finan_orcamento_lancamentos (
	id text primary key,
	ano integer,
	mes integer,
	data date,
	conta_id text,
	centro_custo_id text,
	fornecedor_id text,
	empresa_id text,
	filial_id text,
	orcado numeric(14, 2) not null default 0,
	realizado numeric(14, 2) not null default 0,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists finan_config_meta (
	config_id text primary key,
	data jsonb not null default '{}'::jsonb,
	legacy_path text unique,
	legacy_document_id text,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists finan_equipe_setores (
	id uuid primary key,
	nome text not null,
	descricao text,
	cor text,
	responsavel_id uuid null,
	ordem integer not null default 0,
	created_by text,
	updated_by text,
	created_at timestamptz,
	updated_at timestamptz
);

create table if not exists finan_equipe_cargos (
	id uuid primary key,
	nome text not null,
	setor text,
	setor_id uuid null,
	descricao text,
	ordem integer not null default 0,
	created_by text,
	updated_by text,
	created_at timestamptz,
	updated_at timestamptz
);

create table if not exists finan_equipe_colaboradores (
	id uuid primary key,
	setor text,
	nome text not null,
	cargo_id uuid,
	formacao text,
	atividades text,
	gestor_id uuid,
	avatar_url text,
	pos_x numeric,
	pos_y numeric,
	ordem integer not null default 0,
	ativo boolean not null default true,
	created_by text,
	updated_by text,
	created_at timestamptz,
	updated_at timestamptz
);

create table if not exists finan_equipe_config (
	id text primary key default 'global',
	responsavel_geral_id uuid null,
	created_at timestamptz,
	updated_at timestamptz,
	created_by text,
	updated_by text
);

create index if not exists idx_finan_contas_codigo on finan_contas (codigo);
create index if not exists idx_finan_contas_categoria_mae on finan_contas (categoria_mae);
create index if not exists idx_finan_contas_categoria_classe on finan_contas (categoria_classe);
create index if not exists idx_finan_centros_codigo on finan_centros_custo (codigo);
create index if not exists idx_finan_centros_diretoria on finan_centros_custo (diretoria_id);
create index if not exists idx_finan_lancamentos_periodo on finan_orcamento_lancamentos (ano, mes, data);
create index if not exists idx_finan_lancamentos_conta on finan_orcamento_lancamentos (conta_id);
create index if not exists idx_finan_lancamentos_centro on finan_orcamento_lancamentos (centro_custo_id);
