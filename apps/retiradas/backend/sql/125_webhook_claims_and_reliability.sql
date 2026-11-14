alter table whatsapp_cloud_webhook_events
	add column if not exists claim_token uuid,
	add column if not exists claimed_at timestamptz,
	add column if not exists processing_attempts integer not null default 0;

create index if not exists whatsapp_cloud_webhook_events_claim_idx
	on whatsapp_cloud_webhook_events (processing_status, claimed_at, received_at)
	where processing_status in ('PENDING', 'PROCESSING');
