-- Fase 1 do dominio DSS (Dialogo Semanal de Seguranca), dentro de
-- Seguranca do Trabalho: catalogo de permissoes, usando a MESMA
-- infraestrutura de rot_roles/rot_permissions/rot_role_permissions que
-- o SST ja usa (sem RBAC paralelo). Cargos sst_manager/sst_tech ja
-- existem (046_seguranca_trabalho_rbac.sql) e recebem as permissoes de
-- DSS aqui, sem criar cargo novo so pra DSS.
--
-- "DSS da minha equipe" (visao do gestor, secao 10 do pedido) nao tem
-- permissao dedicada: fica implicita pra qualquer autenticado, mesmo
-- padrao do fallback de protocolVisibilityClause em sst/routes.js.

insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, sort_order, description)
values
	('dss.dashboard.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'view', 1000, 'Acessar o dashboard de indicadores do DSS.'),

	('dss.tema.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'view', 1001, 'Visualizar temas de DSS.'),
	('dss.tema.criar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1002, 'Criar temas de DSS.'),
	('dss.tema.editar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1003, 'Editar/publicar temas de DSS.'),
	('dss.tema.arquivar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1004, 'Arquivar temas de DSS.'),

	('dss.programacao.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'view', 1005, 'Visualizar programacoes de DSS.'),
	('dss.programacao.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1006, 'Criar/editar/cancelar programacoes de DSS.'),
	('dss.programacao.publicar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1007, 'Publicar programacoes de DSS, gerando as execucoes por equipe automaticamente.'),

	('dss.execucao.visualizar_abrangencia', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'view', 1008, 'Visualizar execucoes de DSS dentro da abrangencia operacional autorizada.'),
	('dss.execucao.visualizar_todos', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'view', 1009, 'Visualizar todas as execucoes de DSS sem restricao de abrangencia.'),
	('dss.execucao.registrar_presenca', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1010, 'Registrar presenca/ausencia e anexar evidencia em execucoes de DSS.'),
	('dss.execucao.enviar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1011, 'Enviar execucao de DSS para validacao do SST.'),
	('dss.execucao.validar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'approve', 1012, 'Validar ou solicitar correcao em execucoes de DSS enviadas.'),

	('dss.relatorio.visualizar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'view', 1013, 'Acessar relatorios/indicadores gerenciais do DSS.'),
	('dss.relatorio.exportar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1014, 'Exportar relatorios do DSS em PDF/XLSX.')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true;

-- Tecnico SST: gerencia temas/programacoes/execucoes e valida.
insert into rot_role_permissions (role_id, permission_id)
select 'sst_tech', id from rot_permissions where id in (
	'dss.dashboard.visualizar',
	'dss.tema.visualizar', 'dss.tema.criar', 'dss.tema.editar', 'dss.tema.arquivar',
	'dss.programacao.visualizar', 'dss.programacao.gerenciar', 'dss.programacao.publicar',
	'dss.execucao.visualizar_abrangencia', 'dss.execucao.validar',
	'dss.relatorio.visualizar', 'dss.relatorio.exportar'
)
on conflict do nothing;

-- Gestor SST: tudo do tecnico + visao total.
insert into rot_role_permissions (role_id, permission_id)
select 'sst_manager', id from rot_permissions where id in (
	'dss.dashboard.visualizar',
	'dss.tema.visualizar', 'dss.tema.criar', 'dss.tema.editar', 'dss.tema.arquivar',
	'dss.programacao.visualizar', 'dss.programacao.gerenciar', 'dss.programacao.publicar',
	'dss.execucao.visualizar_abrangencia', 'dss.execucao.visualizar_todos', 'dss.execucao.validar',
	'dss.relatorio.visualizar', 'dss.relatorio.exportar'
)
on conflict do nothing;
