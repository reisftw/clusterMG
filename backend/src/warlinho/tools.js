// Ferramentas (function calling) que o Warlinho pode chamar durante uma
// conversa. Cada tool: {name, description, parameters (JSON schema no
// formato do Gemini), permission, handler(req, args) => Promise<objeto>}.
// Mesmo padrao do Financeirinho do Finan (financeirinho/tools.js), pro
// dominio da Operação (chamados, plantoes, ausencias, feriados, agenda,
// ranking) em vez de financeiro.
//
// REGRA DE OURO: so leitura. Nenhuma tool aqui escreve nada no banco —
// se um dia o Warlinho precisar "fazer" algo (abrir chamado, lançar
// ausência), isso vira uma acao que a UI pede confirmacao explicita do
// usuario, nunca a IA executando escrita sozinha.
//
// `permission` usa a MESMA checagem de sempre (userHasRotPermission) —
// se o usuario da conversa nao tem a permissao, a tool nem entra na
// lista oferecida ao modelo (ver buildAvailableTools em routes.js).
// `null` significa "qualquer usuario autenticado", mesmo criterio dos
// itens de menu com permission:null (Shell.jsx) — a maioria das rotas
// GET da Operação ja e assim (so exige requireRotAuth). Todo handler recebe
// `req` (nao so o usuario) pra poder aplicar scopeRegionalFilter, igual
// o resto do backend.
const db = require("../db");
const { READ_PERMISSIONS, absenceReadTypes } = require("../auth/readPermissions");
const { scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");

const TOOLS = [
	{
		name: "consultarChamados",
		description:
			"Lista chamados/tickets (O.S.) registrados. Filtros opcionais: busca (numero do ticket), mes (formato YYYY-MM). Use busca quando a pergunta mencionar um numero de ticket especifico.",
		parameters: {
			type: "OBJECT",
			properties: {
				busca: { type: "STRING", description: "Numero do ticket (ou parte dele) pra filtrar" },
				mes: { type: "STRING", description: "Mes no formato YYYY-MM pra filtrar" },
			},
		},
		permission: null,
		async handler(req, args) {
			const regionalScope = scopeRegionalFilter(req);
			const condicoes = [];
			const params = [];
			if (regionalScope) {
				params.push(regionalScope);
				condicoes.push(`t.regional_id = $${params.length}`);
			}
			if (args?.busca) {
				params.push(`%${String(args.busca).trim()}%`);
				condicoes.push(`t.ticket_number ilike $${params.length}`);
			}
			if (args?.mes) {
				params.push(`${String(args.mes).trim()}%`);
				condicoes.push(`to_char(t.date, 'YYYY-MM') like $${params.length}`);
			}
			const where = condicoes.length ? `where ${condicoes.join(" and ")}` : "";
			const { rows } = await db.query(
				`select t.ticket_number, t.date, t.status, st.name as tipo_servico
				 from rot_tickets t left join rot_service_types st on st.id = t.service_type_id
				 ${where} order by t.date desc limit 25`,
				params,
			);
			return { total: rows.length, itens: rows };
		},
	},
	{
		name: "consultarPlantoes",
		description: "Lista plantoes/escalas — atuais, proximos ou passados. Mostra quem esta escalado e o periodo.",
		parameters: {
			type: "OBJECT",
			properties: {
				periodo: { type: "STRING", enum: ["proximos", "atuais", "passados"], description: "Qual recorte de plantoes retornar" },
			},
		},
		permission: null,
		async handler(req, args) {
			const regionalScope = scopeRegionalFilter(req);
			const params = regionalScope ? [regionalScope] : [];
			const where = regionalScope ? `where s.regional_id = $1` : "";
			const periodo = args?.periodo || "proximos";
			const ordem = periodo === "passados" ? "s.start_at desc" : "s.start_at asc";
			const filtroTempo = periodo === "proximos" ? "s.end_at >= now()" : periodo === "passados" ? "s.end_at < now()" : "s.start_at <= now() and s.end_at >= now()";
			const { rows } = await db.query(
				`select s.tipo, s.start_at, s.end_at, r.nome as regional_nome,
					(select array_agg(u.name) from rot_users u where u.id = any(s.team_ids)) as equipe
				 from rot_shifts s
				 left join regionais r on r.id = s.regional_id
				 ${where ? `${where} and ${filtroTempo}` : `where ${filtroTempo}`}
				 order by ${ordem} limit 20`,
				params,
			);
			return { itens: rows };
		},
	},
	{
		name: "consultarAusencias",
		description: "Lista quem esta ou vai ficar de ferias, folga ou atestado. Filtro opcional: status ('pendente' ou 'aprovado').",
		parameters: {
			type: "OBJECT",
			properties: { status: { type: "STRING", enum: ["pendente", "aprovado", "recusado"] } },
		},
		permission: null,
		async handler(req, args) {
			const regionalScope = scopeRegionalFilter(req);
			const condicoes = [];
			const params = [];
			if (regionalScope) {
				params.push(regionalScope);
				condicoes.push(`a.regional_id = $${params.length}`);
			}
			if (args?.status) {
				params.push(args.status);
				condicoes.push(`a.status = $${params.length}`);
			}
			params.push(absenceReadTypes(req.rotUser));
			condicoes.push(`a.type = any($${params.length}::text[])`);
			const where = `where ${condicoes.join(" and ")}`;
			const { rows } = await db.query(
				`select u.name as colaborador, a.type as tipo, a.start_date, a.end_date, a.status
				 from rot_absences a join rot_users u on u.id = a.user_id
				 ${where} order by a.start_date desc limit 25`,
				params,
			);
			return { itens: rows };
		},
	},
	{
		name: "consultarFeriados",
		description: "Lista os proximos feriados cadastrados (nacionais, regionais ou municipais).",
		parameters: { type: "OBJECT", properties: {} },
		permission: null,
		async handler(req) {
			const regionalScope = scopeRegionalFilter(req);
			const { rows } = await db.query(
				regionalScope
					? `select title, date, type from rot_holidays where date >= current_date and (regional_id is null or regional_id = $1) order by date asc limit 15`
					: `select title, date, type from rot_holidays where date >= current_date order by date asc limit 15`,
				regionalScope ? [regionalScope] : [],
			);
			return { itens: rows };
		},
	},
	{
		name: "consultarAgenda",
		description: "Lista atividades/visitas agendadas (agenda de campo). Filtro opcional: status ('pendente', 'concluida' ou 'cancelada').",
		parameters: {
			type: "OBJECT",
			properties: { status: { type: "STRING", enum: ["pendente", "concluida", "cancelada"] } },
		},
		permission: null,
		async handler(req, args) {
			const regionalScope = scopeRegionalFilter(req);
			const condicoes = [];
			const params = [];
			if (regionalScope) {
				params.push(regionalScope);
				condicoes.push(`a.regional_id = $${params.length}`);
			}
			if (args?.status) {
				params.push(args.status);
				condicoes.push(`a.status = $${params.length}`);
			}
			const where = condicoes.length ? `where ${condicoes.join(" and ")}` : "";
			const { rows } = await db.query(
				`select a.client_name as cliente, a.date, a.time, a.status, a.priority, u.name as tecnico
				 from rot_activities a left join rot_users u on u.id = a.user_id
				 ${where} order by a.date asc limit 25`,
				params,
			);
			return { itens: rows };
		},
	},
	{
		name: "consultarRanking",
		description: "Lista o ranking de performance dos tecnicos no mes atual (chamados atendidos e pontos).",
		parameters: { type: "OBJECT", properties: {} },
		permission: null,
		async handler(req) {
			const regionalScope = scopeRegionalFilter(req);
			const params = regionalScope ? [regionalScope] : [];
			const where = regionalScope ? `where t.regional_id = $1 and t.date >= date_trunc('month', current_date)` : `where t.date >= date_trunc('month', current_date)`;
			const { rows } = await db.query(
				`select u.name, count(distinct t.id) as chamados, coalesce(sum(st.points), 0) as pontos
				 from rot_tickets t
				 cross join lateral unnest(t.team_ids) as member(user_id)
				 join rot_users u on u.id = member.user_id
				 left join rot_service_types st on st.id = t.service_type_id
				 ${where}
				 group by u.name order by pontos desc, chamados desc limit 10`,
				params,
			);
			return { itens: rows };
		},
	},
];

const toolPermissions = {
	consultarChamados: READ_PERMISSIONS.tickets,
	consultarPlantoes: READ_PERMISSIONS.shifts,
	consultarAusencias: READ_PERMISSIONS.absences,
	consultarAgenda: READ_PERMISSIONS.activities,
	consultarRanking: READ_PERMISSIONS.ranking,
};
for (const tool of TOOLS) {
	tool.permission = toolPermissions[tool.name] || tool.permission;
	const handler = tool.handler;
	tool.handler = async (req, args) => {
		if (!userHasRotPermission(req.rotUser, tool.permission)) {
			const error = new Error("Sem permissao para consultar esses dados.");
			error.status = 403;
			throw error;
		}
		return handler(req, args);
	};
}

/** So as tools que o usuario da conversa tem permissao de usar. */
function buildAvailableTools(rotUser) {
	return TOOLS.filter((tool) => userHasRotPermission(rotUser, tool.permission));
}

function findTool(name) {
	return TOOLS.find((tool) => tool.name === name) || null;
}

module.exports = { TOOLS, buildAvailableTools, findTool };
