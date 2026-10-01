const { buildSourceHash } = require("../utils/hash");
const { text, toBooleanOrNull, toNumberOrNull } = require("../utils/text");
const { parseHubsoftDate } = require("./dates");
const { sanitizeHubsoftPayload } = require("./sanitize");

function normalizeIp(value) {
	const raw = text(value);
	return raw || null;
}

function normalizeConnectionSnapshot(payload = {}, { clienteServicoId, orderId = null, syncRunId = null } = {}) {
	const acct = payload.acct || {};
	const relevant = {
		hubsoft_cliente_servico_id: toNumberOrNull(clienteServicoId),
		hubsoft_order_id: toNumberOrNull(orderId),
		connected: toBooleanOrNull(payload.conectado),
		connection_type: text(payload.tipo),
		pppoe_username: text(acct.username),
		framed_ip_address: normalizeIp(acct.framedipaddress),
		nas_ip_address: normalizeIp(acct.nasipaddress),
		nas_port_id: text(acct.nasportid),
		last_ipv4: normalizeIp(payload.ultimo_ipv4),
		last_nas_ip: normalizeIp(payload.ultimo_nas_ip),
		session_start_at: parseHubsoftDate(acct.acctstarttime || acct.acctstarttimebr || payload.ultima_conexao_datetime),
		session_stop_at: parseHubsoftDate(acct.acctstoptime || acct.acctstoptimebr || payload.ultima_desconexao_datetime),
		session_time_seconds: toNumberOrNull(acct.acctsessiontime),
		upload_bytes: toNumberOrNull(acct.acctinputoctets),
		download_bytes: toNumberOrNull(acct.acctoutputoctets),
		upload_gigabytes: toNumberOrNull(acct.upload_gigabytes),
		download_gigabytes: toNumberOrNull(acct.download_gigabytes),
		status_text: text(payload.status_txt || payload.status_txt_resumido),
		network_equipment_display: text(payload.ultimo_equipamento?.display || payload.ultimo_equipamento?.descricao || payload.ultimo_equipamento?.nome),
	};
	return {
		...relevant,
		sync_run_id: syncRunId,
		source_hash: buildSourceHash(relevant),
		raw_payload_sanitized: sanitizeHubsoftPayload(payload),
	};
}

module.exports = { normalizeConnectionSnapshot };
