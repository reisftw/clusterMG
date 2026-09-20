with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('configuracao.senior.view', 'configuracao', 'Configuração', 'senior', 'Senior / Sapiens', 'view', 1280, 'manage_integracoes', 'Visualizar configuração da integração Senior/Sapiens.'),
    ('configuracao.senior.manage', 'configuracao', 'Configuração', 'senior', 'Senior / Sapiens', 'manage', 1281, 'manage_integracoes', 'Gerenciar credenciais e validação da integração Senior/Sapiens.')
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
  created_at,
  updated_at
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
  now(),
  now()
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
  updated_at = now();

insert into app_role_permissions (role_id, permission)
select distinct role_id, 'configuracao.senior.view'
from app_role_permissions
where permission = 'manage_integracoes'
on conflict do nothing;

insert into app_role_permissions (role_id, permission)
select distinct role_id, 'configuracao.senior.manage'
from app_role_permissions
where permission = 'manage_integracoes'
on conflict do nothing;
