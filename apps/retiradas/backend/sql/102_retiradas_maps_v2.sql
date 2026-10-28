-- Retiradas Maps 2.0.
-- Estruturas aditivas para geolocalizacao, radar, solicitacoes e roteiros.

create table if not exists maps_order_locations (
  order_id text primary key references ordens_servico(id) on update cascade on delete cascade,
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  coordinate_source text not null,
  accuracy_level text not null default 'UNKNOWN',
  accuracy_meters integer,
  address_hash text,
  validated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_order_locations_bbox_idx
  on maps_order_locations (latitude, longitude);
create index if not exists maps_order_locations_last_seen_idx
  on maps_order_locations (last_seen_at desc);

create table if not exists maps_geocode_cache (
  address_hash text primary key,
  normalized_address text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  provider text,
  provider_reference text,
  accuracy_level text not null default 'UNKNOWN',
  accuracy_meters integer,
  status text not null default 'PENDING',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_geocode_cache_queue_idx
  on maps_geocode_cache (status, next_attempt_at, created_at);

create table if not exists maps_geocode_jobs (
  order_id text primary key references ordens_servico(id) on update cascade on delete cascade,
  address_hash text not null references maps_geocode_cache(address_hash) on update cascade on delete cascade,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_geocode_jobs_queue_idx
  on maps_geocode_jobs (status, created_at);

create table if not exists maps_assignment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references ordens_servico(id) on update cascade on delete restrict,
  requester_user_id text not null,
  requester_name text,
  requester_email text,
  regional text,
  city text,
  status text not null default 'PENDING',
  resolution_note text,
  reviewed_by_id text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists maps_assignment_requests_open_order_idx
  on maps_assignment_requests (order_id)
  where status in ('PENDING', 'APPROVED', 'PENDING_EFFECTUATION');
create index if not exists maps_assignment_requests_requester_idx
  on maps_assignment_requests (requester_user_id, created_at desc);
create index if not exists maps_assignment_requests_status_idx
  on maps_assignment_requests (status, created_at desc);

create table if not exists maps_radar_settings (
  user_id text primary key,
  enabled boolean not null default false,
  radius_meters integer not null default 300,
  alert_assigned boolean not null default true,
  alert_opportunities boolean not null default true,
  notifications_enabled boolean not null default false,
  quiet_until timestamptz,
  schedule_start time not null default '08:00',
  schedule_end time not null default '18:00',
  last_valid_location_at timestamptz,
  last_alert_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (radius_meters in (100, 250, 300, 500, 1000))
);

create table if not exists maps_radar_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  order_id text references ordens_servico(id) on update cascade on delete set null,
  category text not null,
  distance_meters integer,
  state text not null default 'ENTERED',
  grouped_count integer not null default 1,
  dismissed_at timestamptz,
  notified_at timestamptz not null default now(),
  exited_at timestamptz,
  cooldown_until timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists maps_radar_alerts_user_time_idx
  on maps_radar_alerts (user_id, notified_at desc);
create index if not exists maps_radar_alerts_order_cooldown_idx
  on maps_radar_alerts (user_id, order_id, cooldown_until desc);

create table if not exists maps_routes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  route_date date not null default current_date,
  status text not null default 'DRAFT',
  optimized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_routes_user_date_idx
  on maps_routes (user_id, route_date desc, updated_at desc);

create table if not exists maps_route_items (
  route_id uuid not null references maps_routes(id) on delete cascade,
  order_id text not null references ordens_servico(id) on update cascade on delete restrict,
  sequence_number integer not null,
  distance_from_previous_meters integer,
  estimated_travel_minutes integer,
  added_at timestamptz not null default now(),
  primary key (route_id, order_id),
  unique (route_id, sequence_number)
);

create index if not exists maps_route_items_order_idx
  on maps_route_items (order_id);

with permissions(id, feature_id, feature_label, action, sort_order, description) as (
  values
    ('retiradas.maps.v2.access', 'maps_v2', 'Retiradas Maps 2.0', 'view', 820, 'Acessar o Retiradas Maps 2.0.'),
    ('retiradas.maps.v2.view_assigned', 'maps_v2_assigned', 'Minhas retiradas', 'view', 821, 'Visualizar retiradas atribuidas ao proprio tecnico.'),
    ('retiradas.maps.v2.view_opportunities', 'maps_v2_opportunities', 'Oportunidades proximas', 'view', 822, 'Visualizar oportunidades anonimizadas no mapa.'),
    ('retiradas.maps.v2.radar', 'maps_v2_radar', 'Radar de proximidade', 'manage', 823, 'Ativar e configurar o Radar de Retiradas.'),
    ('retiradas.maps.v2.request_os', 'maps_v2_requests', 'Solicitar oportunidade', 'manage', 824, 'Solicitar atribuicao de uma oportunidade.'),
    ('retiradas.maps.v2.approve_request', 'maps_v2_approval', 'Aprovar solicitacoes', 'manage', 825, 'Aprovar solicitacoes de oportunidades.'),
    ('retiradas.maps.v2.reject_request', 'maps_v2_approval', 'Recusar solicitacoes', 'manage', 826, 'Recusar solicitacoes de oportunidades.'),
    ('retiradas.maps.v2.manage_routes', 'maps_v2_routes', 'Roteiros', 'manage', 827, 'Criar e otimizar roteiros de retirada.'),
    ('retiradas.maps.v2.manage_settings', 'maps_v2_settings', 'Configuracoes do Maps', 'manage', 828, 'Gerenciar configuracoes operacionais do Maps.'),
    ('retiradas.maps.v2.audit', 'maps_v2_audit', 'Auditoria do Maps', 'view', 829, 'Visualizar solicitacoes, alertas e simulador do Maps.')
)
insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
)
select id, 'retiradas_maps_v2', 'Retiradas Maps 2.0', feature_id,
       feature_label, action, sort_order, null, description, true, false
from permissions
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  sort_order = excluded.sort_order,
  description = excluded.description,
  active = true,
  deprecated = false;

insert into app_role_permissions (role_id, permission)
select role_id, permission
from (values
  ('tecnico', 'retiradas.maps.v2.access'),
  ('tecnico', 'retiradas.maps.v2.view_assigned'),
  ('tecnico', 'retiradas.maps.v2.view_opportunities'),
  ('tecnico', 'retiradas.maps.v2.radar'),
  ('tecnico', 'retiradas.maps.v2.request_os'),
  ('tecnico', 'retiradas.maps.v2.manage_routes'),
  ('backoffice', 'retiradas.maps.v2.access'),
  ('backoffice', 'retiradas.maps.v2.view_opportunities'),
  ('backoffice', 'retiradas.maps.v2.request_os'),
  ('backoffice', 'retiradas.maps.v2.manage_routes'),
  ('backoffice_retirada', 'retiradas.maps.v2.access'),
  ('backoffice_retirada', 'retiradas.maps.v2.view_assigned'),
  ('backoffice_retirada', 'retiradas.maps.v2.view_opportunities'),
  ('backoffice_retirada', 'retiradas.maps.v2.request_os'),
  ('backoffice_retirada', 'retiradas.maps.v2.approve_request'),
  ('backoffice_retirada', 'retiradas.maps.v2.reject_request'),
  ('backoffice_retirada', 'retiradas.maps.v2.manage_routes'),
  ('backoffice_retirada', 'retiradas.maps.v2.audit'),
  ('supervisor', 'retiradas.maps.v2.access'),
  ('supervisor', 'retiradas.maps.v2.view_assigned'),
  ('supervisor', 'retiradas.maps.v2.view_opportunities'),
  ('supervisor', 'retiradas.maps.v2.radar'),
  ('supervisor', 'retiradas.maps.v2.request_os'),
  ('supervisor', 'retiradas.maps.v2.approve_request'),
  ('supervisor', 'retiradas.maps.v2.reject_request'),
  ('supervisor', 'retiradas.maps.v2.manage_routes'),
  ('supervisor', 'retiradas.maps.v2.manage_settings'),
  ('supervisor', 'retiradas.maps.v2.audit')
) as grants(role_id, permission)
where exists (select 1 from app_roles r where r.id = grants.role_id)
on conflict do nothing;
