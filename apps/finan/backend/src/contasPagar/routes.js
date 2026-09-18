// Roteiro Finan Fase 3 (pré-requisito) — Contas a Pagar. "Vencido" nunca
// é gravado como status: é sempre calculado (status='pendente' e
// data_vencimento < hoje), pra nunca ficar desatualizado.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { IdParamDTO, ContaPagarDTO } = require("../dtos/documentosFinanceirosDto");

const router = express.Router();

router.use(requireFinanPermission("finan.contas_pagar.view"));
router.use(noStore);

function publicConta(row) {
	const vencimento = row.data_vencimento ? new Date(row.data_vencimento) : null;
	const vencida = row.status === "pendente" && vencimento && vencimento < new Date(new Date().toDateString());
	return {
		id: row.id,
		descricao: row.descricao,
		fornecedorId: row.fornecedor_id,
		notaId: row.nota_id,
		contaId: row.conta_id,
		centroCustoId: row.centro_custo_id,
		valor: Number(row.valor || 0),
		dataVencimento: row.data_vencimento,
		dataPagamento: row.data_pagamento,
		formaPagamento: row.forma_pagamento,
		status: row.status,
		vencida,
		observacoes: row.observacoes,
		createdAt: row.created_at,
	};
}

router.get("/", async (_req, res, next) => {
	try {
		const [{ rows }, resumo] = await Promise.all([
			db.query(`select * from finan_contas_pagar order by data_vencimento asc limit 300`),
			db.query(
				`select
					coalesce(sum(valor) filter (where status = 'pendente'), 0)::numeric as total_a_pagar,
					coalesce(sum(valor) filter (where status = 'pendente' and data_vencimento = current_date), 0)::numeric as vence_hoje,
					coalesce(sum(valor) filter (where status = 'pendente' and data_vencimento between current_date and current_date + interval '7 days'), 0)::numeric as vence_semana,
					coalesce(sum(valor) filter (where status = 'pendente' and data_vencimento < current_date), 0)::numeric as vencidas,
					coalesce(sum(valor) filter (where status = 'pago' and date_trunc('month', data_pagamento) = date_trunc('month', current_date)), 0)::numeric as pagas_no_mes
				from finan_contas_pagar`,
			),
		]);
		res.json({
			ok: true,
			contas: rows.map(publicConta),
			resumo: {
				totalAPagar: Number(resumo.rows[0]?.total_a_pagar || 0),
				venceHoje: Number(resumo.rows[0]?.vence_hoje || 0),
				venceSemana: Number(resumo.rows[0]?.vence_semana || 0),
				vencidas: Number(resumo.rows[0]?.vencidas || 0),
				pagasNoMes: Number(resumo.rows[0]?.pagas_no_mes || 0),
			},
		});
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.contas_pagar.manage"),
	validate({ body: ContaPagarDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const id = randomId("cpagar");
			const { rows } = await db.query(
				`insert into finan_contas_pagar (
					id, descricao, fornecedor_id, nota_id, conta_id, centro_custo_id, valor,
					data_vencimento, data_pagamento, forma_pagamento, status, observacoes,
					created_by_id, created_by_nome
				) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11, 'pendente'), $12, $13, $14)
				returning *`,
				[
					id,
					dto.descricao,
					dto.fornecedorId || null,
					dto.notaId || null,
					dto.contaId || null,
					dto.centroCustoId || null,
					dto.valor,
					dto.dataVencimento,
					dto.dataPagamento || null,
					dto.formaPagamento || null,
					dto.status || null,
					dto.observacoes || null,
					req.finanUser?.id || null,
					req.finanUser?.name || req.finanUser?.email || null,
				],
			);
			res.json({ ok: true, conta: publicConta(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/:id",
	requireFinanPermission("finan.contas_pagar.manage"),
	validate({ params: IdParamDTO, body: { schema: ContaPagarDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const { rows } = await db.query(
				`update finan_contas_pagar set
					descricao = coalesce($2, descricao),
					fornecedor_id = coalesce($3, fornecedor_id),
					nota_id = coalesce($4, nota_id),
					conta_id = coalesce($5, conta_id),
					centro_custo_id = coalesce($6, centro_custo_id),
					valor = coalesce($7, valor),
					data_vencimento = coalesce($8, data_vencimento),
					data_pagamento = coalesce($9, data_pagamento),
					forma_pagamento = coalesce($10, forma_pagamento),
					status = coalesce($11, status),
					observacoes = coalesce($12, observacoes),
					updated_at = now()
				where id = $1
				returning *`,
				[
					req.validated.params.id,
					dto.descricao ?? null,
					dto.fornecedorId ?? null,
					dto.notaId ?? null,
					dto.contaId ?? null,
					dto.centroCustoId ?? null,
					dto.valor ?? null,
					dto.dataVencimento ?? null,
					dto.dataPagamento ?? null,
					dto.formaPagamento ?? null,
					dto.status ?? null,
					dto.observacoes ?? null,
				],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Conta a pagar não encontrada." });
				return;
			}
			res.json({ ok: true, conta: publicConta(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

// Marca como paga com um clique (atalho pro fluxo mais comum), sem
// precisar reenviar o objeto inteiro pelo PUT.
router.post(
	"/:id/pagar",
	requireFinanPermission("finan.contas_pagar.manage"),
	validate({ params: IdParamDTO }),
	async (req, res, next) => {
		try {
			const dataPagamento = req.body?.dataPagamento || new Date().toISOString().slice(0, 10);
			const { rows } = await db.query(
				`update finan_contas_pagar set status = 'pago', data_pagamento = $2, updated_at = now() where id = $1 returning *`,
				[req.validated.params.id, dataPagamento],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Conta a pagar não encontrada." });
				return;
			}
			res.json({ ok: true, conta: publicConta(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/:id", requireFinanPermission("finan.contas_pagar.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query(`update finan_contas_pagar set status = 'cancelado', updated_at = now() where id = $1`, [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
