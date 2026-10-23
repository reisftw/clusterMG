create table if not exists hubsoft_technicians (
	hubsoft_technician_id bigint primary key,
	name text not null,
	display_name text not null,
	active boolean not null default true,
	is_withdrawal boolean not null default false,
	last_seen_at timestamptz not null default now(),
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	updated_by text
);

create index if not exists hubsoft_technicians_active_name_idx
	on hubsoft_technicians (active, display_name);

create index if not exists hubsoft_technicians_withdrawal_idx
	on hubsoft_technicians (is_withdrawal, active);

drop trigger if exists hubsoft_technicians_touch_updated_at
	on hubsoft_technicians;
create trigger hubsoft_technicians_touch_updated_at
before update on hubsoft_technicians
for each row execute function touch_updated_at();

alter table service_order_requests
	add column if not exists technician_hubsoft_id bigint;

update service_order_requests request
set technician_hubsoft_id = technician.hubsoft_technician_id
from hubsoft_withdrawal_technicians technician
where request.technician_hubsoft_id is null
  and upper(trim(request.technician_hubsoft_name)) = upper(trim(technician.nome_hubsoft));
