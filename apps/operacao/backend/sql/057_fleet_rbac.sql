-- Fase 1 da reestruturacao de Frotas: permissoes granulares, na mesma
-- secao/feature ja usada por rot.fleet.view/rot.fleet.manage
-- (019_rot_operation_scopes_rbac_catalog.sql, secao "recursos"). Quem
-- ja tem rot.fleet.manage (fonte de verdade: rot_role_permissions, nao
-- o jsonb legado de rot_roles.permissions) recebe todas as novas.

insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, sort_order, description)
values
	('rot.fleet.transfer', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 402, 'Transferir veículo para outro responsável, devolver ou retirar da base.'),
	('rot.fleet.receive', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 403, 'Confirmar recebimento de veículo transferido.'),
	('rot.fleet.km.manage', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 404, 'Registrar leitura de quilometragem do veículo.'),
	('rot.fleet.km.correct', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 405, 'Corrigir administrativamente uma leitura de quilometragem incorreta.'),
	('rot.fleet.maintenance.manage', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 406, 'Registrar entrada e retorno de manutenção do veículo.'),
	('rot.fleet.block', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 407, 'Bloquear veículo.'),
	('rot.fleet.unblock', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 408, 'Desbloquear veículo.'),
	('rot.fleet.inactivate', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 409, 'Dar baixa/inativar veículo da frota.'),
	('rot.fleet.documents.manage', 'recursos', 'Recursos', 'fleet', 'Frota', 'manage', 410, 'Cadastrar e remover documentos do veículo.'),
	('rot.fleet.report.view', 'recursos', 'Recursos', 'fleet', 'Frota', 'view', 411, 'Acessar relatórios e indicadores da frota.')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true;

insert into rot_role_permissions (role_id, permission_id)
select rp.role_id, perm.id
from (select distinct role_id from rot_role_permissions where permission_id = 'rot.fleet.manage') rp
cross join (values
	('rot.fleet.transfer'), ('rot.fleet.receive'), ('rot.fleet.km.manage'), ('rot.fleet.km.correct'),
	('rot.fleet.maintenance.manage'), ('rot.fleet.block'), ('rot.fleet.unblock'), ('rot.fleet.inactivate'),
	('rot.fleet.documents.manage'), ('rot.fleet.report.view')
) as perm(id)
on conflict do nothing;
