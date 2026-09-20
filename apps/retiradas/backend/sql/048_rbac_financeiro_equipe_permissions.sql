with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    (
      'financeiro.equipe.view',
      'financeiro',
      'Financeiro',
      'equipe',
      'Equipe',
      'view',
      1380,
      null,
      'Permite visualizar o organograma da equipe financeira.'
    ),
    (
      'financeiro.equipe.manage',
      'financeiro',
      'Financeiro',
      'equipe',
      'Equipe',
      'manage',
      1381,
      null,
      'Permite cadastrar cargos, colaboradores e reorganizar o organograma financeiro.'
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
