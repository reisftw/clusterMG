-- migration:no-transaction
create index concurrently if not exists mensageria_historico_codigo_cliente_idx
  on mensageria_historico (codigo_cliente);
