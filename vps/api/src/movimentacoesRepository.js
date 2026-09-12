const crypto = require("node:crypto");
const db = require("./db");

const CONFIG_ID = "global";
const DEFAULT_CONFIG = Object.freeze({
	enabled: true,
	dailyScanTime: "03:00",
	timezone: "America/Sao_Paulo",
	lastRunDate: "",
	lastRunAt: null,
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
		  serie, observacao_raw, raw_payload, criado_em, atualizado_em)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,now(),now())
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
			JSON.stringify(movimento.rawPayload || {}),
		],
	);
	return mapMovimentacao(result.rows[0]);
}

async function marcarComoCasada(id, { osNumero, osCollection } = {}) {
	const result = await db.query(
		`update movimentacoes_estoque
		    set status_match = 'casada',
		        os_numero = $2,
		        os_collection = $3,
		        casada_em = now(),
		        removido_mapa_em = case when $3 in ('ordens_abertas', 'match_os_abertas')
		          then coalesce(removido_mapa_em, now()) else removido_mapa_em end,
		        removido_match_em = case when $3 = 'match_os_abertas'
		          then coalesce(removido_match_em, now()) else removido_match_em end,
		        atualizado_em = now()
		  where id = $1
		  returning *`,
		[id, nullableText(osNumero), nullableText(osCollection)],
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

async function listMovimentacoes({
	page = 1,
	limit = 20,
	dataInicio,
	dataFim,
	empresa,
	tecnico,
	produto,
	status,
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
	};
	await db.query(
		`insert into movimentacoes_config
		 (id, enabled, daily_scan_time, timezone, last_run_date, last_run_at, updated_at, updated_by)
		 values ($1,$2,$3,$4,$5,$6,now(),$7)
		 on conflict (id) do update set
		   enabled = excluded.enabled,
		   daily_scan_time = excluded.daily_scan_time,
		   timezone = excluded.timezone,
		   last_run_date = excluded.last_run_date,
		   last_run_at = excluded.last_run_at,
		   updated_at = now(),
		   updated_by = excluded.updated_by`,
		[
			CONFIG_ID,
			next.enabled,
			next.dailyScanTime,
			next.timezone,
			next.lastRunDate,
			next.lastRunAt,
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
	createScanJob,
	getResumoPorEmpresaDia,
	getRankingProdutos,
	getRankingTecnicos,
	getScanJob,
	listMovimentacoes,
	marcarComoCasada,
	marcarComoSemMatch,
	readConfig,
	saveConfig,
	updateScanJob,
	upsertMovimentacao,
};
