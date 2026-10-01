const { resolveHubsoftTechnician } = require("../services/technicianMatcher");

async function upsertClienteServicoSnapshot(client, snapshot) {
	if (!snapshot?.hubsoft_cliente_servico_id) return { action: "skipped" };
	const { rows: currentRows } = await client.query(
		`select id, source_hash, version from hubsoft_cliente_servico_snapshots
		  where hubsoft_cliente_servico_id = $1 and is_current = true
		  limit 1`,
		[snapshot.hubsoft_cliente_servico_id],
	);
	const current = currentRows[0];
	if (current?.source_hash === snapshot.source_hash) {
		await client.query(
			`update hubsoft_cliente_servico_snapshots
			    set last_seen_at = now(), synced_at = now(), sync_run_id = $2, updated_at = now()
			  where id = $1`,
			[current.id, snapshot.sync_run_id],
		);
		return { action: "unchanged", id: current.id };
	}
	if (current) {
		await client.query(`update hubsoft_cliente_servico_snapshots set is_current = false, updated_at = now() where id = $1`, [current.id]);
	}
	const { rows } = await client.query(
		`insert into hubsoft_cliente_servico_snapshots (
			sync_run_id, hubsoft_cliente_servico_id, hubsoft_client_id, hubsoft_service_id,
			numero_plano, service_description, service_status, service_status_id,
			brand, brand_source, speed_mbps_derived, speed_source, source_hash,
			raw_payload_sanitized, version
		)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
		returning id`,
		[
			snapshot.sync_run_id,
			snapshot.hubsoft_cliente_servico_id,
			snapshot.hubsoft_client_id,
			snapshot.hubsoft_service_id,
			snapshot.numero_plano || null,
			snapshot.service_description || null,
			snapshot.service_status || null,
			snapshot.service_status_id,
			snapshot.brand,
			snapshot.brand_source,
			snapshot.speed_mbps_derived,
			snapshot.speed_source,
			snapshot.source_hash,
			JSON.stringify(snapshot.raw_payload_sanitized || {}),
			current ? Number(current.version || 1) + 1 : 1,
		],
	);
	return { action: current ? "updated" : "inserted", id: rows[0].id };
}

async function upsertOrderSnapshot(client, snapshot, hubsoftTechnician = {}) {
	if (!snapshot?.hubsoft_order_id) return { action: "skipped" };
	const match = await resolveHubsoftTechnician(client, hubsoftTechnician);
	const { rows: currentRows } = await client.query(
		`select id, source_hash, version from hubsoft_activation_os_snapshots
		  where hubsoft_order_id = $1 and is_current = true
		  limit 1`,
		[snapshot.hubsoft_order_id],
	);
	const current = currentRows[0];
	if (current?.source_hash === snapshot.source_hash) {
		await client.query(
			`update hubsoft_activation_os_snapshots
			    set last_seen_at = now(),
			        synced_at = now(),
			        sync_run_id = $2,
			        operacao_tecnico_id = $3::uuid,
			        operacao_empresa_id = $4::uuid,
			        technician_match_status = $5,
			        technician_match_reason = $6,
			        updated_at = now()
			  where id = $1`,
			[current.id, snapshot.sync_run_id, match.id || null, match.empresa_id || null, match.status, match.reason],
		);
		return { action: "unchanged", id: current.id, technicianMatch: match.status };
	}
	if (current) {
		await client.query(`update hubsoft_activation_os_snapshots set is_current = false, updated_at = now() where id = $1`, [current.id]);
	}
	const { rows } = await client.query(
		`insert into hubsoft_activation_os_snapshots (
			sync_run_id, hubsoft_order_id, order_number, order_type_id, order_type_name,
			health_monitoring_mode, hubsoft_cliente_servico_id, hubsoft_technician_id,
			operacao_tecnico_id, operacao_empresa_id, technician_match_status, technician_match_reason,
			status, executando, closure_reason_id, closure_reason_name, created_at_hubsoft,
			scheduled_start_at, scheduled_end_at, executed_start_at, executed_end_at,
			source_hash, raw_payload_sanitized, version
		)
		values (
			$1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10::uuid, $11, $12,
			$13, $14, $15, $16, $17::timestamptz, $18::timestamptz, $19::timestamptz,
			$20::timestamptz, $21::timestamptz, $22, $23::jsonb, $24
		)
		returning id`,
		[
			snapshot.sync_run_id,
			snapshot.hubsoft_order_id,
			snapshot.order_number || null,
			snapshot.order_type_id,
			snapshot.order_type_name || null,
			snapshot.health_monitoring_mode,
			snapshot.hubsoft_cliente_servico_id,
			snapshot.hubsoft_technician_id,
			match.id || null,
			match.empresa_id || null,
			match.status,
			match.reason,
			snapshot.status || null,
			snapshot.executando,
			snapshot.closure_reason_id,
			snapshot.closure_reason_name || null,
			snapshot.created_at_hubsoft,
			snapshot.scheduled_start_at,
			snapshot.scheduled_end_at,
			snapshot.executed_start_at,
			snapshot.executed_end_at,
			snapshot.source_hash,
			JSON.stringify(snapshot.raw_payload_sanitized || {}),
			current ? Number(current.version || 1) + 1 : 1,
		],
	);
	return { action: current ? "updated" : "inserted", id: rows[0].id, technicianMatch: match.status };
}

async function insertConnectionSnapshotIfNeeded(client, snapshot, { minIntervalMinutes = 60 } = {}) {
	if (!snapshot?.hubsoft_cliente_servico_id || !snapshot.source_hash) return { action: "skipped" };
	const { rows } = await client.query(
		`select id, source_hash, captured_at
		   from hubsoft_connection_snapshots
		  where hubsoft_cliente_servico_id = $1
		  order by captured_at desc
		  limit 1`,
		[snapshot.hubsoft_cliente_servico_id],
	);
	const latest = rows[0];
	if (latest?.source_hash === snapshot.source_hash) {
		const latestAt = new Date(latest.captured_at).getTime();
		if (Date.now() - latestAt < minIntervalMinutes * 60 * 1000) {
			return { action: "unchanged", id: latest.id };
		}
	}
	const { rows: inserted } = await client.query(
		`insert into hubsoft_connection_snapshots (
			sync_run_id, hubsoft_cliente_servico_id, hubsoft_order_id, connected, connection_type,
			pppoe_username, framed_ip_address, nas_ip_address, nas_port_id, last_ipv4, last_nas_ip,
			session_start_at, session_stop_at, session_time_seconds, upload_bytes, download_bytes,
			upload_gigabytes, download_gigabytes, status_text, network_equipment_display,
			source_hash, raw_payload_sanitized
		)
		values (
			$1, $2, $3, $4, $5, $6, $7::inet, $8::inet, $9, $10::inet, $11::inet,
			$12::timestamptz, $13::timestamptz, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb
		)
		returning id`,
		[
			snapshot.sync_run_id,
			snapshot.hubsoft_cliente_servico_id,
			snapshot.hubsoft_order_id,
			snapshot.connected,
			snapshot.connection_type || null,
			snapshot.pppoe_username || null,
			snapshot.framed_ip_address,
			snapshot.nas_ip_address,
			snapshot.nas_port_id || null,
			snapshot.last_ipv4,
			snapshot.last_nas_ip,
			snapshot.session_start_at,
			snapshot.session_stop_at,
			snapshot.session_time_seconds,
			snapshot.upload_bytes,
			snapshot.download_bytes,
			snapshot.upload_gigabytes,
			snapshot.download_gigabytes,
			snapshot.status_text || null,
			snapshot.network_equipment_display || null,
			snapshot.source_hash,
			JSON.stringify(snapshot.raw_payload_sanitized || {}),
		],
	);
	return { action: "inserted", id: inserted[0].id };
}

module.exports = { insertConnectionSnapshotIfNeeded, upsertClienteServicoSnapshot, upsertOrderSnapshot };
