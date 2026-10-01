const { getActivationOrderTypeConfig } = require("../constants");
const { buildSourceHash } = require("../utils/hash");
const {
	ACTIVATION_HEALTH_CONFIG,
	ACTIVATION_DATA_QUALITY_ISSUE,
	ACTIVATION_HEALTH_REASON,
	ACTIVATION_HEALTH_STATUS,
} = require("./activationHealthConfig");
const { daysSinceActivation } = require("./healthWindow");

function resolveActivationDate(row = {}) {
	return row.executed_end_at || row.closed_at || null;
}

function resolveHealthWindow(days) {
	if (days === null || days === undefined) return "SEM_DATA";
	if (days < 0 || days > ACTIVATION_HEALTH_CONFIG.monitoringWindowDays) return "FORA_DA_JANELA";
	if (days <= 1) return "D+1";
	if (days <= 7) return "D+7";
	if (days <= 15) return "D+15";
	return "D+30";
}

function uniqueReasons(reasons) {
	return [...new Set(reasons.filter(Boolean))];
}

function hoursBetween(later, earlier) {
	if (!later || !earlier) return null;
	const diff = new Date(later).getTime() - new Date(earlier).getTime();
	if (!Number.isFinite(diff)) return null;
	return Math.max(0, diff / 3600000);
}

function isServiceActive(value) {
	const text = String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
	if (!text) return null;
	if (/(ativo|habilitado|liberado|normal)/.test(text)) return true;
	if (/(cancel|inativo|bloqueado|suspenso|desativado)/.test(text)) return false;
	return null;
}

function trafficTotal(row = {}) {
	const down = Number(row.download_gigabytes ?? row.connection_download_gigabytes ?? 0);
	const up = Number(row.upload_gigabytes ?? row.connection_upload_gigabytes ?? 0);
	return {
		download: Number.isFinite(down) ? down : 0,
		upload: Number.isFinite(up) ? up : 0,
		total: (Number.isFinite(down) ? down : 0) + (Number.isFinite(up) ? up : 0),
	};
}

function normalizeSupportEvents(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	try {
		return JSON.parse(value);
	} catch (_error) {
		return [];
	}
}

function timelineEvent(at, type, label, metadata = {}) {
	return at ? { at, type, label, metadata } : null;
}

function dataQualityIssues(row = {}) {
	const issues = [];
	if (row.technician_match_status && row.technician_match_status !== "matched" && row.technician_match_status !== "matched_by_name") {
		issues.push(ACTIVATION_DATA_QUALITY_ISSUE.TECHNICIAN_UNMATCHED);
	}
	if (!row.operacao_empresa_id && !row.company_name) issues.push(ACTIVATION_DATA_QUALITY_ISSUE.COMPANY_UNMATCHED);
	if (!row.cidade_id && !row.city_name && !row.cidade_nome) issues.push(ACTIVATION_DATA_QUALITY_ISSUE.CITY_MISSING);
	if (!row.brand || String(row.brand).toUpperCase() === "UNKNOWN") issues.push(ACTIVATION_DATA_QUALITY_ISSUE.BRAND_UNKNOWN);
	return uniqueReasons(issues);
}

function evaluateActivationHealth(row = {}, options = {}) {
	const now = options.now || new Date();
	const activationDate = resolveActivationDate(row);
	const days = daysSinceActivation(activationDate, now);
	const healthWindow = resolveHealthWindow(days);
	const orderTypeConfig = getActivationOrderTypeConfig(row.order_type_id);
	const monitoringMode = row.health_monitoring_mode || orderTypeConfig?.healthMonitoringMode || "NONE";
	const reasons = [];
	const qualityIssues = dataQualityIssues(row);
	const evidence = {
		activationDate,
		daysSinceActivation: days,
		healthWindow,
		monitoringMode,
		dataQualityIssues: qualityIssues,
		connection: {
			connected: row.connection_connected,
			capturedAt: row.connection_captured_at,
			statusText: row.connection_status_text,
			sessionTimeSeconds: row.session_time_seconds,
			pppoeUsername: row.pppoe_username,
			nasIpAddress: row.nas_ip_address,
			nasPortId: row.nas_port_id,
			traffic: trafficTotal(row),
		},
		service: {
			status: row.service_status,
			brand: row.brand,
			plan: row.service_description,
			speedMbps: row.speed_mbps_derived,
		},
		support: {
			source: "hubsoft_activation_support_events",
			events: normalizeSupportEvents(row.support_events),
		},
	};

	if (!activationDate) reasons.push(ACTIVATION_HEALTH_REASON.INSUFFICIENT_DATA);
	if (monitoringMode === "NONE") reasons.push(ACTIVATION_HEALTH_REASON.INSUFFICIENT_DATA);
	if (!row.connection_captured_at) reasons.push(ACTIVATION_HEALTH_REASON.INSUFFICIENT_DATA);

	const dataAgeHours = hoursBetween(now, row.connection_captured_at);
	evidence.connection.dataAgeHours = dataAgeHours;
	if (dataAgeHours !== null && dataAgeHours > ACTIVATION_HEALTH_CONFIG.staleConnectionHours) {
		reasons.push(ACTIVATION_HEALTH_REASON.STALE_CONNECTION_DATA);
	}

	const serviceActive = isServiceActive(row.service_status);
	evidence.service.active = serviceActive;
	if (serviceActive === false) reasons.push(ACTIVATION_HEALTH_REASON.SERVICE_INACTIVE);

	if (monitoringMode === "LIMITED") {
		reasons.push(ACTIVATION_HEALTH_REASON.LIMITED_MONITORING);
	} else if (row.connection_connected === false) {
		reasons.push(ACTIVATION_HEALTH_REASON.NO_CONNECTION);
	} else if (row.connection_connected === true) {
		const traffic = evidence.connection.traffic.total;
		const hasEnoughObservation = dataAgeHours === null || dataAgeHours >= ACTIVATION_HEALTH_CONFIG.minObservationHoursForNoTraffic;
		if (hasEnoughObservation && traffic <= ACTIVATION_HEALTH_CONFIG.noTrafficGigabytesThreshold) {
			reasons.push(ACTIVATION_HEALTH_REASON.NO_TRAFFIC);
		} else if (hasEnoughObservation && traffic <= ACTIVATION_HEALTH_CONFIG.lowTrafficGigabytesThreshold) {
			reasons.push(ACTIVATION_HEALTH_REASON.LOW_TRAFFIC);
		}
	}

	const qualitySupportEvents = evidence.support.events.filter((event) => event.affectsActivationQuality === true);
	evidence.support.qualityCount = qualitySupportEvents.length;
	if (qualitySupportEvents.length >= ACTIVATION_HEALTH_CONFIG.repeatedSupportCount) {
		reasons.push(ACTIVATION_HEALTH_REASON.REPEATED_SUPPORT);
	} else if (qualitySupportEvents.length === 1) {
		reasons.push(ACTIVATION_HEALTH_REASON.RECENT_SUPPORT);
	}

	const finalReasons = uniqueReasons(reasons);
	let healthStatus = ACTIVATION_HEALTH_STATUS.HEALTHY;
	if (!activationDate || !row.connection_captured_at || monitoringMode === "NONE") {
		healthStatus = ACTIVATION_HEALTH_STATUS.NO_DATA;
	} else if (
		finalReasons.includes(ACTIVATION_HEALTH_REASON.NO_CONNECTION) ||
		finalReasons.includes(ACTIVATION_HEALTH_REASON.SERVICE_INACTIVE) ||
		finalReasons.includes(ACTIVATION_HEALTH_REASON.REPEATED_SUPPORT) ||
		(finalReasons.includes(ACTIVATION_HEALTH_REASON.RECENT_SUPPORT) && finalReasons.includes(ACTIVATION_HEALTH_REASON.NO_TRAFFIC))
	) {
		healthStatus = ACTIVATION_HEALTH_STATUS.CRITICAL;
	} else if (finalReasons.some((reason) => [
		ACTIVATION_HEALTH_REASON.NO_TRAFFIC,
		ACTIVATION_HEALTH_REASON.LOW_TRAFFIC,
		ACTIVATION_HEALTH_REASON.RECENT_SUPPORT,
		ACTIVATION_HEALTH_REASON.STALE_CONNECTION_DATA,
		ACTIVATION_HEALTH_REASON.LIMITED_MONITORING,
	].includes(reason))) {
		healthStatus = ACTIVATION_HEALTH_STATUS.ATTENTION;
	}

	const timeline = [
		timelineEvent(activationDate, "activation", "Ativação concluída", { orderNumber: row.order_number }),
		timelineEvent(row.connection_captured_at, "connection", row.connection_connected === true ? "PPPoE conectado observado" : row.connection_connected === false ? "PPPoE desconectado observado" : "Captura de conexão sem estado", {
			connected: row.connection_connected,
			pppoeUsername: row.pppoe_username,
		}),
		...qualitySupportEvents.map((event) => timelineEvent(event.openedAt || event.opened_at, "support", `Atendimento técnico: ${event.attendanceType || event.attendance_type || event.attendance_category || "suporte"}`, event)),
		timelineEvent(now.toISOString(), "health", `Saúde avaliada como ${healthStatus}`, { reasons: finalReasons }),
	].filter(Boolean).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

	const result = {
		healthStatus,
		reasons: finalReasons.length ? finalReasons : [],
		dataQualityIssues: qualityIssues,
		daysSinceActivation: days,
		healthWindow,
		evidence: { ...evidence, timeline },
		evaluatedAt: now.toISOString(),
	};
	return { ...result, sourceHash: buildSourceHash(result) };
}

module.exports = {
	evaluateActivationHealth,
	resolveActivationDate,
	resolveHealthWindow,
};
