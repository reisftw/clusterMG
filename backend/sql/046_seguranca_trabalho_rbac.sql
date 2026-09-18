-- Fase B do dominio Seguranca do Trabalho (SST): so RBAC + cargos.
-- Nao cria nenhuma tabela de protocolo ainda (isso e Fase C) — aqui so
-- preparamos o catalogo de permissoes e os dois novos cargos, usando a
-- MESMA infraestrutura de rot_roles/rot_permissions/rot_role_permissions
-- que ja existe pra Ativos & Seguranca, sem sistema de auth paralelo.

insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, sort_order, description)
values
	('sst.dashboard.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dashboard', 'Visao Geral', 'view', 900, 'Acessar o cockpit de Seguranca do Trabalho.'),

	('sst.protocolo.visualizar_proprio', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'view', 901, 'Visualizar protocolos onde e o solicitante ou o colaborador envolvido.'),
	('sst.protocolo.visualizar_equipe', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'view', 902, 'Visualizar protocolos dos colaboradores sob sua gestao (modo acompanhamento).'),
	('sst.protocolo.visualizar_abrangencia', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'view', 903, 'Visualizar protocolos dentro da abrangencia operacional autorizada.'),
	('sst.protocolo.visualizar_todos', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'view', 904, 'Visualizar todos os protocolos SST sem restricao de abrangencia.'),
	('sst.protocolo.criar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 905, 'Criar/abrir protocolos SST.'),
	('sst.protocolo.atribuir', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 906, 'Assumir ou atribuir/reatribuir o responsavel de um protocolo.'),
	('sst.protocolo.editar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 907, 'Editar dados/classificacao de um protocolo.'),
	('sst.protocolo.responder', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 908, 'Enviar resposta oficial e notas internas em um protocolo.'),
	('sst.protocolo.solicitar_informacao', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 909, 'Solicitar manifestacao/informacao de colaborador, gestor ou outro envolvido.'),
	('sst.protocolo.alterar_prioridade', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 910, 'Alterar a prioridade de um protocolo.'),
	('sst.protocolo.alterar_status', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 911, 'Alterar o status/workflow de um protocolo.'),
	('sst.protocolo.criar_acao', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 912, 'Criar plano de acao a partir de um protocolo.'),
	('sst.protocolo.concluir', 'seguranca_trabalho', 'Seguranca do Trabalho', 'protocolo', 'Protocolos', 'manage', 913, 'Concluir ou reabrir um protocolo.'),

	('sst.apr.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'apr', 'APR', 'view', 920, 'Visualizar APRs dentro do dominio SST.'),
	('sst.apr.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'apr', 'APR', 'manage', 921, 'Tratar/gerenciar APRs dentro do dominio SST.'),

	('sst.quase_acidente.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'quase_acidente', 'Quase Acidentes', 'view', 930, 'Visualizar registros de quase acidente.'),
	('sst.quase_acidente.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'quase_acidente', 'Quase Acidentes', 'manage', 931, 'Tratar registros de quase acidente.'),

	('sst.acidente.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'acidente', 'Acidentes e Incidentes', 'view', 940, 'Visualizar acidentes e incidentes.'),
	('sst.acidente.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'acidente', 'Acidentes e Incidentes', 'manage', 941, 'Tratar acidentes e incidentes.'),

	('sst.inspecao.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'inspecao', 'Inspecoes', 'view', 950, 'Visualizar inspecoes de seguranca.'),
	('sst.inspecao.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'inspecao', 'Inspecoes', 'manage', 951, 'Realizar/gerenciar inspecoes de seguranca.'),

	('sst.desvio.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'desvio', 'Desvios de Seguranca', 'view', 960, 'Visualizar desvios de seguranca.'),
	('sst.desvio.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'desvio', 'Desvios de Seguranca', 'manage', 961, 'Tratar desvios de seguranca.'),

	('sst.plano_acao.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'plano_acao', 'Planos de Acao', 'view', 970, 'Visualizar planos de acao SST.'),
	('sst.plano_acao.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'plano_acao', 'Planos de Acao', 'manage', 971, 'Criar/editar planos de acao SST.'),
	('sst.plano_acao.validar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'plano_acao', 'Planos de Acao', 'approve', 972, 'Validar a conclusao de planos de acao SST.'),

	('sst.relatorio.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'relatorio', 'Relatorios', 'view', 980, 'Acessar relatorios/indicadores gerenciais de SST.'),
	('sst.configuracoes.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'configuracoes', 'Configuracoes', 'manage', 990, 'Gerenciar categorias, prioridades, SLA e templates de SST.')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true;

-- Dois novos cargos, seguindo o mesmo mecanismo de usuarios/cargos —
-- sem autenticacao propria. Nivel/escopo servem so pra hierarquia visual
-- em Usuarios & Cargos (quem pode editar quem); autorizacao de feature
-- e sempre via permissao granular, nunca via "if cargo === X".
insert into rot_roles (id, name, description, level, is_global, permissions, system_role)
values
	('sst_manager', 'Gestor de Seguranca do Trabalho', 'Gestao do dominio Seguranca do Trabalho: distribui protocolos, acompanha SLA, configura o modulo.', 85, false, '[]'::jsonb, true),
	('sst_tech', 'Tecnico de Seguranca do Trabalho', 'Tratativas operacionais de Seguranca do Trabalho: protocolos, investigacao, planos de acao.', 55, false, '[]'::jsonb, true)
on conflict (id) do update set
	name = excluded.name,
	description = excluded.description,
	level = excluded.level,
	is_global = excluded.is_global,
	system_role = true,
	updated_at = now();

-- Tecnico SST: trata protocolos dentro da abrangencia autorizada.
insert into rot_role_permissions (role_id, permission_id)
select 'sst_tech', id from rot_permissions where id in (
	'sst.dashboard.visualizar',
	'sst.protocolo.visualizar_abrangencia',
	'sst.protocolo.criar',
	'sst.protocolo.atribuir',
	'sst.protocolo.editar',
	'sst.protocolo.responder',
	'sst.protocolo.solicitar_informacao',
	'sst.protocolo.alterar_prioridade',
	'sst.protocolo.alterar_status',
	'sst.protocolo.criar_acao',
	'sst.protocolo.concluir',
	'sst.apr.visualizar', 'sst.apr.gerenciar',
	'sst.quase_acidente.visualizar', 'sst.quase_acidente.gerenciar',
	'sst.acidente.visualizar', 'sst.acidente.gerenciar',
	'sst.inspecao.visualizar', 'sst.inspecao.gerenciar',
	'sst.desvio.visualizar', 'sst.desvio.gerenciar',
	'sst.plano_acao.visualizar', 'sst.plano_acao.gerenciar', 'sst.plano_acao.validar'
)
on conflict do nothing;

-- Gestor SST: tudo do tecnico + visao total, relatorios e configuracoes.
insert into rot_role_permissions (role_id, permission_id)
select 'sst_manager', id from rot_permissions where id in (
	'sst.dashboard.visualizar',
	'sst.protocolo.visualizar_abrangencia',
	'sst.protocolo.visualizar_todos',
	'sst.protocolo.criar',
	'sst.protocolo.atribuir',
	'sst.protocolo.editar',
	'sst.protocolo.responder',
	'sst.protocolo.solicitar_informacao',
	'sst.protocolo.alterar_prioridade',
	'sst.protocolo.alterar_status',
	'sst.protocolo.criar_acao',
	'sst.protocolo.concluir',
	'sst.apr.visualizar', 'sst.apr.gerenciar',
	'sst.quase_acidente.visualizar', 'sst.quase_acidente.gerenciar',
	'sst.acidente.visualizar', 'sst.acidente.gerenciar',
	'sst.inspecao.visualizar', 'sst.inspecao.gerenciar',
	'sst.desvio.visualizar', 'sst.desvio.gerenciar',
	'sst.plano_acao.visualizar', 'sst.plano_acao.gerenciar', 'sst.plano_acao.validar',
	'sst.relatorio.visualizar',
	'sst.configuracoes.gerenciar'
)
on conflict do nothing;
