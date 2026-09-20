create extension if not exists pgcrypto;

create or replace function touch_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

create table if not exists financeiro_contas (
	id text primary key,
	codigo text,
	nome text not null,
	tipo text,
	grupo text,
	status text,
	parent_id text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists financeiro_diretorias (
	id text primary key,
	nome text not null,
	diretor_nome text,
	diretor_email text,
	diretor_numero text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists financeiro_centros_custo (
	id text primary key,
	codigo text,
	nome text not null,
	tipo_centro text,
	parent_id text references financeiro_centros_custo(id) deferrable initially deferred,
	diretoria_id text references financeiro_diretorias(id) deferrable initially deferred,
	status text,
	tipo_despesa text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists financeiro_fornecedores (
	id text primary key,
	codigo text,
	nome text not null,
	cnpj text,
	status text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists financeiro_matrizes (
	id text primary key,
	nome text not null,
	nome_fantasia text,
	cidade text,
	cnpj text,
	status text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists financeiro_filiais (
	id text not null,
	matriz_id text not null references financeiro_matrizes(id) on delete cascade deferrable initially deferred,
	nome text not null,
	nome_fantasia text,
	cidade text,
	cnpj text,
	status text,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb,
	primary key (matriz_id, id)
);

create table if not exists financeiro_orcamento_matriz (
	id uuid primary key default gen_random_uuid(),
	ano integer not null,
	mes integer not null check (mes between 1 and 12),
	conta_id text references financeiro_contas(id) deferrable initially deferred,
	centro_custo_id text references financeiro_centros_custo(id) deferrable initially deferred,
	versao_id text not null default 'budget',
	orcado numeric(14, 2) not null default 0,
	realizado numeric(14, 2) not null default 0,
	comprometido numeric(14, 2) not null default 0,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb,
	unique (ano, mes, conta_id, centro_custo_id, versao_id)
);

create table if not exists financeiro_orcamento_lancamentos (
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
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb
);

create table if not exists financeiro_config_meta (
	config_id text primary key,
	data jsonb not null default '{}'::jsonb,
	legacy_path text unique,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb
);

create index if not exists idx_financeiro_contas_codigo on financeiro_contas (codigo);
create index if not exists idx_financeiro_contas_parent on financeiro_contas (parent_id);
create index if not exists idx_financeiro_centros_codigo on financeiro_centros_custo (codigo);
create index if not exists idx_financeiro_centros_parent on financeiro_centros_custo (parent_id);
create index if not exists idx_financeiro_centros_diretoria on financeiro_centros_custo (diretoria_id);
create index if not exists idx_financeiro_fornecedores_codigo on financeiro_fornecedores (codigo);
create index if not exists idx_financeiro_fornecedores_cnpj on financeiro_fornecedores (cnpj);
create index if not exists idx_financeiro_filiais_matriz on financeiro_filiais (matriz_id);
create index if not exists idx_financeiro_orcamento_periodo on financeiro_orcamento_matriz (ano, mes);
create index if not exists idx_financeiro_orcamento_conta on financeiro_orcamento_matriz (conta_id);
create index if not exists idx_financeiro_orcamento_centro on financeiro_orcamento_matriz (centro_custo_id);
create index if not exists idx_financeiro_lancamentos_periodo on financeiro_orcamento_lancamentos (ano, mes, data);
create index if not exists idx_financeiro_lancamentos_conta on financeiro_orcamento_lancamentos (conta_id);
create index if not exists idx_financeiro_lancamentos_centro on financeiro_orcamento_lancamentos (centro_custo_id);

drop trigger if exists financeiro_contas_touch_updated_at on financeiro_contas;
create trigger financeiro_contas_touch_updated_at
before update on financeiro_contas
for each row execute function touch_updated_at();

drop trigger if exists financeiro_diretorias_touch_updated_at on financeiro_diretorias;
create trigger financeiro_diretorias_touch_updated_at
before update on financeiro_diretorias
for each row execute function touch_updated_at();

drop trigger if exists financeiro_centros_custo_touch_updated_at on financeiro_centros_custo;
create trigger financeiro_centros_custo_touch_updated_at
before update on financeiro_centros_custo
for each row execute function touch_updated_at();

drop trigger if exists financeiro_fornecedores_touch_updated_at on financeiro_fornecedores;
create trigger financeiro_fornecedores_touch_updated_at
before update on financeiro_fornecedores
for each row execute function touch_updated_at();

drop trigger if exists financeiro_matrizes_touch_updated_at on financeiro_matrizes;
create trigger financeiro_matrizes_touch_updated_at
before update on financeiro_matrizes
for each row execute function touch_updated_at();

drop trigger if exists financeiro_filiais_touch_updated_at on financeiro_filiais;
create trigger financeiro_filiais_touch_updated_at
before update on financeiro_filiais
for each row execute function touch_updated_at();

drop trigger if exists financeiro_orcamento_matriz_touch_updated_at on financeiro_orcamento_matriz;
create trigger financeiro_orcamento_matriz_touch_updated_at
before update on financeiro_orcamento_matriz
for each row execute function touch_updated_at();

drop trigger if exists financeiro_orcamento_lancamentos_touch_updated_at on financeiro_orcamento_lancamentos;
create trigger financeiro_orcamento_lancamentos_touch_updated_at
before update on financeiro_orcamento_lancamentos
for each row execute function touch_updated_at();

drop trigger if exists financeiro_config_meta_touch_updated_at on financeiro_config_meta;
create trigger financeiro_config_meta_touch_updated_at
before update on financeiro_config_meta
for each row execute function touch_updated_at();
