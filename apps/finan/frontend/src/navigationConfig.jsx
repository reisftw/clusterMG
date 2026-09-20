// Fonte única de verdade da navegação do Finan (menu lateral, busca local
// do menu e favoritos). Antes desta refatoração, a mesma informação vivia
// espalhada em `navGroups` dentro de FinanLayout.jsx sem nenhuma metadata
// de busca/badge — este arquivo não inventa rota nova nenhuma, só reorganiza
// os MESMOS itens (mesmos `FINAN_ROUTES`, mesmas permissões) em 6 grupos por
// intenção de uso, com `keywords` pra busca local e `badgeKey` pra ligar com
// os contadores de `fetchFinanContadoresNavegacao` (navegacao/routes.js).
//
// Cada item: { id, label, path?, icon, permission, badgeKey?, keywords?,
// description?, children? }. `permission` segue a mesma regra de sempre
// (null = aberto a todo autenticado; string ou array = ver canAccess em
// FinanLayout.jsx); filho sem `permission` própria herda a do pai (usar
// `"permission" in child` pra distinguir "não definiu" de "definiu null" —
// ver DADOS_ORCAMENTARIOS/CONFIGURACAO_GERAL abaixo).
import {
	Activity,
	AlertTriangle,
	BadgeCheck,
	BarChart3,
	Bell,
	Building2,
	CalendarDays,
	CircleDollarSign,
	ClipboardList,
	Compass,
	CreditCard,
	Database,
	FileCheck2,
	FileCode2,
	FileSignature,
	FileText,
	Gauge,
	Landmark,
	LayoutDashboard,
	LineChart,
	ListChecks,
	Lock as LockIcon,
	Mail,
	Paperclip,
	Plug,
	ReceiptText,
	Scale,
	Settings,
	ShieldCheck,
	Sparkles,
	Tags,
	Target,
	Users,
	Users2,
	WalletCards,
} from "lucide-react";
import { FINAN_ROUTES } from "./routes";
import { ShieldIcon } from "./navigationIcons";

export const NAV_SECTIONS = [
	{
		id: "inicio",
		label: "Início",
		// Sem acordeão: itens diretos, sempre visíveis (ver seção 8 do pedido
		// do usuário — Início não precisa de acordeão por ter itens diretos).
		accordion: false,
		items: [
			{
				id: "dashboard",
				label: "Dashboard",
				path: FINAN_ROUTES.DASHBOARD,
				icon: LayoutDashboard,
				permission: "finan.dashboard.view",
				keywords: ["inicio", "home", "resumo"],
			},
			{
				id: "calendario",
				label: "Calendário Financeiro",
				path: FINAN_ROUTES.CALENDARIO,
				icon: CalendarDays,
				// Aberto a todo mundo de proposito: o calendario e pensado como
				// ponto de entrada do dia a dia. Criar/editar evento exige
				// finan.calendario.manage, checado dentro da propria pagina.
				permission: null,
				keywords: ["calendario", "agenda", "vencimentos", "eventos"],
			},
			{
				id: "pendencias",
				label: "Central de Pendências",
				path: FINAN_ROUTES.PENDENCIAS,
				icon: ClipboardList,
				permission: "finan.pendencias.view",
				badgeKey: "pendencias",
				keywords: ["pendencias", "atencao", "vencidas", "duplicidades"],
			},
		],
	},
	{
		id: "operacao-financeira",
		label: "Operação Financeira",
		accordion: true,
		items: [
			{
				id: "contas-pagar",
				label: "Contas a Pagar",
				path: FINAN_ROUTES.CONTAS_PAGAR,
				icon: Landmark,
				permission: "finan.contas_pagar.view",
				keywords: ["contas a pagar", "pagamento", "pagamentos", "fornecedor a pagar"],
			},
			{
				id: "contas-receber",
				label: "Contas a Receber",
				path: FINAN_ROUTES.CONTAS_RECEBER,
				icon: FileCheck2,
				permission: "finan.contas_receber.view",
				keywords: ["contas a receber", "recebimento", "recebimentos", "cliente"],
			},
			{
				id: "faturamento",
				label: "Faturamento",
				path: FINAN_ROUTES.FATURAMENTO,
				icon: Building2,
				permission: "finan.faturamento.view",
				keywords: ["faturamento", "faturas"],
			},
			{
				id: "notas",
				label: "Notas Fiscais",
				path: FINAN_ROUTES.NOTAS,
				icon: FileText,
				permission: "finan.notas.view",
				keywords: ["nota", "notas fiscais", "nf", "nfe"],
			},
			{
				id: "gestao-fornecedores",
				label: "Gestão de Fornecedores",
				icon: Users2,
				permission: "finan.gestao_orcamentaria.view",
				keywords: ["fornecedor", "fornecedores", "contratos"],
				children: [
					{
						id: "fornecedores",
						label: "Fornecedores",
						path: FINAN_ROUTES.FORNECEDORES,
						icon: Users2,
						keywords: ["forn", "fornecedor", "fornecedores", "central de fornecedores"],
					},
					{
						id: "contratos",
						label: "Contratos Recorrentes",
						path: FINAN_ROUTES.CONTRATOS,
						icon: FileSignature,
						permission: "finan.contratos.view",
						keywords: ["forn", "contrato", "contratos", "recorrente"],
					},
				],
			},
		],
	},
	{
		id: "planejamento",
		label: "Planejamento",
		accordion: true,
		items: [
			{
				id: "orcamento",
				label: "Orçamento",
				path: FINAN_ROUTES.GESTAO_ORCAMENTARIA,
				icon: CircleDollarSign,
				permission: "finan.gestao_orcamentaria.view",
				keywords: ["orcamento", "gestao orcamentaria", "planejamento"],
				children: [
					{
						id: "orcamento-visao-geral",
						label: "Visão Geral",
						path: FINAN_ROUTES.ORCAMENTO_VISAO_GERAL,
						icon: LayoutDashboard,
					},
					{
						id: "orcamento-lancamentos",
						// UX_AUDIT.md, Fase 4: renomeado de "Orçamento" — o nome
						// genérico, colado com o item "Centros de Custo" logo abaixo,
						// dava a entender que eram a mesma tela (Top 10 #2). Esta
						// mostra o orçamento AGRUPADO POR CATEGORIA; "Centros de
						// Custo" mostra cada centro individualmente, com responsável
						// e % de uso — a `description` reforça a diferença pra quem
						// usa a busca do menu.
						label: "Orçamento por Categoria",
						description: "Gasto agrupado por categoria de despesa, somando os centros de custo de cada uma.",
						path: FINAN_ROUTES.ORCAMENTO,
						icon: CircleDollarSign,
						keywords: ["orcamento", "categoria", "orcamento por categoria"],
					},
					{
						id: "orcamento-centros-custo",
						label: "Centros de Custo",
						description: "Um centro de custo por vez, com responsável e % de uso do orçamento — pra achar quem estourou.",
						path: FINAN_ROUTES.ORCAMENTO_CENTROS_CUSTO,
						icon: Gauge,
						keywords: [
							"centro de custo",
							"centros de custo",
							"estourou",
							"estourado",
							"na media",
							"responsavel",
							"desempenho",
						],
					},
					{
						id: "orcamento-aprovacoes",
						label: "Aprovações",
						path: FINAN_ROUTES.APROVACOES,
						permission: "finan.gestao_orcamentaria.manage",
						icon: FileCheck2,
						keywords: ["aprovacoes", "aprovar"],
					},
					{
						id: "orcamento-configuracoes",
						label: "Configurações Orçamentárias",
						path: FINAN_ROUTES.ORCAMENTO_CONFIGURACOES,
						permission: "finan.gestao_orcamentaria.manage",
						icon: Settings,
					},
					{
						id: "fechamento-mensal",
						label: "Fechamento Mensal",
						path: FINAN_ROUTES.FECHAMENTO_MENSAL,
						icon: LockIcon,
						keywords: ["fechamento", "fechamento mensal"],
					},
					{
						id: "metas",
						label: "Metas Financeiras",
						path: FINAN_ROUTES.METAS,
						icon: Target,
						keywords: ["metas", "objetivos"],
					},
				],
			},
		],
	},
	{
		id: "analises",
		label: "Análises",
		accordion: true,
		items: [
			{
				id: "relatorios",
				label: "Relatórios",
				path: FINAN_ROUTES.REPORTS,
				icon: BarChart3,
				permission: "finan.reports.view",
				keywords: ["relatorios", "reports"],
				children: [
					{
						id: "relatorios-serasa",
						label: "Serasa",
						path: FINAN_ROUTES.REPORTS_SERASA,
						icon: ShieldIcon,
						keywords: ["serasa"],
					},
					{
						id: "relatorios-tarifas",
						label: "Tarifas",
						path: FINAN_ROUTES.REPORTS_TARIFAS,
						icon: Tags,
						keywords: ["tarifas"],
						children: [
							{
								id: "relatorios-tarifas-visao-geral",
								label: "Visão Geral",
								path: FINAN_ROUTES.REPORTS_VISAO_GERAL,
								icon: LayoutDashboard,
							},
							{
								id: "relatorios-tarifas-faturas",
								label: "Faturas",
								path: FINAN_ROUTES.REPORTS_FATURAS,
								icon: FileText,
							},
							{
								id: "relatorios-tarifas-receitas",
								label: "Receitas",
								path: FINAN_ROUTES.REPORTS_RECEITAS,
								icon: LineChart,
							},
							{
								id: "relatorios-tarifas-formas-pagamento",
								label: "Formas de Pagamento",
								path: FINAN_ROUTES.REPORTS_FORMAS_PAGAMENTO,
								icon: CreditCard,
								keywords: ["pagamento", "formas de pagamento"],
							},
						],
					},
				],
			},
			{
				id: "indicadores-financeiros",
				label: "Indicadores",
				path: FINAN_ROUTES.RELATORIOS_FINANCEIROS,
				icon: ReceiptText,
				permission: ["relatorios_financeiros:visualizar", "relatorios_financeiros:gerenciar"],
				keywords: ["indicadores financeiros", "dre", "fluxo de caixa", "balanco"],
				children: [
					{
						id: "dre",
						label: "DRE",
						path: FINAN_ROUTES.DRE,
						icon: LineChart,
						description: "Demonstra resultado, receitas, custos, despesas e margens do período.",
					},
					{
						id: "fluxo-caixa",
						label: "Fluxo de Caixa",
						path: FINAN_ROUTES.RELATORIOS_FLUXO_CAIXA,
						icon: WalletCards,
						description: "Acompanha entradas e saídas reais de dinheiro no caixa e nas contas bancárias no regime de caixa.",
						keywords: ["fluxo de caixa", "caixa"],
					},
					{
						id: "balanco-patrimonial",
						label: "Balanço Patrimonial",
						path: FINAN_ROUTES.RELATORIOS_BALANCO_PATRIMONIAL,
						icon: Scale,
						description: "Apresenta ativos, passivos, patrimônio líquido e obrigações da empresa.",
					},
					{
						id: "conciliacao-bancaria",
						label: "Conciliação Bancária",
						path: FINAN_ROUTES.RELATORIOS_CONCILIACAO_BANCARIA,
						icon: Landmark,
						description: "Cruza lançamentos do sistema com extratos bancários da Sempre Internet.",
					},
					{
						id: "qualidade-dados",
						label: "Qualidade de Dados",
						path: FINAN_ROUTES.QUALIDADE_DADOS,
						icon: BadgeCheck,
						permission: "finan.qualidade_dados.view",
						description: "Saúde do cadastro e dos lançamentos — fornecedor sem CNPJ, duplicidade, CNPJ inválido.",
						keywords: ["qualidade", "data quality", "score", "cnpj invalido", "duplicidade", "saude do dado"],
					},
					{
						id: "anexos",
						label: "Biblioteca de Documentos",
						path: FINAN_ROUTES.ANEXOS,
						icon: Paperclip,
						permission: "finan.anexos.view",
						description: "Anexos centralizados com detecção de duplicado e versionamento.",
						keywords: ["anexos", "documentos", "biblioteca", "versionamento", "duplicado", "hash"],
					},
				],
			},
			{
				id: "central-indicadores",
				label: "Central de Indicadores",
				path: FINAN_ROUTES.INDICADORES,
				icon: Gauge,
				// Historicamente vivia dentro de Gestão Orçamentária, herdando
				// finan.gestao_orcamentaria.view — mantido igual, só mudou de
				// lugar no menu (é uma página de indicadores customizáveis,
				// genuinamente distinta do DRE/Fluxo de Caixa acima).
				permission: "finan.gestao_orcamentaria.view",
				keywords: ["central de indicadores", "kpi", "indicadores customizados"],
			},
			{
				id: "inteligencia",
				label: "Inteligência Financeira",
				path: FINAN_ROUTES.INTELIGENCIA,
				icon: Sparkles,
				permission: "finan.gestao_orcamentaria.view",
				keywords: ["inteligencia", "victorinho", "financeirinho", "anomalias", "forecast", "score"],
			},
		],
	},
	{
		id: "automacoes",
		label: "Automações",
		accordion: true,
		items: [
			{
				id: "notificacoes-central",
				label: "Central de Notificações",
				path: FINAN_ROUTES.NOTIFICACOES_CENTRAL,
				icon: Bell,
				// Aberto pra todo mundo autenticado — a visibilidade de cada
				// notificacao ja e filtrada individualmente no backend
				// (finan_notifications.target_permissions/target_role_ids).
				permission: null,
				badgeKey: "notificacoes",
				keywords: ["notificacoes", "avisos", "alertas"],
			},
		],
	},
	{
		id: "administracao",
		label: "Administração",
		accordion: true,
		// Baixa prioridade visual no dia a dia — ver seção 15 do pedido do
		// usuário: fica colapsada por padrão (não é a rota ativa nem foi
		// aberta manualmente na sessão).
		collapsedByDefault: true,
		items: [
			{
				id: "equipe",
				label: "Equipe",
				path: FINAN_ROUTES.EQUIPE,
				icon: Users,
				permission: "finan.equipe.view",
				keywords: ["equipe", "colaboradores", "setores", "cargos"],
			},
			{
				id: "configuracoes",
				label: "Configurações",
				path: FINAN_ROUTES.CONFIGURACAO_GERAL,
				icon: Settings,
				permission: "finan.configuracoes.view",
				keywords: ["configuracoes", "ajustes"],
				children: [
					{
						id: "config-geral",
						label: "Geral",
						path: FINAN_ROUTES.CONFIGURACAO_GERAL,
						icon: Settings,
						// Aberto pra todo mundo de proposito: quem tem
						// finan.configuracoes.view ve as configuracoes admin; quem
						// nao tem ve "Minha conta" (senha/avatar/PIN) no mesmo lugar
						// — ver ConfiguracaoGeralRoute em App.jsx.
						permission: null,
					},
					{
						id: "config-notificacoes",
						label: "Notificações",
						path: FINAN_ROUTES.CONFIG_NOTIFICACOES,
						icon: Bell,
						// Tambem aberto pra todo mundo — a API de notificacoes ja
						// nao exige nenhuma permissao especial, so estava escondida.
						permission: null,
					},
					{
						id: "config-usuarios",
						label: "Usuários",
						path: FINAN_ROUTES.CONFIG_USUARIOS,
						icon: Users,
						keywords: ["usuarios", "cadastro de usuarios"],
					},
					{
						id: "config-cargos-permissoes",
						label: "Cargos e Permissões",
						path: FINAN_ROUTES.CONFIG_CARGOS_PERMISSOES,
						icon: FileCheck2,
						keywords: ["cargos", "permissoes", "rbac"],
					},
					{
						id: "config-banco-dados",
						label: "Banco de Dados",
						path: FINAN_ROUTES.CONFIG_BANCO_DADOS,
						icon: Database,
						keywords: ["banco de dados", "backup", "restore"],
					},
					{
						id: "config-email",
						label: "E-mail",
						path: FINAN_ROUTES.CONFIG_EMAIL,
						icon: Mail,
						keywords: ["email", "e-mail", "smtp"],
					},
				],
			},
			{
				id: "integracoes",
				label: "Integrações",
				path: FINAN_ROUTES.CONFIG_INTEGRACOES_APIS,
				icon: Plug,
				permission: "finan.configuracoes.view",
				keywords: ["integracoes", "api"],
				children: [
					{
						id: "integracoes-apis",
						label: "APIs",
						path: FINAN_ROUTES.CONFIG_INTEGRACOES_APIS,
						icon: Plug,
						keywords: ["api", "apis"],
					},
					{
						id: "integracoes-hubsoft",
						label: "Hubsoft",
						path: FINAN_ROUTES.CONFIG_HUBSOFT,
						icon: Plug,
						keywords: ["hubsoft"],
					},
					{
						id: "integracoes-cvortex",
						label: "Cvortex",
						path: FINAN_ROUTES.CONFIG_CVORTEX,
						icon: Plug,
						keywords: ["cvortex"],
					},
					{
						id: "integracoes-senior",
						label: "Sênior",
						path: FINAN_ROUTES.CONFIG_SENIOR,
						icon: Plug,
						keywords: ["senior", "sapiens"],
					},
					{
						id: "integracoes-jobs",
						label: "Central de Jobs",
						path: FINAN_ROUTES.JOBS_INTEGRACOES,
						icon: ListChecks,
						keywords: ["jobs", "central de jobs", "backup", "alertas", "reprocessar"],
					},
					{
						id: "integracoes-observabilidade",
						label: "Observabilidade",
						path: FINAN_ROUTES.OBSERVABILIDADE,
						icon: Activity,
						keywords: ["observabilidade", "uptime", "latencia", "erros", "postgres"],
					},
					{
						id: "integracoes-api-docs",
						label: "API (v1)",
						path: FINAN_ROUTES.API_DOCS,
						icon: FileCode2,
						keywords: ["api", "v1", "openapi", "swagger", "documentacao"],
					},
					{
						id: "integracoes-regras",
						label: "Regras Financeiras",
						path: FINAN_ROUTES.REGRAS_FINANCEIRAS,
						icon: AlertTriangle,
						keywords: ["regras", "limiar", "alerta", "pendencia critica"],
					},
					{
						id: "integracoes-webhooks",
						label: "Webhooks",
						path: FINAN_ROUTES.WEBHOOKS,
						icon: Plug,
						keywords: ["webhook", "evento", "automacao externa"],
					},
					{
						id: "integracoes-conciliacao",
						label: "Conciliação Bancária",
						path: FINAN_ROUTES.CONCILIACAO,
						icon: Landmark,
						keywords: ["conciliacao", "extrato", "banco", "conferencia"],
					},
				],
			},
			{
				id: "seguranca-auditoria",
				label: "Segurança e Auditoria",
				path: FINAN_ROUTES.CONFIG_LOGS_AUDITORIA,
				icon: ShieldCheck,
				permission: "finan.configuracoes.view",
				keywords: ["seguranca", "auditoria", "logs"],
				children: [
					{
						id: "logs-auditoria",
						label: "Logs de Auditoria",
						path: FINAN_ROUTES.CONFIG_LOGS_AUDITORIA,
						icon: LineChart,
						keywords: ["auditoria", "logs"],
					},
					{
						id: "central-dados",
						label: "Central de Dados",
						path: FINAN_ROUTES.CENTRAL_DADOS,
						icon: Database,
						// Substitui os 3 itens antigos ("Dados" em Orçamento, "Central
						// de Importações" em Integrações, "Caixa de Entrada" no topo)
						// — removidos do menu a pedido do usuário (2026-09-10) pra não
						// duplicar ponto de entrada da mesma tela. `permission` em
						// array = visível pra quem tem QUALQUER uma das 3 permissões
						// que os itens antigos exigiam (união, não interseção —
						// ninguém perde acesso por causa da fusão); cada aba dentro da
						// página segue checando a sua própria permissão
						// especificamente (ver FinanCentralDadosPage.jsx). `badgeKey`
						// migrado do antigo item "Caixa de Entrada", pra não perder o
						// contador de pendências.
						permission: [
							"finan.gestao_orcamentaria.manage",
							"finan.configuracoes.view",
							"finan.notas.view",
						],
						badgeKey: "caixaEntrada",
						keywords: [
							"central de dados",
							"upload",
							"envio de arquivo",
							"planilha",
							"importar",
							"ocr",
							"dados orcamentarios",
							"caixa de entrada",
						],
					},
				],
			},
			{
				id: "roteiro",
				label: "Roteiro Finan",
				path: FINAN_ROUTES.ROTEIRO,
				icon: Compass,
				// Aberto pra todo mundo ver o andamento; marcar status exige
				// finan.configuracoes.manage (checado dentro da propria pagina).
				permission: null,
				keywords: ["roteiro", "roadmap", "cronograma"],
			},
		],
	},
];

// Achata a árvore inteira (sem filtrar por permissão — isso é feito na hora
// de renderizar/favoritar, olhando pro `user` atual) pra alimentar a busca
// local do menu e a validação de favoritos.
export function flattenNavItems(sections = NAV_SECTIONS) {
	const flat = [];
	function walk(items, parentPermission) {
		for (const item of items) {
			const effectivePermission = "permission" in item ? item.permission : parentPermission;
			flat.push({ ...item, permission: effectivePermission });
			if (item.children?.length) walk(item.children, effectivePermission);
		}
	}
	for (const section of sections) walk(section.items, null);
	return flat;
}
