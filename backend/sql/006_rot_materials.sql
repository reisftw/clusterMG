-- Materiais/Insumos — fiel a rot/src/pages/MaterialsPage.tsx e ao fluxo
-- real em rot/src/App.tsx (handleSendSupply/handleAcceptSupply/
-- handleSaveChecklist). Catalogo fixo de itens + envio de material por
-- tecnico (aceite com assinatura) + vistorias (checklist) periodicas.

create table if not exists rot_material_catalog (
	id text primary key,
	name text not null,
	unit text not null default 'un',
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists rot_material_catalog_touch_updated_at on rot_material_catalog;
create trigger rot_material_catalog_touch_updated_at
before update on rot_material_catalog
for each row execute function touch_updated_at();

-- Cada remessa de material vira 1 linha em supply_history + 1 linha em
-- tech_supplies (vinculadas por history_id) — mesmo modelo 1:1 do
-- legado, sem merge de quantidades por item.
create table if not exists rot_supply_history (
	id text primary key,
	tech_id text not null references rot_users(id) on delete cascade,
	item_name text not null,
	quantity numeric not null default 0,
	status text not null default 'PENDING', -- PENDING | ACCEPTED
	sent_by text references rot_users(id) on delete set null,
	sent_at timestamptz not null default now(),
	accepted_at timestamptz,
	signature text -- data URL da assinatura no aceite
);

create index if not exists idx_rot_supply_history_tech on rot_supply_history(tech_id, sent_at desc);

create table if not exists rot_tech_supplies (
	id text primary key,
	tech_id text not null references rot_users(id) on delete cascade,
	item_name text not null,
	quantity numeric not null default 0,
	status text not null default 'PENDING', -- PENDING | ACCEPTED
	history_id text references rot_supply_history(id) on delete set null,
	sent_by text references rot_users(id) on delete set null,
	accepted_at timestamptz,
	signature text,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_tech_supplies_tech on rot_tech_supplies(tech_id);

-- Vistorias de estoque (checklist) — inspetor abre, marca resposta por
-- item, tecnico "assina" (aprova) depois.
create table if not exists rot_inventory_checklists (
	id text primary key,
	tech_id text not null references rot_users(id) on delete cascade,
	inspector_id text references rot_users(id) on delete set null,
	responses jsonb not null default '{}'::jsonb, -- { itemName: "ok" | "missing" | "damaged" }
	status text not null default 'PENDING_TECH_APPROVAL', -- PENDING_TECH_APPROVAL | APPROVED
	signature text,
	date_accepted timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_rot_inventory_checklists_tech on rot_inventory_checklists(tech_id, created_at desc);
