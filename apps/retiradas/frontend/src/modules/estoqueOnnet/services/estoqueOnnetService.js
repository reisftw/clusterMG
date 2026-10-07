import { requestVpsApi } from "../../../services/vpsApiClient";

const MAC_PREFIX_MANUFACTURERS = {
	"001A79": "ZTE",
	"04BF6D": "ZTE",
	"081075": "FiberHome",
	"0C722C": "FiberHome",
	"18725D": "Huawei",
	"1C1D67": "Huawei",
	"2008ED": "Huawei",
	"286ED4": "Huawei",
	"2C9D1E": "Huawei",
	"34B7DA": "ZTE",
	"485754": "FiberHome",
	"5C497D": "FiberHome",
	"68A828": "Huawei",
	"707BE8": "Huawei",
	"78D752": "Huawei",
	"7C6097": "Huawei",
	"805EC0": "FiberHome",
	"8C34FD": "Huawei",
	"A8329A": "FiberHome",
	"AC4E91": "Huawei",
	"ACE87B": "Huawei",
	"C83A35": "Huawei",
	"D46E0E": "Huawei",
	"E067B3": "ZTE",
	"E80945": "ZTE",
	"F49EEF": "Huawei",
	"F4E3FB": "FiberHome",
};

export function normalizeOnnetMac(value) {
	return String(value || "")
		.replace(/[^a-fA-F0-9]/g, "")
		.toUpperCase()
		.slice(0, 12);
}

export function formatOnnetMac(value) {
	const normalized = normalizeOnnetMac(value);
	return normalized.replace(/(.{2})(?=.)/g, "$1:");
}

export function inferOnnetManufacturer(value) {
	const normalized = normalizeOnnetMac(value);
	if (normalized.length < 6) return "Fabricante não identificado";
	return (
		MAC_PREFIX_MANUFACTURERS[normalized.slice(0, 6)] ||
		"Fabricante não identificado"
	);
}

export async function listarEstoqueOnnet({ page = 1, limit = 50, query = "" } = {}) {
	const params = new URLSearchParams({
		limit: String(limit),
		page: String(page),
	});
	if (query) params.set("query", query);
	return requestVpsApi(`/estoque/onnet?${params.toString()}`);
}

export async function salvarEstoqueOnnet(payload = {}) {
	return requestVpsApi("/estoque/onnet", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}
