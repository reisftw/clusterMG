// Roteiro Finan — checklist de evolucao do produto (25 ideias discutidas
// com o usuario, organizadas em 3 fases). O catalogo de itens vive aqui no
// frontend (ROADMAP); o backend so guarda o status marcado por item
// (finan_settings, chave "roteiro_status", via compat/routes.js:
// GET/PUT /roteiro-status). Ver tambem o artefato publicado na conversa
// (versao local, sem persistencia compartilhada) que deu origem a este
// catalogo.
import { CheckCircle2, Circle, Compass, Loader2, RefreshCw, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchFinanRoadmapStatus, saveFinanRoadmapStatus } from "../api/finanApi";
import { useFinanAuth } from "../state/FinanAuthContext";

const ROADMAP = [
	{
		group: "Fase 1 — Fundação",
		note: "Não depende de histórico nem de módulos que ainda não existem. Cinco ondas de execução, cada item vira um commit único.",
		gate: null,
		phases: [
			{
				code: "1A",
				title: "Qualidade de dado e governança básica",
				why: "Reduz o risco do futuro backfill de 3 anos e dá a primeira camada de confiança nos lançamentos.",
				items: [
					{ id: "p17", num: "#17", title: "Importação inteligente de planilhas", desc: "Reconhece automaticamente o layout de uma planilha já vista (\"reconhecemos o layout Serasa\") e deixa confirmar o mapeamento de colunas novas." },
					{ id: "p14", num: "#14", title: "Detecção de duplicidade", desc: "Fornecedor + valor + data em janela curta, com % de similaridade — pensado para não confundir recorrência (aluguel, softwares) com duplicata real." },
					{ id: "p19", num: "#19", title: "Velocidade de consumo do orçamento", desc: "Mostra % utilizado contra % do mês transcorrido, com aviso quando o ritmo de gasto está acima do esperado." },
					{ id: "p11", num: "#11", title: "Auditoria avançada — completar", desc: "Já entregue (filtros por usuário/módulo/entidade/ação/data + diff antes/depois). Falta só filtro por faixa de valor e por fornecedor." },
				],
			},
			{
				code: "1B",
				title: "Pendências e fechamento",
				why: "Depende da onda 1A existir para o checklist de fechamento ter pendências reais para checar.",
				items: [
					{ id: "p13", num: "#13", title: "Central de Pendências", desc: "Lista única do que precisa de atenção: lançamentos sem categoria, integrações com erro, falhas de importação de relatórios." },
					{ id: "p10", num: "#10", title: "Timeline do lançamento", desc: "Histórico por registro (importado → categorizado → alterado → conferido), em cima da auditoria que já existe." },
					{ id: "p12", num: "#12", title: "Fechamento Mensal", desc: "Checklist do período + trava de edição após fechado (exige justificativa registrada para alterar depois)." },
				],
			},
			{
				code: "1C",
				title: "Fornecedores e contratos",
				why: "Módulo novo e autocontido — não depende de nada que falta, só precisa de tabela própria.",
				items: [
					{ id: "p8", num: "#8", title: "Central de Fornecedores", desc: "Ficha por fornecedor: total gasto, categorias, média mensal, maior lançamento, evolução — a partir do orçamento já importado." },
					{ id: "p9", num: "#9", title: "Dependência de fornecedor", desc: "Índice de concentração de gasto por fornecedor/categoria, extensão direta da Central de Fornecedores." },
					{ id: "p6", num: "#6", title: "Contratos recorrentes", desc: "Cadastro de aluguel, softwares, links, seguros: fornecedor, valor, periodicidade, vencimento, reajuste, responsável — com alerta de vencimento." },
					{ id: "p7", num: "#7", title: "Controle de reajustes", desc: "Registra reajuste de um contrato e compara com o valor e o índice anteriores do mesmo contrato.", dep: "depende de #6" },
				],
			},
			{
				code: "1D",
				title: "Produtividade",
				why: "Features de uso do dia a dia, sem dependência de dado histórico.",
				items: [
					{ id: "p25", num: "#25", title: "Central de indicadores", desc: "Usuário cria KPI próprio por fórmula (ex.: despesas ÷ clientes ativos), reaproveitável pelo Finan Score mais adiante." },
					{ id: "p18", num: "#18", title: "Metas financeiras", desc: "Meta contra o orçamento corrente, com barra de progresso e projeção de quando deve ser atingida no ritmo atual." },
					{ id: "p21", num: "#21", title: "Favoritos / dashboard pessoal", desc: "Cada usuário fixa os indicadores que mais usa numa visão pessoal." },
					{ id: "p22", num: "#22", title: "Busca global", desc: "v1 sobre o que já existe (fornecedores, lançamentos, integrações); cresce conforme novos módulos entram." },
				],
			},
			{
				code: "1E",
				title: "Victorinho v1 e Insights",
				why: "Depende das ondas anteriores existirem — é a camada de conversa e resumo em cima delas.",
				items: [
					{ id: "p23", num: "#23", title: "Comandos em linguagem natural (v1)", desc: "Catálogo fechado de perguntas sobre o mês corrente, sem LLM externo — determinístico e sem custo por chamada." },
					{ id: "p24", num: "#24", title: "Victorinho proativo", desc: "Camada de personalidade sobre o #23: \"encontrei 3 coisas para você\" em vez de só responder quando perguntado." },
					{ id: "p1", num: "#1", title: "Finan Insights / Resumo Semanal", desc: "Junta Pendências + Fornecedores + Orçamento num resumo em texto fixo (sem IA), tipo \"R$ 84 mil previstos para vencer em 7 dias\"." },
				],
			},
		],
	},
	{
		group: "Fase 2 — Inteligência",
		note: "Cada item precisa de meses reais de histórico para a matemática fazer sentido. Liberado quando o backfill dos 3 anos de planilhas antigas for concluído.",
		gate: "Aguarda backfill de histórico",
		phases: [
			{
				code: "2",
				title: "Comparação, previsão e pontuação",
				why: "Cada item usa o anterior como base de dados — nessa ordem específica.",
				items: [
					{ id: "p3", num: "#3", title: "Comparador de períodos", desc: "Setembro × agosto, ou setembro/2026 × setembro/2025 — receita, despesa, orçamento utilizado, fornecedores, com destaque automático do que mais mudou." },
					{ id: "p2", num: "#2", title: "Detecção de anomalias", desc: "Compara um lançamento novo contra a média/desvio-padrão histórico do mesmo fornecedor ou categoria.", dep: "usa a base do #3" },
					{ id: "p4", num: "#4", title: "Forecast financeiro", desc: "Receita/despesa/saldo projetados para o próximo mês por média móvel + sazonalidade, em cenários conservador/provável/otimista.", dep: "usa a base do #3" },
					{ id: "p5", num: "#5", title: "Finan Score", desc: "Nota 0–100 combinando orçamento comprometido, variação de despesas, previsibilidade, inadimplência e concentração de fornecedor — fórmula a desenhar junto antes de codar.", dep: "depende de #2 e #4" },
					{ id: "p20", num: "#20", title: "Simulador financeiro", desc: "\"E se despesas com energia subirem 10%?\" — roda o forecast com premissa alterada, sem tocar nos dados reais.", dep: "depende de #4" },
				],
			},
		],
	},
	{
		group: "Fase 3 — Documentos e IA",
		note: "Bloqueada por um módulo que ainda não existe de verdade no Finan: Notas Fiscais / Contas a Pagar / Contas a Receber hoje são só telas de indicadores fixos, sem lançamento real por trás. Esse módulo entra como pré-requisito antes de qualquer item desta fase.",
		gate: "Aguarda módulo de Notas/Contas",
		phases: [
			{
				code: "3",
				title: "Documentos, entrada e extração",
				why: "OCR e caixa de entrada só fazem sentido depois de existir uma entidade \"nota/documento\" para anexar o resultado.",
				items: [
					{ id: "p0", num: "pré-req.", title: "Módulo de Notas / Contas a Pagar / Contas a Receber", desc: "Hoje são telas com indicadores fixos, sem lançamento real por trás. Precisa nascer antes dos dois itens abaixo." },
					{ id: "p16", num: "#16", title: "Caixa de entrada financeira", desc: "Upload de PDF/XML/imagem com pipeline Recebidos → Processando → Conferir → Importados.", dep: "depende do módulo de Notas" },
					{ id: "p15", num: "#15", title: "OCR inteligente", desc: "Extrai CNPJ, fornecedor, número, vencimento e valor de uma nota para confirmação manual. Provedor já decidido: Google Document AI.", dep: "depende do módulo de Notas" },
				],
			},
		],
	},
	{
		// 24 ideias trazidas pelo usuario em 2026-09-10 (avaliacao de
		// funcionalidades enterprise de FP&A/plataforma). Mapeadas em 6 ondas
		// por ordem de dependencia real, nao por empolgacao — varias sao
		// extensao direta de itens que ja estavam no roteiro (marcado com
		// "estende #N" no dep) e duas dependem do mesmo bloqueio da Fase 3
		// (modulo de Notas/Contas real). "Forecast Rolling 12 Meses" do
		// pedido original NAO virou item novo: e exatamente o #4 (Forecast
		// financeiro) que ja existe na Fase 2 — citado aqui so pra nao
		// duplicar.
		group: "Fase 4 — Plataforma, Governança e Inteligência Avançada",
		note: "Onda 4A é a única com risco real de escopo (Rule Engine e Workflow): recomendação é nascer pequena — regra parametrizável, não motor genérico — e crescer com uso real, não codar o motor completo de uma vez. As demais ondas são engenharia direta, sem incerteza de design.",
		gate: null,
		phases: [
			{
				code: "4A",
				title: "Infraestrutura de plataforma",
				why: "Não depende de nenhum dado de negócio novo, mas é a base que as ondas seguintes (e o próprio módulo de Notas da Fase 3) vão reaproveitar — por isso entra primeiro, mesmo não sendo a mais vistosa.",
				items: [
					{ id: "p26", num: "#26", title: "API interna oficial do Finan (/api/v1)", desc: "Versionar as rotas existentes sob /api/v1, com DTOs, paginação e erros padronizados, e documentação OpenAPI/Swagger publicada. Viável, mas é o maior item de engenharia pura da lista inteira — significa revisar e recontratar ~15 arquivos de rota já em produção, não só escrever rota nova." },
					{ id: "p27", num: "#27", title: "Observabilidade", desc: "Painel técnico (uptime, latência, erros 4xx/5xx, tamanho do Postgres, backups, filas) separado do financeiro. Parte do dado já existe solto (journalctl, estatísticas do Postgres); falta instrumentar as rotas para registrar isso de forma estruturada — trabalho real, não só montar tela." },
					{ id: "p28", num: "#28", title: "Central de Jobs e Integrações", desc: "Última execução, próxima, duração, registros processados, erros e botão de reprocessar para cada tarefa automática (calendário, backup, importação de orçamento). Precisa de uma tabela de registro de execução — hoje cada job só loga no próprio arquivo de log do servidor." },
					{ id: "p29", num: "#29", title: "Qualidade de Dados / Data Quality Score", desc: "Painel de saúde: fornecedores sem CNPJ, lançamentos sem classe, duplicados, CPF/CNPJ inválido. Viável e de baixo risco — boa parte das checagens já é a mesma consulta que alimenta a Central de Pendências (#13); aqui vira painel dedicado com um placar único (ex.: 97,4%)." },
					{ id: "p30", num: "#30", title: "Sistema de anexos centralizado", desc: "Biblioteca de documentos com hash, versionamento, categoria e detecção de duplicado, vinculável a fornecedor/contrato/nota. Vale construir aqui, de forma genérica, precisamente porque o módulo de Notas da Fase 3 (#0) vai precisar disso — evita reconstruir depois." },
				],
			},
			{
				code: "4B",
				title: "Produtividade sobre o que já existe",
				why: "Todos os itens desta onda são extensão direta de algo que já estava no roteiro (Fases 1 e 2) — baixo risco, sem depender de módulo novo.",
				items: [
					{ id: "p31", num: "#31", title: "Busca Global — Command Palette (Ctrl+K)", desc: "Busca unificada por fornecedor, NF, CNPJ, conta, contrato, colaborador — digitar \"Cemig\" mostra fornecedor, notas, pagamentos e indicadores relacionados numa lista só.", dep: "estende #22 (Busca global v1)" },
					{ id: "p32", num: "#32", title: "Drill-down universal na Dashboard", desc: "Todo número clicável, com navegação até o lançamento de origem. Viável, mas maior do que parece — é esforço tela por tela, não uma feature única; melhor entrar de forma incremental (Dashboard primeiro, resto depois) do que como projeto fechado." },
					{ id: "p33", num: "#33", title: "Linha do tempo financeira — estados completos", desc: "Adiciona os estados que envolvem documento (\"documento anexado\", \"vinculado ao orçamento\", \"baixado\", \"fechado\") à timeline que já existe.", dep: "estende #10; os estados de documento dependem do módulo de Notas (Fase 3)" },
					{ id: "p34", num: "#34", title: "Detecção avançada de duplicidade", desc: "Evolui de \"fornecedor + valor + data\" para CNPJ + valor + emissão + vencimento + número + similaridade textual, com % de confiança.", dep: "estende #14" },
					{ id: "p35", num: "#35", title: "Importador universal com templates", desc: "Central de Importações: mapear colunas uma vez (\"Coluna A = fornecedor\"), salvar como template e reaplicar quando a planilha de um sistema externo mudar de layout.", dep: "estende #17" },
				],
			},
			{
				code: "4C",
				title: "Orçamento avançado",
				why: "Mexe na estrutura de dado do orçamento — melhor vir depois da produtividade da 4B rodando, para não competir por atenção com mudança de schema ao mesmo tempo.",
				items: [
					{ id: "p36", num: "#36", title: "Snapshots financeiros de fechamento", desc: "Fotografia congelada dos indicadores no momento do fechamento do mês — mudanças posteriores não alteram silenciosamente um relatório já fechado. Base técnica mais simples desta onda; as outras duas se apoiam nela." },
					{ id: "p37", num: "#37", title: "Versionamento de orçamento", desc: "Original → Revisão 1 → Forecast Q3 → Revisão Diretoria, sem nunca sobrescrever a versão anterior. Exige reestruturar o schema do orçamento para suportar várias versões por período — mudança de modelo de dado real, não só de tela.", dep: "usa #36" },
					{ id: "p38", num: "#38", title: "Controle de CAPEX × OPEX", desc: "Nova dimensão de classificação sobre contas/centros de custo já existentes. Viável, mas precisa de uma decisão de produto antes de codar: qual regra separa investimento de despesa recorrente." },
					{ id: "p39", num: "#39", title: "Motor de Comprometimento Orçamentário", desc: "Orçado − realizado − comprometido = disponível real, evitando a falsa sensação de saldo livre. É o item mais incerto desta onda: o Finan não tem hoje um terceiro estado \"comprometido\" — precisa decidir o que gera esse valor (contrato recorrente? nota digitada mas não paga?) antes de ter onde codar." },
				],
			},
			{
				code: "4D",
				title: "Governança e automação de regras",
				why: "Maior risco de escopo da lista inteira — recomendação explícita: nascer pequeno (regra parametrizável fixa, não motor genérico) e só crescer com casos de uso reais repetidos, não como projeto de plataforma desde o dia um.",
				items: [
					{ id: "p40", num: "#40", title: "Regras financeiras configuráveis (v1 restrito)", desc: "Cadastrar limiares sem alterar código: \"despesa acima de R$ 50 mil gera alerta\", \"conta sem NF acima de R$ 5 mil vira pendência crítica\". Viável como v1 restrito (parâmetros num catálogo fixo de regras); um motor genérico e livre é um projeto bem maior e mais arriscado de manter — não recomendo essa versão de início." },
					{ id: "p41", num: "#41", title: "Workflow configurável (Evento → Condição → Ação)", desc: "Automação encadeada estilo Power Automate/n8n, ex.: NF recebida → OCR → validar CNPJ → checar duplicidade → criar pendência. Só faz sentido depois de #40 provar valor — e mesmo assim, prefiro automações específicas codadas (como já é o padrão do sistema) a um motor genérico até existirem 5+ casos reais pedindo o mesmo formato.", dep: "depende de #40" },
					{ id: "p42", num: "#42", title: "Motor de Fechamento Financeiro Inteligente", desc: "Checklist automático de fechamento (contas sem categoria, notas sem vínculo, conciliações pendentes) com um Score de Fechamento (ex.: 92/100) — boa parte dos critérios já é dado da Central de Pendências (#13).", dep: "estende #12; usa #40" },
				],
			},
			{
				code: "4E",
				title: "Inteligência de fornecedores e FP&A",
				why: "Depende de dado consolidado das ondas anteriores — cada item usa o anterior como insumo, nessa ordem.",
				items: [
					{ id: "p43", num: "#43", title: "Centro de Inteligência de Fornecedores / Supplier Score", desc: "Histórico financeiro, contratos, reajustes e divergências por fornecedor, com nota combinando custo, regularidade documental e histórico — e comparação automática entre fornecedores equivalentes.", dep: "estende #8 e #9" },
					{ id: "p44", num: "#44", title: "Explicação automática de variação", desc: "Em vez de só \"orçado R$ 1 mi / realizado R$ 1,18 mi\", atribuir o desvio às causas prováveis (\"+R$ 95 mil de Fornecedor A, +R$ 42 mil de reajuste\"). Viável sem IA generativa — é atribuição determinística por regra, mas a lógica de atribuição em si precisa ser bem desenhada, não é trivial.", dep: "usa #43" },
					{ id: "p45", num: "#45", title: "Briefing Executivo automático", desc: "Resumo diário/semanal/mensal com receita, despesas, variações, riscos e recomendações, pronto para levar a uma reunião. Recomendo v1 no mesmo padrão determinístico do #1 (texto fixo, sem custo de IA por chamada); Victorinho como camada de linguagem natural entra depois, como v2 opcional.", dep: "reúne #44, #43, #18 e #1" },
					{ id: "p46", num: "#46", title: "Business Case dentro do Finan", desc: "Calculadora de ROI, payback, VPL e TIR a partir de investimento inicial, economia esperada e prazo, com resumo executivo gerado. Item independente — não depende de nenhum outro desta lista, pode entrar em qualquer onda se quiser adiantar." },
				],
			},
			{
				code: "4F",
				title: "Bloqueados pelo módulo de Notas/Contas real",
				why: "Mesmo bloqueio já documentado na Fase 3 — sem um lançamento de fatura/título real por trás (hoje são telas de indicador fixo), não existe evento nem extrato pra esses itens operarem sobre dado de verdade.",
				items: [
					{ id: "p47", num: "#47", title: "Webhooks", desc: "Eventos como invoice.created, supplier.updated, budget.threshold_reached, month.closed para automações externas. supplier.updated, budget.threshold_reached e month.closed já têm dado suficiente para sair mais cedo; invoice.created só faz sentido depois do módulo de Notas existir de verdade.", dep: "invoice.created depende do módulo de Notas (Fase 3)" },
					{ id: "p48", num: "#48", title: "Conciliação inteligente", desc: "Sugestão automática de correspondência entre extrato bancário importado e títulos em aberto (\"96% de confiança: corresponde à conta X\"), com confirmação manual. O item mais dependente da lista inteira: sem título/conta a pagar-receber real (não indicador fixo) e sem extrato bancário importado, não existe o que conciliar.", dep: "depende do módulo de Notas/Contas (Fase 3)" },
				],
			},
		],
	},
];

const STATES = ["planejado", "andamento", "concluido"];
const STATE_META = {
	planejado: { label: "Planejado", icon: Circle, className: "bg-slate-100 text-slate-500" },
	andamento: { label: "Em andamento", icon: Timer, className: "bg-amber-100 text-amber-700" },
	concluido: { label: "Concluído", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
};

function allItems() {
	return ROADMAP.flatMap((g) => g.phases.flatMap((p) => p.items));
}

function hasFinanConfigManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.configuracoes.manage");
}

export default function FinanRoadmapPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasFinanConfigManagePermission(currentUser);
	const [status, setStatus] = useState({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setStatus(await fetchFinanRoadmapStatus());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o roteiro.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const cycleStatus = async (itemId) => {
		if (!canManage || saving) return;
		const current = status[itemId] || "planejado";
		const next = STATES[(STATES.indexOf(current) + 1) % STATES.length];
		const nextStatus = { ...status, [itemId]: next };
		setStatus(nextStatus);
		setSaving(true);
		try {
			await saveFinanRoadmapStatus(nextStatus);
		} catch (err) {
			setStatus(status);
			setError(err?.message || "Não foi possível salvar o andamento.");
		} finally {
			setSaving(false);
		}
	};

	const summary = useMemo(() => {
		const items = allItems();
		const total = items.length;
		const concluido = items.filter((item) => (status[item.id] || "planejado") === "concluido").length;
		const andamento = items.filter((item) => (status[item.id] || "planejado") === "andamento").length;
		return { total, concluido, andamento, planejado: total - concluido - andamento };
	}, [status]);

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Compass size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Roteiro Finan</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Cronograma de evolução do Finan em três fases. O andamento marcado aqui é salvo para toda a equipe.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={17} />
						Atualizar
					</button>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}

			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Carregando roteiro...</p>
			) : (
				<>
					<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex items-center justify-between gap-3 text-sm font-black text-slate-800">
							<span>
								Progresso geral: {summary.concluido} / {summary.total} concluídos
							</span>
							{saving ? (
								<span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400">
									<Loader2 size={14} className="animate-spin" /> salvando...
								</span>
							) : null}
						</div>
						<div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
							<div
								className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all"
								style={{ width: summary.total ? `${(summary.concluido / summary.total) * 100}%` : "0%" }}
							/>
						</div>
						<div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
							<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
								{summary.concluido} concluído(s)
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-700">
								{summary.andamento} em andamento
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-500">
								{summary.planejado} planejado(s)
							</span>
						</div>
						{!canManage ? (
							<p className="mt-4 text-xs font-semibold text-slate-400">
								Modo somente leitura. Marcar andamento exige a permissão finan.configuracoes.manage.
							</p>
						) : null}
					</section>

					{ROADMAP.map((group) => (
						<section key={group.group} className="space-y-4">
							<div className="flex flex-wrap items-center gap-3">
								<h2 className="text-lg font-black text-slate-950">{group.group}</h2>
								{group.gate ? (
									<span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-700">
										{group.gate}
									</span>
								) : null}
							</div>
							<p className="max-w-3xl text-sm text-slate-500">{group.note}</p>

							{group.phases.map((phase) => (
								<div key={phase.code} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
									<p className="text-xs font-black uppercase tracking-wide text-blue-600">Fase {phase.code}</p>
									<h3 className="mt-1 text-base font-black text-slate-950">{phase.title}</h3>
									<p className="mt-1 max-w-2xl text-sm text-slate-500">{phase.why}</p>
									<ul className="mt-4 space-y-2">
										{phase.items.map((item) => {
											const state = status[item.id] || "planejado";
											const meta = STATE_META[state];
											const StateIcon = meta.icon;
											return (
												<li
													key={item.id}
													className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between"
												>
													<div className="flex min-w-0 items-start gap-3">
														<span className="mt-0.5 shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-500">
															{item.num}
														</span>
														<div className="min-w-0">
															<p className="text-sm font-black text-slate-950">{item.title}</p>
															<p className="mt-1 text-xs font-medium text-slate-500">{item.desc}</p>
															{item.dep ? (
																<span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-700">
																	{item.dep}
																</span>
															) : null}
														</div>
													</div>
													<button
														type="button"
														onClick={() => cycleStatus(item.id)}
														disabled={!canManage}
														className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed ${meta.className}`}
													>
														<StateIcon size={13} />
														{meta.label}
													</button>
												</li>
											);
										})}
									</ul>
								</div>
							))}
						</section>
					))}
				</>
			)}
		</div>
	);
}
