function cleanText(value) {
	return String(value || "").trim();
}

function normalizeText(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizeCityKey(value) {
	return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

const OS_TYPES = Object.freeze({
	RETIRADA_FTTH: { id: 1487, label: "RETIRADA FTTH", legacy: true },
	RETIRADA_CANCELAMENTO_SEGUNDA_TENTATIVA: {
		id: 1488,
		label: "RETIRADA & CANCELAMENTO - SEGUNDA TENTATIVA",
		legacy: true,
	},
	CANCELAMENTO_FTTH: { id: 1495, label: "CANCELAMENTO FTTH", legacy: true },
	CANCELAMENTO_LOJA: { id: 5, label: "CANCELAMENTO LOJA", legacy: true },
	RETIRADA_OUTROS: { id: 1493, label: "RETIRADA - OUTROS", legacy: false },
	CANCELAMENTO_OUTROS: {
		id: 1496,
		label: "CANCELAMENTO - OUTROS",
		legacy: false,
	},
});

const LEGACY_PRODUCTION_OS_TYPE_IDS = new Set(
	Object.values(OS_TYPES)
		.filter((item) => item.legacy)
		.map((item) => item.id),
);
const NEW_PRODUCTION_OS_TYPE_IDS = new Set(
	Object.values(OS_TYPES)
		.filter((item) => !item.legacy)
		.map((item) => item.id),
);
const PRODUCTION_OS_TYPE_IDS = new Set(
	Object.values(OS_TYPES).map((item) => item.id),
);

const MATCH_IGNORED_OS_TYPES = Object.freeze([
	[522, "DESMONTE DE POP"],
	[63, "EXPANSÃO DE REDE"],
	[449, "FALHA DE INFRAESTRUTURA"],
	[48, "INSERÇÃO DE EQUIPAMENTO"],
	[1490, "LIBERAÇÃO DE PORTAS"],
	[571, "LISTAGEM DE TA"],
	[665, "MIGRAÇÃO EPON / GPON"],
	[1494, "MULTA DE EQUIPAMENTO"],
	[67, "TROCA EPON/GPON"],
	[66, "VIABILIDADE"],
]);
const MATCH_IGNORED_TYPE_IDS = new Set(
	MATCH_IGNORED_OS_TYPES.map(([id]) => Number(id)),
);

function featureEnabled(name, fallback = true) {
	const value = process.env[name];
	if (value === undefined || value === null || value === "") return fallback;
	return !["0", "false", "FALSE", "no", "NO"].includes(String(value).trim());
}

function productionOsTypeIds({ includeNewTypes } = {}) {
	const include =
		includeNewTypes === undefined
			? featureEnabled("ENABLE_NEW_OS_TYPES", true)
			: Boolean(includeNewTypes);
	return include ? new Set(PRODUCTION_OS_TYPE_IDS) : new Set(LEGACY_PRODUCTION_OS_TYPE_IDS);
}

function isProductionOsType(value, options = {}) {
	return productionOsTypeIds(options).has(Number(value));
}

function isNewProductionOsType(value) {
	return NEW_PRODUCTION_OS_TYPE_IDS.has(Number(value));
}

function isIgnoredForMatch(value) {
	return MATCH_IGNORED_TYPE_IDS.has(Number(value));
}

function parseServiceSpeedMbps(value) {
	const text = normalizeText(value).replace(",", ".");
	if (!text) return null;
	const gb = text.match(/(\d+(?:\.\d+)?)\s*(GIGA|GB|G\b)/);
	if (gb) return Number(gb[1]) * 1000;
	const mb = text.match(/(\d+(?:\.\d+)?)\s*(MEGA|MB|M\b|MBPS)/);
	if (mb) return Number(mb[1]);
	const plain = text.match(/(?:^|\D)(\d{2,4})(?:\D|$)/);
	if (!plain) return null;
	const number = Number(plain[1]);
	return Number.isFinite(number) && number > 0 ? number : null;
}

function classifyEquipmentByServiceSpeed(value) {
	const speedMbps = parseServiceSpeedMbps(value);
	if (!speedMbps || !Number.isFinite(speedMbps)) {
		return {
			equipmentType: "UNKNOWN",
			speedMbps: null,
			reason: "SERVICE_SPEED_MISSING",
		};
	}
	if (speedMbps <= 100) {
		return { equipmentType: "FAST", speedMbps, reason: "SPEED_LTE_100" };
	}
	if (speedMbps <= 500) {
		return { equipmentType: "AC", speedMbps, reason: "SPEED_101_500" };
	}
	return { equipmentType: "AX", speedMbps, reason: "SPEED_GT_500" };
}

module.exports = {
	MATCH_IGNORED_OS_TYPES,
	MATCH_IGNORED_TYPE_IDS,
	NEW_PRODUCTION_OS_TYPE_IDS,
	OS_TYPES,
	PRODUCTION_OS_TYPE_IDS,
	classifyEquipmentByServiceSpeed,
	cleanText,
	featureEnabled,
	isIgnoredForMatch,
	isNewProductionOsType,
	isProductionOsType,
	normalizeCityKey,
	normalizeText,
	parseServiceSpeedMbps,
	productionOsTypeIds,
};
