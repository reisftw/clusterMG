const crypto = require("node:crypto");
const db = require("./db");

function nullableText(value) {
	const text = String(value ?? "").trim();
	return text || null;
}

function randomJobId() {
	return `ordfech_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function mapJob(row) {
	if (!row) return null;
	return {
		id: row.id,
		status: row.status,
		stage: row.stage,
		percent: row.percent,
		total: row.total,
		entregues: row.entregues,
		naoEntregues: row.nao_entregues,
		periodoInicio: row.periodo_inicio,
		periodoFim: row.periodo_fim,
		resultado: row.resultado,
		error: row.error,
		createdAt: row.created_at,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	};
}

async function createJob({ dataInicio, dataFim, total = 0, user = {} } = {}) {
	const id = randomJobId();
	await db.query(
		`insert into movimentacoes_ordens_fechadas_jobs
		 (id, status, stage, percent, total, periodo_inicio, periodo_fim,
		  created_at, created_by, created_by_name)
		 values ($1,'queued','Aguardando processamento',0,$2,$3,$4,now(),$5,$6)`,
		[
			id,
			total,
			dataInicio || null,
			dataFim || null,
			nullableText(user?.uid),
			nullableText(user?.profile?.nome || user?.email),
		],
	);
	return getJob(id);
}

async function updateJob(id, patch = {}) {
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
	if (patch.entregues !== undefined) set("entregues", patch.entregues);
	if (patch.naoEntregues !== undefined) set("nao_entregues", patch.naoEntregues);
	if (patch.resultado !== undefined) {
		params.push(JSON.stringify(patch.resultado));
		fields.push(`resultado = $${params.length}::jsonb`);
	}
	if (patch.error !== undefined) set("error", patch.error);
	if (patch.startedAt !== undefined) set("started_at", patch.startedAt);
	if (patch.finishedAt !== undefined) set("finished_at", patch.finishedAt);
	if (!fields.length) return getJob(id);
	await db.query(
		`update movimentacoes_ordens_fechadas_jobs set ${fields.join(", ")} where id = $1`,
		params,
	);
	return getJob(id);
}

async function getJob(id) {
	const result = await db.query(
		"select * from movimentacoes_ordens_fechadas_jobs where id = $1",
		[id],
	);
	return mapJob(result.rows[0]);
}

module.exports = {
	createJob,
	getJob,
	updateJob,
};
