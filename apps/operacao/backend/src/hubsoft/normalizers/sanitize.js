const SENSITIVE_KEY_PATTERN = /cpf|cnpj|documento|telefone|celular|email|endereco|logradouro|numero|bairro|complemento|cep|nome|name|razao|cliente|senha|password|token|cookie|authorization|secret/i;
const ALLOWED_TECHNICAL_KEY_PATTERN = /id_|_id$|status|tipo|servico|plano|tecnologia|velocidade|mac|serial|modelo|fabricante|nas|porta|slot|olt|ct[opw]?|rx|tx|dbm|pon|radius|acct|pppoe|session|download|upload|trafego/i;

function removeJsonbUnsafeControlChars(value) {
	let clean = "";
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (!(code === 9 || code === 10 || code === 13 || code >= 32)) continue;
		if (code >= 0xD800 && code <= 0xDBFF) {
			const next = value.charCodeAt(index + 1);
			if (next >= 0xDC00 && next <= 0xDFFF) {
				clean += value[index] + value[index + 1];
				index += 1;
			}
			continue;
		}
		if (code >= 0xDC00 && code <= 0xDFFF) continue;
		clean += value[index];
	}
	return clean;
}

function sanitizeHubsoftPayload(value, depth = 0, key = "") {
	if (depth > 8) return "<max-depth>";
	if (SENSITIVE_KEY_PATTERN.test(key) && !ALLOWED_TECHNICAL_KEY_PATTERN.test(key)) return "<masked>";
	if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeHubsoftPayload(item, depth + 1, key));
	if (!value || typeof value !== "object") {
		if (typeof value === "string") {
			const clean = removeJsonbUnsafeControlChars(value);
			if (clean.length > 1000) return `${clean.slice(0, 1000)}...<truncated>`;
			return clean;
		}
		return value;
	}
	return Object.fromEntries(
		Object.entries(value)
			.slice(0, 250)
			.map(([childKey, childValue]) => [childKey, sanitizeHubsoftPayload(childValue, depth + 1, childKey)]),
	);
}

module.exports = { sanitizeHubsoftPayload };
