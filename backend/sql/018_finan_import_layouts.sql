-- Roteiro Finan #17 (Importacao inteligente de planilhas): memoria de
-- layouts de planilha ja vistos no importador de orcamento, pra sinalizar
-- "reconhecemos este layout" (usado N vezes) ou "layout novo, confira os
-- dados" quando a assinatura do cabecalho + layout detectado (FPCP106 /
-- FPCP302 / GENERIC) nunca apareceu antes. Aditiva, sem risco pra dado
-- existente.
create table if not exists finan_import_layouts (
	signature text primary key,
	layout text not null,
	sample_file_name text,
	sample_sheet_name text,
	times_used integer not null default 1,
	first_seen_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now()
);
