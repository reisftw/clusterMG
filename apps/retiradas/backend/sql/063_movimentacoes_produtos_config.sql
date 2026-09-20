-- Feature: cadastro de categoria (FAST/AC/AX) e valor (custo/preco de
-- referencia, para relatorio financeiro futuro) por equipamento, editavel
-- ao clicar no item no ranking de produtos de Movimentacoes.
--
-- Chave e o nome do produto tal como vem do Portal de Movimentacoes
-- (movimentacoes_estoque.produto_nome) — mesmo texto usado pra agrupar no
-- ranking, entao o cadastro sempre casa com a linha que o usuario clicou.

create table if not exists movimentacoes_produtos_config (
	produto_nome text primary key,
	categoria text check (categoria in ('FAST', 'AC', 'AX')),
	valor numeric(12, 2),
	atualizado_em timestamptz not null default now(),
	atualizado_por text
);
