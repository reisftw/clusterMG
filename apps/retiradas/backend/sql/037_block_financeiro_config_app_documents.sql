create or replace function block_migrated_financeiro_config_app_documents()
returns trigger as $$
begin
	if new.collection_path = 'financeiro_config' then
		raise exception 'Configuracao financeira % migrada para tabelas normalizadas.', new.path;
	end if;
	return new;
end;
$$ language plpgsql;

drop trigger if exists block_migrated_financeiro_config_app_documents on app_documents;
create trigger block_migrated_financeiro_config_app_documents
before insert or update on app_documents
for each row execute function block_migrated_financeiro_config_app_documents();
