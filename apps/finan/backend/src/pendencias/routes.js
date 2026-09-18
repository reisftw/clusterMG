// Roteiro Finan #13 (Central de Pendências): agrega, sem gravar nada
// novo, sinais de qualidade de dado ja existentes em outras tabelas —
// lançamentos sem categoria/centro de custo, integrações com erro, falhas
// de importação de relatórios e possíveis duplicidades (mesma janela curta
// usada em orcamento/routes.js:/duplicidades). So leitura, nenhuma ação
// aqui resolve nada por conta propria.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { consultarCnpj } = require("../brasilapi/service");

const router = express.Router();

// Verifica os CNPJs de notas recentes contra a Receita (BrasilAPI) e
// devolve so os inativos. Best-effort de verdade: qualquer erro (CNPJ
// invalido, BrasilAPI fora do ar, timeout) e ignorado por item — a
// Central de Pendencias nunca pode falhar por causa de um servico
// externo instavel. Limite baixo (10) e cache de 1h no service.js evitam
// pesar a rota a cada carregamento.
async function checarCnpjsInativos() {
	const { rows } = await db.query(
		`select distinct on (cnpj_emissor) cnpj_emissor, fornecedor_nome
		from finan_notas_fiscais
		where cnpj_emissor is not null and cnpj_emissor <> '' and created_at > now() - interval '180 days'
		order by cnpj_emissor, created_at desc
		limit 10`,
	);
	const resultados = await Promise.allSettled(
		rows.map(async (row) => {
			const digits = String(row.cnpj_emissor).replace(/\D/g, "");
			const { empresa } = await consultarCnpj(digits);
			return { cnpjEmissor: row.cnpj_emissor, fornecedorNome: row.fornecedor_nome, empresa };
		}),
	);
	return resultados
		.filter((r) => r.status === "fulfilled" && r.value.empresa && !r.value.empresa.ativa)
		.map((r) => r.value);
}

router.use(requireFinanPermission("finan.pendencias.view"));
router.use(noStore);

router.get("/", async (req, res, next) => {
	try {
		const now = new Date();
		const year = Number(req.query?.ano || now.getFullYear());
		const month = Number(req.query?.mes || now.getMonth() + 1);

		const [semCategoria, integracoesErro, importsErro, duplicidades, contasPagarVencidas, contasReceberVencidas, cnpjsInativos] = await Promise.all([
			db.query(
				`select ol.id, ol.data, ol.realizado, f.nome as fornecedor_nome
				from finan_orcamento_lancamentos ol
				left join finan_fornecedores f on f.id = ol.fornecedor_id
				where ol.ano = $1 and ol.mes = $2
					and (ol.conta_id is null or ol.centro_custo_id is null)
				order by ol.data desc
				limit 100`,
				[year, month],
			),
			db.query(
				`select id, provider, name, status, updated_at
				from finan_integration_configs
				where status = 'erro'
				order by updated_at desc`,
			),
			db.query(
				`select id, source_id, label, message, created_at
				from finan_import_logs
				where status = 'erro'
				order by created_at desc
				limit 20`,
			),
			db.query(
				`select count(*)::int as total
				from finan_orcamento_lancamentos a
				join finan_orcamento_lancamentos b
					on a.fornecedor_id = b.fornecedor_id
					and a.realizado = b.realizado
					and a.id < b.id
					and a.data is not null and b.data is not null
					and abs(a.data - b.data) <= 5
				where a.ano = $1 and a.mes = $2 and b.ano = $1 and b.mes = $2
					and a.fornecedor_id is not null and a.realizado <> 0`,
				[year, month],
			),
			db.query(
				`select id, descricao, valor, data_vencimento from finan_contas_pagar
				where status = 'pendente' and data_vencimento < current_date
				order by data_vencimento asc limit 20`,
			),
			db.query(
				`select id, descricao, cliente_nome, valor, data_vencimento from finan_contas_receber
				where status = 'pendente' and data_vencimento < current_date
				order by data_vencimento asc limit 20`,
			),
			checarCnpjsInativos().catch(() => []),
		]);

		const items = [
			...semCategoria.rows.map((row) => ({
				id: `lancamento-${row.id}`,
				tipo: "lancamento_sem_categoria",
				titulo: "Lançamento sem categoria ou centro de custo",
				descricao: `${row.fornecedor_nome || "Fornecedor não informado"} · ${Number(row.realizado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
				severidade: "atencao",
				link: "/gestao-orcamentaria/dados",
			})),
			...integracoesErro.rows.map((row) => ({
				id: `integracao-${row.id}`,
				tipo: "integracao_erro",
				titulo: `Integração ${row.name || row.provider} com erro`,
				descricao: `Última atualização: ${row.updated_at ? new Date(row.updated_at).toLocaleString("pt-BR") : "-"}`,
				severidade: "critico",
				link: "/configuracao-geral/integracoes-apis",
			})),
			...importsErro.rows.map((row) => ({
				id: `import-${row.id}`,
				tipo: "importacao_erro",
				titulo: `Falha ao importar ${row.label || row.source_id || "relatório"}`,
				descricao: row.message || "Sem detalhes registrados.",
				severidade: "critico",
				link: "/reports/serasa",
			})),
			...contasPagarVencidas.rows.map((row) => ({
				id: `conta-pagar-${row.id}`,
				tipo: "conta_pagar_vencida",
				titulo: `Conta a pagar vencida: ${row.descricao}`,
				descricao: `${Number(row.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · venceu em ${new Date(row.data_vencimento).toLocaleDateString("pt-BR")}`,
				severidade: "critico",
				link: "/contas-a-pagar",
			})),
			...contasReceberVencidas.rows.map((row) => ({
				id: `conta-receber-${row.id}`,
				tipo: "conta_receber_vencida",
				titulo: `Conta a receber vencida: ${row.descricao}`,
				descricao: `${row.cliente_nome} · ${Number(row.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · venceu em ${new Date(row.data_vencimento).toLocaleDateString("pt-BR")}`,
				severidade: "atencao",
				link: "/contas-a-receber",
			})),
			...cnpjsInativos.map((item) => ({
				id: `cnpj-inativo-${item.cnpjEmissor}`,
				tipo: "cnpj_inativo",
				titulo: `CNPJ inativo na Receita: ${item.fornecedorNome || item.empresa.razaoSocial || item.cnpjEmissor}`,
				descricao: `${item.cnpjEmissor} · situação: ${item.empresa.situacaoCadastral || "não ativa"}`,
				severidade: "critico",
				link: "/notas",
			})),
		];

		if (duplicidades.rows[0]?.total > 0) {
			items.push({
				id: "duplicidades",
				tipo: "possivel_duplicidade",
				titulo: `${duplicidades.rows[0].total} possível(is) lançamento(s) duplicado(s) este mês`,
				descricao: "Mesmo fornecedor e valor em poucos dias de diferença.",
				severidade: "atencao",
				link: "/gestao-orcamentaria/dados",
			});
		}

		res.json({
			ok: true,
			periodo: { ano: year, mes: month },
			total: items.length,
			items,
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
