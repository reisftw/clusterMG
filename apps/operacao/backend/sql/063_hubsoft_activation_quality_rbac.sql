-- Permissões da Qualidade de Ativações.

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('ativacoes.qualidade.visualizar', 'ativacoes', 'Ativações', 'ativacoes_qualidade', 'Qualidade da Instalação', 'view', 706, 'Visualizar métricas objetivas de qualidade das ativações.'),
		('ativacoes.qualidade.exportar', 'ativacoes', 'Ativações', 'ativacoes_qualidade', 'Qualidade da Instalação', 'export', 707, 'Exportar métricas de qualidade das ativações.')
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
where p.id in ('ativacoes.qualidade.visualizar', 'ativacoes.qualidade.exportar')
  and (
  	r.permissions ? '*'
  	or exists (
  		select 1 from rot_role_permissions rp
  		where rp.role_id = r.id and rp.permission_id = '*'
  	)
  )
on conflict do nothing;
