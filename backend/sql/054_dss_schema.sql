-- Fase 1 do dominio DSS (Dialogo Semanal de Seguranca): schema completo
-- (tema -> programacao -> execucao -> snapshot da equipe -> timeline),
-- pra nao precisar de nova migration nas fases seguintes (presenca,
-- evidencia, validacao, dashboard, relatorios usam estas mesmas tabelas).
--
-- Reaproveita entidades ja existentes: regionais/regional_cidades
-- (operacao->regional->base), rot_users/operacao_tecnicos
-- (colaboradores), rot_roles (cargos). Nao existe tabela de "equipe" no
-- projeto — a unidade organizacional usada como "equipe" e a combinacao
-- (operation_type, regional_id, base_id), igual ao exemplo do pedido
-- ("ROT -> Metropolitana -> Sub 2"). Evidencia (fotos/PDF assinado)
-- entra em rot_image_attachments (055_dss_attachments_pdf.sql), auditoria
-- de sistema em rot_audit_logs (auditLog, sem tabela propria), plano de
-- acao futuro reaproveita sst_action_plans — nada disso duplicado aqui.

-- Tema: o conteudo do DSS. Conteudo pronto (PDF, via rot_image_attachments
-- entidade DSS_THEME) ou escrito no sistema (content_blocks jsonb, mesmo
-- espirito flexivel do sst_protocols.details).
create table if not exists dss_themes (
	id text primary key,
	title text not null,
	description text,
	objective text,
	category text not null check (category in (
		'epi','epc','direcao_segura','trabalho_altura','seguranca_eletrica',
		'acidentes','ergonomia','saude_ocupacional','prevencao',
		'procedimentos_operacionais','outros'
	)),
	notes text,
	modality text not null check (modality in ('semanal','mensal')),
	content_type text not null check (content_type in ('editor','pdf')),
	content_blocks jsonb not null default '[]'::jsonb,
	status text not null default 'rascunho' check (status in ('rascunho','publicado','arquivado')),
	author_id text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_dss_themes_status on dss_themes(status);
create index if not exists idx_dss_themes_category on dss_themes(category);

drop trigger if exists dss_themes_touch_updated_at on dss_themes;
create trigger dss_themes_touch_updated_at
before update on dss_themes
for each row execute function touch_updated_at();

-- Desdobramento semanal de um tema mensal (secao 6 do pedido). So
-- populado quando dss_themes.modality = 'mensal'; para tema semanal, o
-- proprio tema e o conteudo usado na programacao.
create table if not exists dss_theme_weeks (
	id text primary key,
	theme_id text not null references dss_themes(id) on delete cascade,
	week_number integer not null check (week_number between 1 and 4),
	title text not null,
	content_type text not null check (content_type in ('editor','pdf')),
	content_blocks jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (theme_id, week_number)
);

drop trigger if exists dss_theme_weeks_touch_updated_at on dss_theme_weeks;
create trigger dss_theme_weeks_touch_updated_at
before update on dss_theme_weeks
for each row execute function touch_updated_at();

-- Programacao: quando/para quem um conteudo (tema semanal OU semana
-- especifica de um tema mensal) vale. Exatamente um de theme_id /
-- theme_week_id deve estar preenchido.
create table if not exists dss_schedules (
	id text primary key,
	theme_id text references dss_themes(id) on delete restrict,
	theme_week_id text references dss_theme_weeks(id) on delete restrict,
	week_label text not null,
	start_date date not null,
	end_date date not null,
	due_date date not null,
	status text not null default 'rascunho' check (status in ('rascunho','publicado','cancelado')),
	created_by text references rot_users(id) on delete set null,
	published_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint dss_schedules_theme_xor_week check (
		(theme_id is not null and theme_week_id is null) or
		(theme_id is null and theme_week_id is not null)
	)
);

create index if not exists idx_dss_schedules_status on dss_schedules(status);
create index if not exists idx_dss_schedules_due_date on dss_schedules(due_date);

drop trigger if exists dss_schedules_touch_updated_at on dss_schedules;
create trigger dss_schedules_touch_updated_at
before update on dss_schedules
for each row execute function touch_updated_at();

-- Publico de uma programacao (secao 8): cada linha e uma combinacao de
-- abrangencia; regional_id/base_id/role_id nulos significam "todas" dentro
-- do nivel acima (ex.: operation_type='FIELD', regional_id=null = todas
-- as regionais que atendem FIELD).
create table if not exists dss_schedule_scopes (
	id bigserial primary key,
	schedule_id text not null references dss_schedules(id) on delete cascade,
	operation_type text not null check (operation_type in ('ROT','FIELD','DELIVERY')),
	regional_id text references regionais(id) on delete cascade,
	base_id uuid references regional_cidades(id) on delete cascade,
	role_id text references rot_roles(id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists idx_dss_schedule_scopes_schedule on dss_schedule_scopes(schedule_id);

-- Execucao: realizacao do DSS por uma equipe (operation_type + regional +
-- base) especifica, numa semana especifica. Gerada automaticamente ao
-- publicar a programacao (backend/src/dss/helpers.js).
create table if not exists dss_executions (
	id text primary key,
	schedule_id text not null references dss_schedules(id) on delete cascade,
	theme_id text references dss_themes(id) on delete restrict,
	theme_week_id text references dss_theme_weeks(id) on delete restrict,
	week_label text not null,

	operation_type text not null check (operation_type in ('ROT','FIELD','DELIVERY')),
	regional_id text not null references regionais(id) on delete restrict,
	base_id uuid references regional_cidades(id) on delete restrict,
	responsible_id text references rot_users(id) on delete set null,

	due_date date not null,
	status text not null default 'disponivel' check (status in (
		'planejado','disponivel','em_andamento','enviado','validado','rejeitado','cancelado'
	)),

	previstos_count integer not null default 0,
	presentes_count integer not null default 0,
	ausentes_count integer not null default 0,
	participation_pct numeric(5,2),

	submitted_by text references rot_users(id) on delete set null,
	submitted_at timestamptz,
	validated_by text references rot_users(id) on delete set null,
	validated_at timestamptz,
	validation_note text,
	rejection_reason text,

	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (schedule_id, operation_type, regional_id, base_id)
);

create index if not exists idx_dss_executions_status on dss_executions(status);
create index if not exists idx_dss_executions_regional on dss_executions(regional_id);
create index if not exists idx_dss_executions_due_date on dss_executions(due_date);
create index if not exists idx_dss_executions_schedule on dss_executions(schedule_id);

drop trigger if exists dss_executions_touch_updated_at on dss_executions;
create trigger dss_executions_touch_updated_at
before update on dss_executions
for each row execute function touch_updated_at();

-- Snapshot da equipe no momento da geracao (secao 12 do pedido):
-- name/role/regional/base sao copiados pra ca e NUNCA recalculados a
-- partir do cadastro atual, mesmo que o colaborador mude de regional
-- depois. user_id/tecnico_id ficam so como referencia auxiliar (podem
-- virar null se o cadastro for excluido; o snapshot textual permanece).
create table if not exists dss_execution_members (
	id bigserial primary key,
	execution_id text not null references dss_executions(id) on delete cascade,
	user_id text references rot_users(id) on delete set null,
	tecnico_id uuid references operacao_tecnicos(id) on delete set null,
	name_snapshot text not null,
	role_snapshot text,
	regional_snapshot text,
	base_snapshot text,
	presence_status text not null default 'pendente' check (presence_status in ('pendente','presente','ausente')),
	absence_reason text check (absence_reason in ('ferias','afastamento','folga','atestado','ausencia_operacional','outro')),
	absence_note text,
	created_at timestamptz not null default now()
);

create index if not exists idx_dss_execution_members_execution on dss_execution_members(execution_id);

-- Timeline de negocio da execucao (mesmo padrao de sst_protocol_timeline):
-- visivel ao usuario no detalhe, gerada pelas acoes do sistema/usuarios,
-- nunca editavel. Distinta de rot_audit_logs (auditoria de sistema).
create table if not exists dss_execution_timeline (
	id bigserial primary key,
	execution_id text not null references dss_executions(id) on delete cascade,
	event_type text not null,
	title text not null,
	description text,
	before_data jsonb,
	after_data jsonb,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists idx_dss_execution_timeline_execution on dss_execution_timeline(execution_id, created_at);
