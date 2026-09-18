import {
	ArrowRight,
	Landmark,
	LineChart,
	ReceiptText,
	Scale,
	ShieldCheck,
	WalletCards,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { FINAN_ROUTES } from "../routes";

const REPORTS = {
	overview: {
		title: "Relatórios Financeiros",
		subtitle:
			"Relatórios gerenciais para acompanhar caixa, patrimônio e conciliações do financeiro.",
	},
	fluxoCaixa: {
		title: "Fluxo de Caixa",
		subtitle:
			"Entradas e saídas reais de dinheiro no caixa e nas contas bancárias ao longo do tempo.",
	},
	balancoPatrimonial: {
		title: "Balanço Patrimonial",
		subtitle:
			"Fotografia dos ativos, passivos, patrimônio líquido e obrigações da Sempre Internet.",
	},
	conciliacaoBancaria: {
		title: "Conciliação Bancária",
		subtitle:
			"Cruzamento entre lançamentos internos e extratos bancários para identificar divergências.",
	},
};

const REPORT_CARDS = [
	{
		key: "dre",
		title: "DRE",
		route: FINAN_ROUTES.DRE,
		icon: LineChart,
		accent: "blue",
		what:
			"Demonstra receitas, custos, despesas, resultado e margens do período.",
		purpose:
			"Acompanha a formação do resultado financeiro e ajuda a entender onde a operação ganhou ou perdeu margem.",
	},
	{
		key: "fluxoCaixa",
		title: "Fluxo de Caixa",
		route: FINAN_ROUTES.RELATORIOS_FLUXO_CAIXA,
		icon: WalletCards,
		accent: "blue",
		what:
			"Acompanha as entradas e saídas reais de dinheiro no caixa e nas contas bancárias no tempo, em regime de caixa.",
		purpose:
			"Garante a liquidez e mostra se a empresa tem dinheiro hoje para pagar as contas de amanhã.",
	},
	{
		key: "balancoPatrimonial",
		title: "Balanço Patrimonial",
		route: FINAN_ROUTES.RELATORIOS_BALANCO_PATRIMONIAL,
		icon: Scale,
		accent: "orange",
		what:
			"Apresenta a fotografia dos ativos, bens e direitos, passivos, deveres e obrigações da empresa.",
		purpose:
			"Controla endividamento, patrimônio líquido e obrigações com fornecedores e bancos.",
	},
	{
		key: "conciliacaoBancaria",
		title: "Conciliação Bancária",
		route: FINAN_ROUTES.RELATORIOS_CONCILIACAO_BANCARIA,
		icon: Landmark,
		accent: "green",
		what:
			"Cruza os lançamentos do sistema com os extratos bancários das contas da Sempre Internet.",
		purpose:
			"Identifica divergências, tarifas não contabilizadas ou cobranças duplicadas.",
	},
];

export default function FinanFinancialReportsPage({ report = "overview" }) {
	const current = REPORTS[report] || REPORTS.overview;
	const selectedCard =
		report === "overview"
			? null
			: REPORT_CARDS.find((card) => card.key === report) || null;

	return (
		<section className="finan-financial-reports-page">
			<div className="finan-page-title">
				<div>
					<h1>{current.title}</h1>
					<p>{current.subtitle}</p>
				</div>
				<span>Regime financeiro</span>
			</div>

			<div className="finan-report-hero">
				<div className="finan-report-hero-icon">
					<ReceiptText size={28} />
				</div>
				<div>
					<span>Planejamento financeiro</span>
					<h2>Relatórios prontos para análise e fechamento.</h2>
					<p>
						As páginas seguem o layout do Finan e já ficam protegidas por RBAC.
						A próxima etapa é conectar cada relatório às fontes oficiais.
					</p>
				</div>
			</div>

			{selectedCard ? <SelectedReport card={selectedCard} /> : null}

			<div className="finan-report-card-grid">
				{REPORT_CARDS.map((card) => (
					<ReportCard key={card.key} card={card} active={card.key === report} />
				))}
			</div>
		</section>
	);
}

function SelectedReport({ card }) {
	const Icon = card.icon;
	return (
		<article className={`finan-report-focus-card ${card.accent}`}>
			<div className="finan-report-focus-icon">
				<Icon size={24} />
			</div>
			<div>
				<span>Relatório selecionado</span>
				<h2>{card.title}</h2>
				<p>{card.what}</p>
			</div>
			<div className="finan-report-focus-status">
				<ShieldCheck size={18} />
				<span>Protegido por permissão</span>
			</div>
		</article>
	);
}

function ReportCard({ card, active }) {
	const Icon = card.icon;
	return (
		<article className={`finan-report-card ${card.accent} ${active ? "is-active" : ""}`}>
			<div className="finan-report-card-head">
				<div>
					<Icon size={22} />
				</div>
				<span>{active ? "Aberto agora" : "Relatório"}</span>
			</div>
			<h2>{card.title}</h2>
			<div className="finan-report-card-section">
				<strong>O que faz</strong>
				<p>{card.what}</p>
			</div>
			<div className="finan-report-card-section">
				<strong>Para que serve</strong>
				<p>{card.purpose}</p>
			</div>
			<NavLink to={card.route} title={`${card.title}: ${card.purpose}`}>
				Abrir relatório
				<ArrowRight size={16} />
			</NavLink>
		</article>
	);
}
