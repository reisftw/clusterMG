// Roteiro Finan #8 (Central de Fornecedores) e #9 (Dependência de
// fornecedor): agrega os dados de finan_orcamento_lancamentos ja
// importados via Gestão Orçamentária → Dados, por fornecedor. Sem fonte
// de dado nova — mesma tabela que alimenta o dashboard orçamentário.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { getSupplierScore } = require("./scoreService");

const router = express.Router();

router.use(requireFinanPermission(["finan.gestao_orcamentaria.view", "finan.dashboard.view"]));
router.use(noStore);

router.get("/", async (req, res, next) => {
	try {
		const now = new Date();
		const ano = Number(req.query?.ano || now.getFullYear());
		const { rows } = await db.query(
			`select
				f.id, f.codigo, f.nome,
				count(ol.id)::int as linhas,
				count(distinct ol.mes)::int as meses_com_dados,
				coalesce(sum(ol.realizado), 0)::numeric as total,
				coalesce(max(ol.realizado), 0)::numeric as maior_lancamento,
				max(ol.data) as ultimo_lancamento
			from finan_orcamento_lancamentos ol
			join finan_fornecedores f on f.id = ol.fornecedor_id
			where ol.ano = $1
			group by f.id, f.codigo, f.nome
			order by total desc
			limit 300`,
			[ano],
		);
		const grandTotal = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
		const fornecedores = rows.map((row) => ({
			...row,
			mediaMensal: row.meses_com_dados ? Number(row.total) / Number(row.meses_com_dados) : 0,
			percentual: grandTotal ? (Number(row.total) / grandTotal) * 100 : 0,
		}));
		// Indice de concentracao (#9): quanto do total do ano os 3 maiores
		// fornecedores representam — sinal simples de dependencia excessiva.
		const top3Total = fornecedores.slice(0, 3).reduce((sum, item) => sum + Number(item.total || 0), 0);
		res.json({
			ok: true,
			ano,
			grandTotal,
			concentracaoTop3Percent: grandTotal ? (top3Total / grandTotal) * 100 : 0,
			fornecedores,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/:id", async (req, res, next) => {
	try {
		const now = new Date();
		const ano = Number(req.query?.ano || now.getFullYear());
		const id = String(req.params.id);
		const [fornecedor, mensal, topLancamentos, score] = await Promise.all([
			db.query(`select id, codigo, nome from finan_fornecedores where id = $1`, [id]),
			db.query(
				`select mes, coalesce(sum(realizado), 0)::numeric as total, count(*)::int as linhas
				from finan_orcamento_lancamentos
				where fornecedor_id = $1 and ano = $2
				group by mes
				order by mes`,
				[id, ano],
			),
			db.query(
				`select ol.id, ol.data, ol.realizado, c.nome as conta_nome
				from finan_orcamento_lancamentos ol
				left join finan_contas c on c.id = ol.conta_id
				where ol.fornecedor_id = $1 and ol.ano = $2
				order by ol.realizado desc
				limit 10`,
				[id, ano],
			),
			// Roteiro Finan #43 (Supplier Score, estende #8 e #9).
			getSupplierScore(id, { ano }),
		]);
		if (!fornecedor.rows[0]) {
			res.status(404).json({ ok: false, error: "Fornecedor não encontrado." });
			return;
		}
		res.json({
			ok: true,
			fornecedor: fornecedor.rows[0],
			ano,
			mensal: mensal.rows,
			topLancamentos: topLancamentos.rows,
			score,
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
