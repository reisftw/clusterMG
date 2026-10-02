alter table hubsoft_activation_os_snapshots
	add column if not exists hubsoft_technician_name text,
	add column if not exists hubsoft_technician_email text,
	add column if not exists technician_assignment_status text not null default 'UNKNOWN',
	add column if not exists activation_closure_status text not null default 'ABERTA',
	add column if not exists activation_city_id bigint,
	add column if not exists activation_city_name text,
	add column if not exists activation_city_source text,
	add column if not exists activation_city_confidence text not null default 'MISSING';

alter table hubsoft_activation_os_snapshots
	drop constraint if exists hubsoft_activation_os_snapshots_assignment_status_chk;

alter table hubsoft_activation_os_snapshots
	add constraint hubsoft_activation_os_snapshots_assignment_status_chk
	check (technician_assignment_status in ('ASSIGNED', 'UNASSIGNED', 'UNKNOWN'));

alter table hubsoft_activation_os_snapshots
	drop constraint if exists hubsoft_activation_os_snapshots_closure_status_chk;

alter table hubsoft_activation_os_snapshots
	add constraint hubsoft_activation_os_snapshots_closure_status_chk
	check (activation_closure_status in ('ABERTA', 'EM_ATENDIMENTO', 'CONCLUIDA', 'ENCERRADA_SEM_CONCLUSAO'));

create index if not exists idx_hubsoft_activation_os_closure_current
	on hubsoft_activation_os_snapshots(activation_closure_status, is_current);

create index if not exists idx_hubsoft_activation_os_assignment_current
	on hubsoft_activation_os_snapshots(technician_assignment_status, is_current);

create index if not exists idx_hubsoft_activation_os_city_current
	on hubsoft_activation_os_snapshots(lower(coalesce(activation_city_name, '')), is_current);

create index if not exists idx_hubsoft_activation_os_hubsoft_tech_name_current
	on hubsoft_activation_os_snapshots(lower(coalesce(hubsoft_technician_name, '')), is_current);
