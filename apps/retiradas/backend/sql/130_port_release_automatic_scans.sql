create table if not exists service_order_port_release_scans (
	id uuid primary key default gen_random_uuid(),
	status text not null default 'QUEUED'
		check (status in ('QUEUED', 'DISCOVERING', 'PROCESSING', 'COMPLETE', 'PARTIAL', 'FAILED')),
	phase text not null default 'QUEUED',
	start_date date not null,
	end_date date not null,
	attendances_scanned integer not null default 0,
	customers_matched integer not null default 0,
	orders_found integer not null default 0,
	processed integer not null default 0,
	succeeded integer not null default 0,
	skipped integer not null default 0,
	failed integer not null default 0,
	indeterminate integer not null default 0,
	requested_by text not null,
	requested_by_name text not null,
	error_message text,
	created_at timestamptz not null default now(),
	started_at timestamptz,
	completed_at timestamptz,
	check (end_date >= start_date),
	check (end_date - start_date <= 366)
);

alter table service_order_port_release_batches
	add column if not exists scan_id uuid references service_order_port_release_scans(id);

create unique index if not exists service_order_port_release_active_scan_idx
	on service_order_port_release_scans ((true))
	where status in ('QUEUED', 'DISCOVERING', 'PROCESSING');
create index if not exists service_order_port_release_scans_created_idx
	on service_order_port_release_scans (created_at desc);
create index if not exists service_order_port_release_batches_scan_idx
	on service_order_port_release_batches (scan_id)
	where scan_id is not null;
