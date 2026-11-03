-- migration:no-transaction
create index concurrently if not exists mensageria_callbacks_codigo_cliente_idx
  on mensageria_callbacks (codigo_cliente);
