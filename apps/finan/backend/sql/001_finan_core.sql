create table if not exists finan_migrations (
	id text primary key,
	applied_at timestamptz not null default now()
);

create table if not exists finan_roles (
	id text primary key,
	name text not null,
	description text,
	permissions jsonb not null default '[]'::jsonb,
	is_admin boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists finan_users (
	id text primary key,
	name text not null,
	email text not null unique,
	password_hash text,
	role_id text references finan_roles(id),
	status text not null default 'ativo',
	mfa_enabled boolean not null default false,
	mfa_email text,
	must_change_password boolean not null default false,
	source_system text not null default 'finan',
	source_user_id text,
	source_role text,
	source_permissions jsonb not null default '[]'::jsonb,
	source_profile jsonb not null default '{}'::jsonb,
	last_login_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists finan_sessions (
	id text primary key,
	user_id text not null references finan_users(id) on delete cascade,
	token_hash text not null,
	expires_at timestamptz not null,
	created_at timestamptz not null default now(),
	revoked_at timestamptz
);

create table if not exists finan_mfa_challenges (
	id text primary key,
	user_id text not null references finan_users(id) on delete cascade,
	code_hash text not null,
	channel text not null default 'email',
	expires_at timestamptz not null,
	consumed_at timestamptz,
	created_at timestamptz not null default now()
);

create table if not exists finan_settings (
	key text primary key,
	value jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now(),
	updated_by text references finan_users(id)
);

create table if not exists finan_integration_configs (
	id text primary key,
	provider text not null,
	name text not null,
	config jsonb not null default '{}'::jsonb,
	status text not null default 'planejado',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists finan_audit_logs (
	id bigserial primary key,
	user_id text references finan_users(id),
	action text not null,
	entity text not null,
	entity_id text,
	before_data jsonb,
	after_data jsonb,
	created_at timestamptz not null default now()
);

create table if not exists finan_orcamento_movimentos (
	id bigserial primary key,
	periodo text,
	data date,
	classe text,
	categoria text,
	conta_codigo text,
	conta_nome text,
	centro_codigo text,
	centro_nome text,
	fornecedor_codigo text,
	fornecedor_nome text,
	matriz_codigo text,
	filial_codigo text,
	orcado numeric(14,2) not null default 0,
	realizado numeric(14,2) not null default 0,
	source_file text,
	source_row integer,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists idx_finan_orcamento_movimentos_periodo
	on finan_orcamento_movimentos(periodo);

create index if not exists idx_finan_orcamento_movimentos_classe
	on finan_orcamento_movimentos(classe);

create index if not exists idx_finan_orcamento_movimentos_conta
	on finan_orcamento_movimentos(conta_codigo);

create index if not exists idx_finan_orcamento_movimentos_centro
	on finan_orcamento_movimentos(centro_codigo);

create table if not exists finan_migration_snapshots (
	id bigserial primary key,
	source_table text not null,
	source_pk text,
	payload jsonb not null,
	imported_at timestamptz not null default now(),
	unique (source_table, source_pk)
);

create index if not exists idx_finan_migration_snapshots_source
	on finan_migration_snapshots(source_table);

insert into finan_roles (id, name, description, permissions, is_admin)
values
	('admin', 'Admin', 'Administrador do sistema financeiro dedicado.', '["finan.dashboard.view","finan.gestao_orcamentaria.view","finan.gestao_orcamentaria.manage","relatorios_financeiros:visualizar","relatorios_financeiros:gerenciar","finan.contas_pagar.view","finan.contas_pagar.manage","finan.contas_receber.view","finan.contas_receber.manage","finan.faturamento.view","finan.notas.view","finan.reports.view","finan.reports.manage","finan.equipe.view","finan.equipe.manage","finan.integracoes.view","finan.integracoes.manage","finan.configuracoes.view","finan.configuracoes.manage","finan.usuarios.manage"]'::jsonb, true),
	('coordenador_financeiro', 'Coordenador Financeiro', 'Coordenação do financeiro no Finan.', '["finan.dashboard.view","finan.gestao_orcamentaria.view","finan.gestao_orcamentaria.manage","relatorios_financeiros:visualizar","relatorios_financeiros:gerenciar","finan.reports.view","finan.equipe.view","finan.equipe.manage"]'::jsonb, false),
	('analista_financeiro', 'Analista Financeiro', 'Operação financeira no Finan.', '["finan.dashboard.view","finan.gestao_orcamentaria.view","relatorios_financeiros:visualizar","finan.contas_pagar.view","finan.contas_receber.view","finan.reports.view"]'::jsonb, false)
on conflict (id) do update set
	name = excluded.name,
	description = excluded.description,
	permissions = excluded.permissions,
	is_admin = excluded.is_admin,
	updated_at = now();

insert into finan_integration_configs (id, provider, name, status)
values
	('hubsoft', 'hubsoft', 'Hubsoft', 'planejado'),
	('cvortex', 'cvortex', 'Cvortex', 'planejado'),
	('senior', 'senior', 'Senior', 'planejado'),
	('playground', 'playground', 'Playground', 'planejado')
on conflict (id) do update set
	provider = excluded.provider,
	name = excluded.name,
	status = excluded.status,
	updated_at = now();
