const MAP_ORDER_COMPARISON_FIELDS = [
	"num_os",
	"empresa",
	"fonte",
	"status",
	"tipo",
	"cidade",
	"regional",
	"agente",
	"codigo_cliente",
	"nome_cliente",
	"id_cliente_servico",
	"servico",
	"numero_plano",
	"data_cadastro",
	"data_abertura_os",
	"telefone",
	"telefone_primario",
	"telefone_secundario",
	"telefone_terciario",
	"telefones",
	"mac_addr",
	"phy_addr",
	"macs_equipamento",
	"tecnico",
	"endereco",
	"numero",
	"bairro",
	"endereco_resumo",
	"coordenadas",
	"latitude",
	"longitude",
];

const DATE_FIELDS = new Set(["data_cadastro", "data_abertura_os"]);

function normalizeDateTime(value) {
	const text = String(value || "").trim();
	if (!text) return null;
	const iso = text.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
	);
	if (iso) {
		return `${iso[1]}-${iso[2]}-${iso[3]} ${String(iso[4] || "00").padStart(2, "0")}:${iso[5] || "00"}:${iso[6] || "00"}`;
	}
	const br = text.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
	);
	if (!br) return text;
	return `${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")} ${String(br[4] || "00").padStart(2, "0")}:${br[5] || "00"}:${br[6] || "00"}`;
}

function normalizeComparableValue(field, value) {
	if (DATE_FIELDS.has(field)) return normalizeDateTime(value);
	if (Array.isArray(value)) {
		return value
			.map((item) => String(item || "").trim())
			.filter(Boolean)
			.sort();
	}
	if (value === undefined || value === null || value === "") return null;
	return typeof value === "string" ? value.trim() : value;
}

function comparableMapOrder(order = {}) {
	return MAP_ORDER_COMPARISON_FIELDS.map((field) =>
		normalizeComparableValue(field, order[field]),
	);
}

function mapOrderChanged(current = {}, incoming = {}) {
	return (
		JSON.stringify(comparableMapOrder(current)) !==
		JSON.stringify(comparableMapOrder(incoming))
	);
}

module.exports = { comparableMapOrder, mapOrderChanged };
