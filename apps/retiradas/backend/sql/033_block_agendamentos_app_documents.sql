create or replace function block_app_documents_agendamentos_write()
returns trigger
language plpgsql
as $$
declare
	target_collection text;
begin
	target_collection := coalesce(new.collection_path, old.collection_path);
	if target_collection = any(array[
		'agendamentos',
		'agendamentos_logs',
		'agendamento_esteira_blocos',
		'agendamento_esteira_clientes',
		'agendamento_esteira_cliente_index',
		'agendamento_esteira_logs',
		'agendamento_esteira_metricas',
		'agendamento_esteira_catalogo'
	]) then
		raise exception 'Collection % migrada para tabelas normalizadas de agendamentos/esteira.', target_collection;
	end if;
	return coalesce(new, old);
end;
$$;

drop trigger if exists app_documents_block_agendamentos_write on app_documents;
create trigger app_documents_block_agendamentos_write
before insert or update or delete on app_documents
for each row
execute function block_app_documents_agendamentos_write();
