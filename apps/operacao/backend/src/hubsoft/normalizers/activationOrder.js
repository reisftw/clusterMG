const { getActivationOrderTypeConfig } = require("../constants");
const { buildSourceHash } = require("../utils/hash");
const { text, toBooleanOrNull, toNumberOrNull } = require("../utils/text");
const { parseHubsoftDate } = require("./dates");
const { resolveHubsoftBrand } = require("./brand");
const { parsePlanSpeedMbps } = require("./speed");
const { sanitizeHubsoftPayload } = require("./sanitize");
const { resolveActivationClosureStatus } = require("../services/activationClosureStatus");
const { resolveActivationLocation } = require("./activationLocation");
const { resolveActivationTechnician } = require("./activationTechnician");

function normalizeClienteServico(clienteServico = {}, syncRunId = null) {
	const service = clienteServico?.servico || {};
	const status = clienteServico?.servico_status || {};
	const description = text(service.descricao || service.display || clienteServico.display || "");
	const brand = resolveHubsoftBrand(clienteServico);
	const speed = parsePlanSpeedMbps(description);
	const relevant = {
		hubsoft_cliente_servico_id: toNumberOrNull(clienteServico.id_cliente_servico),
		hubsoft_client_id: toNumberOrNull(clienteServico.id_cliente),
		hubsoft_service_id: toNumberOrNull(clienteServico.id_servico || service.id_servico || service.id),
		numero_plano: text(clienteServico.numero_plano),
		service_description: description,
		service_status: text(status.descricao || status.display || status.status || ""),
		service_status_id: toNumberOrNull(clienteServico.id_servico_status || status.id_servico_status || status.id),
		brand: brand.brand,
		brand_source: brand.brandSource,
		speed_mbps_derived: speed,
		speed_source: speed ? "service_description" : null,
	};
	return {
		...relevant,
		sync_run_id: syncRunId,
		source_hash: buildSourceHash(relevant),
		raw_payload_sanitized: sanitizeHubsoftPayload(clienteServico),
	};
}

function normalizeActivationOrder(order = {}, syncRunId = null) {
	const orderTypeId = toNumberOrNull(order.id_tipo_ordem_servico || order.tipo_ordem_servico?.id_tipo_ordem_servico || order.tipo_ordem_servico?.id);
	const typeConfig = getActivationOrderTypeConfig(orderTypeId);
	if (!typeConfig) return null;
	const technician = resolveActivationTechnician(order);
	const closureReason = order.motivo_fechamento || {};
	const clienteServico = order.cliente_servico || {};
	const location = resolveActivationLocation(order);
	const relevant = {
		hubsoft_order_id: toNumberOrNull(order.id_ordem_servico),
		order_number: text(order.numero_ordem_servico),
		order_type_id: orderTypeId,
		order_type_name: text(order.tipo_ordem_servico?.descricao || order.tipo_ordem_servico?.display || typeConfig.name),
		health_monitoring_mode: typeConfig.healthMonitoringMode,
		hubsoft_cliente_servico_id: toNumberOrNull(order.id_cliente_servico || clienteServico.id_cliente_servico),
		hubsoft_technician_id: technician.hubsoftTechnicianId,
		hubsoft_technician_name: technician.name,
		hubsoft_technician_email: technician.email,
		technician_assignment_status: technician.assignmentStatus,
		status: text(order.status),
		executando: toBooleanOrNull(order.executando),
		closure_reason_id: toNumberOrNull(closureReason.id_motivo_fechamento || closureReason.id),
		closure_reason_name: text(closureReason.descricao || closureReason.display || closureReason.nome),
		activation_city_id: location.cityId,
		activation_city_name: location.cityName,
		activation_city_source: location.source,
		activation_city_confidence: location.confidence,
		created_at_hubsoft: parseHubsoftDate(order.data_cadastro || order.data_cadastro_br),
		scheduled_start_at: parseHubsoftDate(order.data_inicio_programado),
		scheduled_end_at: parseHubsoftDate(order.data_termino_programado),
		executed_start_at: parseHubsoftDate(order.data_inicio_executado || order.data_inicio_executado_br),
		executed_end_at: parseHubsoftDate(order.data_termino_executado || order.data_termino_executado_br),
	};
	relevant.activation_closure_status = resolveActivationClosureStatus(relevant).status;
	return {
		...relevant,
		sync_run_id: syncRunId,
		cliente_servico_snapshot: clienteServico?.id_cliente_servico ? normalizeClienteServico(clienteServico, syncRunId) : null,
		source_hash: buildSourceHash(relevant),
		raw_payload_sanitized: sanitizeHubsoftPayload(order),
	};
}

module.exports = { normalizeActivationOrder, normalizeClienteServico };
