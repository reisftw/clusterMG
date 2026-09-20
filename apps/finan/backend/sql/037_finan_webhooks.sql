-- Roteiro Finan #47 (Fase 4F — Webhooks): eventos para automações
-- externas. v1 com os eventos que já têm dado suficiente hoje
-- (supplier.updated, budget.threshold_reached, month.closed,
-- invoice.created — Notas já é real, então esse também entra).
create table if not exists finan_webhooks (
	id text primary key,
	url text not null,
	eventos text[] not null default '{}', -- 'supplier.updated' | 'budget.threshold_reached' | 'month.closed' | 'invoice.created'
	secreto text not null, -- usado pra assinar o payload (HMAC-SHA256), o destino confere a assinatura
	ativo boolean not null default true,
	ultima_execucao_em timestamptz,
	ultimo_status_code integer,
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now()
);

create index if not exists finan_webhooks_ativo_idx on finan_webhooks (ativo) where ativo;
