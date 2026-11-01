insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label,
  action, description, sort_order, active, deprecated, legacy_permission
) values
  ('configuracao.push.view', 'configuracao', 'Configuração', 'push', 'Push',
   'view', 'Visualizar campanhas e métricas de notificações push.', 1012, true, false, null),
  ('configuracao.push.manage', 'configuracao', 'Configuração', 'push', 'Push',
   'manage', 'Criar e enviar campanhas de notificações push.', 1013, true, false, null)
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true,
  deprecated = false,
  updated_at = now();

create table if not exists retiradas_push_campaigns (
  id bigserial primary key,
  notification_id text not null unique,
  title text not null,
  message text not null,
  severity text not null default 'info',
  target_path text,
  target_mode text not null check (target_mode in ('ALL', 'USERS', 'ROLES')),
  target_values jsonb not null default '[]'::jsonb,
  audience_count integer not null default 0,
  selected_devices integer not null default 0,
  sent_devices integer not null default 0,
  failed_devices integer not null default 0,
  created_by_id text,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists retiradas_push_campaigns_created_idx
  on retiradas_push_campaigns (created_at desc);
create index if not exists retiradas_push_campaigns_creator_idx
  on retiradas_push_campaigns (created_by_id, created_at desc);
