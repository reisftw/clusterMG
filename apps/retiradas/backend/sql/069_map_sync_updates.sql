create table if not exists map_sync_updates (
	id uuid primary key default gen_random_uuid(),
	sync_run_id uuid not null references hubsoft_sync_runs(id) on delete cascade,
	previous_sync_run_id uuid references hubsoft_sync_runs(id) on delete set null,
	previous_total integer not null default 0,
	current_total integer not null default 0,
	added_count integer not null default 0,
	removed_count integer not null default 0,
	executed_count integer not null default 0,
	other_removed_count integer not null default 0,
	updated_count integer not null default 0,
	permanent_count integer not null default 0,
	saldo integer not null default 0,
	summary jsonb not null default '{}'::jsonb,
	detected_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (sync_run_id)
);

create index if not exists map_sync_updates_detected_idx
	on map_sync_updates (detected_at desc);

create index if not exists map_sync_updates_previous_idx
	on map_sync_updates (previous_sync_run_id);

create table if not exists map_sync_update_items (
	id uuid primary key default gen_random_uuid(),
	update_id uuid not null references map_sync_updates(id) on delete cascade,
	sync_run_id uuid not null references hubsoft_sync_runs(id) on delete cascade,
	order_id text not null,
	order_number text,
	change_type text not null check (
		change_type in (
			'ADDED',
			'UPDATED',
			'REMOVED_EXECUTED',
			'REMOVED_UNKNOWN',
			'REMOVED_NO_LONGER_MATCHES_MAP_FILTER'
		)
	),
	source_city text,
	source_type text,
	source_status text,
	source_date timestamptz,
	technician_id text,
	technician_name text,
	production_channel text,
	production_owner_id text,
	production_owner_name text,
	confirmed_meta_record_id uuid references hubsoft_sync_records(id) on delete set null,
	detected_at timestamptz not null default now(),
	record_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (update_id, order_id, change_type)
);

create index if not exists map_sync_update_items_update_type_idx
	on map_sync_update_items (update_id, change_type);

create index if not exists map_sync_update_items_order_idx
	on map_sync_update_items (order_id);

create index if not exists map_sync_update_items_detected_idx
	on map_sync_update_items (detected_at desc);

create index if not exists map_sync_update_items_city_idx
	on map_sync_update_items (source_city, change_type);

drop trigger if exists map_sync_updates_touch_updated_at on map_sync_updates;
create trigger map_sync_updates_touch_updated_at
before update on map_sync_updates
for each row execute function touch_updated_at();

drop trigger if exists map_sync_update_items_touch_updated_at on map_sync_update_items;
create trigger map_sync_update_items_touch_updated_at
before update on map_sync_update_items
for each row execute function touch_updated_at();
