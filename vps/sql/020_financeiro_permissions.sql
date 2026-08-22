with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, legacy_permission, description) as (
  values
    ('financeiro.visao_geral.view', 'financeiro', 'Financeiro', 'visao_geral', 'Visão Geral', 'view', 1300, null, 'Visualizar painel financeiro.'),
    ('financeiro.visao_geral.manage', 'financeiro', 'Financeiro', 'visao_geral', 'Visão Geral', 'manage', 1301, null, 'Gerenciar ações da visão geral financeira.'),
    ('financeiro.contas_pagar.view', 'financeiro', 'Financeiro', 'contas_pagar', 'Contas a Pagar', 'view', 1310, null, 'Visualizar contas a pagar.'),
    ('financeiro.contas_pagar.manage', 'financeiro', 'Financeiro', 'contas_pagar', 'Contas a Pagar', 'manage', 1311, null, 'Gerenciar contas a pagar.'),
    ('financeiro.contas_receber.view', 'financeiro', 'Financeiro', 'contas_receber', 'Contas a Receber', 'view', 1320, null, 'Visualizar contas a receber.'),
    ('financeiro.contas_receber.manage', 'financeiro', 'Financeiro', 'contas_receber', 'Contas a Receber', 'manage', 1321, null, 'Gerenciar contas a receber.'),
    ('financeiro.faturamento.view', 'financeiro', 'Financeiro', 'faturamento', 'Faturamento', 'view', 1330, null, 'Visualizar faturamento.'),
    ('financeiro.notas.view', 'financeiro', 'Financeiro', 'notas', 'Notas', 'view', 1340, null, 'Visualizar notas financeiras.'),
    ('financeiro.chamados.view', 'financeiro', 'Financeiro', 'chamados', 'Chamados', 'view', 1350, null, 'Visualizar chamados financeiros.'),
    ('financeiro.configuracoes.view', 'financeiro', 'Financeiro', 'configuracoes', 'Configurações', 'view', 1360, null, 'Visualizar configurações financeiras.'),
    ('financeiro.configuracoes.manage', 'financeiro', 'Financeiro', 'configuracoes', 'Configurações', 'manage', 1361, null, 'Gerenciar configurações financeiras e dados de mockup.')
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
