import { useEffect, useState } from "react";
import { requestFinanApi } from "../api/finanApi";

const PAGE_META = {
	dashboard: {
		title: "Dashboard",
		subtitle: "Visão geral financeira dedicada.",
	},
	"gestao-orcamentaria": {
		title: "Gestão Orçamentária",
		subtitle: "Orçamento, realizado, centros, contas e fornecedores.",
	},
	"dados-orcamentarios": {
		title: "Dados Orçamentários",
		subtitle: "Importador FPCP106/FPCP302 e leitura Access.",
	},
	orcamento: {
		title: "Orçamento",
		subtitle: "Categorias, contas financeiras e centros de custo.",
	},
	dre: {
		title: "DRE",
		subtitle: "Demonstração por competência.",
	},
	aprovacoes: {
		title: "Aprovações",
		subtitle: "Fluxo de estouros e ajustes orçamentários.",
	},
	"contas-a-pagar": {
		title: "Contas a Pagar",
		subtitle: "Operação financeira de saídas.",
	},
	"contas-a-receber": {
		title: "Contas a Receber",
		subtitle: "Operação financeira de entradas.",
	},
	faturamento: {
		title: "Faturamento",
		subtitle: "Acompanhamento de faturamento.",
	},
	notas: {
		title: "Notas",
		subtitle: "Notas lançadas no financeiro.",
	},
	reports: {
		title: "Reports",
		subtitle: "Serasa, tarifas e relatórios financeiros.",
	},
	equipe: {
		title: "Equipe",
		subtitle: "Organograma e usuários do financeiro.",
	},
};

export default function FinanModulePage({ page }) {
	const meta = PAGE_META[page] || PAGE_META.dashboard;
	const [summary, setSummary] = useState(null);
	const [details, setDetails] = useState(null);

	useEffect(() => {
		if (page !== "dashboard" && page !== "gestao-orcamentaria") return;
		let active = true;
		Promise.all([
			requestFinanApi("/orcamento/resumo"),
			requestFinanApi("/orcamento/detalhes"),
		])
			.then(([summaryData, detailsData]) => {
				if (!active) return;
				setSummary(summaryData.resumo);
				setDetails(detailsData.detalhes);
			})
			.catch(() => {
				if (!active) return;
				setSummary(null);
				setDetails(null);
			});
		return () => {
			active = false;
		};
	}, [page]);

	return (
		<section>
			<div className="finan-page-title">
				<div>
					<h1>{meta.title}</h1>
					<p>{meta.subtitle}</p>
				</div>
				<span>Fase ponte</span>
			</div>
			<div className="finan-kpi-grid">
				<div className="finan-kpi-card">
					<span>Orçado</span>
					<strong>{formatMoney(summary?.orcado)}</strong>
					<p>Banco financeiro dedicado</p>
				</div>
				<div className="finan-kpi-card">
					<span>Realizado</span>
					<strong>{formatMoney(summary?.realizado)}</strong>
					<p>Movimentos migrados/importados</p>
				</div>
				<div className="finan-kpi-card">
					<span>Linhas</span>
					<strong>{Number(summary?.linhas || 0).toLocaleString("pt-BR")}</strong>
					<p>Registros no Finan</p>
				</div>
			</div>
			<div className="finan-work-card">
				<h2>Migração em andamento</h2>
				<p>
					Esta aba já existe no app dedicado. O próximo passo é transferir a
					lógica visual e de dados do módulo financeiro atual para componentes
					nativos do Finan, mantendo o Retiradas intacto até a validação final.
				</p>
			</div>
			{details ? (
				<div className="finan-detail-grid">
					<DetailList
						title="Categorias orçamentárias"
						rows={details.classes}
						getLabel={(row) => labelClasse(row.classe)}
					/>
					<DetailList
						title="Diretorias"
						rows={details.diretorias}
						getLabel={(row) => row.nome}
						getMeta={(row) => row.diretor_nome || "Diretor não informado"}
					/>
					<DetailList
						title="Contas financeiras"
						rows={details.contas}
						getLabel={(row) => [row.codigo, row.nome].filter(Boolean).join(" - ")}
						getMeta={(row) => row.categoria}
					/>
					<DetailList
						title="Centros de custo"
						rows={details.centros}
						getLabel={(row) => [row.codigo, row.nome].filter(Boolean).join(" - ")}
						getMeta={(row) => row.diretoria || "Diretoria não informada"}
					/>
					<DetailList
						title="Fornecedores"
						rows={details.fornecedores}
						getLabel={(row) => [row.codigo, row.nome].filter(Boolean).join(" - ")}
						getMeta={(row) => `${Number(row.linhas || 0).toLocaleString("pt-BR")} linha(s)`}
						showBudget={false}
					/>
				</div>
			) : null}
		</section>
	);
}

function DetailList({ title, rows = [], getLabel, getMeta, showBudget = true }) {
	return (
		<article className="finan-work-card finan-detail-card">
			<h2>{title}</h2>
			{rows.slice(0, 8).map((row) => (
				<div key={row.id || row.classe || row.nome} className="finan-detail-row">
					<div>
						<strong>{getLabel(row) || "Sem identificação"}</strong>
						{getMeta ? <span>{getMeta(row)}</span> : null}
					</div>
					<div>
						{showBudget ? <span>{formatMoney(row.orcado)}</span> : null}
						<strong>{formatMoney(row.realizado)}</strong>
					</div>
				</div>
			))}
			{!rows.length ? <p>Aguardando carga inicial no banco dedicado.</p> : null}
		</article>
	);
}

function formatMoney(value) {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(Number(value || 0));
}

function labelClasse(value) {
	const normalized = String(value || "").toLowerCase();
	if (normalized === "basal") return "BASAL";
	if (normalized === "nao_basal") return "NÃO BASAL";
	if (normalized === "projetos") return "PROJETOS";
	return value || "Sem classe";
}
