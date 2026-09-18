export const normalizeText = (value) =>
	String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLowerCase();

export const normalizeKey = (value) =>
	normalizeText(value).replace(/[^a-z0-9]+/g, "");

export const normalizeWorksheetRows = (rows) =>
	rows.map((row) => {
		const normalized = {};
		Object.keys(row || {}).forEach((key) => {
			normalized[normalizeKey(key)] = row[key];
		});
		return normalized;
	});

export function extractCidadeFromEndereco(endereco, fallback = null) {
	if (!endereco) return fallback;
	const source = String(endereco);

	const ufMatch = source.match(/,\s*([^,|/\n]+?)\/[A-Z]{2}(?:\s*\||$)/i);
	if (ufMatch) return ufMatch[1].trim();

	const cepMatch = source.match(/,\s*([^,|\n]+?)\s*\|\s*CEP/i);
	if (cepMatch) {
		return cepMatch[1]
			.trim()
			.replace(/\/[A-Z]{2}$/, "")
			.trim();
	}

	return fallback;
}

export const pickFirst = (row, keys) => {
	for (const key of keys) {
		const value = row?.[key];
		if (String(value ?? "").trim()) return String(value).trim();
	}
	return "";
};

export const parseFerramentasDate = (value) => {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

	const raw = String(value).trim();
	if (!raw) return null;

	const onlyDate = raw.split(",")[0].trim().split(" ")[0];
	const br = onlyDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

	const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatFerramentasMonth = (date) =>
	date
		? `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
		: null;

export function buildCidadeRegionalMap(regionais = [], mapper) {
	return regionais.reduce((map, regional) => {
		(regional.cidades || []).forEach((cidade) => {
			map[normalizeText(cidade.nome)] = mapper
				? mapper(regional, cidade)
				: regional.nome;
		});
		return map;
	}, {});
}
