with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('financeiro.gestao_orcamento.view', 'financeiro', 'Financeiro', 'gestao_orcamento', 'Gestão Orçamento', 'view', 1370, null, 'Visualizar gestão de orçamento.'),
    ('financeiro.gestao_orcamento.manage', 'financeiro', 'Financeiro', 'gestao_orcamento', 'Gestão Orçamento', 'manage', 1371, null, 'Gerenciar gestão de orçamento e dados de mockup.')
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
