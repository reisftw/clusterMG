-- Permissões do domínio Ativações.

alter table rot_permissions
	drop constraint if exists rot_permissions_action_chk;

alter table rot_permissions
	add constraint rot_permissions_action_chk
	check (action in ('view', 'manage', 'approve', 'export', 'system'));

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('ativacoes.visualizar', 'ativacoes', 'Ativações', 'ativacoes', 'Ativações', 'view', 700, 'Visualizar visão geral de ativações.'),
		('ativacoes.kanban.visualizar', 'ativacoes', 'Ativações', 'ativacoes_kanban', 'Kanban de Ativações', 'view', 701, 'Visualizar Kanban de ativações.'),
		('ativacoes.sincronizar', 'ativacoes', 'Ativações', 'ativacoes_sync', 'Sincronização HubSoft', 'manage', 702, 'Disparar sincronização read-only de ativações.'),
		('ativacoes.exportar', 'ativacoes', 'Ativações', 'ativacoes_export', 'Exportação de Ativações', 'export', 703, 'Exportar dados filtrados de ativações.')
)
insert into rot_permissions (
	id, section_id, section_label, feature_id, feature_label, action, sort_order, description
)
select id, section_id, section_label, feature_id, feature_label, action, sort_order, description
from catalog
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true,
	updated_at = now();

insert into rot_role_permissions (role_id, permission_id)
select r.id, p.id
from rot_roles r
cross join rot_permissions p
where p.id in ('ativacoes.visualizar', 'ativacoes.kanban.visualizar', 'ativacoes.sincronizar', 'ativacoes.exportar')
  and (
  	r.permissions ? '*'
  	or exists (
  		select 1 from rot_role_permissions rp
  		where rp.role_id = r.id and rp.permission_id = '*'
  	)
  )
on conflict do nothing;
