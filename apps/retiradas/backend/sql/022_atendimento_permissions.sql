with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('atendimento.casos.view', 'atendimento', 'Atendimento', 'casos', 'Casos', 'view', 1400, null, 'Visualizar casos do atendimento WhatsApp.'),
    ('atendimento.casos.manage', 'atendimento', 'Atendimento', 'casos', 'Casos', 'manage', 1401, null, 'Gerenciar casos e responder atendimentos WhatsApp.'),
    ('atendimento.tecnicos.view', 'atendimento', 'Atendimento', 'tecnicos', 'Técnicos WhatsApp', 'view', 1410, null, 'Visualizar técnicos cadastrados pelo atendimento WhatsApp.'),
    ('atendimento.tecnicos.manage', 'atendimento', 'Atendimento', 'tecnicos', 'Técnicos WhatsApp', 'manage', 1411, null, 'Gerenciar técnicos cadastrados pelo atendimento WhatsApp.'),
    ('atendimento.configuracoes.view', 'atendimento', 'Atendimento', 'configuracoes', 'Configurações', 'view', 1420, null, 'Visualizar configurações do bot de atendimento.'),
    ('atendimento.configuracoes.manage', 'atendimento', 'Atendimento', 'configuracoes', 'Configurações', 'manage', 1421, null, 'Gerenciar bot, instância Evolution, horários e templates do atendimento.'),
    ('atendimento.logs.view', 'atendimento', 'Atendimento', 'logs', 'Logs', 'view', 1430, null, 'Visualizar logs do atendimento WhatsApp.')
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
    ('admin', 'atendimento.casos.view'),
    ('admin', 'atendimento.casos.manage'),
    ('admin', 'atendimento.tecnicos.view'),
    ('admin', 'atendimento.tecnicos.manage'),
    ('admin', 'atendimento.configuracoes.view'),
    ('admin', 'atendimento.configuracoes.manage'),
    ('admin', 'atendimento.logs.view'),
    ('supervisor', 'atendimento.casos.view'),
    ('supervisor', 'atendimento.casos.manage'),
    ('supervisor', 'atendimento.tecnicos.view'),
    ('supervisor', 'atendimento.tecnicos.manage'),
    ('supervisor', 'atendimento.logs.view'),
    ('backoffice', 'atendimento.casos.view'),
    ('backoffice', 'atendimento.casos.manage'),
    ('backoffice', 'atendimento.tecnicos.view'),
    ('backoffice', 'atendimento.logs.view'),
    ('backoffice_retirada', 'atendimento.casos.view'),
    ('backoffice_retirada', 'atendimento.casos.manage'),
    ('backoffice_retirada', 'atendimento.tecnicos.view'),
    ('backoffice_retirada', 'atendimento.logs.view')
) as defaults(role_id, permission)
where exists (select 1 from app_roles where id = defaults.role_id)
on conflict (role_id, permission) do nothing;
