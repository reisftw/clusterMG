insert into app_permissions (
  id,
  section_id,
  section_label,
  feature_id,
  feature_label,
  action,
  sort_order,
  legacy_permission,
  description
) values
  (
    'configuracao.vpn.view',
    'configuracao',
    'Configuração',
    'vpn',
    'VPN',
    'view',
    1120,
    null,
    'Visualizar configurações e logs de VPN.'
  ),
  (
    'configuracao.vpn.manage',
    'configuracao',
    'Configuração',
    'vpn',
    'VPN',
    'manage',
    1121,
    null,
    'Gerenciar rotas protegidas, faixas de IP e ativação da VPN.'
  )
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
