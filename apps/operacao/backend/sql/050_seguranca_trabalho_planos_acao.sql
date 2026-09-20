-- Fase F: Plano de Acao como entidade UNICA e reutilizavel (secao 37
-- da especificacao explicita: "Nao criar uma implementacao diferente
-- de acao para cada modulo"). Por enquanto so nasce de protocolo (unica
-- origem que existe no dominio ate aqui); protocol_id fica nullable
-- pra nao forcar reescrita quando APR/inspecao tiverem seus proprios
-- fluxos completos nas proximas fases.

create table if not exists sst_action_plans (
	id text primary key,
	protocol_id text references sst_protocols(id) on delete set null,
	title text not null,
	description text,
	responsible_id text references rot_users(id) on delete set null,
	operation_scope text check (operation_scope in ('ROT','FIELD','DELIVERY')),
	regional_id text references regionais(id) on delete set null,
	base_id uuid references regional_cidades(id) on delete set null,
	company_id uuid references operacao_empresas(id) on delete set null,
	priority text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'critica')),
	due_date date,
	status text not null default 'ABERTO' check (status in ('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_VALIDACAO', 'CONCLUIDO', 'CANCELADO')),
	completion_note text,
	validator_id text references rot_users(id) on delete set null,
	validated_at timestamptz,
	validation_note text,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	completed_at timestamptz
);

create index if not exists idx_sst_action_plans_protocol on sst_action_plans(protocol_id);
create index if not exists idx_sst_action_plans_responsible on sst_action_plans(responsible_id, status);
create index if not exists idx_sst_action_plans_status on sst_action_plans(status);
create index if not exists idx_sst_action_plans_due_date on sst_action_plans(due_date);

drop trigger if exists sst_action_plans_touch_updated_at on sst_action_plans;
create trigger sst_action_plans_touch_updated_at
before update on sst_action_plans
for each row execute function touch_updated_at();
