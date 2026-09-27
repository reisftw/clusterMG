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
	('service_orders.fines.view', 'service_orders', 'Ordem de Serviço', 'fines', 'Multas', 'view', 720, 'view_metas', 'Visualizar auditoria de multas.'),
	('service_orders.fines.simulate', 'service_orders', 'Ordem de Serviço', 'fines', 'Multas', 'manage', 721, 'manage_metas', 'Executar simulações de auditoria de multas.'),
	('service_orders.asset_recovery.view', 'service_orders', 'Ordem de Serviço', 'asset_recovery', 'Recuperação de ativos', 'view', 730, 'movimentacoes.view', 'Visualizar recuperação de ativos.'),
	('service_orders.asset_recovery.simulate', 'service_orders', 'Ordem de Serviço', 'asset_recovery', 'Recuperação de ativos', 'manage', 731, 'movimentacoes.manage', 'Executar simulações de recuperação de ativos.')
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
		('admin', 'service_orders.fines.view'),
		('admin', 'service_orders.fines.simulate'),
		('admin', 'service_orders.asset_recovery.view'),
		('admin', 'service_orders.asset_recovery.simulate'),
		('supervisor', 'service_orders.fines.view'),
		('supervisor', 'service_orders.fines.simulate'),
		('supervisor', 'service_orders.asset_recovery.view'),
		('supervisor', 'service_orders.asset_recovery.simulate'),
		('backoffice_retirada', 'service_orders.fines.view'),
		('backoffice_retirada', 'service_orders.asset_recovery.view')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict do nothing;
