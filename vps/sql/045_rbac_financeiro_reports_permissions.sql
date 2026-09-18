with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('financeiro.reports.view', 'financeiro', 'Financeiro', 'reports', 'Reports', 'view', 1350, 'financeiro.chamados.view', 'Visualizar reports financeiros.'),
    ('financeiro.reports.manage', 'financeiro', 'Financeiro', 'reports', 'Reports', 'manage', 1351, null, 'Gerenciar imports e reports financeiros.')
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

update app_permissions
   set active = false,
       deprecated = true,
       feature_label = 'Reports',
       description = 'Permissao legada substituida por financeiro.reports.view.'
 where id = 'financeiro.chamados.view';
