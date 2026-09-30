create extension if not exists pgcrypto;

create table if not exists service_order_cancellation_competencies (
	competencia text primary key check (competencia ~ '^\d{4}-\d{2}$'),
	status text not null default 'NOT_SYNCED'
		check (status in ('NOT_SYNCED', 'SYNCING', 'SYNCED', 'ERROR', 'UPDATE_AVAILABLE')),
	validation_status text not null default 'PENDING'
		check (validation_status in ('PENDING', 'VALIDATED', 'REQUIRES_REVALIDATION')),
	total_records integer not null default 0,
	summary jsonb not null default '{}'::jsonb,
	validated_summary jsonb,
	validated_by_uid text,
	validated_by_name text,
	validated_at timestamptz,
	last_sync_run_id uuid,
	last_synced_at timestamptz,
	last_error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists service_order_cancellation_records (
	id uuid primary key default gen_random_uuid(),
	competencia text not null references service_order_cancellation_competencies(competencia) on delete cascade,
	unique_key text not null,
	codigo_cliente text,
	cliente_id text,
	cliente_servico_id text,
	cliente_nome text,
	numero_plano text,
	empresa_original text,
	empresa_normalizada text not null,
	servico text,
	tecnologia_original text,
	classificacao_tecnologia text not null check (classificacao_tecnologia in ('FTTH', 'NAO_FTTH')),
	grupo_servico text,
	grupo_padrao text,
	velocidade numeric,
	data_cancelamento date not null,
	motivo_cancelamento text,
	usuario_cancelamento text,
	cidade text,
	cidade_normalizada text,
	regional_id text references regionais(id) on delete set null,
	regional_nome text,
	bairro text,
	endereco text,
	equipamento_comodato text,
	valor numeric,
	faturas_geradas integer,
	faturas_quitadas integer,
	faturas_em_aberto integer,
	payload_original jsonb not null default '{}'::jsonb,
	synced_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (competencia, unique_key)
);

create table if not exists service_order_cancellation_sync_runs (
	id uuid primary key default gen_random_uuid(),
	competencia text,
	start_competencia text,
	end_competencia text,
	status text not null default 'RUNNING'
		check (status in ('RUNNING', 'COMPLETE', 'FAILED')),
	triggered_by_uid text,
	triggered_by_name text,
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	duration_ms integer,
	total_hubsoft integer not null default 0,
	inserted_count integer not null default 0,
	updated_count integer not null default 0,
	deleted_count integer not null default 0,
	summary jsonb not null default '{}'::jsonb,
	error_message text,
	created_at timestamptz not null default now()
);

create index if not exists service_order_cancellations_competencia_idx
	on service_order_cancellation_records (competencia, data_cancelamento desc);

create index if not exists service_order_cancellations_empresa_idx
	on service_order_cancellation_records (competencia, empresa_normalizada, classificacao_tecnologia);

create index if not exists service_order_cancellations_regional_idx
	on service_order_cancellation_records (competencia, regional_id, cidade_normalizada);

create index if not exists service_order_cancellations_tecnologia_idx
	on service_order_cancellation_records (competencia, tecnologia_original);

create index if not exists service_order_cancellations_cliente_idx
	on service_order_cancellation_records (competencia, codigo_cliente, cliente_id, cliente_servico_id);

create index if not exists service_order_cancellations_payload_gin_idx
	on service_order_cancellation_records using gin (payload_original);

drop trigger if exists service_order_cancellation_competencies_touch_updated_at
	on service_order_cancellation_competencies;
create trigger service_order_cancellation_competencies_touch_updated_at
before update on service_order_cancellation_competencies
for each row execute function touch_updated_at();

drop trigger if exists service_order_cancellation_records_touch_updated_at
	on service_order_cancellation_records;
create trigger service_order_cancellation_records_touch_updated_at
before update on service_order_cancellation_records
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
	('service_orders.cancellations.view', 'service_orders', 'Ordem de Serviço', 'cancellations', 'Cancelamentos', 'view', 710, 'view_metas', 'Visualizar cancelamentos mensais.'),
	('service_orders.cancellations.manage', 'service_orders', 'Ordem de Serviço', 'cancellations', 'Cancelamentos', 'manage', 711, 'manage_metas', 'Sincronizar e validar cancelamentos mensais.')
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
		('admin', 'service_orders.cancellations.view'),
		('admin', 'service_orders.cancellations.manage'),
		('supervisor', 'service_orders.cancellations.view'),
		('supervisor', 'service_orders.cancellations.manage'),
		('backoffice_retirada', 'service_orders.cancellations.view')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict do nothing;
