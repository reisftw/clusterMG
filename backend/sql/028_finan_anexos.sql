-- Roteiro Finan #30 (Fase 4A — Sistema de anexos centralizado): biblioteca
-- de documentos com hash (deteccao de duplicado), versionamento simples
-- (grupo_id ancora todas as versoes do "mesmo" documento logico; v1 tem
-- grupo_id = id proprio), categoria e vinculo opcional com
-- fornecedor/contrato/nota fiscal. Conteudo em base64 direto na linha,
-- mesmo padrao ja usado em finan_documentos_entrada (022) — sem
-- dependencia de storage externo.
--
-- Construida desde ja de forma generica (nao amarrada so a nota fiscal)
-- porque o modulo de Notas real da Fase 3 (pre-requisito ainda pendente)
-- vai reaproveitar esta tabela em vez de duplicar upload/hash/versao.
create table if not exists finan_anexos (
	id text primary key,
	grupo_id text not null,
	versao integer not null default 1,
	nome_arquivo text not null,
	tipo_mime text not null,
	tamanho_bytes integer not null default 0,
	conteudo_base64 text not null,
	hash_sha256 text not null,
	categoria text not null default 'outro', -- contrato | nota_fiscal | comprovante | outro
	descricao text,
	vinculo_tipo text, -- fornecedor | contrato | nota_fiscal
	vinculo_id text,
	uploaded_by_id text,
	uploaded_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists finan_anexos_grupo_idx on finan_anexos (grupo_id, versao desc);
create index if not exists finan_anexos_hash_idx on finan_anexos (hash_sha256);
create index if not exists finan_anexos_vinculo_idx on finan_anexos (vinculo_tipo, vinculo_id);
create index if not exists finan_anexos_categoria_idx on finan_anexos (categoria);
