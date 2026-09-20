with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('atendimento.avaliacoes.manage', 'atendimento', 'Atendimento', 'avaliacoes', 'Avaliação', 'manage', 1440, null, 'Visualizar relatórios e rankings de avaliações do atendimento WhatsApp.')
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
    ('admin', 'atendimento.avaliacoes.manage'),
    ('supervisor', 'atendimento.avaliacoes.manage')
) as defaults(role_id, permission)
where exists (select 1 from app_roles where id = defaults.role_id)
on conflict (role_id, permission) do nothing;
