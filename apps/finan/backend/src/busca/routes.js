// Roteiro Finan #22 (Busca global) + #31 (Fase 4B — Command Palette
// Ctrl+K, estende #22): fornecedor, NF, CNPJ, conta financeira, contrato,
// colaborador e contas a pagar/receber numa busca só. So leitura, sem
// gate de permissao alem de autenticado (resultado ja e metadado de
// baixa sensibilidade, mesmo padrao de /notifications).
const express = require("express");
const db = require("../db");
const { noStore } = require("../security/noStore");

const router = express.Router();

router.use(noStore);

function onlyDigits(value) {
	return String(value || "").replace(/\D/g, "");
}

router.get("/", async (req, res, next) => {
	try {
		const term = String(req.query?.q || "").trim();
		if (term.length < 2) {
			res.json({ ok: true, items: [] });
			return;
		}
		const like = `%${term}%`;
		const cnpjDigits = onlyDigits(term);
		const cnpjLike = cnpjDigits.length >= 4 ? `%${cnpjDigits}%` : null;

		const [
			fornecedores,
			contratos,
			integracoes,
			notas,
			contasPagar,
			contasReceber,
			colaboradores,
			contas,
		] = await Promise.all([
			db.query(
				`select id, nome, codigo, cnpj from finan_fornecedores
				where nome ilike $1 or ($2::text is not null and regexp_replace(coalesce(cnpj,''), '\\D', '', 'g') ilike $2)
				order by nome limit 8`,
				[like, cnpjLike],
			),
			db.query(`select id, nome from finan_contratos where nome ilike $1 and ativo is not false order by nome limit 8`, [like]),
			db.query(`select id, provider, name from finan_integration_configs where name ilike $1 order by name limit 5`, [like]),
			db.query(
				`select id, numero, fornecedor_nome, valor, status from finan_notas_fiscais
				where numero ilike $1 or fornecedor_nome ilike $1
					or ($2::text is not null and regexp_replace(coalesce(cnpj_emissor,''), '\\D', '', 'g') ilike $2)
				order by data_emissao desc nulls last limit 8`,
				[like, cnpjLike],
			),
			db.query(
				`select cp.id, cp.descricao, cp.valor, cp.status, f.nome as fornecedor_nome
				from finan_contas_pagar cp
				left join finan_fornecedores f on f.id = cp.fornecedor_id
				where cp.descricao ilike $1 or f.nome ilike $1
				order by cp.data_vencimento desc nulls last limit 8`,
				[like],
			),
			db.query(
				`select id, descricao, cliente_nome, valor, status from finan_contas_receber
				where descricao ilike $1 or cliente_nome ilike $1
				order by data_vencimento desc nulls last limit 8`,
				[like],
			),
			db.query(
				`select id, nome, setor from finan_equipe_colaboradores where nome ilike $1 and ativo is not false order by nome limit 6`,
				[like],
			),
			db.query(
				`select id, codigo, nome from finan_contas where nome ilike $1 or codigo ilike $1 order by nome limit 6`,
				[like],
			),
		]);

		const items = [
			...fornecedores.rows.map((row) => ({
				tipo: "fornecedor",
				titulo: row.nome,
				subtitulo: row.cnpj ? `CNPJ ${row.cnpj}${row.codigo ? ` · Código ${row.codigo}` : ""}` : row.codigo ? `Código ${row.codigo}` : "Fornecedor",
				link: "/fornecedores",
			})),
			...notas.rows.map((row) => ({
				tipo: "nota_fiscal",
				titulo: `NF ${row.numero || row.id}`,
				subtitulo: [row.fornecedor_nome, row.status].filter(Boolean).join(" · ") || "Nota fiscal",
				link: "/notas",
			})),
			...contasPagar.rows.map((row) => ({
				tipo: "conta_pagar",
				titulo: row.descricao,
				subtitulo: [row.fornecedor_nome, row.status].filter(Boolean).join(" · ") || "Conta a pagar",
				link: "/contas-a-pagar",
			})),
			...contasReceber.rows.map((row) => ({
				tipo: "conta_receber",
				titulo: row.descricao,
				subtitulo: [row.cliente_nome, row.status].filter(Boolean).join(" · ") || "Conta a receber",
				link: "/contas-a-receber",
			})),
			...contratos.rows.map((row) => ({
				tipo: "contrato",
				titulo: row.nome,
				subtitulo: "Contrato recorrente",
				link: "/contratos",
			})),
			...colaboradores.rows.map((row) => ({
				tipo: "colaborador",
				titulo: row.nome,
				subtitulo: row.setor ? `Equipe · ${row.setor}` : "Equipe",
				link: "/equipe",
			})),
			...contas.rows.map((row) => ({
				tipo: "conta_financeira",
				titulo: row.nome,
				subtitulo: row.codigo ? `Plano de contas · ${row.codigo}` : "Plano de contas",
				link: "/gestao-orcamentaria/configuracoes",
			})),
			...integracoes.rows.map((row) => ({
				tipo: "integracao",
				titulo: row.name,
				subtitulo: "Integração",
				link: `/configuracao-geral/${row.provider}`,
			})),
		];
		res.json({ ok: true, items });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
