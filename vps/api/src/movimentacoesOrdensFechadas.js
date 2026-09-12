// Feature: aba "Ordens Fechadas" — o usuario sobe uma planilha (nome +
// cidade do cliente, mesmo padrao do upload do Mapa: linhas ja vem
// convertidas em JSON pelo frontend via xlsx) com O.S. que foram fechadas
// num periodo, e aqui confrontamos cada linha contra TODAS as
// movimentacoes do Portal de Movimentacoes no mesmo periodo — qualquer
// tipo_operacao, nao so "Devolucao de comodato" (diferente de
// movimentacoesEntregas.js, que so rastreia devolucao de equipamento pra
// baixa automatica de O.S.). O objetivo aqui e so responder "esse cliente
// teve alguma movimentacao de entrega registrada?", pra achar O.S. fechada
// sem entrega correspondente.
const sempreIntegration = require("./sempreIntegration");
const movimentacoesOrdensFechadasRepository = require("./movimentacoesOrdensFechadasRepository");

const NOTES_TIMEOUT_MS = 60 * 1000;
const NOTES_PAGE_LIMIT = 100;
const NOTES_MAX_PAGES = 5000;

function cleanText(value) {
	return String(value || "").trim();
}

function normalizeText(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function extractArray(payload, keys = ["data"]) {
	if (Array.isArray(payload)) return payload;
	for (const key of keys) {
		if (Array.isArray(payload?.[key])) return payload[key];
	}
	return [];
}

async function fetchNotesPage({ page, start, end }) {
	const params = new URLSearchParams({
		page: String(page),
		limit: String(NOTES_PAGE_LIMIT),
	});
	params.append("filter.emitido_em", `$gte:${start.toISOString()}`);
	params.append("filter.emitido_em", `$lte:${end.toISOString()}`);
	params.append("filter.status", "$in:transmitido,cancelado,rejeitado");
	return sempreIntegration.requestSempreRaw(`/nota?${params.toString()}`, {
		timeoutMs: NOTES_TIMEOUT_MS,
	});
}

// Todas as notas do periodo (qualquer tipo_operacao) — bem mais amplo que
// fetchNotasDevolucaoComodato de movimentacoesEntregas.js, que so olha
// "Devolucao de comodato".
async function fetchTodasNotas({ start, end, onProgress }) {
	const notas = [];
	let page = 1;
	let totalPages = 1;
	while (page <= NOTES_MAX_PAGES) {
		const payload = await fetchNotesPage({ page, start, end });
		const pageNotes = extractArray(payload, ["data"]);
		for (const note of pageNotes) {
			const parceiroNome = cleanText(
				note.parceiro?.nome_razaosocial || note.parceiro?.nome,
			);
			if (!parceiroNome) continue;
			notas.push({
				parceiroNome,
				tipoOperacao: cleanText(note.tipo_operacao?.descricao),
				emitidoEm: note.emitido_em || null,
				numero: cleanText(note.numero),
			});
		}
		totalPages = Number(payload?.meta?.totalPages || 1);
		if (onProgress) {
			await onProgress({ page, totalPages, notasEncontradas: notas.length });
		}
		if (!pageNotes.length || page >= totalPages) break;
		page += 1;
	}
	return { notas, limiteAtingido: page >= NOTES_MAX_PAGES && page < totalPages };
}

function extrairLinhasPlanilha(rows = []) {
	return rows
		.map((row) => {
			const nome = cleanText(
				row.nome ?? row.nome_cliente ?? row.cliente ?? row.Nome ?? row.Cliente,
			);
			const cidade = cleanText(
				row.cidade ?? row.pop ?? row.Cidade ?? row.municipio ?? row.Municipio,
			);
			return { nome, cidade };
		})
		.filter((row) => row.nome);
}

function encontrarMatch(nome, notas) {
	const nomeNormalizado = normalizeText(nome);
	if (!nomeNormalizado) return null;
	return (
		notas.find((nota) => {
			const notaNormalizada = normalizeText(nota.parceiroNome);
			return (
				notaNormalizada &&
				(notaNormalizada.includes(nomeNormalizado) ||
					nomeNormalizado.includes(notaNormalizada))
			);
		}) || null
	);
}

async function executeJob(jobId, { rows, dataInicio, dataFim }) {
	await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
		status: "running",
		stage: "Consultando movimentações no Portal de Movimentações",
		percent: 10,
		startedAt: new Date().toISOString(),
	});

	try {
		const start = new Date(dataInicio);
		const end = new Date(dataFim);
		const { notas, limiteAtingido } = await fetchTodasNotas({
			start,
			end,
			onProgress: async ({ page, totalPages, notasEncontradas }) => {
				await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
					stage: `Consultando movimentações (página ${page} de ${totalPages || "?"}, ${notasEncontradas} nota(s) encontrada(s))`,
					percent: Math.min(60, 10 + Math.round((page / Math.max(totalPages, page)) * 50)),
				});
			},
		});

		const linhas = extrairLinhasPlanilha(rows);
		await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
			stage: "Cruzando O.S. fechadas com as movimentações encontradas",
			percent: 70,
			total: linhas.length,
		});

		const itens = linhas.map((linha) => {
			const match = encontrarMatch(linha.nome, notas);
			return {
				nome: linha.nome,
				cidade: linha.cidade,
				entregue: Boolean(match),
				movimentacao: match
					? {
							parceiroNome: match.parceiroNome,
							tipoOperacao: match.tipoOperacao,
							emitidoEm: match.emitidoEm,
							numero: match.numero,
						}
					: null,
			};
		});
		const entregues = itens.filter((item) => item.entregue).length;
		const naoEntregues = itens.length - entregues;

		const resultadoFinal = {
			itens,
			totalNotasConsultadas: notas.length,
			limiteAtingido,
			periodo: { inicio: start.toISOString(), fim: end.toISOString() },
		};

		await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
			status: "completed",
			stage: "Conciliação concluída",
			percent: 100,
			total: itens.length,
			entregues,
			naoEntregues,
			resultado: resultadoFinal,
			finishedAt: new Date().toISOString(),
		});
		return resultadoFinal;
	} catch (error) {
		await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
			status: "failed",
			stage: "Falha na conciliação",
			percent: 100,
			error: error?.message || "Falha ao consultar o Portal de Movimentações.",
			finishedAt: new Date().toISOString(),
		});
		throw error;
	}
}

async function runConciliacao({ rows = [], dataInicio, dataFim, user = {} } = {}) {
	if (!dataInicio || !dataFim) {
		const error = new Error("Informe o período (data início e fim).");
		error.statusCode = 400;
		throw error;
	}
	const linhas = extrairLinhasPlanilha(rows);
	if (!linhas.length) {
		const error = new Error(
			"Planilha vazia ou sem coluna de nome do cliente reconhecida.",
		);
		error.statusCode = 400;
		throw error;
	}
	const job = await movimentacoesOrdensFechadasRepository.createJob({
		dataInicio,
		dataFim,
		total: linhas.length,
		user,
	});
	setImmediate(() => {
		executeJob(job.id, { rows, dataInicio, dataFim }).catch((error) => {
			console.error(
				`[movimentacoesOrdensFechadas] Falha no job ${job.id}:`,
				error?.message || error,
			);
		});
	});
	return job;
}

async function getJob(jobId) {
	return movimentacoesOrdensFechadasRepository.getJob(jobId);
}

module.exports = {
	getJob,
	runConciliacao,
};
