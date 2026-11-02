begin;

create table if not exists maps_admin_presentation_settings (
  user_id text primary key references app_users(uid) on update cascade on delete cascade,
  overview_seconds smallint not null default 12 check (overview_seconds between 5 and 120),
  regional_seconds smallint not null default 10 check (regional_seconds between 5 and 120),
  city_seconds smallint not null default 8 check (city_seconds between 5 and 120),
  technician_seconds smallint not null default 12 check (technician_seconds between 5 and 120),
  route_seconds smallint not null default 10 check (route_seconds between 5 and 120),
  inactivity_seconds smallint not null default 60 check (inactivity_seconds between 15 and 600),
  ranking_limit smallint not null default 3 check (ranking_limit between 1 and 10),
  active_signal_minutes smallint not null default 5 check (active_signal_minutes between 1 and 30),
  attention_signal_minutes smallint not null default 15 check (attention_signal_minutes between 2 and 120),
  stop_radius_meters smallint not null default 80 check (stop_radius_meters between 20 and 500),
  stop_minutes smallint not null default 10 check (stop_minutes between 5 and 180),
  rotate_regionals boolean not null default true,
  automatic_movement boolean not null default true,
  show_priority_orders boolean not null default true,
  show_daily_route boolean not null default true,
  auto_resume boolean not null default true,
  layer_preferences jsonb not null default '{"technicians":true,"openOrders":true,"assignedOrders":true,"priorityOrders":true,"routes":true,"regionals":true,"cities":true,"stops":true}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists maps_admin_presentation_settings_touch_updated_at on maps_admin_presentation_settings;
create trigger maps_admin_presentation_settings_touch_updated_at
before update on maps_admin_presentation_settings
for each row execute function touch_updated_at();

comment on table maps_admin_presentation_settings is
  'Preferencias administrativas do modo TV da Central de Monitoramento do Retiradas Maps.';

commit;
