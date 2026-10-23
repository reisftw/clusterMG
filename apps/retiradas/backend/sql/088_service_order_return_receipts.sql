create extension if not exists pgcrypto;

create table if not exists service_order_return_receipts (
	id uuid primary key default gen_random_uuid(),
	client_code text not null check (client_code ~ '^\d+$'),
	client_name text not null,
	service_order_number text not null,
	service_order_type text not null,
	company text not null,
	technician_name text not null,
	completed_at timestamptz not null,
	equipment jsonb not null default '[]'::jsonb,
	source_snapshot jsonb not null default '{}'::jsonb,
	generated_by_uid text not null,
	generated_by_name text not null,
	generated_by_email text,
	pdf_filename text not null,
	pdf_data bytea not null,
	created_at timestamptz not null default now()
);

create unique index if not exists service_order_return_receipts_order_idx
	on service_order_return_receipts (service_order_number);

create index if not exists service_order_return_receipts_owner_idx
	on service_order_return_receipts (generated_by_uid, created_at desc);

create index if not exists service_order_return_receipts_technician_idx
	on service_order_return_receipts (technician_name, created_at desc);

create index if not exists service_order_return_receipts_history_idx
	on service_order_return_receipts (created_at desc);

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
	('service_orders.return_receipts.create', 'service_orders', 'Ordem de Servico', 'return_receipts', 'Comprovante', 'manage', 702, null, 'Consultar devolucoes finalizadas e gerar comprovantes em PDF.'),
	('service_orders.return_receipts.history', 'service_orders', 'Ordem de Servico', 'return_receipts', 'Comprovante', 'view', 703, null, 'Visualizar o historico administrativo de comprovantes de devolucao.')
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
		('admin', 'service_orders.return_receipts.create'),
		('admin', 'service_orders.return_receipts.history'),
		('tecnico', 'service_orders.return_receipts.create')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict do nothing;
