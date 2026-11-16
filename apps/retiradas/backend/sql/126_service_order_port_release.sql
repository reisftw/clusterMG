create extension if not exists pgcrypto;

create table if not exists service_order_port_release_config (
	company_key text primary key,
	company_name text not null,
	source_types jsonb not null default '[]'::jsonb,
	target_type jsonb,
	open_statuses text[] not null default array['aguardando_agendamento', 'pendente'],
	batch_limit integer not null default 500 check (batch_limit between 1 and 5000),
	concurrency integer not null default 2 check (concurrency between 1 and 5),
	updated_by text,
	updated_at timestamptz not null default now()
);

create table if not exists service_order_port_release_batches (
	id uuid primary key default gen_random_uuid(),
	status text not null default 'QUEUED'
		check (status in ('QUEUED', 'RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED')),
	total integer not null default 0,
	processed integer not null default 0,
	succeeded integer not null default 0,
	skipped integer not null default 0,
	failed integer not null default 0,
	indeterminate integer not null default 0,
	reason text not null,
	note text,
	requested_by text not null,
	requested_by_name text not null,
	created_at timestamptz not null default now(),
	started_at timestamptz,
	completed_at timestamptz
);

create table if not exists service_order_port_release_searches (
	id uuid primary key default gen_random_uuid(),
	requested_by text not null,
	invalid_codes jsonb not null default '[]'::jsonb,
	duplicates integer not null default 0,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null default (now() + interval '2 hours')
);

create table if not exists service_order_port_release_search_results (
	id uuid primary key default gen_random_uuid(),
	search_id uuid not null references service_order_port_release_searches(id) on delete cascade,
	position integer not null,
	result jsonb not null,
	unique (search_id, position)
);

create index if not exists service_order_port_release_search_results_search_idx
	on service_order_port_release_search_results (search_id, position);
create index if not exists service_order_port_release_searches_expiry_idx
	on service_order_port_release_searches (expires_at);

create table if not exists service_order_port_release_operations (
	id uuid primary key default gen_random_uuid(),
	batch_id uuid not null references service_order_port_release_batches(id),
	client_code text not null,
	client_name text,
	service_order_id text not null,
	service_order_number text,
	company_key text not null default 'DEFAULT',
	company_name text,
	source_type_id bigint,
	source_type_name text,
	target_type_id bigint not null,
	target_type_name text not null,
	status text not null default 'QUEUED'
		check (status in ('QUEUED', 'RUNNING', 'SUCCESS', 'SKIPPED', 'ERROR', 'INDETERMINATE')),
	reason text not null,
	note text,
	requested_by text not null,
	requested_by_name text not null,
	requested_at timestamptz not null default now(),
	confirmed_at timestamptz,
	external_operation_id text,
	error_message text,
	before_evidence jsonb,
	after_evidence jsonb
);

create unique index if not exists service_order_port_release_active_order_idx
	on service_order_port_release_operations (service_order_id)
	where status in ('QUEUED', 'RUNNING', 'INDETERMINATE');
create index if not exists service_order_port_release_operations_batch_idx
	on service_order_port_release_operations (batch_id, requested_at);
create index if not exists service_order_port_release_operations_history_idx
	on service_order_port_release_operations (requested_at desc);
create index if not exists service_order_port_release_operations_client_idx
	on service_order_port_release_operations (client_code, requested_at desc);
create index if not exists service_order_port_release_operations_user_idx
	on service_order_port_release_operations (requested_by, requested_at desc);
create index if not exists service_order_port_release_operations_company_idx
	on service_order_port_release_operations (company_key, requested_at desc);
create index if not exists service_order_port_release_operations_status_idx
	on service_order_port_release_operations (status, requested_at desc);

with catalog as (
	select
		'service_orders'::text as section_id,
		'Ordem de Servico'::text as section_label,
		'port_release'::text as feature_id,
		'Liberacao de Portas'::text as feature_label
), permissions(id, sort_order, description) as (
	values
		('liberacao_portas.view', 720, 'Visualizar o modulo Liberacao de Portas.'),
		('liberacao_portas.search', 721, 'Consultar clientes e ordens elegiveis.'),
		('liberacao_portas.execute', 722, 'Alterar o tipo de ordens no HubSoft.'),
		('liberacao_portas.history', 723, 'Consultar o historico de liberacoes.'),
		('liberacao_portas.export', 724, 'Exportar relatorios de liberacoes.'),
		('liberacao_portas.manage', 725, 'Gerenciar tipos e regras do modulo.')
)
insert into app_permissions (
	id, section_id, section_label, feature_id, feature_label, action,
	sort_order, legacy_permission, description
)
select
	p.id,
	c.section_id,
	c.section_label,
	c.feature_id,
	c.feature_label,
	case when p.id in ('liberacao_portas.execute', 'liberacao_portas.manage') then 'manage' else 'view' end,
	p.sort_order,
	null,
	p.description
from permissions p
cross join catalog c
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true,
	deprecated = false;

-- Role identifiers repeat because each role receives an explicit permission matrix. -- NOSONAR
insert into app_role_permissions (role_id, permission)
select role_id, permission
from (values
	('admin', 'liberacao_portas.view'), ('admin', 'liberacao_portas.search'),
	('admin', 'liberacao_portas.execute'), ('admin', 'liberacao_portas.history'),
	('admin', 'liberacao_portas.export'), ('admin', 'liberacao_portas.manage'),
	('backoffice', 'liberacao_portas.view'), ('backoffice', 'liberacao_portas.search'),
	('backoffice', 'liberacao_portas.execute'), ('backoffice', 'liberacao_portas.history'),
	('backoffice', 'liberacao_portas.export'), ('backoffice', 'liberacao_portas.manage'),
	('backoffice_retirada', 'liberacao_portas.view'), ('backoffice_retirada', 'liberacao_portas.search'),
	('backoffice_retirada', 'liberacao_portas.execute'), ('backoffice_retirada', 'liberacao_portas.history'),
	('backoffice_retirada', 'liberacao_portas.export'), ('backoffice_retirada', 'liberacao_portas.manage')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict do nothing;
