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
    'auditoria_bolsa',
    'Bolsa Técnico',
    'view',
    'Visualizar auditoria de bolsa dos técnicos via API Sempre.',
    350,
    null,
    true,
    false
  ),
  (
    'tecnicos.auditoria_bolsa.manage',
    'tecnicos',
    'Técnicos',
    'auditoria_bolsa',
    'Bolsa Técnico',
    'manage',
    'Atualizar bolsas, configurar alertas e executar rotinas da auditoria de bolsa.',
    351,
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
  active = true,
  deprecated = false;

insert into app_role_permissions (role_id, permission)
select role_id, permission
from (
  values
    ('supervisor', 'tecnicos.auditoria_bolsa.view'),
    ('supervisor', 'tecnicos.auditoria_bolsa.manage'),
    ('backoffice_retirada', 'tecnicos.auditoria_bolsa.view'),
    ('backoffice_retirada', 'tecnicos.auditoria_bolsa.manage'),
    ('backoffice', 'tecnicos.auditoria_bolsa.view'),
    ('backoffice', 'tecnicos.auditoria_bolsa.manage'),
    ('lider_empresa', 'tecnicos.auditoria_bolsa.view')
) as seed(role_id, permission)
where exists (select 1 from app_roles where id = seed.role_id)
on conflict do nothing;

commit;
