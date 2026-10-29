begin;

create table if not exists maps_technician_presence (
  user_id text primary key references app_users(uid) on update cascade on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision,
  heading_degrees double precision,
  speed_mps double precision,
  technician_name text,
  display_name text,
  consent_source text not null default 'BROWSER_GEOLOCATION',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_technician_presence_seen_idx
  on maps_technician_presence (last_seen_at desc);

drop trigger if exists maps_technician_presence_touch_updated_at on maps_technician_presence;
create trigger maps_technician_presence_touch_updated_at
before update on maps_technician_presence
for each row execute function touch_updated_at();

insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
)
values (
  'retiradas.maps.v2.live_technicians',
  'retiradas_maps_v2',
  'Retiradas Maps 2.0',
  'maps_v2_live_technicians',
  'Mapa ao vivo dos tecnicos',
  'view',
  830,
  null,
  'Visualizar a ultima localizacao compartilhada pelos tecnicos no painel administrativo.',
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
select 'admin', 'retiradas.maps.v2.live_technicians'
where exists (select 1 from app_roles where id = 'admin')
on conflict (role_id, permission) do nothing;

commit;
