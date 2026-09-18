-- Agentes autorizados canônicos da Operação.
-- Segue o fluxo Regional -> Agentes -> Tecnicos, com escopo operacional
-- separado para nao criar entidades paralelas por ROT/FIELD/DELIVERY.

create extension if not exists pgcrypto;

create table if not exists operacao_agentes (
	id uuid primary key default gen_random_uuid(),
	cidade_id uuid references regional_cidades(id) on delete set null,
	regional_id text not null references regionais(id) on delete restrict,
	cidade_nome text not null,
	responsavel_nome text,
	responsavel_email text,
	responsavel_telefone text,
	ativo boolean not null default true,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint operacao_agentes_cidade_nome_not_empty_chk check (btrim(cidade_nome) <> '')
);

create unique index if not exists idx_operacao_agentes_regional_cidade_unique
	on operacao_agentes(regional_id, lower(cidade_nome))
	where ativo = true;

create index if not exists idx_operacao_agentes_regional
	on operacao_agentes(regional_id, ativo, lower(cidade_nome));

create index if not exists idx_operacao_agentes_cidade
	on operacao_agentes(cidade_id);

drop trigger if exists operacao_agentes_touch_updated_at on operacao_agentes;
create trigger operacao_agentes_touch_updated_at
before update on operacao_agentes
for each row execute function touch_updated_at();

create table if not exists operacao_agente_operation_scopes (
	agente_id uuid not null references operacao_agentes(id) on delete cascade,
	operation_type text not null references rot_operation_types(id) on delete restrict,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (agente_id, operation_type)
);

create index if not exists idx_operacao_agente_operation_scopes_operation
	on operacao_agente_operation_scopes(operation_type, agente_id);

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('rot.agents.view', 'gestao', 'Gestao', 'agents', 'Agentes', 'view', 615, 'Visualizar agentes autorizados.'),
		('rot.agents.manage', 'gestao', 'Gestao', 'agents', 'Agentes', 'manage', 616, 'Gerenciar agentes autorizados.')
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
where p.id in ('rot.agents.view', 'rot.agents.manage')
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
