create extension if not exists pgcrypto;

create table if not exists service_order_requests (
	id uuid primary key default gen_random_uuid(),
	client_code text not null check (client_code ~ '^\d+$'),
	requester_uid text not null,
	requester_email text,
	requester_name text not null,
	technician_hubsoft_name text not null,
	service_order_id text,
	service_order_number text,
	client_name text,
	status text not null default 'QUEUED'
		check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
	stage text not null default 'Solicitacao recebida',
	progress integer not null default 0 check (progress between 0 and 100),
	result_message text,
	error_message text,
	hubsoft_url text,
	before_snapshot jsonb,
	after_snapshot jsonb,
	created_at timestamptz not null default now(),
	started_at timestamptz,
	completed_at timestamptz,
	updated_at timestamptz not null default now()
);

create unique index if not exists service_order_requests_active_client_idx
	on service_order_requests (client_code)
	where status in ('QUEUED', 'RUNNING');

create index if not exists service_order_requests_requester_idx
	on service_order_requests (requester_uid, created_at desc);

create index if not exists service_order_requests_history_idx
	on service_order_requests (created_at desc);

drop trigger if exists service_order_requests_touch_updated_at
	on service_order_requests;
create trigger service_order_requests_touch_updated_at
before update on service_order_requests
for each row execute function touch_updated_at();

insert into app_permissions (
	id,
	section_id,
	section_label,
	feature_id,
	feature_label,
	action,
	sort_order,
	legacy_permission,
	description
) values
	('service_orders.requests.create', 'service_orders', 'Ordem de Servico', 'requests', 'Solicitacao', 'manage', 700, null, 'Solicitar a transferencia manual de uma O.S para o tecnico autenticado.'),
	('service_orders.requests.history', 'service_orders', 'Ordem de Servico', 'requests', 'Solicitacao', 'view', 701, null, 'Visualizar o historico administrativo de solicitacoes de O.S.')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	legacy_permission = excluded.legacy_permission,
	description = excluded.description,
	active = true,
	deprecated = false;

insert into app_role_permissions (role_id, permission)
select role_id, permission
from (
	values
		('admin', 'service_orders.requests.create'),
		('admin', 'service_orders.requests.history'),
		('tecnico', 'service_orders.requests.create')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict do nothing;
