// Roteiro Finan #40 (Fase 4D — Regras financeiras configuráveis, v1
// restrito): catálogo FIXO de tipos de regra (decisão já tomada no
// próprio roteiro — "um motor genérico e livre é um projeto bem maior e
// mais arriscado de manter, não recomendo essa versão de início"). Cada
// tipo sabe avaliar a si mesmo contra o período atual e devolver os
// registros que violam o limiar configurado.
const db = require("../db");
const { randomId } = require("../secureRandom");
const notificationsService = require("../notifications/notificationsService");
const { dispatchEvent } = require("../webhooks/dispatchService");

const TIPOS = {
	despesa_acima_limite: {
		label: "Despesa acima de um valor gera alerta",
		descricaoParametro: "limiteValor — valor do lançamento realizado que dispara o alerta.",
		async avaliar(parametros) {
			const limite = Number(parametros?.limiteValor) || 0;
			if (limite <= 0) return [];
			const now = new Date();
			const { rows } = await db.query(
				`select ol.id, ol.data, ol.realizado, f.nome as fornecedor_nome, c.nome as conta_nome
				from finan_orcamento_lancamentos ol
				left join finan_fornecedores f on f.id = ol.fornecedor_id
				left join finan_contas c on c.id = ol.conta_id
				where ol.ano = $1 and ol.mes = $2 and ol.realizado > $3
				order by ol.realizado desc
				limit 50`,
				[now.getFullYear(), now.getMonth() + 1, limite],
			);
			return rows.map((row) => ({
				registroId: row.id,
				titulo: `${row.fornecedor_nome || "Fornecedor não identificado"} — ${row.conta_nome || "conta não identificada"}`,
				valor: Number(row.realizado),
				data: row.data,
			}));
		},
	},
	conta_sem_nf_acima_limite: {
		label: "Conta a pagar sem NF vinculada acima de um valor vira pendência crítica",
		descricaoParametro: "limiteValor — valor da conta a pagar sem nota_id que dispara a pendência.",
		async avaliar(parametros) {
			const limite = Number(parametros?.limiteValor) || 0;
			if (limite <= 0) return [];
			const { rows } = await db.query(
				`select cp.id, cp.descricao, cp.valor, cp.data_vencimento, f.nome as fornecedor_nome
				from finan_contas_pagar cp
				left join finan_fornecedores f on f.id = cp.fornecedor_id
				where cp.nota_id is null and cp.valor > $1 and cp.status <> 'cancelado'
				order by cp.valor desc
				limit 50`,
				[limite],
			);
			return rows.map((row) => ({
				registroId: row.id,
				titulo: `${row.descricao} — ${row.fornecedor_nome || "fornecedor não identificado"}`,
				valor: Number(row.valor),
				data: row.data_vencimento,
			}));
		},
	},
};

function publicRegra(row) {
	return {
		id: row.id,
		tipo: row.tipo,
		nome: row.nome,
		parametros: row.parametros || {},
		ativa: row.ativa,
		createdByNome: row.created_by_nome,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function getCatalogoTipos() {
	return Object.entries(TIPOS).map(([tipo, meta]) => ({
		tipo,
		label: meta.label,
		descricaoParametro: meta.descricaoParametro,
	}));
}

async function listRegras() {
	const { rows } = await db.query(`select * from finan_regras_financeiras order by created_at desc`);
	return rows.map(publicRegra);
}

async function createRegra({ tipo, nome, parametros, createdBy }) {
	if (!TIPOS[tipo]) {
		const error = new Error(`Tipo de regra "${tipo}" não reconhecido.`);
		error.statusCode = 400;
		throw error;
	}
	const id = randomId("regra");
	const { rows } = await db.query(
		`insert into finan_regras_financeiras (id, tipo, nome, parametros, created_by_id, created_by_nome)
		values ($1, $2, $3, $4::jsonb, $5, $6)
		returning *`,
		[id, tipo, nome, JSON.stringify(parametros || {}), createdBy?.id || null, createdBy?.name || null],
	);
	return publicRegra(rows[0]);
}

async function updateRegra(id, { nome, parametros, ativa }) {
	const { rows } = await db.query(
		`update finan_regras_financeiras set
			nome = coalesce($2, nome),
			parametros = coalesce($3::jsonb, parametros),
			ativa = coalesce($4, ativa),
			updated_at = now()
		where id = $1
		returning *`,
		[id, nome ?? null, parametros ? JSON.stringify(parametros) : null, ativa ?? null],
	);
	if (!rows[0]) {
		const error = new Error("Regra não encontrada.");
		error.statusCode = 404;
		throw error;
	}
	return publicRegra(rows[0]);
}

async function deleteRegra(id) {
	await db.query(`delete from finan_regras_financeiras where id = $1`, [id]);
}

// Roteiro #28 (jobExecutionService) chama isso — avalia toda regra
// ATIVA contra o período atual e gera 1 notificação por regra violada
// (dedupe por dia, pra não reenviar toda vez que o job rodar de novo).
async function avaliarRegrasAtivas() {
	const { rows } = await db.query(`select * from finan_regras_financeiras where ativa = true`);
	let totalViolacoes = 0;
	const resultadosPorRegra = [];
	for (const regraRow of rows) {
		const regra = publicRegra(regraRow);
		const tipoMeta = TIPOS[regra.tipo];
		if (!tipoMeta) continue;
		// eslint-disable-next-line no-await-in-loop
		const violacoes = await tipoMeta.avaliar(regra.parametros);
		resultadosPorRegra.push({ regraId: regra.id, nome: regra.nome, violacoes: violacoes.length });
		if (violacoes.length) {
			totalViolacoes += violacoes.length;
			const today = new Date().toISOString().slice(0, 10);
			// eslint-disable-next-line no-await-in-loop
			await notificationsService.createNotification({
				type: "regra_financeira",
				title: `Regra "${regra.nome}" disparada`,
				message: `${violacoes.length} registro(s) violam o limiar configurado. Exemplo: ${violacoes[0].titulo} (R$ ${violacoes[0].valor.toFixed(2)}).`,
				severity: "warning",
				targetPath: "/configuracao-geral/regras-financeiras",
				targets: { permissions: ["finan.configuracoes.manage"] },
				dedupeKey: `regra_${regra.id}_${today}`,
			});
			// Roteiro Finan #47 (Webhooks): budget.threshold_reached — so pro
			// tipo de regra que de fato representa um limiar orcamentario.
			// Melhor esforco.
			if (regra.tipo === "despesa_acima_limite") {
				// eslint-disable-next-line no-await-in-loop
				await dispatchEvent("budget.threshold_reached", {
					regraId: regra.id,
					regraNome: regra.nome,
					limiteValor: regra.parametros?.limiteValor,
					violacoes: violacoes.length,
				}).catch(() => {});
			}
		}
	}
	return { recordsProcessed: totalViolacoes, resultadosPorRegra };
}

module.exports = {
	getCatalogoTipos,
	listRegras,
	createRegra,
	updateRegra,
	deleteRegra,
	avaliarRegrasAtivas,
};
