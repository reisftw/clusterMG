-- Feature: a "Varredura do ano todo" e pra rodar 1x so (backfill inicial
-- do historico). Depois que ela terminar com sucesso, o botao some da
-- tela e so fica a varredura do mes corrente (pra nao ficar reprocessando
-- o ano inteiro toda hora — ver movimentacoesEntregas.js runScan/anoTodo).

alter table movimentacoes_config
	add column if not exists backfill_anual_concluido_em timestamptz;
