-- Feature: retomar a "Varredura do ano todo" de onde parou. Antes, se o
-- job caisse no meio (ex.: falha de rede numa janela mais pra frente), a
-- proxima tentativa comecava de novo em 01/01 — reprocessando janelas ja
-- concluidas com sucesso (idempotente, mas desperdicava bastante tempo
-- numa varredura que ja e demorada por natureza).
--
-- backfill_ultima_janela_fim guarda o fim da ultima janela de 15 dias que
-- terminou com sucesso — a proxima "Varredura do ano todo" retoma dali em
-- vez de do zero (ver movimentacoesEntregas.js executeScanJob).

alter table movimentacoes_config
	add column if not exists backfill_ultima_janela_fim timestamptz;
