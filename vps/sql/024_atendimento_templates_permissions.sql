with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('atendimento.templates.manage', 'atendimento', 'Atendimento', 'templates', 'Templates', 'manage', 1425, null, 'Gerenciar templates das mensagens automáticas do atendimento WhatsApp.')
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

insert into app_role_permissions (role_id, permission)
select role_id, permission
from (
  values
    ('admin', 'atendimento.templates.manage'),
    ('supervisor', 'atendimento.templates.manage')
) as defaults(role_id, permission)
where exists (select 1 from app_roles where id = defaults.role_id)
on conflict (role_id, permission) do nothing;
