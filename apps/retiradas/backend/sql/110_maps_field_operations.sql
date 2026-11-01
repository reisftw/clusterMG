begin;

create table if not exists maps_technician_location_history (
  id bigserial primary key,
  user_id text not null references app_users(uid) on update cascade on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision,
  heading_degrees double precision,
  speed_mps double precision,
  consent_source text not null default 'BROWSER_GEOLOCATION',
  recorded_at timestamptz not null default now()
);

create index if not exists maps_technician_location_history_user_time_idx
  on maps_technician_location_history (user_id, recorded_at desc);
create index if not exists maps_technician_location_history_time_idx
  on maps_technician_location_history (recorded_at desc);

create table if not exists maps_order_proximity_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references ordens_servico(id) on update cascade on delete cascade,
  user_id text not null references app_users(uid) on update cascade on delete cascade,
  technician_name text,
  event_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  minimum_distance_meters integer not null,
  observations integer not null default 1,
  source text not null default 'LIVE_LOCATION',
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists maps_order_proximity_events_order_user_day_idx
  on maps_order_proximity_events (order_id, user_id, event_date);
create index if not exists maps_order_proximity_events_order_time_idx
  on maps_order_proximity_events (order_id, last_seen_at desc);
create index if not exists maps_order_proximity_events_user_time_idx
  on maps_order_proximity_events (user_id, last_seen_at desc);

alter table maps_assignment_requests
  add column if not exists batch_id uuid;
create index if not exists maps_assignment_requests_batch_idx
  on maps_assignment_requests (batch_id, created_at desc)
  where batch_id is not null;

alter table maps_radar_settings alter column enabled set default true;
alter table maps_radar_settings alter column notifications_enabled set default true;

insert into maps_radar_settings (user_id, enabled, notifications_enabled)
select uid, true, true
  from app_users
 where disabled = false and lower(coalesce(role, '')) = 'tecnico'
on conflict (user_id) do update set
  enabled = true,
  notifications_enabled = true,
  updated_at = now();

insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
)
values (
  'retiradas.maps.v2.view_tracks',
  'retiradas_maps_v2',
  'Retiradas Maps 2.0',
  'maps_v2_tracks',
  'Historico de deslocamento',
  'view',
  831,
  null,
  'Visualizar a rota percorrida pelos tecnicos no horario operacional e as evidencias de proximidade.',
  true,
  false
)
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
select 'admin', 'retiradas.maps.v2.view_tracks'
where exists (select 1 from app_roles where id = 'admin')
on conflict (role_id, permission) do nothing;

commit;
