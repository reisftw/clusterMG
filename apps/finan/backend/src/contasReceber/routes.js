// Roteiro Finan Fase 3 (pré-requisito) — Contas a Receber. Mesmo padrao
// de finan_contas_pagar (vencido calculado, nao gravado).
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { IdParamDTO, ContaReceberDTO } = require("../dtos/documentosFinanceirosDto");

const router = express.Router();

router.use(requireFinanPermission("finan.contas_receber.view"));
router.use(noStore);

function publicConta(row) {
	const vencimento = row.data_vencimento ? new Date(row.data_vencimento) : null;
	const vencida = row.status === "pendente" && vencimento && vencimento < new Date(new Date().toDateString());
	return {
		id: row.id,
		descricao: row.descricao,
		clienteNome: row.cliente_nome,
		valor: Number(row.valor || 0),
		dataVencimento: row.data_vencimento,
		dataRecebimento: row.data_recebimento,
		status: row.status,
		vencida,
		observacoes: row.observacoes,
		createdAt: row.created_at,
	};
}

router.get("/", async (_req, res, next) => {
	try {
		const [{ rows }, resumo] = await Promise.all([
			db.query(`select * from finan_contas_receber order by data_vencimento asc limit 300`),
			db.query(
				`select
					coalesce(sum(valor) filter (where status = 'pendente'), 0)::numeric as total_a_receber,
					coalesce(sum(valor) filter (where status = 'pendente' and data_vencimento = current_date), 0)::numeric as receber_hoje,
					coalesce(sum(valor) filter (where status = 'recebido' and data_recebimento = current_date), 0)::numeric as recebido_hoje,
					coalesce(sum(valor) filter (where status = 'pendente' and data_vencimento < current_date), 0)::numeric as vencidos,
					coalesce(count(*) filter (where status = 'pendente' and data_vencimento < current_date), 0)::int as inadimplencia_qtd
				from finan_contas_receber`,
			),
		]);
		res.json({
			ok: true,
			contas: rows.map(publicConta),
			resumo: {
				totalAReceber: Number(resumo.rows[0]?.total_a_receber || 0),
				receberHoje: Number(resumo.rows[0]?.receber_hoje || 0),
				recebidoHoje: Number(resumo.rows[0]?.recebido_hoje || 0),
				vencidos: Number(resumo.rows[0]?.vencidos || 0),
				inadimplenciaQtd: Number(resumo.rows[0]?.inadimplencia_qtd || 0),
			},
		});
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.contas_receber.manage"),
	validate({ body: ContaReceberDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const id = randomId("creceber");
			const { rows } = await db.query(
				`insert into finan_contas_receber (
					id, descricao, cliente_nome, valor, data_vencimento, data_recebimento, status, observacoes,
					created_by_id, created_by_nome
				) values ($1, $2, $3, $4, $5, $6, coalesce($7, 'pendente'), $8, $9, $10)
				returning *`,
				[
					id,
					dto.descricao,
					dto.clienteNome,
					dto.valor,
					dto.dataVencimento,
					dto.dataRecebimento || null,
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
	requireFinanPermission("finan.contas_receber.manage"),
	validate({ params: IdParamDTO, body: { schema: ContaReceberDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const { rows } = await db.query(
				`update finan_contas_receber set
					descricao = coalesce($2, descricao),
					cliente_nome = coalesce($3, cliente_nome),
					valor = coalesce($4, valor),
					data_vencimento = coalesce($5, data_vencimento),
					data_recebimento = coalesce($6, data_recebimento),
					status = coalesce($7, status),
					observacoes = coalesce($8, observacoes),
					updated_at = now()
				where id = $1
				returning *`,
				[
					req.validated.params.id,
					dto.descricao ?? null,
					dto.clienteNome ?? null,
					dto.valor ?? null,
					dto.dataVencimento ?? null,
					dto.dataRecebimento ?? null,
					dto.status ?? null,
					dto.observacoes ?? null,
				],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Conta a receber não encontrada." });
				return;
			}
			res.json({ ok: true, conta: publicConta(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.post(
	"/:id/receber",
	requireFinanPermission("finan.contas_receber.manage"),
	validate({ params: IdParamDTO }),
	async (req, res, next) => {
		try {
			const dataRecebimento = req.body?.dataRecebimento || new Date().toISOString().slice(0, 10);
			const { rows } = await db.query(
				`update finan_contas_receber set status = 'recebido', data_recebimento = $2, updated_at = now() where id = $1 returning *`,
				[req.validated.params.id, dataRecebimento],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Conta a receber não encontrada." });
				return;
			}
			res.json({ ok: true, conta: publicConta(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/:id", requireFinanPermission("finan.contas_receber.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query(`update finan_contas_receber set status = 'cancelado', updated_at = now() where id = $1`, [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
