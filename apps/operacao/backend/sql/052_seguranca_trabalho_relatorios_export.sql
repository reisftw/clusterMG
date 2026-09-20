-- Adiciona a permissao de EXPORTAR relatorios SST (visualizar ja existe
-- desde a Fase B — migration 046, id sst.relatorio.visualizar). Segue o
-- mesmo padrao de RBAC granular ja usado no resto do dominio, sem criar
-- sistema de permissao paralelo pra relatorios.

insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, sort_order, description)
values
	('sst.relatorio.exportar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'relatorio', 'Relatorios', 'manage', 981, 'Exportar relatorios SST em PDF/DOCX.')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true;

-- Tecnico SST tambem acompanha indicadores da propria abrangencia (o
-- endpoint de relatorios reaproveita a mesma clausula de visibilidade
-- regional dos protocolos), so sem mexer em configuracoes.
insert into rot_role_permissions (role_id, permission_id)
select 'sst_tech', id from rot_permissions where id in ('sst.relatorio.visualizar', 'sst.relatorio.exportar')
on conflict do nothing;

insert into rot_role_permissions (role_id, permission_id)
select 'sst_manager', id from rot_permissions where id = 'sst.relatorio.exportar'
on conflict do nothing;
