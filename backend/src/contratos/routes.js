// Roteiro Finan #6 (Contratos recorrentes) e #7 (Controle de reajustes):
// cadastro proprio de compromissos financeiros (aluguel, softwares,
// links, seguros...) com historico de reajuste. Nao deriva de nenhuma
// outra tabela — dado cadastrado manualmente.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { ContratoUpsertDTO, IdParamDTO, ReajusteDTO } = require("../dtos/contratoDto");

const router = express.Router();

router.use(requireFinanPermission("finan.contratos.view"));
router.use(noStore);

function publicContrato(row) {
	const diasParaVencer = row.data_renovacao
		? Math.ceil((new Date(row.data_renovacao) - new Date()) / (1000 * 60 * 60 * 24))
		: null;
	return {
		id: row.id,
		fornecedorId: row.fornecedor_id,
		nome: row.nome,
		valor: Number(row.valor || 0),
		periodicidade: row.periodicidade,
		dataInicio: row.data_inicio,
		dataRenovacao: row.data_renovacao,
		diasParaVencer,
		indiceReajuste: row.indice_reajuste,
		responsavelId: row.responsavel_id,
		responsavelNome: row.responsavel_nome,
		ativo: row.ativo,
		observacoes: row.observacoes,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

router.get("/", async (req, res, next) => {
	try {
		const soVencendo = String(req.query?.vencendoEm30Dias || "") === "true";
		const { rows } = await db.query(
			`select * from finan_contratos
			where ativo is not false
				${soVencendo ? "and data_renovacao is not null and data_renovacao <= current_date + interval '30 days'" : ""}
			order by data_renovacao nulls last, nome`,
		);
		res.json({ ok: true, contratos: rows.map(publicContrato) });
	} catch (error) {
		next(error);
	}
});

router.get("/:id", validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		const [contrato, reajustes] = await Promise.all([
			db.query(`select * from finan_contratos where id = $1`, [req.validated.params.id]),
			db.query(
				`select * from finan_contrato_reajustes where contrato_id = $1 order by data desc`,
				[req.validated.params.id],
			),
		]);
		if (!contrato.rows[0]) {
			res.status(404).json({ ok: false, error: "Contrato não encontrado." });
			return;
		}
		res.json({
			ok: true,
			contrato: publicContrato(contrato.rows[0]),
			reajustes: reajustes.rows.map((row) => ({
				id: row.id,
				valorAnterior: Number(row.valor_anterior),
				valorNovo: Number(row.valor_novo),
				indice: row.indice,
				data: row.data,
				criadoPorNome: row.criado_por_nome,
				createdAt: row.created_at,
			})),
		});
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.contratos.manage"),
	validate({ body: ContratoUpsertDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const id = randomId("contrato");
			const { rows } = await db.query(
				`insert into finan_contratos (
					id, fornecedor_id, nome, valor, periodicidade, data_inicio, data_renovacao,
					indice_reajuste, responsavel_id, responsavel_nome, ativo, observacoes,
					created_by_id, created_by_nome
				) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
				returning *`,
				[
					id,
					dto.fornecedorId || null,
					dto.nome,
					dto.valor,
					dto.periodicidade,
					dto.dataInicio || null,
					dto.dataRenovacao || null,
					dto.indiceReajuste || null,
					dto.responsavelId || null,
					dto.responsavelNome || null,
					dto.ativo !== false,
					dto.observacoes || null,
					req.finanUser?.id || null,
					req.finanUser?.name || req.finanUser?.email || null,
				],
			);
			res.json({ ok: true, contrato: publicContrato(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/:id",
	requireFinanPermission("finan.contratos.manage"),
	validate({ params: IdParamDTO, body: { schema: ContratoUpsertDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const { rows } = await db.query(
				`update finan_contratos set
					fornecedor_id = coalesce($2, fornecedor_id),
					nome = coalesce($3, nome),
					valor = coalesce($4, valor),
					periodicidade = coalesce($5, periodicidade),
					data_inicio = coalesce($6, data_inicio),
					data_renovacao = coalesce($7, data_renovacao),
					indice_reajuste = coalesce($8, indice_reajuste),
					responsavel_id = coalesce($9, responsavel_id),
					responsavel_nome = coalesce($10, responsavel_nome),
					ativo = coalesce($11, ativo),
					observacoes = coalesce($12, observacoes),
					updated_at = now()
				where id = $1
				returning *`,
				[
					req.validated.params.id,
					dto.fornecedorId ?? null,
					dto.nome ?? null,
					dto.valor ?? null,
					dto.periodicidade ?? null,
					dto.dataInicio ?? null,
					dto.dataRenovacao ?? null,
					dto.indiceReajuste ?? null,
					dto.responsavelId ?? null,
					dto.responsavelNome ?? null,
					dto.ativo ?? null,
					dto.observacoes ?? null,
				],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Contrato não encontrado." });
				return;
			}
			res.json({ ok: true, contrato: publicContrato(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/:id", requireFinanPermission("finan.contratos.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query(`update finan_contratos set ativo = false, updated_at = now() where id = $1`, [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// Roteiro Finan #7: registra um reajuste do contrato, comparando com o
// valor atual (que vira "anterior" nesse registro) e atualiza o valor do
// contrato pro novo. Compara tambem com o reajuste anterior mais recente
// pra sinalizar se este reajuste esta acima do historico do proprio
// contrato.
router.post(
	"/:id/reajustes",
	requireFinanPermission("finan.contratos.manage"),
	validate({ params: IdParamDTO, body: ReajusteDTO }),
	async (req, res, next) => {
		try {
			const contratoId = req.validated.params.id;
			const { valorNovo, indice, data } = req.validated.body;
			const contrato = await db.query(`select valor from finan_contratos where id = $1`, [contratoId]);
			if (!contrato.rows[0]) {
				res.status(404).json({ ok: false, error: "Contrato não encontrado." });
				return;
			}
			const valorAnterior = Number(contrato.rows[0].valor || 0);
			const ultimoReajuste = await db.query(
				`select valor_anterior, valor_novo from finan_contrato_reajustes
				where contrato_id = $1 order by data desc limit 1`,
				[contratoId],
			);

			const id = randomId("reajuste");
			await db.query(
				`insert into finan_contrato_reajustes (id, contrato_id, valor_anterior, valor_novo, indice, data, criado_por_id, criado_por_nome)
				values ($1, $2, $3, $4, $5, coalesce($6, current_date), $7, $8)`,
				[
					id,
					contratoId,
					valorAnterior,
					valorNovo,
					indice || null,
					data || null,
					req.finanUser?.id || null,
					req.finanUser?.name || req.finanUser?.email || null,
				],
			);
			await db.query(`update finan_contratos set valor = $2, updated_at = now() where id = $1`, [contratoId, valorNovo]);

			const percentualAtual = valorAnterior ? ((valorNovo - valorAnterior) / valorAnterior) * 100 : 0;
			let percentualAnterior = null;
			if (ultimoReajuste.rows[0]) {
				const before = Number(ultimoReajuste.rows[0].valor_anterior || 0);
				const after = Number(ultimoReajuste.rows[0].valor_novo || 0);
				percentualAnterior = before ? ((after - before) / before) * 100 : 0;
			}
			const acimaDoHistorico = percentualAnterior !== null && percentualAtual > percentualAnterior + 5;

			res.json({
				ok: true,
				reajuste: {
					id,
					valorAnterior,
					valorNovo,
					percentual: percentualAtual,
					percentualAnterior,
					acimaDoHistorico,
				},
			});
		} catch (error) {
			next(error);
		}
	},
);

module.exports = router;
