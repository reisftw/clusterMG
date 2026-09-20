-- Fases finais da Operacao: tecnicos, acerto de estoque, entrega,
-- auditoria de bolsa e relatorios. Estrutura additive-only.

create extension if not exists pgcrypto;

create table if not exists operacao_tecnicos (
	id uuid primary key default gen_random_uuid(),
	user_id text references rot_users(id) on delete set null,
	empresa_id uuid references operacao_empresas(id) on delete set null,
	regional_id text references regionais(id) on delete set null,
	cidade_id uuid references regional_cidades(id) on delete set null,
	nome text not null,
	email text,
	telefone text,
	cidade_nome text,
	area_operacional text not null default 'delivery',
	status text not null default 'Ativo',
	observacoes text,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint operacao_tecnicos_nome_not_empty_chk check (btrim(nome) <> ''),
	constraint operacao_tecnicos_area_chk check (area_operacional in ('delivery', 'field_service', 'rot')),
	constraint operacao_tecnicos_status_chk check (status in ('Ativo', 'Inativo'))
);

create index if not exists idx_operacao_tecnicos_empresa on operacao_tecnicos(empresa_id, status, lower(nome));
create index if not exists idx_operacao_tecnicos_regional on operacao_tecnicos(regional_id, status, lower(nome));
create index if not exists idx_operacao_tecnicos_user on operacao_tecnicos(user_id);

drop trigger if exists operacao_tecnicos_touch_updated_at on operacao_tecnicos;
create trigger operacao_tecnicos_touch_updated_at
before update on operacao_tecnicos
for each row execute function touch_updated_at();

create table if not exists operacao_tecnico_operation_scopes (
	tecnico_id uuid not null references operacao_tecnicos(id) on delete cascade,
	operation_type text not null references rot_operation_types(id) on delete restrict,
	created_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	primary key (tecnico_id, operation_type)
);

create index if not exists idx_operacao_tecnico_operation_scopes_operation
	on operacao_tecnico_operation_scopes(operation_type, tecnico_id);

create table if not exists operacao_acertos_estoque (
	id uuid primary key default gen_random_uuid(),
	empresa_id uuid references operacao_empresas(id) on delete set null,
	tecnico_id uuid references operacao_tecnicos(id) on delete set null,
	regional_id text references regionais(id) on delete set null,
	codigo text,
	data_acerto date not null default current_date,
	status text not null default 'Registrado',
	itens jsonb not null default '[]'::jsonb,
	observacoes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint operacao_acertos_status_chk check (status in ('Registrado', 'Pendente', 'Concluido', 'Cancelado', 'Em conferência', 'Aprovado', 'Divergente'))
);

alter table operacao_acertos_estoque drop constraint if exists operacao_acertos_status_chk;
alter table operacao_acertos_estoque add constraint operacao_acertos_status_chk
	check (status in ('Registrado', 'Pendente', 'Concluido', 'Cancelado', 'Em conferência', 'Aprovado', 'Divergente'));

create index if not exists idx_operacao_acertos_data on operacao_acertos_estoque(data_acerto desc, status);
create index if not exists idx_operacao_acertos_tecnico on operacao_acertos_estoque(tecnico_id, data_acerto desc);

drop trigger if exists operacao_acertos_estoque_touch_updated_at on operacao_acertos_estoque;
create trigger operacao_acertos_estoque_touch_updated_at
before update on operacao_acertos_estoque
for each row execute function touch_updated_at();

create table if not exists operacao_entregas_tecnicos (
	id uuid primary key default gen_random_uuid(),
	empresa_id uuid references operacao_empresas(id) on delete set null,
	tecnico_id uuid references operacao_tecnicos(id) on delete set null,
	regional_id text references regionais(id) on delete set null,
	data_entrega date not null default current_date,
	tipo text not null default 'Entrega',
	status text not null default 'Pendente',
	itens jsonb not null default '[]'::jsonb,
	assinatura text,
	observacoes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint operacao_entregas_tipo_chk check (tipo in ('Entrega', 'Devolucao', 'Devolução', 'Troca')),
	constraint operacao_entregas_status_chk check (status in ('Pendente', 'Entregue', 'Conferida', 'Cancelada'))
);

alter table operacao_entregas_tecnicos drop constraint if exists operacao_entregas_tipo_chk;
alter table operacao_entregas_tecnicos add constraint operacao_entregas_tipo_chk
	check (tipo in ('Entrega', 'Devolucao', 'Devolução', 'Troca'));
alter table operacao_entregas_tecnicos drop constraint if exists operacao_entregas_status_chk;
alter table operacao_entregas_tecnicos add constraint operacao_entregas_status_chk
	check (status in ('Pendente', 'Entregue', 'Conferida', 'Cancelada'));

create index if not exists idx_operacao_entregas_data on operacao_entregas_tecnicos(data_entrega desc, status);
create index if not exists idx_operacao_entregas_tecnico on operacao_entregas_tecnicos(tecnico_id, data_entrega desc);

drop trigger if exists operacao_entregas_tecnicos_touch_updated_at on operacao_entregas_tecnicos;
create trigger operacao_entregas_tecnicos_touch_updated_at
before update on operacao_entregas_tecnicos
for each row execute function touch_updated_at();

create table if not exists operacao_auditoria_bolsa (
	id uuid primary key default gen_random_uuid(),
	tecnico_id uuid references operacao_tecnicos(id) on delete set null,
	regional_id text references regionais(id) on delete set null,
	data_auditoria date not null default current_date,
	status text not null default 'Pendente',
	score integer not null default 0,
	respostas jsonb not null default '{}'::jsonb,
	observacoes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text references rot_users(id) on delete set null,
	updated_by text references rot_users(id) on delete set null,
	constraint operacao_auditoria_status_chk check (status in ('Pendente', 'Aprovada', 'Reprovada', 'Revisar')),
	constraint operacao_auditoria_score_chk check (score between 0 and 100)
);

alter table operacao_auditoria_bolsa drop constraint if exists operacao_auditoria_status_chk;
alter table operacao_auditoria_bolsa add constraint operacao_auditoria_status_chk
	check (status in ('Pendente', 'Aprovada', 'Reprovada', 'Revisar'));

create index if not exists idx_operacao_auditoria_data on operacao_auditoria_bolsa(data_auditoria desc, status);
create index if not exists idx_operacao_auditoria_tecnico on operacao_auditoria_bolsa(tecnico_id, data_auditoria desc);

drop trigger if exists operacao_auditoria_bolsa_touch_updated_at on operacao_auditoria_bolsa;
create trigger operacao_auditoria_bolsa_touch_updated_at
before update on operacao_auditoria_bolsa
for each row execute function touch_updated_at();

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('rot.technicians.view', 'gestao', 'Gestao', 'technicians', 'Tecnicos', 'view', 619, 'Visualizar tecnicos.'),
		('rot.technicians.manage', 'gestao', 'Gestao', 'technicians', 'Tecnicos', 'manage', 620, 'Gerenciar tecnicos.'),
		('rot.stock_adjustments.view', 'estoque', 'Estoque', 'stock_adjustments', 'Acerto de Estoque', 'view', 621, 'Visualizar acertos de estoque.'),
		('rot.stock_adjustments.manage', 'estoque', 'Estoque', 'stock_adjustments', 'Acerto de Estoque', 'manage', 622, 'Gerenciar acertos de estoque.'),
		('rot.tech_deliveries.view', 'estoque', 'Estoque', 'tech_deliveries', 'Entrega Tecnicos', 'view', 623, 'Visualizar entregas de tecnicos.'),
		('rot.tech_deliveries.manage', 'estoque', 'Estoque', 'tech_deliveries', 'Entrega Tecnicos', 'manage', 624, 'Gerenciar entregas de tecnicos.'),
		('rot.bag_audit.view', 'estoque', 'Estoque', 'bag_audit', 'Auditoria Bolsa', 'view', 625, 'Visualizar auditoria de bolsa.'),
		('rot.bag_audit.manage', 'estoque', 'Estoque', 'bag_audit', 'Auditoria Bolsa', 'manage', 626, 'Gerenciar auditoria de bolsa.'),
		('rot.audit_reports.view', 'analises', 'Analises', 'audit_reports', 'Relatorios de Auditoria', 'view', 627, 'Visualizar relatorios de auditoria.')
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
where p.id in (
	'rot.technicians.view', 'rot.technicians.manage',
	'rot.stock_adjustments.view', 'rot.stock_adjustments.manage',
	'rot.tech_deliveries.view', 'rot.tech_deliveries.manage',
	'rot.bag_audit.view', 'rot.bag_audit.manage',
	'rot.audit_reports.view'
)
  and (
  	r.permissions ? '*'
  	or exists (
  		select 1 from rot_role_permissions rp
  		where rp.role_id = r.id and rp.permission_id = '*'
  	)
  )
on conflict do nothing;
