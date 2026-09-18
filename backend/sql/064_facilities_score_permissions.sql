with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('facilities.score.view', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'view', 1581, 'facilities.score.view', 'Visualizar Saúde das Unidades.'),
    ('facilities.score.details.view', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'view', 1582, 'facilities.score.view', 'Visualizar detalhe e decomposição do score por unidade.'),
    ('facilities.score.export', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'view', 1583, 'facilities.score.view', 'Exportar score, fatores e pendências.'),
    ('facilities.score.configure', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'configure', 1584, 'facilities.manage', 'Configurar pesos, criticidades e faixas do Facility Score.'),
    ('facilities.saude.view', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'view', 1585, 'facilities.score.view', 'Visualizar indicador de saúde das unidades.'),
    ('facilities.saude.configure', 'facilities', 'Facilities', 'score', 'Saúde das Unidades', 'configure', 1586, 'facilities.manage', 'Configurar indicador de saúde das unidades.')
)
insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
)
select id, section_id, section_label, feature_id, feature_label, action,
       sort_order, legacy_permission, description, true, false
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
