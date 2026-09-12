// Feature: Movimentacoes — concilia devolucoes de equipamento (comodato)
// registradas no Portal de Movimentacoes (hoje: Playground/Sempre, via
// sempreIntegration.js) contra as O.S. abertas no mapa/match
// (ordensRepository.js). Quando acha o par (mesmo cliente + mesma
// serie/MAC), marca a devolucao como "casada" e remove a O.S. do
// mapa/match, deixando o dado pronto para o dia em que o proprio Hubsoft
// passar a fazer essa baixa nativamente — o ponto de troca de fonte fica
// isolado em fetchNotasDevolucaoComodato().
const sempreIntegration = require("./sempreIntegration");
const ordensRepository = require("./ordensRepository");
const movimentacoesRepository = require("./movimentacoesRepository");

const NOTES_TIMEOUT_MS = 60 * 1000;
const NOTES_PAGE_LIMIT = 100;
const NOTES_MAX_PAGES = 80;

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

// Extrai o campo "Operacao" de dentro da observacao livre da nota (mesmo
// formato usado por tecnicosBolsaAuditoria.js: "Operacao: Retirada | Origem:
// ... | Destino: ...").
function extractOperacaoDaObservacao(observacao) {
	const match = cleanText(observacao).match(/Operacao:\s*([^|\n]+)/i);
	return cleanText(match?.[1]);
}

// So conta como devolucao relevante quando a nota e "Devolucao de comodato"
// E a operacao registrada na observacao e "Retirada" — os dois juntos, como
// no exemplo real (movimento_estoque_id=2369046): tipo_operacao "Devolução
// de comodato" com "Operacao: Retirada" na observacao. Uma nota so com um
// dos dois nao e a devolucao de equipamento ao estoque que a feature trata.
function isDevolucaoComodato(note = {}) {
	const tipoOperacaoOk = normalizeText(note.tipo_operacao?.descricao).includes(
		"devolucao de comodato",
	);
	const operacaoOk =
		normalizeText(extractOperacaoDaObservacao(note.observacao)) === "retirada";
	return tipoOperacaoOk && operacaoOk;
}

// Categorias de equipamento que a feature acompanha — o resto (insumos,
// cabos, etc.) nao entra em Movimentacoes/ranking de produtos.
const EQUIPAMENTO_TERMS = ["ont", "onu", "gpon", "xpon", "epon", "roteador", "router", "camera", "câmera"];

function isEquipamentoRelevante(produtoNome) {
	const nome = normalizeText(produtoNome);
	return EQUIPAMENTO_TERMS.some((term) => nome.includes(term));
}

// Extrai os movimentos de nivel "item" de uma nota (uma nota de devolucao
// pode carregar mais de um equipamento). So considera ONT/ONU, roteador e
// camera de video — os demais itens da nota (insumos, cabos) sao ignorados.
function extractMovimentos(note = {}) {
	const itens = Array.isArray(note.itens) ? note.itens : [];
	return itens
		.filter((item) => cleanText(item.serie))
		.filter((item) =>
			isEquipamentoRelevante(item.produto?.descricao || item.descricao),
		)
		.map((item) => ({
			notaId: note.id ? String(note.id) : "",
			numero: cleanText(note.numero),
			movimentoEstoqueId: cleanText(note.externo_id).replace(
				/^movimento_estoque_id=/i,
				"",
			),
			tipoOperacao: cleanText(note.tipo_operacao?.descricao),
			emitidoEm: note.emitido_em || null,
			empresaNome: cleanText(note.empresa?.nome_razaosocial),
			parceiroNome: cleanText(
				note.parceiro?.nome_razaosocial || note.parceiro?.nome,
			),
			registradoPor: cleanText(
				note.usuario_cadastro?.email || note.usuario_recebedor?.email,
			),
			produtoNome: cleanText(item.produto?.descricao || item.descricao),
			produtoCodigo: cleanText(item.produto?.codigo || item.produto_id),
			serie: cleanText(item.serie),
			observacaoRaw: cleanText(note.observacao),
			rawPayload: { nota: note.id, item },
		}));
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

// Ponto unico de acesso ao "Portal de Movimentacoes". Hoje aponta pro
// Playground/Sempre; quando o Hubsoft nativo expuser o mesmo dado, troca
// so aqui (mantendo o formato de retorno: lista de movimentos por item).
async function fetchNotasDevolucaoComodato({ start, end }) {
	const movimentos = [];
	let page = 1;
	while (page <= NOTES_MAX_PAGES) {
		const payload = await fetchNotesPage({ page, start, end });
		const notes = extractArray(payload, ["data"]);
		for (const note of notes) {
			if (!isDevolucaoComodato(note)) continue;
			movimentos.push(...extractMovimentos(note));
		}
		const totalPages = Number(payload?.meta?.totalPages || 1);
		if (!notes.length || page >= totalPages) break;
		page += 1;
	}
	return movimentos;
}

// Confronta uma devolucao contra as O.S. abertas no mapa/match: mesma
// serie/MAC do equipamento (obrigatorio) + nome do cliente compativel
// (parceiro da devolucao == nome_cliente da O.S., comparacao tolerante).
async function matchMovimentoComOrdens(movimento) {
	const candidatas = await ordensRepository.findOrdensAbertasBySerie(
		movimento.serie,
	);
	if (!candidatas.length) return null;
	const parceiro = normalizeText(movimento.parceiroNome);
	const compativel = candidatas.find((ordem) => {
		const cliente = normalizeText(ordem.data?.nome_cliente);
		return (
			cliente &&
			parceiro &&
			(cliente.includes(parceiro) || parceiro.includes(cliente))
		);
	});
	return compativel || null;
}

async function removerOrdemDoMapaEMatch(ordem) {
	const collectionPath = ordem.collectionPath;
	const documentPath = ordem.path;
	await ordensRepository.deleteDocument(documentPath);
	return { osNumero: ordem.data?.num_os || "", osCollection: collectionPath };
}

async function processarMovimento(movimento) {
	const salvo = await movimentacoesRepository.upsertMovimentacao(movimento);
	if (salvo.statusMatch !== "pendente") {
		// Ja processado em varredura anterior (idempotencia).
		return salvo;
	}
	const ordem = await matchMovimentoComOrdens(movimento);
	if (!ordem) {
		return movimentacoesRepository.marcarComoSemMatch(salvo.id);
	}
	const { osNumero, osCollection } = await removerOrdemDoMapaEMatch(ordem);
	return movimentacoesRepository.marcarComoCasada(salvo.id, {
		osNumero,
		osCollection,
	});
}

const SCAN_WINDOW_MAX_DAYS = 366;

// Janela padrao (rotina diaria e botao manual sem periodo escolhido): so as
// ultimas 24h. Quando vem dataInicio/dataFim (ex.: filtro "Ano" na tela),
// usa o intervalo pedido — permite reprocessar o historico inteiro e achar
// O.S. que ficaram abertas mesmo com o equipamento ja retirado ha tempos.
function getScanWindow({ dataInicio, dataFim } = {}) {
	const end = dataFim ? new Date(dataFim) : new Date();
	const defaultStart = new Date(end.getTime() - 24 * 60 * 60 * 1000);
	const start = dataInicio ? new Date(dataInicio) : defaultStart;
	const maxRangeMs = SCAN_WINDOW_MAX_DAYS * 24 * 60 * 60 * 1000;
	const boundedStart =
		end.getTime() - start.getTime() > maxRangeMs
			? new Date(end.getTime() - maxRangeMs)
			: start;
	return { start: boundedStart, end };
}

async function runScan({ user = {}, manual = false, dataInicio, dataFim } = {}) {
	const job = await movimentacoesRepository.createScanJob({ manual, user });
	setImmediate(() => {
		executeScanJob(job.id, { dataInicio, dataFim }).catch((error) => {
			console.error(
				`[movimentacoesEntregas] Falha no job de varredura ${job.id}:`,
				error?.message || error,
			);
		});
	});
	return job;
}

async function executeScanJob(jobId, { dataInicio, dataFim } = {}) {
	await movimentacoesRepository.updateScanJob(jobId, {
		status: "running",
		stage: "Consultando devoluções no Portal de Movimentações",
		percent: 10,
		startedAt: new Date().toISOString(),
	});

	try {
		const { start, end } = getScanWindow({ dataInicio, dataFim });
		const movimentos = await fetchNotasDevolucaoComodato({ start, end });
		await movimentacoesRepository.updateScanJob(jobId, {
			stage: "Cruzando com O.S. abertas no mapa/match",
			percent: 50,
			total: movimentos.length,
		});

		let processed = 0;
		let casadas = 0;
		let semMatch = 0;
		for (const movimento of movimentos) {
			const resultado = await processarMovimento(movimento);
			processed += 1;
			if (resultado?.statusMatch === "casada") casadas += 1;
			if (resultado?.statusMatch === "sem_match") semMatch += 1;
			await movimentacoesRepository.updateScanJob(jobId, {
				processed,
				casadas,
				semMatch,
				percent: 50 + Math.round((processed / Math.max(movimentos.length, 1)) * 45),
			});
		}

		const resultadoFinal = {
			totalMovimentacoes: movimentos.length,
			totalCasadas: casadas,
			totalSemMatch: semMatch,
			periodo: { inicio: start.toISOString(), fim: end.toISOString() },
		};
		await movimentacoesRepository.updateScanJob(jobId, {
			status: "completed",
			stage: "Varredura concluída",
			percent: 100,
			resultado: resultadoFinal,
			finishedAt: new Date().toISOString(),
		});
		return resultadoFinal;
	} catch (error) {
		await movimentacoesRepository.updateScanJob(jobId, {
			status: "failed",
			stage: "Falha na varredura",
			percent: 100,
			error: error?.message || "Falha ao consultar o Portal de Movimentações.",
			finishedAt: new Date().toISOString(),
		});
		throw error;
	}
}

async function getScanJob(jobId) {
	return movimentacoesRepository.getScanJob(jobId);
}

// Chamado por um setInterval periodico (mesmo padrao de
// tecnicosBolsaAuditoria.runDailyIfDue) — dispara a varredura uma vez por
// dia, no horario configurado (padrao 03:00).
async function runDailyIfDue(user = {}) {
	const config = await movimentacoesRepository.readConfig();
	if (!config.enabled) {
		return { ok: true, skipped: true, reason: "Rotina desativada." };
	}
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: config.timezone || "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const parts = Object.fromEntries(
		formatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
	);
	const today = `${parts.year}-${parts.month}-${parts.day}`;
	const currentTime = `${parts.hour}:${parts.minute}`;
	if (config.lastRunDate === today || currentTime < config.dailyScanTime) {
		return {
			ok: true,
			skipped: true,
			reason: "Fora da janela ou rotina já executada hoje.",
		};
	}
	const job = await runScan({ user, manual: false });
	await movimentacoesRepository.saveConfig(
		{ lastRunDate: today, lastRunAt: new Date().toISOString() },
		user,
	);
	return { ok: true, jobId: job.id };
}

module.exports = {
	getScanJob,
	runDailyIfDue,
	runScan,
};
