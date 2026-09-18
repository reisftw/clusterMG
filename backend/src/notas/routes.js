// Roteiro Finan Fase 3 (pré-requisito) — Notas Fiscais: cadastro
// independente (não gera Conta a Pagar automaticamente; o vínculo é
// opcional via notaId na Conta a Pagar).
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { IdParamDTO, NotaFiscalDTO } = require("../dtos/documentosFinanceirosDto");

const router = express.Router();

router.use(requireFinanPermission("finan.notas.view"));
router.use(noStore);

function publicNota(row) {
	return {
		id: row.id,
		numero: row.numero,
		serie: row.serie,
		cnpjEmissor: row.cnpj_emissor,
		fornecedorId: row.fornecedor_id,
		fornecedorNome: row.fornecedor_nome,
		descricao: row.descricao,
		valor: Number(row.valor || 0),
		valorImpostos: Number(row.valor_impostos || 0),
		dataEmissao: row.data_emissao,
		dataVencimento: row.data_vencimento,
		status: row.status,
		observacoes: row.observacoes,
		createdAt: row.created_at,
		// Vinculo opcional com Contas a Pagar (nota.id = contas_pagar.nota_id
		// — ver notas/routes.js no topo do arquivo). So null quando ainda nao
		// foi gerada nenhuma conta a partir desta nota; a tela usa isso pra
		// decidir se mostra "Gerar Conta a Pagar" ou o vinculo ja existente.
		contaPagarId: row.conta_pagar_id || null,
		// Documento original (PDF/imagem) que deu origem a esta nota, se ela
		// veio da Caixa de Entrada — permite "ver a nota" antes de pagar
		// (GET /documentos/:id/conteudo). Null pra nota cadastrada manual.
		documentoId: row.documento_id || null,
	};
}

router.get("/", async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select n.*, cp.conta_pagar_id, doc.documento_id
			from finan_notas_fiscais n
			left join lateral (
				select min(id) as conta_pagar_id from finan_contas_pagar where nota_id = n.id
			) cp on true
			left join lateral (
				select id as documento_id from finan_documentos_entrada where nota_id = n.id limit 1
			) doc on true
			order by n.data_vencimento desc nulls last, n.created_at desc
			limit 300`,
		);
		res.json({ ok: true, notas: rows.map(publicNota) });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.notas.manage"),
	validate({ body: NotaFiscalDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const id = randomId("nota");
			const { rows } = await db.query(
				`insert into finan_notas_fiscais (
					id, numero, serie, cnpj_emissor, fornecedor_id, fornecedor_nome, descricao, valor, valor_impostos,
					data_emissao, data_vencimento, status, observacoes, created_by_id, created_by_nome
				) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12, 'pendente'), $13, $14, $15)
				returning *`,
				[
					id,
					dto.numero || null,
					dto.serie || null,
					dto.cnpjEmissor || null,
					dto.fornecedorId || null,
					dto.fornecedorNome || null,
					dto.descricao || null,
					dto.valor,
					dto.valorImpostos || 0,
					dto.dataEmissao || null,
					dto.dataVencimento || null,
					dto.status || null,
					dto.observacoes || null,
					req.finanUser?.id || null,
					req.finanUser?.name || req.finanUser?.email || null,
				],
			);
			res.json({ ok: true, nota: publicNota(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/:id",
	requireFinanPermission("finan.notas.manage"),
	validate({ params: IdParamDTO, body: { schema: NotaFiscalDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const { rows } = await db.query(
				`update finan_notas_fiscais set
					numero = coalesce($2, numero),
					serie = coalesce($3, serie),
					cnpj_emissor = coalesce($4, cnpj_emissor),
					fornecedor_id = coalesce($5, fornecedor_id),
					fornecedor_nome = coalesce($6, fornecedor_nome),
					descricao = coalesce($7, descricao),
					valor = coalesce($8, valor),
					valor_impostos = coalesce($9, valor_impostos),
					data_emissao = coalesce($10, data_emissao),
					data_vencimento = coalesce($11, data_vencimento),
					status = coalesce($12, status),
					observacoes = coalesce($13, observacoes),
					updated_at = now()
				where id = $1
				returning *`,
				[
					req.validated.params.id,
					dto.numero ?? null,
					dto.serie ?? null,
					dto.cnpjEmissor ?? null,
					dto.fornecedorId ?? null,
					dto.fornecedorNome ?? null,
					dto.descricao ?? null,
					dto.valor ?? null,
					dto.valorImpostos ?? null,
					dto.dataEmissao ?? null,
					dto.dataVencimento ?? null,
					dto.status ?? null,
					dto.observacoes ?? null,
				],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Nota fiscal não encontrada." });
				return;
			}
			res.json({ ok: true, nota: publicNota(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/:id", requireFinanPermission("finan.notas.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query(`update finan_notas_fiscais set status = 'cancelada', updated_at = now() where id = $1`, [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
