const crypto = require("node:crypto");
const db = require("./db");

const CONFIG_ID = "global";
const DEFAULT_CONFIG = Object.freeze({
	enabled: true,
	dailyScanTime: "03:00",
	timezone: "America/Sao_Paulo",
	lastRunDate: "",
	lastRunAt: null,
	backfillAnualConcluidoEm: null,
	backfillUltimaJanelaFim: null,
});

function text(value) {
	return String(value ?? "").trim();
}

function nullableText(value) {
	return text(value) || null;
}

function normalizeLimit(value, fallback = 20) {
	const parsed = Number(value || fallback);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(Math.trunc(parsed), 1), 200);
}

function normalizePage(value) {
	const parsed = Number(value || 1);
	if (!Number.isFinite(parsed)) return 1;
	return Math.max(Math.trunc(parsed), 1);
}

function mapMovimentacao(row = {}) {
	return {
		id: row.id,
		notaId: row.nota_id || "",
		numero: row.numero || "",
		movimentoEstoqueId: row.movimento_estoque_id || "",
		tipoOperacao: row.tipo_operacao || "",
		emitidoEm: row.emitido_em || null,
		empresaNome: row.empresa_nome || "",
		parceiroNome: row.parceiro_nome || "",
		registradoPor: row.registrado_por || "",
		produtoNome: row.produto_nome || "",
		produtoCodigo: row.produto_codigo || "",
		serie: row.serie || "",
		observacaoRaw: row.observacao_raw || "",
		statusMatch: row.status_match || "pendente",
		osNumero: row.os_numero || "",
		osCollection: row.os_collection || "",
		cidade: row.cidade || "",
		estoqueDestino: row.estoque_destino || "",
		casadaEm: row.casada_em || null,
		removidoMapaEm: row.removido_mapa_em || null,
		removidoMatchEm: row.removido_match_em || null,
		criadoEm: row.criado_em || null,
		atualizadoEm: row.atualizado_em || null,
	};
}

function buildDedupeId(movimento = {}) {
	return crypto
		.createHash("sha256")
		.update(
			[
				movimento.movimentoEstoqueId,
				movimento.notaId,
				movimento.serie,
				movimento.produtoCodigo,
			]
				.map((value) => text(value))
				.join("|"),
		)
		.digest("hex")
		.slice(0, 40);
}

// Upsert idempotente: a mesma devolucao (mesmo movimento/nota/serie/produto)
// nunca duplica registro, mesmo rodando a varredura varias vezes por dia
// (botao manual + rotina das 03h podem se sobrepor).
async function upsertMovimentacao(movimento = {}) {
	const id = buildDedupeId(movimento);
	const result = await db.query(
		`insert into movimentacoes_estoque
		 (id, nota_id, numero, movimento_estoque_id, tipo_operacao, emitido_em,
		  empresa_nome, parceiro_nome, registrado_por, produto_nome, produto_codigo,
		  serie, observacao_raw, estoque_destino, raw_payload, criado_em, atualizado_em)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,now(),now())
		 on conflict (id) do update set
		   atualizado_em = now()
		 returning *`,
		[
			id,
			nullableText(movimento.notaId),
			nullableText(movimento.numero),
			nullableText(movimento.movimentoEstoqueId),
			nullableText(movimento.tipoOperacao),
			movimento.emitidoEm || null,
			nullableText(movimento.empresaNome),
			nullableText(movimento.parceiroNome),
			nullableText(movimento.registradoPor),
			nullableText(movimento.produtoNome),
			nullableText(movimento.produtoCodigo),
			nullableText(movimento.serie),
			nullableText(movimento.observacaoRaw),
			nullableText(movimento.estoqueDestino),
			JSON.stringify(movimento.rawPayload || {}),
		],
	);
	return mapMovimentacao(result.rows[0]);
}

// cidade vem da O.S. casada (ordens_servico.cidade) — a nota do Portal de
// Movimentacoes nao traz cidade do cliente, so dá pra saber depois do match.
async function marcarComoCasada(id, { osNumero, osCollection, cidade } = {}) {
	const result = await db.query(
		`update movimentacoes_estoque
		    set status_match = 'casada',
		        os_numero = $2,
		        os_collection = $3,
		        cidade = coalesce($4, cidade),
		        casada_em = now(),
		        removido_mapa_em = case when $3 in ('ordens_abertas', 'match_os_abertas')
		          then coalesce(removido_mapa_em, now()) else removido_mapa_em end,
		        removido_match_em = case when $3 = 'match_os_abertas'
		          then coalesce(removido_match_em, now()) else removido_match_em end,
		        atualizado_em = now()
		  where id = $1
		  returning *`,
		[id, nullableText(osNumero), nullableText(osCollection), nullableText(cidade)],
	);
	return result.rows[0] ? mapMovimentacao(result.rows[0]) : null;
}

async function marcarComoSemMatch(id) {
	const result = await db.query(
		`update movimentacoes_estoque
		    set status_match = case when status_match = 'pendente' then 'sem_match' else status_match end,
		        atualizado_em = now()
		  where id = $1
		  returning *`,
		[id],
	);
	return result.rows[0] ? mapMovimentacao(result.rows[0]) : null;
}

// Usado pela aba Ordens Fechadas como pre-checagem: antes de sair
// consultando o Portal de Movimentacoes ao vivo (lento, ver
// movimentacoesOrdensFechadas.js), confere se o cliente ja aparece no que
// foi salvo em movimentacoes_estoque (painel de Movimentacoes) — evita
// retrabalho quando a devolucao ja foi capturada por uma varredura normal.
// Comparacao tolerante nos dois sentidos (mesmo criterio usado no match ao
// vivo), so por "Devolucao de comodato"/"Retirada" (o que essa tabela
// guarda) — nao substitui a busca ampla, so adianta quem ja bate aqui.
async function buscarMovimentacaoPorParceiro({ nome, dataInicio, dataFim } = {}) {
	const nomeNormalizado = text(nome);
	if (!nomeNormalizado) return null;
	const result = await db.query(
		`select parceiro_nome, tipo_operacao, emitido_em, numero
		 from movimentacoes_estoque
		 where parceiro_nome is not null
		   and (parceiro_nome ilike ('%' || $1 || '%') or $1 ilike ('%' || parceiro_nome || '%'))
		   and ($2::timestamptz is null or emitido_em >= $2)
		   and ($3::timestamptz is null or emitido_em <= $3)
		 order by emitido_em desc
		 limit 1`,
		[nomeNormalizado, dataInicio || null, dataFim || null],
	);
	const row = result.rows[0];
	if (!row) return null;
	return {
		parceiroNome: row.parceiro_nome,
		tipoOperacao: row.tipo_operacao,
		emitidoEm: row.emitido_em,
		numero: row.numero,
	};
}

async function listMovimentacoes({
	page = 1,
	limit = 20,
	dataInicio,
	dataFim,
	empresa,
	tecnico,
	produto,
	status,
	cidade,
	estoqueDestino,
} = {}) {
	const normalizedLimit = normalizeLimit(limit);
	const normalizedPage = normalizePage(page);
	const offset = (normalizedPage - 1) * normalizedLimit;

	const conditions = [];
	const params = [];
	function addCondition(sql, value) {
		params.push(value);
		conditions.push(sql.replace("$$", `$${params.length}`));
	}
	if (dataInicio) addCondition("emitido_em >= $$", dataInicio);
	if (dataFim) addCondition("emitido_em <= $$", dataFim);
	if (empresa) addCondition("empresa_nome ilike $$", `%${empresa}%`);
	if (tecnico) addCondition("registrado_por ilike $$", `%${tecnico}%`);
	if (produto) addCondition("produto_nome ilike $$", `%${produto}%`);
	if (status) addCondition("status_match = $$", status);
	// "Não identificada"/"Não identificado" (ver rankings de cidades/
	// estoques) representa linha com o campo vazio — filtra por is null em
	// vez de tentar casar o texto literal (sem parametro, pra nao desalinhar
	// a numeracao posicional dos $N seguintes).
	if (cidade === "Não identificada") conditions.push("coalesce(nullif(trim(cidade), ''), '') = ''");
	else if (cidade) addCondition("cidade = $$", cidade);
	if (estoqueDestino === "Não identificado") {
		conditions.push("coalesce(nullif(trim(estoque_destino), ''), '') = ''");
	} else if (estoqueDestino) addCondition("estoque_destino = $$", estoqueDestino);

	const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
	const totalResult = await db.query(
		`select count(*)::int as total from movimentacoes_estoque ${where}`,
		params,
	);
	const total = totalResult.rows[0]?.total || 0;

	const rowsResult = await db.query(
		`select * from movimentacoes_estoque ${where}
		  order by emitido_em desc nulls last, criado_em desc
		  limit ${normalizedLimit} offset ${offset}`,
		params,
	);

	return {
		items: rowsResult.rows.map(mapMovimentacao),
		page: normalizedPage,
		limit: normalizedLimit,
		total,
		totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
	};
}

async function getResumoPorEmpresaDia({ dataInicio, dataFim } = {}) {
	const params = [dataInicio || null, dataFim || null];
	const result = await db.query(
		`select
		   date_trunc('day', emitido_em) as dia,
		   coalesce(empresa_nome, 'Sem empresa') as empresa,
		   count(*)::int as total,
		   count(*) filter (where status_match = 'casada')::int as casadas,
		   count(*) filter (where status_match = 'sem_match')::int as sem_match,
		   count(*) filter (where status_match = 'pendente')::int as pendentes
		 from movimentacoes_estoque
		 where ($1::timestamptz is null or emitido_em >= $1)
		   and ($2::timestamptz is null or emitido_em <= $2)
		 group by 1, 2
		 order by 1 desc, 2`,
		params,
	);
	return result.rows.map((row) => ({
		dia: row.dia,
		empresa: row.empresa,
		total: row.total,
		casadas: row.casadas,
		semMatch: row.sem_match,
		pendentes: row.pendentes,
	}));
}

async function getRankingTecnicos({ dataInicio, dataFim, limit = 20 } = {}) {
	const result = await db.query(
		`select
		   coalesce(registrado_por, 'Não identificado') as tecnico,
		   count(*)::int as total
		 from movimentacoes_estoque
		 where ($1::timestamptz is null or emitido_em >= $1)
		   and ($2::timestamptz is null or emitido_em <= $2)
		 group by 1
		 order by total desc
		 limit $3`,
		[dataInicio || null, dataFim || null, normalizeLimit(limit, 20)],
	);
	return result.rows.map((row) => ({ tecnico: row.tecnico, total: row.total }));
}

async function getRankingProdutos({ dataInicio, dataFim, limit = 20 } = {}) {
	const result = await db.query(
		`select
		   coalesce(produto_nome, 'Não identificado') as produto,
		   count(*)::int as total
		 from movimentacoes_estoque
		 where ($1::timestamptz is null or emitido_em >= $1)
		   and ($2::timestamptz is null or emitido_em <= $2)
		 group by 1
		 order by total desc
		 limit $3`,
		[dataInicio || null, dataFim || null, normalizeLimit(limit, 20)],
	);
	return result.rows.map((row) => ({ produto: row.produto, total: row.total }));
}

// Igual getRankingProdutos, mas ja traz a categoria (FAST/AC/AX) e o valor
// cadastrados pra cada produto — usado na aba Equipamentos.
async function getRankingProdutosComConfig({ dataInicio, dataFim, limit = 100 } = {}) {
	const result = await db.query(
		`select
		   m.produto_nome as produto,
		   count(*)::int as total,
		   c.categoria,
		   c.valor
		 from movimentacoes_estoque m
		 left join movimentacoes_produtos_config c on c.produto_nome = m.produto_nome
		 where m.produto_nome is not null
		   and ($1::timestamptz is null or m.emitido_em >= $1)
		   and ($2::timestamptz is null or m.emitido_em <= $2)
		 group by 1, c.categoria, c.valor
		 order by total desc
		 limit $3`,
		[dataInicio || null, dataFim || null, normalizeLimit(limit, 100)],
	);
	return result.rows.map((row) => ({
		produto: row.produto,
		total: row.total,
		categoria: row.categoria || "",
		valor: row.valor === null ? null : Number(row.valor),
	}));
}

// Quantidade e valor total (soma do valor unitario cadastrado, uma vez por
// devolucao) agrupados por categoria (FAST/AC/AX) — pro botao "Resumo por
// categoria" na aba Equipamentos e pro PDF gerado a partir dele.
async function getResumoCategoriaProdutos({ dataInicio, dataFim } = {}) {
	const result = await db.query(
		`select
		   coalesce(c.categoria, 'Não definida') as categoria,
		   count(*)::int as quantidade,
		   sum(coalesce(c.valor, 0))::numeric as valor_total
		 from movimentacoes_estoque m
		 left join movimentacoes_produtos_config c on c.produto_nome = m.produto_nome
		 where m.produto_nome is not null
		   and ($1::timestamptz is null or m.emitido_em >= $1)
		   and ($2::timestamptz is null or m.emitido_em <= $2)
		 group by 1
		 order by quantidade desc`,
		[dataInicio || null, dataFim || null],
	);
	return result.rows.map((row) => ({
		categoria: row.categoria,
		quantidade: row.quantidade,
		valorTotal: Number(row.valor_total || 0),
	}));
}

async function saveProdutoConfig(
	{ produtoNome, categoria, valor } = {},
	user = {},
) {
	const nome = text(produtoNome);
	if (!nome) {
		const error = new Error("Nome do produto obrigatório.");
		error.statusCode = 400;
		throw error;
	}
	const categoriaNormalizada = text(categoria).toUpperCase();
	if (categoriaNormalizada && !["FAST", "AC", "AX"].includes(categoriaNormalizada)) {
		const error = new Error("Categoria inválida. Use FAST, AC ou AX.");
		error.statusCode = 400;
		throw error;
	}
	const valorNumero =
		valor === null || valor === undefined || valor === ""
			? null
			: Number(valor);
	if (valorNumero !== null && !Number.isFinite(valorNumero)) {
		const error = new Error("Valor inválido.");
		error.statusCode = 400;
		throw error;
	}
	const result = await db.query(
		`insert into movimentacoes_produtos_config
		 (produto_nome, categoria, valor, atualizado_em, atualizado_por)
		 values ($1, $2, $3, now(), $4)
		 on conflict (produto_nome) do update set
		   categoria = excluded.categoria,
		   valor = excluded.valor,
		   atualizado_em = now(),
		   atualizado_por = excluded.atualizado_por
		 returning *`,
		[nome, categoriaNormalizada || null, valorNumero, nullableText(user?.uid || user?.email)],
	);
	const row = result.rows[0];
	return {
		produto: row.produto_nome,
		categoria: row.categoria || "",
		valor: row.valor === null ? null : Number(row.valor),
	};
}

// Base paginada compartilhada pelos 3 rankings de Cidades — mesmo formato
// {items, page, limit, total, totalPages} de listMovimentacoes, agora que
// a tela pagina 10 por vez em vez de trazer um top-20 fixo sem paginacao.
async function getPaginatedRanking({
	groupExpr,
	labelKey,
	extraWhere = "",
	dataInicio,
	dataFim,
	page = 1,
	limit = 10,
}) {
	const normalizedLimit = normalizeLimit(limit, 10);
	const normalizedPage = normalizePage(page);
	const offset = (normalizedPage - 1) * normalizedLimit;
	const params = [dataInicio || null, dataFim || null];

	const countResult = await db.query(
		`select count(*)::int as total from (
		   select 1 from movimentacoes_estoque
		   where ($1::timestamptz is null or emitido_em >= $1)
		     and ($2::timestamptz is null or emitido_em <= $2)
		     ${extraWhere}
		   group by ${groupExpr}
		 ) contagem`,
		params,
	);
	const total = countResult.rows[0]?.total || 0;

	const rowsResult = await db.query(
		`select ${groupExpr} as label, count(*)::int as total
		 from movimentacoes_estoque
		 where ($1::timestamptz is null or emitido_em >= $1)
		   and ($2::timestamptz is null or emitido_em <= $2)
		   ${extraWhere}
		 group by 1
		 order by total desc
		 limit ${normalizedLimit} offset ${offset}`,
		params,
	);

	return {
		items: rowsResult.rows.map((row) => ({ [labelKey]: row.label, total: row.total })),
		page: normalizedPage,
		limit: normalizedLimit,
		total,
		totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
	};
}

const CIDADE_GROUP_EXPR = "coalesce(nullif(trim(cidade), ''), 'Não identificada')";
const ESTOQUE_GROUP_EXPR =
	"coalesce(nullif(trim(estoque_destino), ''), 'Não identificado')";

// Cidades com mais retirada de equipamento — conta toda devolucao que
// casou com O.S. (cidade so fica conhecida via a O.S., ver marcarComoCasada).
// Nao descarta linha sem cidade — agrupa como "Nao identificada" pra ficar
// visivel quando a maioria das devolucoes ainda nao tem cidade confirmada
// (normalmente porque ainda esta "sem_match" ou a O.S. casada nao tinha
// cidade cadastrada), em vez de o ranking parecer "sem dados" por sumir.
async function getRankingCidadesRetiradas({ dataInicio, dataFim, page, limit } = {}) {
	return getPaginatedRanking({
		groupExpr: CIDADE_GROUP_EXPR,
		labelKey: "cidade",
		dataInicio,
		dataFim,
		page,
		limit,
	});
}

// Cidades com devolucao confirmada (O.S. efetivamente baixada do mapa/match).
async function getRankingCidadesDevolvidas({ dataInicio, dataFim, page, limit } = {}) {
	return getPaginatedRanking({
		groupExpr: CIDADE_GROUP_EXPR,
		labelKey: "cidade",
		extraWhere: "and status_match = 'casada'",
		dataInicio,
		dataFim,
		page,
		limit,
	});
}

// Estoques (destino do item na nota) que mais receberam equipamento de volta.
async function getRankingEstoquesRecebimento({ dataInicio, dataFim, page, limit } = {}) {
	return getPaginatedRanking({
		groupExpr: ESTOQUE_GROUP_EXPR,
		labelKey: "estoque",
		dataInicio,
		dataFim,
		page,
		limit,
	});
}

async function readConfig() {
	const result = await db.query(
		"select * from movimentacoes_config where id = $1",
		[CONFIG_ID],
	);
	const row = result.rows[0];
	if (!row) return { ...DEFAULT_CONFIG };
	return {
		enabled: row.enabled,
		dailyScanTime: row.daily_scan_time,
		timezone: row.timezone,
		lastRunDate: row.last_run_date || "",
		lastRunAt: row.last_run_at || null,
		backfillAnualConcluidoEm: row.backfill_anual_concluido_em || null,
		backfillUltimaJanelaFim: row.backfill_ultima_janela_fim || null,
	};
}

async function saveConfig(payload = {}, user = {}) {
	const current = await readConfig();
	const next = {
		enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : current.enabled,
		dailyScanTime: text(payload.dailyScanTime || current.dailyScanTime).slice(0, 5),
		timezone: text(payload.timezone || current.timezone),
		lastRunDate: text(payload.lastRunDate ?? current.lastRunDate),
		lastRunAt: payload.lastRunAt ?? current.lastRunAt,
		backfillAnualConcluidoEm:
			payload.backfillAnualConcluidoEm ?? current.backfillAnualConcluidoEm,
		backfillUltimaJanelaFim:
			payload.backfillUltimaJanelaFim !== undefined
				? payload.backfillUltimaJanelaFim
				: current.backfillUltimaJanelaFim,
	};
	await db.query(
		`insert into movimentacoes_config
		 (id, enabled, daily_scan_time, timezone, last_run_date, last_run_at,
		  backfill_anual_concluido_em, backfill_ultima_janela_fim, updated_at, updated_by)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)
		 on conflict (id) do update set
		   enabled = excluded.enabled,
		   daily_scan_time = excluded.daily_scan_time,
		   timezone = excluded.timezone,
		   last_run_date = excluded.last_run_date,
		   last_run_at = excluded.last_run_at,
		   backfill_anual_concluido_em = excluded.backfill_anual_concluido_em,
		   backfill_ultima_janela_fim = excluded.backfill_ultima_janela_fim,
		   updated_at = now(),
		   updated_by = excluded.updated_by`,
		[
			CONFIG_ID,
			next.enabled,
			next.dailyScanTime,
			next.timezone,
			next.lastRunDate,
			next.lastRunAt,
			next.backfillAnualConcluidoEm,
			next.backfillUltimaJanelaFim,
			nullableText(user?.uid || user?.email),
		],
	);
	return next;
}

function randomJobId() {
	return `movscan_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

async function createScanJob({ manual = false, user = {} } = {}) {
	const id = randomJobId();
	await db.query(
		`insert into movimentacoes_scan_jobs
		 (id, status, stage, percent, manual, created_at, created_by, created_by_name)
		 values ($1,'queued','Aguardando processamento',0,$2,now(),$3,$4)`,
		[
			id,
			Boolean(manual),
			nullableText(user?.uid),
			nullableText(user?.profile?.nome || user?.email),
		],
	);
	return getScanJob(id);
}

async function updateScanJob(id, patch = {}) {
	const fields = [];
	const params = [id];
	function set(column, value) {
		params.push(value);
		fields.push(`${column} = $${params.length}`);
	}
	if (patch.status !== undefined) set("status", patch.status);
	if (patch.stage !== undefined) set("stage", patch.stage);
	if (patch.percent !== undefined) set("percent", patch.percent);
	if (patch.total !== undefined) set("total", patch.total);
	if (patch.processed !== undefined) set("processed", patch.processed);
	if (patch.casadas !== undefined) set("casadas", patch.casadas);
	if (patch.semMatch !== undefined) set("sem_match", patch.semMatch);
	if (patch.resultado !== undefined) {
		params.push(JSON.stringify(patch.resultado));
		fields.push(`resultado = $${params.length}::jsonb`);
	}
	if (patch.error !== undefined) set("error", patch.error);
	if (patch.startedAt !== undefined) set("started_at", patch.startedAt);
	if (patch.finishedAt !== undefined) set("finished_at", patch.finishedAt);
	if (!fields.length) return getScanJob(id);
	await db.query(
		`update movimentacoes_scan_jobs set ${fields.join(", ")} where id = $1`,
		params,
	);
	return getScanJob(id);
}

function mapScanJob(row) {
	if (!row) return null;
	return {
		id: row.id,
		status: row.status,
		stage: row.stage,
		percent: row.percent,
		total: row.total,
		processed: row.processed,
		casadas: row.casadas,
		semMatch: row.sem_match,
		manual: row.manual,
		resultado: row.resultado,
		error: row.error,
		createdAt: row.created_at,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	};
}

async function getScanJob(id) {
	const result = await db.query(
		"select * from movimentacoes_scan_jobs where id = $1",
		[id],
	);
	return mapScanJob(result.rows[0]);
}

module.exports = {
	buscarMovimentacaoPorParceiro,
	createScanJob,
	getResumoPorEmpresaDia,
	getRankingCidadesDevolvidas,
	getRankingCidadesRetiradas,
	getRankingEstoquesRecebimento,
	getRankingProdutos,
	getRankingProdutosComConfig,
	getRankingTecnicos,
	getResumoCategoriaProdutos,
	getScanJob,
	listMovimentacoes,
	marcarComoCasada,
	marcarComoSemMatch,
	readConfig,
	saveConfig,
	saveProdutoConfig,
	updateScanJob,
	upsertMovimentacao,
};
