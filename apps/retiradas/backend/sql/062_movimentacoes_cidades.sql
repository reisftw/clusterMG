-- Feature: aba "Cidades" dentro de Movimentacoes — ranking de cidades que
-- mais tiveram retirada de equipamento (pela cidade da O.S./cliente
-- casada), cidades com devolucao confirmada (O.S. efetivamente baixada) e
-- estoques que mais receberam equipamento de volta.
--
-- cidade: preenchida a partir da O.S. casada (ordens_servico.cidade),
-- nao do Portal de Movimentacoes — a nota de devolucao nao traz cidade do
-- cliente, so o nome do parceiro. So fica populada quando statusMatch =
-- 'casada' (quando dá pra saber com certeza de qual O.S./cidade veio).
--
-- estoque_destino: vem direto do item da nota (estoque_local_destino),
-- independente de ter casado com O.S. ou nao.
--
-- Aditiva: colunas novas nullable.

alter table movimentacoes_estoque
	add column if not exists cidade text,
	add column if not exists estoque_destino text;

create index if not exists movimentacoes_estoque_cidade_idx
	on movimentacoes_estoque (cidade);
create index if not exists movimentacoes_estoque_estoque_destino_idx
	on movimentacoes_estoque (estoque_destino);
