-- Frota e Equipamentos — fiel a rot/src/pages/FleetPage.tsx e
-- EquipmentsPage.tsx. Frota: veiculo + responsavel (tecnico) + sinistros
-- + manutencoes (agendadas em oficina, finalizadas com nota). Equipamentos:
-- ativo (fusion/outro) + responsavel + auditorias periodicas.

create table if not exists rot_workshops (
	id text primary key,
	name text not null,
	address text not null default '',
	phone text not null default '',
	regional_id text references rot_regionals(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists rot_workshops_touch_updated_at on rot_workshops;
create trigger rot_workshops_touch_updated_at
before update on rot_workshops
for each row execute function touch_updated_at();

create table if not exists rot_vehicles (
	id text primary key,
	model text not null,
	plate text not null,
	manufacturer text not null default '',
	regional_id text references rot_regionals(id) on delete set null,
	responsible_id text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicles_regional on rot_vehicles(regional_id);

drop trigger if exists rot_vehicles_touch_updated_at on rot_vehicles;
create trigger rot_vehicles_touch_updated_at
before update on rot_vehicles
for each row execute function touch_updated_at();

create table if not exists rot_vehicle_claims (
	id text primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	description text not null default '',
	date timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	created_by_name text,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicle_claims_vehicle on rot_vehicle_claims(vehicle_id, date desc);

create table if not exists rot_vehicle_maintenances (
	id text primary key,
	vehicle_id text not null references rot_vehicles(id) on delete cascade,
	workshop_id text references rot_workshops(id) on delete set null,
	date date not null,
	time text not null default '',
	status text not null default 'OPEN', -- OPEN | FINISHED
	resolution_note text not null default '',
	finished_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_vehicle_maintenances_vehicle on rot_vehicle_maintenances(vehicle_id, date desc);

create table if not exists rot_equipments (
	id text primary key,
	name text not null,
	brand text not null default '',
	serial_number text not null default '',
	type text not null default 'OTHER', -- FUSION | OTHER
	regional_id text references rot_regionals(id) on delete set null,
	tech_id text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_equipments_regional on rot_equipments(regional_id);

drop trigger if exists rot_equipments_touch_updated_at on rot_equipments;
create trigger rot_equipments_touch_updated_at
before update on rot_equipments
for each row execute function touch_updated_at();

create table if not exists rot_equipment_audits (
	id text primary key,
	equipment_id text not null references rot_equipments(id) on delete cascade,
	regional_id text references rot_regionals(id) on delete set null,
	auditor_id text references rot_users(id) on delete set null,
	responses jsonb not null default '{}'::jsonb,
	notes text not null default '',
	date timestamptz not null default now()
);

create index if not exists idx_rot_equipment_audits_equipment on rot_equipment_audits(equipment_id, date desc);
create index if not exists idx_rot_equipment_audits_regional on rot_equipment_audits(regional_id, date desc);
