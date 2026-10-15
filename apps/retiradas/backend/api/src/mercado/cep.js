const https = require("node:https");

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const cache = new Map();

function onlyDigits(value) {
	return String(value || "").replace(/\D/g, "");
}

function fetchJson(url, timeoutMs = 4500) {
	return new Promise((resolve, reject) => {
		const request = https.get(url, { headers: { Accept: "application/json", "User-Agent": "Retiradas-Mercado/1.0" } }, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => { body += chunk; });
			response.on("end", () => {
				if (response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(new Error("CEP provider unavailable"), { statusCode: response.statusCode }));
				try { resolve(JSON.parse(body)); } catch { reject(new Error("CEP provider returned invalid JSON")); }
			});
		});
		request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error("CEP lookup timeout"), { code: "ETIMEDOUT" })));
		request.on("error", reject);
	});
}

function normalizeViaCep(data, cep) {
	if (!data || data.erro) return null;
	return {
		cep,
		logradouro: data.logradouro || "",
		bairro: data.bairro || "",
		cidade: data.localidade || "",
		uf: data.uf || "",
		codigoIbge: data.ibge || null,
		origemConsulta: "VIACEP",
		generico: !data.logradouro || !data.bairro,
	};
}

async function lookupCep(value) {
	const cep = onlyDigits(value);
	if (!/^\d{8}$/.test(cep)) {
		const error = new Error("Informe um CEP com oito dígitos.");
		error.statusCode = 400;
		throw error;
	}
	const cached = cache.get(cep);
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	// ViaCEP is used as the validated fallback. CEP Brasil remains configurable because
	// its official endpoint and contracted credentials vary by plan.
	const configuredBase = String(process.env.CEP_BRASIL_API_URL || "").trim();
	let result = null;
	if (configuredBase && process.env.CEP_BRASIL_API_TOKEN) {
		try {
			const url = `${configuredBase.replace(/\/$/, "")}/${cep}`;
			const remote = await fetchJson(url);
			if (remote?.cep) result = { ...remote, cep, origemConsulta: "CEP_BRASIL" };
		} catch { /* fallback below */ }
	}
	if (!result) result = normalizeViaCep(await fetchJson(`https://viacep.com.br/ws/${cep}/json/`), cep);
	if (!result) {
		const error = new Error("Não conseguimos localizar seu CEP. Preencha o endereço manualmente.");
		error.statusCode = 404;
		throw error;
	}
	cache.set(cep, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
	return result;
}

module.exports = { lookupCep, onlyDigits };
