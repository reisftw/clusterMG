create table if not exists store_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  company text not null default 'SEMPRE',
  cnpj text,
  zip_code text,
  address text not null,
  address_number text,
  complement text,
  district text,
  city text not null,
  state char(2) not null,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_users add column if not exists store_location_id uuid references store_locations(id);
alter table app_users add column if not exists managed_store_location_ids uuid[] not null default '{}';

create table if not exists store_deliveries (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  idempotency_key text not null unique,
  client_code text not null,
  client_name text not null,
  client_document_masked text,
  contract_id text,
  service_id text,
  service_order_id text,
  service_order_number text,
  store_id uuid not null references store_locations(id),
  store_snapshot jsonb not null,
  received_by_uid text not null references app_users(uid),
  received_by_name text not null,
  delivery_type text not null check (delivery_type in ('TOTAL','PARTIAL')),
  physical_status text not null default 'RECEIVED_AT_STORE',
  reconciliation_status text not null default 'PENDING', -- NOSONAR: independent workflow statuses share the same initial state
  hubsoft_status text not null default 'PENDING',
  hubsoft_attendance_id text,
  port_release_status text not null default 'PENDING',
  port_release_batch_id uuid,
  pdf_filename text,
  pdf_data bytea,
  integration_error text,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists store_delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references store_deliveries(id) on delete restrict,
  asset_id text,
  product_name text not null,
  model text,
  mac text not null,
  serial text,
  service_id text,
  contract_id text,
  custody_status text not null default 'RECEIVED_AT_STORE',
  reconciliation_status text not null default 'PENDING',
  movement_id text,
  divergence_reason text,
  created_at timestamptz not null default now(),
  unique (delivery_id, mac)
);

create table if not exists store_delivery_events (
  id bigserial primary key,
  delivery_id uuid not null references store_deliveries(id) on delete restrict,
  item_id uuid references store_delivery_items(id) on delete restrict,
  event_type text not null,
  status text not null,
  payload jsonb not null default '{}',
  actor_uid text,
  actor_name text,
  created_at timestamptz not null default now()
);

create sequence if not exists store_delivery_protocol_seq;
create index if not exists store_deliveries_store_date_idx on store_deliveries(store_id, confirmed_at desc);
create index if not exists store_deliveries_owner_date_idx on store_deliveries(received_by_uid, confirmed_at desc);
create index if not exists store_deliveries_client_idx on store_deliveries(client_code, confirmed_at desc);
create index if not exists store_delivery_items_mac_idx on store_delivery_items(regexp_replace(upper(mac), '[^A-Z0-9]', '', 'g'));
create index if not exists store_delivery_items_reconciliation_idx on store_delivery_items(reconciliation_status, created_at desc);

insert into app_roles(id,name,description,system_role,active) values -- NOSONAR: role identifiers intentionally seed both roles and permissions
 ('atendente_loja','Atendente de Loja','Recebimento presencial na loja.',true,true), -- NOSONAR
 ('supervisor_loja','Supervisor de Loja','Gestão operacional da própria loja.',true,true), -- NOSONAR
 ('coordenador_loja','Coordenador de Loja','Gestão das lojas autorizadas.',true,true) -- NOSONAR
on conflict(id) do update set name=excluded.name,description=excluded.description,system_role=true,active=true;

with permissions(role_id,permission) as (values -- NOSONAR: explicit RBAC matrix is safer to audit than generated SQL
 ('atendente_loja','loja.entregas.create'),('atendente_loja','loja.entregas.mine'),('atendente_loja','loja.protocolos.view'), -- NOSONAR
 ('supervisor_loja','loja.entregas.create'),('supervisor_loja','loja.entregas.mine'),('supervisor_loja','loja.entregas.store'),('supervisor_loja','loja.historico.view'),('supervisor_loja','loja.protocolos.view'), -- NOSONAR
 ('coordenador_loja','loja.entregas.create'),('coordenador_loja','loja.entregas.mine'),('coordenador_loja','loja.entregas.store'),('coordenador_loja','loja.historico.view'),('coordenador_loja','loja.protocolos.view'),('coordenador_loja','loja.lojas.manage') -- NOSONAR
)
insert into app_role_permissions(role_id,permission) select role_id,permission from permissions on conflict do nothing;
