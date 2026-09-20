-- Varredura de RBAC (relatado em producao: conta TECNICO_1 via
-- Indicadores/Visao Geral, Manutencoes, Ocorrencias e todas as acoes de
-- ativo — bloquear/transferir/manutencao — que sao de lideranca/gestao).

-- 1) Nova permissao para o dashboard executivo (Visao Geral/Indicadores),
-- separada de ativos.visualizar (que tecnico precisa ter pra checklist/
-- historico do proprio ativo, mas nao deveria destravar o dashboard
-- agregado da operacao inteira).
insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, sort_order, description)
values
	('ativos.dashboard.visualizar', 'ativos_seguranca', 'Ativos & Seguranca', 'dashboard', 'Visao Geral', 'view', 799, 'Visualizar o dashboard executivo de ativos (Visao Geral/Indicadores).')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true;

-- So lideranca/gestao (regional_supervisor pra cima) enxerga o dashboard
-- agregado. tech_lead e tecnicos (1/2/3) ficam de fora deliberadamente —
-- mesmo criterio que ja existia pra "criar ativo em outra regional"
-- (so cargo acima de supervisor).
insert into rot_role_permissions (role_id, permission_id)
select r.id, p.id
from rot_roles r
join rot_permissions p on p.id = 'ativos.dashboard.visualizar'
where r.id in ('regional_supervisor', 'supervisor_rot', 'supervisor_field', 'supervisor_delivery', 'coordinator', 'manager')
on conflict do nothing;

-- 2) Remove de tech_lead/tech_1/tech_2/tech_3 a visualizacao das listas
-- inteiras de manutencao e ocorrencias (management-only). Continuam
-- podendo ABRIR checklist e REPORTAR problema (checklists.executar,
-- ocorrencias.criar) — so a navegacao pelas listas completas some.
delete from rot_role_permissions
 where permission_id in ('manutencoes.visualizar', 'ocorrencias.visualizar')
   and role_id in ('tech_lead', 'tech_1', 'tech_2', 'tech_3');
