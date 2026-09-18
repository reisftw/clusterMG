// Ferramentas (function calling) que o Financeirinho pode chamar durante
// uma conversa. Cada tool: {name, description, parameters (JSON schema no
// formato do Gemini), permission, handler(user) => Promise<objeto>}.
//
// REGRA DE OURO: so leitura. Nenhuma tool aqui escreve nada no banco — se
// um dia o Financeirinho precisar "fazer" algo (gerar conta a pagar,
// mudar status), isso vira uma acao que a UI pede confirmacao explicita
// do usuario, igual ao "conferir antes de confirmar" do OCR (ver
// documentos/routes.js) — nunca a IA executando escrita sozinha.
//
// `permission` usa a MESMA checagem de sempre (userHasFinanPermission) —
// se o usuario da conversa nao tem a permissao, a tool nem entra na lista
// oferecida ao modelo (ver buildAvailableTools em routes.js), entao o
// Financeirinho nunca "sabe" de dado que o usuario nao pode ver.
const db = require("../db");
const { userHasFinanPermission } = require("../auth/middleware");
const { listIndicadoresComValor } = require("../indicadores/service");

const TOOLS = [
	{
		name: "consultarPendencias",
		description: "Lista as pendencias financeiras em aberto (lancamentos sem categoria, integracoes com erro, contas vencidas, possiveis duplicidades).",
		parameters: { type: "OBJECT", properties: {} },
		permission: "finan.pendencias.view",
		async handler() {
			const { rows } = await db.query(
				`select 'conta_pagar_vencida' as tipo, descricao as titulo, valor from finan_contas_pagar
					where status = 'pendente' and data_vencimento < current_date
				union all
				select 'conta_receber_vencida', descricao, valor from finan_contas_receber
					where status = 'pendente' and data_vencimento < current_date
				union all
				select 'integracao_com_erro', name, null from finan_integration_configs where status = 'erro'
				limit 20`,
			);
			return { total: rows.length, itens: rows };
		},
	},
	{
		name: "consultarContasAPagar",
		description:
			"Lista contas a pagar. Filtros opcionais: status ('pendente' ou 'pago'), somenteVencidas, e busca (texto livre — nome do fornecedor ou parte da descricao, ex: 'Cemig', 'aluguel'). Use busca sempre que a pergunta mencionar um fornecedor ou assunto especifico.",
		parameters: {
			type: "OBJECT",
			properties: {
				status: { type: "STRING", enum: ["pendente", "pago"] },
				somenteVencidas: { type: "BOOLEAN" },
				busca: { type: "STRING", description: "Nome do fornecedor ou parte da descricao pra filtrar" },
			},
		},
		permission: "finan.contas_pagar.view",
		async handler(_user, args) {
			const condicoes = [];
			const params = [];
			if (args?.status) {
				params.push(args.status);
				condicoes.push(`cp.status = $${params.length}`);
			}
			if (args?.somenteVencidas) {
				condicoes.push(`cp.data_vencimento < current_date and cp.status = 'pendente'`);
			}
			if (args?.busca) {
				params.push(`%${String(args.busca).trim()}%`);
				condicoes.push(`(cp.descricao ilike $${params.length} or f.nome ilike $${params.length})`);
			}
			const where = condicoes.length ? `where ${condicoes.join(" and ")}` : "";
			const { rows } = await db.query(
				`select cp.descricao, f.nome as fornecedor_nome, cp.valor, cp.data_vencimento, cp.status
				from finan_contas_pagar cp
				left join finan_fornecedores f on f.id = cp.fornecedor_id
				${where} order by cp.data_vencimento asc limit 25`,
				params,
			);
			const { rows: totalRows } = await db.query(
				`select coalesce(sum(valor) filter (where status = 'pendente'), 0)::numeric as total_pendente from finan_contas_pagar`,
			);
			return { itens: rows, totalPendente: Number(totalRows[0]?.total_pendente || 0) };
		},
	},
	{
		name: "consultarContasAReceber",
		description:
			"Lista contas a receber. Filtros opcionais: status ('pendente' ou 'recebido'), e busca (texto livre — nome do cliente ou parte da descricao). Use busca sempre que a pergunta mencionar um cliente ou assunto especifico.",
		parameters: {
			type: "OBJECT",
			properties: {
				status: { type: "STRING", enum: ["pendente", "recebido"] },
				busca: { type: "STRING", description: "Nome do cliente ou parte da descricao pra filtrar" },
			},
		},
		permission: "finan.contas_receber.view",
		async handler(_user, args) {
			const condicoes = [];
			const params = [];
			if (args?.status) {
				params.push(args.status);
				condicoes.push(`status = $${params.length}`);
			}
			if (args?.busca) {
				params.push(`%${String(args.busca).trim()}%`);
				condicoes.push(`(descricao ilike $${params.length} or cliente_nome ilike $${params.length})`);
			}
			const where = condicoes.length ? `where ${condicoes.join(" and ")}` : "";
			const { rows } = await db.query(
				`select descricao, cliente_nome, valor, data_vencimento, status from finan_contas_receber ${where} order by data_vencimento asc limit 25`,
				params,
			);
			return { itens: rows };
		},
	},
	{
		name: "buscarFornecedor",
		description: "Busca fornecedores pelo nome (busca parcial).",
		parameters: {
			type: "OBJECT",
			properties: { nome: { type: "STRING", description: "Parte do nome do fornecedor" } },
			required: ["nome"],
		},
		permission: "finan.gestao_orcamentaria.view",
		async handler(_user, args) {
			const { rows } = await db.query(`select nome from finan_fornecedores where nome ilike $1 order by nome limit 10`, [
				`%${String(args?.nome || "").trim()}%`,
			]);
			return { itens: rows };
		},
	},
	{
		name: "consultarNotasFiscais",
		description:
			"Lista notas fiscais cadastradas. Filtros opcionais: status ('pendente', 'paga' ou 'cancelada'), e busca (texto livre — nome do fornecedor, CNPJ ou parte da descricao). Use busca sempre que a pergunta mencionar um fornecedor especifico.",
		parameters: {
			type: "OBJECT",
			properties: {
				status: { type: "STRING", enum: ["pendente", "paga", "cancelada"] },
				busca: { type: "STRING", description: "Nome do fornecedor, CNPJ ou parte da descricao pra filtrar" },
			},
		},
		permission: "finan.notas.view",
		async handler(_user, args) {
			const condicoes = [];
			const params = [];
			if (args?.status) {
				params.push(args.status);
				condicoes.push(`status = $${params.length}`);
			}
			if (args?.busca) {
				params.push(`%${String(args.busca).trim()}%`);
				condicoes.push(`(descricao ilike $${params.length} or fornecedor_nome ilike $${params.length} or cnpj_emissor ilike $${params.length})`);
			}
			const where = condicoes.length ? `where ${condicoes.join(" and ")}` : "";
			const { rows } = await db.query(
				`select numero, descricao, fornecedor_nome, cnpj_emissor, valor, data_vencimento, status from finan_notas_fiscais ${where} order by data_vencimento desc nulls last limit 25`,
				params,
			);
			return { itens: rows };
		},
	},
	{
		name: "consultarIndicadores",
		description: "Lista os indicadores customizados cadastrados na Central de Indicadores, com seus valores atuais.",
		parameters: { type: "OBJECT", properties: {} },
		permission: "finan.gestao_orcamentaria.view",
		async handler() {
			const indicadores = await listIndicadoresComValor();
			return { itens: indicadores.map((item) => ({ nome: item.nome, valor: item.valor, formula: `${item.metricaALabel} ${item.operador} ${item.metricaBLabel}` })) };
		},
	},
];

/** So as tools que o usuario da conversa tem permissao de usar. */
function buildAvailableTools(user) {
	return TOOLS.filter((tool) => userHasFinanPermission(user, tool.permission));
}

function findTool(name) {
	return TOOLS.find((tool) => tool.name === name) || null;
}

module.exports = { TOOLS, buildAvailableTools, findTool };
