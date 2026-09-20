create or replace function block_app_documents_financeiro_reports_write()
returns trigger
language plpgsql
as $$
declare
	target_collection text;
	target_path text;
begin
	target_collection := coalesce(new.collection_path, old.collection_path);
	target_path := coalesce(new.path, old.path);

	if target_collection = 'financeiro_import_logs' then
		raise exception 'Collection % migrada para tabelas normalizadas de financeiro.', target_collection;
	end if;

	if target_collection = 'financeiro_reports'
		and target_path = any(array['financeiro_reports/serasa', 'financeiro_reports/tarifas'])
	then
		raise exception 'Relatorio financeiro % migrado para tabelas normalizadas.', target_path;
	end if;

	return coalesce(new, old);
end;
$$;

drop trigger if exists app_documents_block_financeiro_reports_write on app_documents;
create trigger app_documents_block_financeiro_reports_write
before insert or update or delete on app_documents
for each row
execute function block_app_documents_financeiro_reports_write();
