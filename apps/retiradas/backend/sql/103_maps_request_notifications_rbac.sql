-- Permissao independente para exibir o alerta e a fila de solicitacoes do Maps.
-- Aprovar e recusar continuam controlados por permissoes separadas.

insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
)
values (
  'retiradas.maps.v2.view_requests',
  'retiradas_maps_v2',
  'Retiradas Maps 2.0',
  'maps_v2_requests_queue',
  'Alertas e fila de solicitacoes',
  'view',
  824,
  null,
  'Exibir o atalho, o contador e a fila de solicitacoes de retirada do Maps.',
  true,
  false
)
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  sort_order = excluded.sort_order,
  description = excluded.description,
  active = true,
  deprecated = false;

insert into app_role_permissions (role_id, permission)
select role_id, 'retiradas.maps.v2.view_requests'
from (values ('admin'), ('backoffice'), ('backoffice_retirada')) as defaults(role_id)
where exists (select 1 from app_roles role where role.id = defaults.role_id)
on conflict (role_id, permission) do nothing;
