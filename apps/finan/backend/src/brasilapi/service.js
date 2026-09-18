// Núcleo da consulta de CNPJ na BrasilAPI (publica, sem chave), extraido
// de brasilapi/routes.js pra ser reaproveitado tambem por
// pendencias/routes.js (alerta de CNPJ inativo) sem duplicar cache/fetch/
// normalizacao. A rota HTTP (routes.js) so envolve isso com validacao de
// entrada e resposta JSON.
const BASE_URL = "https://brasilapi.com.br/api";

// Cache em memoria (Map + TTL) — processo unico via systemd, sem precisar
// de nada distribuido. Compartilhado entre a rota /cnpj/:cnpj e a
// checagem de pendencias, entao uma consulta feita por uma nao repete pra
// outra dentro da mesma janela de 1h.
const cache = new Map();
function getCached(key, ttlMs) {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < ttlMs) return hit.value;
	return undefined;
}
function setCached(key, value) {
	cache.set(key, { value, at: Date.now() });
}

async function fetchJson(url) {
	// Sem User-Agent, o fetch nativo do Node leva 403 da protecao anti-bot da
	// BrasilAPI (confirmado no endpoint /cnpj, que faz scraping real da
	// Receita — os outros endpoints ate toleram, mas mandamos sempre por
	// consistencia/seguranca contra o mesmo bloqueio no futuro).
	const response = await fetch(url, {
		headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; FinanBot/1.0; +https://finan.retiradas.tech)" },
	});
	if (!response.ok) {
		// 400/404 sao erro de ENTRADA (CNPJ com digito verificador invalido,
		// CNPJ nao encontrado) — repassa o status real e a mensagem da
		// BrasilAPI quando ela manda uma (ex.: "CNPJ 13.126.784/4044-02
		// inválido."), em vez de mascarar tudo que nao e 404 como 502
		// generico "indisponivel" (bug real: um CNPJ digitado errado virava
		// "consulta indisponivel", confundindo o motivo de verdade).
		let payload = null;
		try {
			payload = await response.json();
		} catch {
			// Corpo nao veio como JSON (ou nao veio corpo nenhum) — segue sem
			// mensagem especifica, usa o fallback generico abaixo.
		}
		const error = new Error(payload?.message || `BrasilAPI respondeu HTTP ${response.status}.`);
		error.statusCode = response.status === 400 || response.status === 404 ? response.status : 502;
		throw error;
	}
	return response.json();
}

const CNPJ_DIGITS_PATTERN = /^\d{14}$/;

function normalizeEmpresa(data) {
	return {
		cnpj: data.cnpj,
		razaoSocial: data.razao_social,
		nomeFantasia: data.nome_fantasia || "",
		situacaoCadastral: data.descricao_situacao_cadastral,
		dataSituacaoCadastral: data.data_situacao_cadastral,
		ativa: String(data.descricao_situacao_cadastral || "").toUpperCase() === "ATIVA",
		municipio: data.municipio,
		uf: data.uf,
		logradouro: data.logradouro,
		numero: data.numero,
		bairro: data.bairro,
		cep: data.cep,
		porte: data.porte,
		naturezaJuridica: data.natureza_juridica,
		dataInicioAtividade: data.data_inicio_atividade,
		cnaeDescricao: data.cnae_fiscal_descricao,
	};
}

/**
 * Consulta 1 CNPJ (só dígitos) na BrasilAPI, com cache de 1h. Lança erro
 * com `.statusCode` (404 = não encontrado, 502 = BrasilAPI indisponível)
 * — quem chama decide como tratar.
 */
async function consultarCnpj(cnpjDigits) {
	if (!CNPJ_DIGITS_PATTERN.test(cnpjDigits)) {
		const error = new Error("CNPJ inválido — informe os 14 dígitos.");
		error.statusCode = 400;
		throw error;
	}
	const cacheKey = `cnpj:${cnpjDigits}`;
	const cached = getCached(cacheKey, 60 * 60 * 1000); // 1h
	if (cached) return { empresa: cached, cache: true };
	const data = await fetchJson(`${BASE_URL}/cnpj/v1/${cnpjDigits}`);
	const empresa = normalizeEmpresa(data);
	setCached(cacheKey, empresa);
	return { empresa, cache: false };
}

module.exports = { BASE_URL, CNPJ_DIGITS_PATTERN, cache, getCached, setCached, fetchJson, consultarCnpj };
