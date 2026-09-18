-- QR Codes — marcado como P0 pelo usuario ("O gerenciador de QRcodes e
-- hiper importante mantermos ele funcionando"). Mesma ideia do ROT
-- legado (colecao "qrcodes" no Firestore): pagina publica tipo
-- link-tree, sem auth, contador de visitas incrementado a cada acesso.
-- Simplificado frente ao legado — o merge "root vs scoped" que existia
-- la era artefato do ambiente de sandbox/Canvas, nao fazia sentido em
-- producao (confirmado na investigacao da migracao).
create table if not exists rot_qrcodes (
	id text primary key,
	title text not null,
	links jsonb not null default '[]'::jsonb, -- [{label, url}]
	regional_id text references rot_regionals(id) on delete set null,
	visits integer not null default 0,
	active boolean not null default true,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_rot_qrcodes_regional on rot_qrcodes(regional_id);

drop trigger if exists rot_qrcodes_touch_updated_at on rot_qrcodes;
create trigger rot_qrcodes_touch_updated_at
before update on rot_qrcodes
for each row execute function touch_updated_at();
