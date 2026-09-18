create table if not exists audit_logs (
  id text primary key,
  user_id text,
  user_name text,
  user_email text,
  setor_id text,
  department_id text,
  module text not null,
  entity text,
  action text not null,
  record_id text,
  ip_address text,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  changed_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_id_idx on audit_logs (user_id);
create index if not exists audit_logs_setor_id_idx on audit_logs (setor_id);
create index if not exists audit_logs_department_id_idx on audit_logs (department_id);
create index if not exists audit_logs_module_idx on audit_logs (module);
create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);

with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    (
      'configuracao.auditoria.view',
      'configuracao',
      'Configuração',
      'auditoria',
      'Logs de Auditoria',
      'view',
      1130,
      null,
      'Visualizar logs de auditoria do sistema.'
    )
)
insert into app_permissions (
  id,
  section_id,
  section_label,
  feature_id,
  feature_label,
  action,
  sort_order,
  legacy_permission,
  description,
  active,
  deprecated
)
select
  id,
  section_id,
  section_label,
  feature_id,
  feature_label,
  action,
  sort_order,
  legacy_permission,
  description,
  true,
  false
from permissions
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  sort_order = excluded.sort_order,
  legacy_permission = excluded.legacy_permission,
  description = excluded.description,
  active = true,
  deprecated = false;
