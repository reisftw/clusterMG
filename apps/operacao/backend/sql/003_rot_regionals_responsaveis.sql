-- ROT virou field service: cada regional passa a ter responsaveis
-- (Supervisor ROT / Supervisor FIELD) pra referencia administrativa —
-- pedido explicito do usuario. Guardado como jsonb (array de
-- {type, name, phone, email}) em vez de tabela propria: sao poucos
-- registros por regional, sem necessidade de FK/join, e evita uma
-- migration maior agora que outros modulos de negocio (RH, frota etc.)
-- ainda nao definiram o modelo final de "responsavel".
alter table if exists rot_regionals
	add column if not exists responsaveis jsonb not null default '[]'::jsonb;
