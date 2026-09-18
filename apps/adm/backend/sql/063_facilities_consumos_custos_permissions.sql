with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('facilities.consumos.view', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1570, 'facilities.consumos.view', 'Visualizar consumos e custos prediais.'),
    ('facilities.consumos.create', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'create', 1571, 'facilities.manage', 'Criar registros de consumo predial.'),
    ('facilities.consumos.edit', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'edit', 1572, 'facilities.manage', 'Editar registros de consumo predial.'),
    ('facilities.consumos.import', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'manage', 1573, 'facilities.manage', 'Importar lançamentos de consumos e custos com preview.'),
    ('facilities.consumos.export', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1574, 'facilities.consumos.view', 'Exportar lançamentos de consumos e custos.'),
    ('facilities.encargos.view', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1575, 'facilities.consumos.view', 'Visualizar custos e encargos de imóveis.'),
    ('facilities.encargos.create', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'create', 1576, 'facilities.manage', 'Criar custos e encargos de imóveis.'),
    ('facilities.encargos.edit', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'edit', 1577, 'facilities.manage', 'Editar custos e encargos de imóveis.'),
    ('facilities.anomalias.view', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'view', 1578, 'facilities.consumos.view', 'Visualizar anomalias de consumo e custo.'),
    ('facilities.anomalias.manage', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'manage', 1579, 'facilities.manage', 'Tratar e justificar anomalias de consumo e custo.'),
    ('facilities.consumos.settings.manage', 'facilities', 'Facilities', 'consumos', 'Consumos & Custos', 'manage', 1580, 'facilities.manage', 'Configurar regras de anomalia de consumos e custos.')
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
