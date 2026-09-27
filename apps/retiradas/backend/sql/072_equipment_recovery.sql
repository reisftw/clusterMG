create table if not exists equipment_recovery_snapshots (
	id uuid primary key default gen_random_uuid(),
	os_record_id uuid references hubsoft_sync_records(id) on delete cascade,
	os_id text not null,
	os_number text,
	os_type_id integer,
	os_type text,
	production_channel text,
	technician_id text,
	technician_name text,
	technician_name_normalized text,
	city_id text,
	city_name text,
	service_name text,
	service_speed_mbps numeric(10,2),
	equipment_type text not null default 'UNKNOWN',
	equipment_source text not null default 'SERVICE_SPEED',
	equipment_unit_value numeric(12,2),
	equipment_value_source text,
	equipment_value_product_name text,
	closed_at timestamptz,
	return_status text not null default 'PENDING',
	match_confidence text not null default 'NOT_FOUND',
	match_type text,
	movement_id text,
	movement_at timestamptz,
	calculated_at timestamptz not null default now(),
	raw_snapshot jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique(os_id)
);

create index if not exists equipment_recovery_snapshots_closed_at_idx
	on equipment_recovery_snapshots (closed_at);
create index if not exists equipment_recovery_snapshots_technician_idx
	on equipment_recovery_snapshots (technician_id, technician_name_normalized);
create index if not exists equipment_recovery_snapshots_equipment_idx
	on equipment_recovery_snapshots (equipment_type);
create index if not exists equipment_recovery_snapshots_status_idx
	on equipment_recovery_snapshots (return_status, match_confidence);
create index if not exists equipment_recovery_snapshots_record_idx
	on equipment_recovery_snapshots (os_record_id);

create table if not exists equipment_recovery_movement_allocations (
	id uuid primary key default gen_random_uuid(),
	recovery_id uuid not null references equipment_recovery_snapshots(id) on delete cascade,
	movement_id text not null references movimentacoes_estoque(id) on delete cascade,
	quantity integer not null default 1,
	match_confidence text not null,
	match_type text not null,
	matched_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	unique(recovery_id, movement_id)
);

create index if not exists equipment_recovery_allocations_movement_idx
	on equipment_recovery_movement_allocations (movement_id);

create table if not exists equipment_recovery_jobs (
	id uuid primary key default gen_random_uuid(),
	status text not null default 'RUNNING',
	mode text not null default 'SIMULATE',
	date_start date,
	date_end date,
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	created_by text,
	error_message text,
	summary jsonb not null default '{}'::jsonb
);

drop trigger if exists equipment_recovery_snapshots_touch_updated_at on equipment_recovery_snapshots;
create trigger equipment_recovery_snapshots_touch_updated_at
before update on equipment_recovery_snapshots
for each row execute function touch_updated_at();
