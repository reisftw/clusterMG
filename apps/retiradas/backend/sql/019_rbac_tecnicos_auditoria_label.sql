begin;

insert into app_permissions (
  id,
  section_id,
  section_label,
  feature_id,
  feature_label,
  action,
  description,
  sort_order,
  legacy_permission,
  active,
  deprecated
) values
  (
    'tecnicos.auditoria_bolsa.view',
    'tecnicos',
    'Técnicos',
    'auditoria',
    'Auditoria',
    'view',
    'Visualizar auditoria de bolsa dos técnicos, materiais em bolsa e relatórios.',
    420,
    null,
    true,
    false
  ),
  (
    'tecnicos.auditoria_bolsa.manage',
    'tecnicos',
    'Técnicos',
    'auditoria',
    'Auditoria',
    'manage',
    'Atualizar bolsas, configurar alertas, executar rotinas e enviar relatórios da auditoria.',
    421,
    null,
    true,
    false
  )
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  description = excluded.description,
  sort_order = excluded.sort_order,
  legacy_permission = excluded.legacy_permission,
  active = excluded.active,
  deprecated = excluded.deprecated,
  updated_at = now();

commit;
