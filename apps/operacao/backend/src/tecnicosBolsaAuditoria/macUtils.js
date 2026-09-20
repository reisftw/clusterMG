// Normalização canônica de MAC address (Fase E — docs/TECHNICAL-AUDIT.md,
// achado #2: MAC gravado sem normalização de case/separador, sem
// unicidade no banco — "AA:BB:CC:DD:EE:FF", "aa:bb:cc:dd:ee:ff" e
// "AABBCCDDEEFF" eram tratados como três valores distintos em
// `ordensRepository.js`).
//
// Formato canônico: 12 caracteres hexadecimais maiúsculos, sem separador
// (ex.: "AABBCCDDEEFF"). Esta função já existia, duplicada e sem uso
// centralizado, dentro de `sempreIntegration.js` (usada lá pra casar
// equipamento retirado com o MAC devolvido pela API da Sempre) — extraída
// pra cá pra ter uma única fonte de verdade, reaproveitada tanto na
// integração quanto na gravação de ordens (`ordensRepository.js`).
//
// Este módulo é aplicado NA ESCRITA/COMPARAÇÃO, forward-only — não migra
// nem re-grava dados históricos existentes sozinho. Ver
// `docs/DATABASE-CONSTRAINTS-PLAN.md` para o plano de gerar relatório de
// colisão em cima dos dados já existentes e só então considerar
// backfill + UNIQUE, com preflight antes de qualquer constraint.
const MAC_PLACEHOLDER = "FFFFFFFFFFFF";
const MAC_HEX_LENGTH = 12;

function normalizeMac(value) {
	return String(value || "")
		.replace(/[^a-fA-F0-9]/g, "")
		.toUpperCase();
}

function isValidMac(value) {
	const mac = normalizeMac(value);
	return mac.length === MAC_HEX_LENGTH && mac !== MAC_PLACEHOLDER;
}

function formatMac(value) {
	const normalized = normalizeMac(value);
	if (!isValidMac(normalized)) return "";
	return normalized.match(/.{1,2}/g)?.join(":") || "";
}

module.exports = { normalizeMac, isValidMac, formatMac, MAC_HEX_LENGTH, MAC_PLACEHOLDER };
