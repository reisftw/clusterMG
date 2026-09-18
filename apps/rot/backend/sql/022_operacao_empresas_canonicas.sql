-- Empresas canônicas da Operação.
-- Entidade única, com vínculos N:N para regionais, agentes e escopos
-- operacionais. Técnicos entram na fase seguinte.

create extension if not exists pgcrypto;

create table if not exists operacao_empresas (
	id uuid primary key default gen_random_uuid(),
	nome text not null,
	cnpj text,
	slug text,
	logo_url text,
	status text not null default 'Ativa',
	atuacao text not null default 'Ambos',
	agente_autorizado boolean not null default false,
	responsavel_nome text,
	responsavel_email text,
	observacoes text,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint operacao_empresas_nome_not_empty_chk check (btrim(nome) <> ''),
	constraint operacao_empresas_status_chk check (status in ('Ativa', 'Inativa')),
	constraint operacao_empresas_atuacao_chk check (atuacao in ('Ambos', 'Ativacao', 'Manutencao'))
);

create unique index if not exists idx_operacao_empresas_nome_unique
	on operacao_empresas(lower(nome))
	where status = 'Ativa';

create index if not exists idx_operacao_empresas_status_nome
	on operacao_empresas(status, lower(nome));

drop trigger if exists operacao_empresas_touch_updated_at on operacao_empresas;
create trigger operacao_empresas_touch_updated_at
before update on operacao_empresas
for each row execute function touch_updated_at();

create table if not exists operacao_empresa_regionais (
	empresa_id uuid not null references operacao_empresas(id) on delete cascade,
	regional_id text not null references regionais(id) on delete restrict,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (empresa_id, regional_id)
);

create index if not exists idx_operacao_empresa_regionais_regional
	on operacao_empresa_regionais(regional_id, empresa_id);

create table if not exists operacao_empresa_agentes (
	empresa_id uuid not null references operacao_empresas(id) on delete cascade,
	agente_id uuid not null references operacao_agentes(id) on delete restrict,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (empresa_id, agente_id)
);

create index if not exists idx_operacao_empresa_agentes_agente
	on operacao_empresa_agentes(agente_id, empresa_id);

create table if not exists operacao_empresa_operation_scopes (
	empresa_id uuid not null references operacao_empresas(id) on delete cascade,
	operation_type text not null references rot_operation_types(id) on delete restrict,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (empresa_id, operation_type)
);

create index if not exists idx_operacao_empresa_operation_scopes_operation
	on operacao_empresa_operation_scopes(operation_type, empresa_id);

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('rot.companies.view', 'gestao', 'Gestao', 'companies', 'Empresas', 'view', 617, 'Visualizar empresas.'),
		('rot.companies.manage', 'gestao', 'Gestao', 'companies', 'Empresas', 'manage', 618, 'Gerenciar empresas.')
)
insert into rot_permissions (
	id, section_id, section_label, feature_id, feature_label, action, sort_order, description
)
select id, section_id, section_label, feature_id, feature_label, action, sort_order, description
from catalog
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true,
	updated_at = now();

insert into rot_role_permissions (role_id, permission_id)
select r.id, p.id
from rot_roles r
cross join rot_permissions p
where p.id in ('rot.companies.view', 'rot.companies.manage')
  and (
  	r.permissions ? '*'
  	or exists (
  		select 1
  		from rot_role_permissions rp
  		where rp.role_id = r.id
  		  and rp.permission_id = '*'
  	)
  )
on conflict do nothing;
