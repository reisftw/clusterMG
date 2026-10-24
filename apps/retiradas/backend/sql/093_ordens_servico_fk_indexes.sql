create index if not exists tentativas_opportunities_ordem_id_idx
	on tentativas_opportunities (ordem_id)
	where ordem_id is not null;

create index if not exists mercado_entregas_ordem_servico_idx
	on mercado_entregas (ordem_servico_id)
	where ordem_servico_id is not null;
