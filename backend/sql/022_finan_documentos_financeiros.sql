-- Roteiro Finan Fase 3 — pre-requisito: modulo real de Notas Fiscais,
-- Contas a Pagar e Contas a Receber (hoje essas 3 telas so mostram
-- indicadores fixos, sem lancamento nenhum por tras). Desenhado do zero
-- (nao replica o app principal), notas como cadastro independente (nao
-- gera conta a pagar automaticamente — vinculo e opcional via
-- nota_id). Tambem cria finan_documentos_entrada, base da Caixa de
-- Entrada (#16). "Vencido" nao e status gravado: e sempre calculado
-- (status = 'pendente' and data_vencimento < hoje) pra nunca ficar
-- desatualizado.
create table if not exists finan_notas_fiscais (
	id text primary key,
	numero text,
	serie text,
	cnpj_emissor text,
	fornecedor_id text,
	descricao text,
	valor numeric(14, 2) not null default 0,
	valor_impostos numeric(14, 2) not null default 0,
	data_emissao date,
	data_vencimento date,
	status text not null default 'pendente', -- pendente | paga | cancelada
	observacoes text,
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists finan_notas_fiscais_vencimento_idx on finan_notas_fiscais (data_vencimento);

create table if not exists finan_contas_pagar (
	id text primary key,
	descricao text not null,
	fornecedor_id text,
	nota_id text references finan_notas_fiscais(id) on delete set null,
	conta_id text,
	centro_custo_id text,
	valor numeric(14, 2) not null default 0,
	data_vencimento date not null,
	data_pagamento date,
	forma_pagamento text,
	status text not null default 'pendente', -- pendente | pago | cancelado
	observacoes text,
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists finan_contas_pagar_vencimento_idx on finan_contas_pagar (data_vencimento);

create table if not exists finan_contas_receber (
	id text primary key,
	descricao text not null,
	cliente_nome text not null,
	valor numeric(14, 2) not null default 0,
	data_vencimento date not null,
	data_recebimento date,
	status text not null default 'pendente', -- pendente | recebido | cancelado
	observacoes text,
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists finan_contas_receber_vencimento_idx on finan_contas_receber (data_vencimento);

-- Caixa de entrada (#16): upload de documento com pipeline
-- recebido -> processando -> conferir -> importado. Conteudo guardado
-- como base64 direto na linha (mesmo padrao ja usado pra avatar em
-- compat/routes.js), limite de tamanho aplicado na rota (nao aqui).
-- Sem extracao automatica de dados ainda — isso e o #15 (OCR), que
-- depende de credencial de provedor externo (Google Document AI, ja
-- decidido em sessao anterior) que este ambiente nao tem configurada.
create table if not exists finan_documentos_entrada (
	id text primary key,
	nome_arquivo text not null,
	tipo_mime text not null,
	tamanho_bytes integer not null default 0,
	conteudo_base64 text not null,
	status text not null default 'recebido', -- recebido | processando | conferir | importado
	nota_id text references finan_notas_fiscais(id) on delete set null,
	uploaded_by_id text,
	uploaded_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
