create index if not exists tentativas_opportunities_ordem_id_idx
	on tentativas_opportunities (ordem_id)
	where ordem_id is not null;
