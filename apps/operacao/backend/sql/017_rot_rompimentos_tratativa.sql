-- Rompimentos em andamento: ticket primeiro, responsavel e status.

alter table rot_rompimentos
	add column if not exists ticket_number text not null default '',
	add column if not exists status text not null default 'concluido';

create index if not exists idx_rot_rompimentos_status on rot_rompimentos(status, created_at desc);

update rot_roles
set permissions = (
	select jsonb_agg(distinct value)
	from jsonb_array_elements_text(permissions || '["rot.rompimentos.view"]'::jsonb) as t(value)
)
where id in ('regional_supervisor', 'tech_lead', 'tech_3', 'tech_2', 'tech_1', 'aux');
