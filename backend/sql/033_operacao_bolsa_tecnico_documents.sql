-- Armazenamento compatível com as coleções usadas pelo módulo original
-- de Auditoria de Bolsa Técnico do Retiradas. A regra de negócio continua
-- no serviço original; aqui só persistimos config, snapshots, logs, jobs e
-- movimentações no PostgreSQL dedicado da Operação.

create table if not exists operacao_documents (
	path text primary key,
	collection_path text not null,
	document_id text not null,
	parent_path text,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_operacao_documents_collection
	on operacao_documents(collection_path, document_id);

create index if not exists idx_operacao_documents_updated
	on operacao_documents(collection_path, updated_at desc);

drop trigger if exists operacao_documents_touch_updated_at on operacao_documents;
create trigger operacao_documents_touch_updated_at
before update on operacao_documents
for each row execute function touch_updated_at();

create index if not exists idx_operacao_tecnicos_email_lower
	on operacao_tecnicos(lower(email))
	where email is not null and btrim(email) <> '';

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('rot.bag_audit.logs', 'estoque', 'Estoque', 'bag_audit', 'Auditoria Bolsa', 'view', 628, 'Visualizar logs da auditoria de bolsa.'),
		('rot.audit_reports.manage', 'analises', 'Analises', 'audit_reports', 'Relatorios de Auditoria', 'manage', 629, 'Atualizar e enviar relatorios de auditoria.')
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
where p.id in ('rot.bag_audit.logs', 'rot.audit_reports.manage')
  and (
  	r.permissions ? '*'
  	or exists (
  		select 1 from rot_role_permissions rp
  		where rp.role_id = r.id and rp.permission_id = '*'
  	)
  )
on conflict do nothing;
