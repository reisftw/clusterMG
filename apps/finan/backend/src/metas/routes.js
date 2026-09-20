// Roteiro Finan #18 (Metas financeiras): meta de redução/controle contra
// um valor base, com projeção simples de quando deve ser atingida no
// ritmo atual (regressão linear entre data_inicio/hoje e valor_base/
// valor_atual). valor_atual e atualizado manualmente — nao ha ligação
// automatica com contas/centros de custo do orçamento nesta v1.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { MetaUpsertDTO, IdParamDTO } = require("../dtos/metaDto");

const router = express.Router();

router.use(requireFinanPermission(["finan.gestao_orcamentaria.view", "finan.dashboard.view"]));
router.use(noStore);

function publicMeta(row) {
	const base = Number(row.valor_base || 0);
	const atual = Number(row.valor_atual || 0);
	const alvo = Number(row.valor_alvo || 0);
	const denom = base - alvo;
	const progresso = denom !== 0 ? Math.min(100, Math.max(0, ((base - atual) / denom) * 100)) : 0;

	let projecao = null;
	if (row.data_inicio && denom !== 0 && atual !== base) {
		const inicio = new Date(row.data_inicio);
		const hoje = new Date();
		const diasDecorridos = Math.max(1, Math.round((hoje - inicio) / (1000 * 60 * 60 * 24)));
		const ritmoDiario = (base - atual) / diasDecorridos;
		if (ritmoDiario > 0) {
			const diasRestantes = Math.max(0, Math.round((atual - alvo) / ritmoDiario));
			const dataProjetada = new Date(hoje.getTime() + diasRestantes * 24 * 60 * 60 * 1000);
			projecao = dataProjetada.toISOString().slice(0, 10);
		}
	}

	return {
		id: row.id,
		titulo: row.titulo,
		descricao: row.descricao,
		valorBase: base,
		valorAtual: atual,
		valorAlvo: alvo,
		dataInicio: row.data_inicio,
		dataAlvo: row.data_alvo,
		status: row.status,
		progresso,
		dataProjetada: projecao,
		createdAt: row.created_at,
	};
}

router.get("/", async (_req, res, next) => {
	try {
		const { rows } = await db.query(`select * from finan_metas where status <> 'excluida' order by created_at desc`);
		res.json({ ok: true, metas: rows.map(publicMeta) });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ body: MetaUpsertDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const id = randomId("meta");
			const { rows } = await db.query(
				`insert into finan_metas (id, titulo, descricao, valor_base, valor_atual, valor_alvo, data_inicio, data_alvo, created_by_id, created_by_nome)
				values ($1, $2, $3, $4, $5, $6, coalesce($7, current_date), $8, $9, $10)
				returning *`,
				[
					id,
					dto.titulo,
					dto.descricao || null,
					dto.valorBase,
					dto.valorAtual ?? dto.valorBase,
					dto.valorAlvo,
					dto.dataInicio || null,
					dto.dataAlvo || null,
					req.finanUser?.id || null,
					req.finanUser?.name || req.finanUser?.email || null,
				],
			);
			res.json({ ok: true, meta: publicMeta(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/:id",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ params: IdParamDTO, body: { schema: MetaUpsertDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const { rows } = await db.query(
				`update finan_metas set
					titulo = coalesce($2, titulo),
					descricao = coalesce($3, descricao),
					valor_base = coalesce($4, valor_base),
					valor_atual = coalesce($5, valor_atual),
					valor_alvo = coalesce($6, valor_alvo),
					data_alvo = coalesce($7, data_alvo),
					updated_at = now()
				where id = $1
				returning *`,
				[
					req.validated.params.id,
					dto.titulo ?? null,
					dto.descricao ?? null,
					dto.valorBase ?? null,
					dto.valorAtual ?? null,
					dto.valorAlvo ?? null,
					dto.dataAlvo ?? null,
				],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Meta não encontrada." });
				return;
			}
			res.json({ ok: true, meta: publicMeta(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/:id", requireFinanPermission("finan.gestao_orcamentaria.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query(`update finan_metas set status = 'excluida', updated_at = now() where id = $1`, [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
