-- Fase E: campos especificos por tipo de ocorrencia (potencial de
-- consequencia do quase acidente, acao imediata do desvio, causa raiz
-- e medidas da investigacao) sem criar uma tabela por tipo — o
-- protocolo continua sendo o nucleo unico (secao 31 da especificacao:
-- "Nao duplicar o protocolo"). jsonb flexivel porque os campos variam
-- por tipo e nao justificam uma coluna fixa cada.

alter table sst_protocols add column if not exists details jsonb not null default '{}'::jsonb;
