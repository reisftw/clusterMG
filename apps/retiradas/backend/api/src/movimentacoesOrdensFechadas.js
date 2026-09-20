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
const movimentacoesRepository = require("./movimentacoesRepository");
const { buildDateWindows } = require("./movimentacoesDateWindows");

const NOTES_TIMEOUT_MS = 60 * 1000;
const NOTES_PAGE_LIMIT = 100;
// Confirmado direto na API: um periodo largo tem volume grande demais pra
// paginar de uma vez (ex.: so janeiro/2026 = 29408 notas, 295 paginas).
// Por isso o periodo pedido e quebrado em janelas de WINDOW_DAYS (ver
// fetchTodasNotas) — o teto abaixo e por janela, nao pro periodo inteiro.
const NOTES_MAX_PAGES = 5000;
const WINDOW_DAYS = 15;

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

// Todas as notas de UMA janela (qualquer tipo_operacao) — bem mais amplo
// que fetchNotasDevolucaoComodatoJanela de movimentacoesEntregas.js, que so
// olha "Devolucao de comodato". Quem quebra o periodo pedido em janelas e
// chama isso repetidas vezes e executeJob.
async function fetchNotasDaJanela({ start, end, onProgress }) {
	const notas = [];
	let page = 1;
	let totalPages = 1;
	while (page <= NOTES_MAX_PAGES) {
		const payload = await fetchNotesPage({ page, start, end });
		const pageNotes = extractArray(payload, ["data"]);
		for (const note of pageNotes) {
			// So nome — o codigo do parceiro no Playground (parceiro.externo_id)
			// nao corresponde ao codigo_cliente do Hubsoft (confirmado pelo
			// time), entao nao da pra usar como chave de match.
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
				row.nome ??
					row.nome_razaosocial ??
					row.nome_cliente ??
					row.cliente ??
					row.Nome ??
					row.Cliente,
			);
			const codigo = cleanText(
				row.codigo_cliente ??
					row.codigo ??
					row.cod_cliente ??
					row.Codigo ??
					row.CodigoCliente,
			);
			const cidade = cleanText(
				row.cidade ?? row.pop ?? row.Cidade ?? row.municipio ?? row.Municipio,
			);
			const fechamento = cleanText(
				row.data_termino_executado ??
					row.data_fechamento ??
					row.fechamento ??
					row.DataFechamento,
			);
			// Pedido explicito: mostrar o tipo de O.S. e o tecnico que fechou na
			// conciliacao. Igual codigo/fechamento, ficam so como informacao
			// extra vinda da planilha — nao entram na comparacao com o Portal de
			// Movimentacoes (que so bate por nome).
			const tipoOs = cleanText(
				row.tipo_os ??
					row.tipo_ordem_servico ??
					row.tipo_de_servico ??
					row.tipo_servico ??
					row.TipoOS ??
					row.Tipo ??
					row.tipo,
			);
			const tecnico = cleanText(
				row.tecnico ??
					row.tecnico_responsavel ??
					row.nome_tecnico ??
					row.Tecnico ??
					row.TecnicoResponsavel ??
					row.NomeTecnico,
			);
			return { nome, codigo, cidade, fechamento, tipoOs, tecnico };
		})
		.filter((row) => row.nome);
}

// So bate por nome — o codigo do parceiro no Playground NAO corresponde ao
// codigo_cliente do Hubsoft (confirmado pelo time), entao nao da pra usar
// como chave de match. codigo/fechamento da planilha ficam so como
// informacao extra no resultado (ver executeJob), nao entram na comparacao.
function encontrarMatch({ nome }, notas) {
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
		const janelas = buildDateWindows(start, end, WINDOW_DAYS);

		const linhas = extrairLinhasPlanilha(rows);
		// Um item por linha da planilha, atualizado a medida que cada janela
		// e consultada — comeca tudo como "nao entregue" e vira "entregue" na
		// primeira janela onde aparecer uma movimentacao do cliente.
		const itens = linhas.map((linha) => ({
			nome: linha.nome,
			codigo: linha.codigo,
			cidade: linha.cidade,
			fechamento: linha.fechamento,
			tipoOs: linha.tipoOs,
			tecnico: linha.tecnico,
			entregue: false,
			movimentacao: null,
		}));
		let totalNotasConsultadas = 0;
		let algumLimiteAtingido = false;

		// Pre-checagem: antes de sair consultando o Portal de Movimentacoes
		// janela por janela (lento), confere se o cliente ja aparece no que
		// foi salvo pelo painel de Movimentacoes (movimentacoes_estoque) —
		// evita retrabalho pra quem ja foi capturado por uma varredura normal.
		// So cobre "Devolucao de comodato"/"Retirada" (o que aquela tabela
		// guarda); quem nao casar aqui ainda passa pela busca ampla abaixo.
		await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
			stage: "Conferindo com o que já está salvo no painel de Movimentações",
			percent: 5,
		});
		for (const item of itens) {
			const jaSalvo = await movimentacoesRepository.buscarMovimentacaoPorParceiro({
				nome: item.nome,
				dataInicio,
				dataFim,
			});
			if (!jaSalvo) continue;
			item.entregue = true;
			item.movimentacao = jaSalvo;
		}
		const entreguesNaPreChecagem = itens.filter((item) => item.entregue).length;
		if (entreguesNaPreChecagem) {
			await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
				stage: `${entreguesNaPreChecagem} de ${itens.length} já encontrados no painel — consultando o restante ao vivo`,
				entregues: entreguesNaPreChecagem,
				naoEntregues: itens.length - entreguesNaPreChecagem,
			});
		}
		// Todo mundo ja casou so com o que ja estava salvo — nem precisa
		// consultar o Portal de Movimentacoes ao vivo.
		if (itens.every((item) => item.entregue)) {
			const resultadoFinal = {
				itens,
				totalNotasConsultadas: 0,
				limiteAtingido: false,
				periodo: { inicio: start.toISOString(), fim: end.toISOString() },
			};
			await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
				status: "completed",
				stage: "Conciliação concluída (tudo já estava no painel)",
				percent: 100,
				total: itens.length,
				entregues: itens.length,
				naoEntregues: 0,
				resultado: resultadoFinal,
				finishedAt: new Date().toISOString(),
			});
			return resultadoFinal;
		}

		for (const [indiceJanela, janela] of janelas.entries()) {
			const rotuloJanela = `${janela.start.toLocaleDateString("pt-BR")} a ${janela.end.toLocaleDateString("pt-BR")}`;
			const { notas, limiteAtingido } = await fetchNotasDaJanela({
				start: janela.start,
				end: janela.end,
				onProgress: async ({ page, totalPages }) => {
					await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
						stage: `Período ${indiceJanela + 1} de ${janelas.length} (${rotuloJanela}) — página ${page} de ${totalPages || "?"}`,
						percent: Math.min(
							90,
							Math.round(((indiceJanela + page / Math.max(totalPages, page)) / janelas.length) * 90),
						),
					});
				},
			});
			if (limiteAtingido) algumLimiteAtingido = true;
			totalNotasConsultadas += notas.length;

			// So tenta casar quem ainda nao foi encontrado numa janela anterior
			// — evita reprocessar e ja deixa o resultado salvo (resultado
			// parcial no job) a cada janela concluida.
			for (const item of itens) {
				if (item.entregue) continue;
				const match = encontrarMatch(item, notas);
				if (!match) continue;
				item.entregue = true;
				item.movimentacao = {
					parceiroNome: match.parceiroNome,
					tipoOperacao: match.tipoOperacao,
					emitidoEm: match.emitidoEm,
					numero: match.numero,
				};
			}

			const entreguesAteAqui = itens.filter((item) => item.entregue).length;
			await movimentacoesOrdensFechadasRepository.updateJob(jobId, {
				stage: `Período ${indiceJanela + 1} de ${janelas.length} concluído (${rotuloJanela})`,
				total: itens.length,
				entregues: entreguesAteAqui,
				naoEntregues: itens.length - entreguesAteAqui,
				resultado: {
					itens,
					totalNotasConsultadas,
					limiteAtingido: algumLimiteAtingido,
					janelasProcessadas: indiceJanela + 1,
					janelasTotal: janelas.length,
					periodo: { inicio: start.toISOString(), fim: end.toISOString() },
				},
			});

			// Todo mundo ja casou — nao precisa consultar as janelas restantes.
			if (itens.every((item) => item.entregue)) break;
		}

		const entregues = itens.filter((item) => item.entregue).length;
		const naoEntregues = itens.length - entregues;
		const resultadoFinal = {
			itens,
			totalNotasConsultadas,
			limiteAtingido: algumLimiteAtingido,
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

async function getLatestJob() {
	return movimentacoesOrdensFechadasRepository.getLatestJob();
}

module.exports = {
	getJob,
	getLatestJob,
	runConciliacao,
};
