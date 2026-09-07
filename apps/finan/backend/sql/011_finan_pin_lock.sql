-- PIN de bloqueio de app (PWA) + hierarquia de cargos para gerenciamento de PIN de terceiros.
-- Aditiva: colunas nullable/com default e tabela nova, sem NOT NULL/CHECK/FK
-- contra dados ja existentes. Ainda assim, seguir a regra do projeto: rodar
-- o preflight em sql-tools/011_preflight_pin_lock.sql contra producao (ou
-- pelo menos homolog) antes do push, ja que o deploy do Finan aplica
-- migrations pendentes automaticamente sem gate manual.

alter table finan_users
	add column if not exists pin_hash text,
	add column if not exists pin_secret_word_hash text,
	add column if not exists pin_failed_attempts integer not null default 0,
	add column if not exists pin_locked_at timestamptz,
	add column if not exists pin_configured_at timestamptz;

create table if not exists finan_pin_recovery (
	id text primary key,
	user_id text not null references finan_users(id) on delete cascade,
	token_hash text not null,
	expires_at timestamptz not null,
	consumed_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists finan_pin_recovery_user_id_idx
	on finan_pin_recovery (user_id);

-- Hierarquia de cargos: menor numero = cargo mais "senior". Default alto
-- (999) para nao promover acidentalmente nenhum cargo existente a uma
-- posicao de poder sobre os demais so por causa da migration — quem
-- precisar gerenciar PIN de terceiros tera o nivel ajustado manualmente
-- depois, via tela de Cargos e Permissões.
alter table finan_roles
	add column if not exists hierarchy_level integer not null default 999;
