// Proxy fino pra BrasilAPI (publica, sem chave — brasilapi.com.br) usado
// pelos cards "reais e financeiros" da Dashboard e pelo modal de
// visualização de Nota Fiscal (consulta de CNPJ ativo). Sempre passa pelo
// backend em vez do frontend bater direto na BrasilAPI: cache simples em
// memória (evita repetir a mesma consulta a cada carregamento de página) e
// nunca expõe a chamada externa direto pro navegador do usuário. A parte
// de CNPJ (fetch + cache + normalização) mora em service.js, reaproveitada
// também por pendencias/routes.js (alerta de CNPJ inativo).
const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { BASE_URL, getCached, setCached, fetchJson, consultarCnpj } = require("./service");

const router = express.Router();

router.use(requireFinanPermission("finan.dashboard.view"));
router.use(noStore);

router.get("/cnpj/:cnpj", async (req, res, next) => {
	try {
		const digits = String(req.params.cnpj || "").replace(/\D/g, "");
		const { empresa, cache } = await consultarCnpj(digits);
		res.json({ ok: true, empresa, cache });
	} catch (error) {
		if (error.statusCode === 400) {
			res.status(400).json({ ok: false, error: error.message });
			return;
		}
		if (error.statusCode === 404) {
			res.status(404).json({ ok: false, error: "CNPJ não encontrado na Receita Federal." });
			return;
		}
		if (error.statusCode === 502) {
			res.status(502).json({ ok: false, error: "A consulta de CNPJ está indisponível no momento. Tente novamente em instantes." });
			return;
		}
		next(error);
	}
});

router.get("/bancos", async (_req, res, next) => {
	try {
		const cached = getCached("bancos", 24 * 60 * 60 * 1000); // 24h - lista quase estatica
		if (cached) {
			res.json({ ok: true, bancos: cached, cache: true });
			return;
		}
		const data = await fetchJson(`${BASE_URL}/banks/v1`);
		const bancos = (Array.isArray(data) ? data : [])
			.filter((banco) => banco.code !== null && banco.name)
			.map((banco) => ({ codigo: banco.code, nome: banco.fullName || banco.name, ispb: banco.ispb }))
			.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
		setCached("bancos", bancos);
		res.json({ ok: true, bancos });
	} catch (error) {
		next(error);
	}
});

router.get("/taxas", async (_req, res, next) => {
	try {
		const cached = getCached("taxas", 60 * 60 * 1000); // 1h
		if (cached) {
			res.json({ ok: true, taxas: cached, cache: true });
			return;
		}
		const data = await fetchJson(`${BASE_URL}/taxas/v1`);
		const taxas = Array.isArray(data) ? data.map((item) => ({ nome: item.nome, valor: item.valor })) : [];
		setCached("taxas", taxas);
		res.json({ ok: true, taxas });
	} catch (error) {
		next(error);
	}
});

const MOEDAS_PADRAO = ["USD", "EUR", "GBP", "JPY", "ARS"];

async function fetchCotacaoMoeda(moeda) {
	// A API e por data (sem "cotacao agora" direto) — tenta hoje e, se nao
	// tiver boletim ainda (fim de semana/feriado/antes da abertura), volta
	// ate 5 dias uteis pra achar a ultima cotacao disponivel.
	for (let diasAtras = 0; diasAtras <= 5; diasAtras += 1) {
		const data = new Date();
		data.setDate(data.getDate() - diasAtras);
		const dataStr = data.toISOString().slice(0, 10);
		try {
			const payload = await fetchJson(`${BASE_URL}/cambio/v1/cotacao/${moeda}/${dataStr}`);
			const cotacoes = payload?.cotacoes || [];
			if (cotacoes.length) {
				const ultima = cotacoes[cotacoes.length - 1];
				return {
					moeda,
					compra: ultima.cotacao_compra,
					venda: ultima.cotacao_venda,
					dataHora: ultima.data_hora_cotacao,
					tipoBoletim: ultima.tipo_boletim,
				};
			}
		} catch {
			// Sem cotacao nesse dia — tenta o dia anterior.
		}
	}
	return { moeda, compra: null, venda: null, dataHora: null, tipoBoletim: null };
}

router.get("/cambio", async (req, res, next) => {
	try {
		const moedasParam = String(req.query?.moedas || "")
			.split(",")
			.map((m) => m.trim().toUpperCase())
			.filter(Boolean);
		const moedas = (moedasParam.length ? moedasParam : MOEDAS_PADRAO).slice(0, 10);

		const resultados = await Promise.all(
			moedas.map(async (moeda) => {
				const cacheKey = `cambio:${moeda}`;
				const cached = getCached(cacheKey, 15 * 60 * 1000); // 15min
				if (cached) return cached;
				const cotacao = await fetchCotacaoMoeda(moeda);
				setCached(cacheKey, cotacao);
				return cotacao;
			}),
		);
		res.json({ ok: true, cotacoes: resultados });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
