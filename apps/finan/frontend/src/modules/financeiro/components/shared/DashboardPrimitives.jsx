// Roteiro UX_AUDIT.md (Fase 5 — extracao incremental de FinanceiroPage.jsx):
// primeiro passo da extracao por dominio recomendada na auditoria. Estes 6
// componentes/funcoes viviam dentro do arquivao (FinanceiroPage.jsx,
// 11.5k linhas) e sao usados por varias telas (Dashboard, Orcamento,
// Relatorios) — extraidos juntos porque ChartCard/FinancePanel dependem
// diretamente de CardFooterLink/PanelActionButton/EmptyState, e barOptions
// e o helper de grafico que a maioria dos ChartCard usa. Comportamento
// idêntico ao que estava no arquivao — só mudou de arquivo.
import { ArrowRight, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { brl } from "../../utils/financeiroFormatters";

export function EmptyState({
	text = "Nenhum dado encontrado para o período selecionado.",
}) {
	return (
		<div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
			{text}
		</div>
	);
}

function CardFooterLink({ to, children }) {
	return (
		<Link
			to={to}
			className="mt-auto flex min-h-11 items-center justify-between rounded-xl border-t border-slate-100 pt-3 text-sm font-bold text-blue-700 hover:text-blue-800"
		>
			<span>{children}</span>
			<ArrowRight size={18} />
		</Link>
	);
}

export function PanelActionButton({ onClick, label = "Ver mais" }) {
	if (!onClick) return null;
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700 hover:border-blue-200 hover:bg-blue-100"
		>
			<Eye size={15} />
			{label}
		</button>
	);
}

export function FinancePanel({
	title,
	children,
	actionTo,
	actionLabel,
	headerExtra,
	className = "",
	onViewMore,
	viewMoreLabel,
}) {
	return (
		<section
			className={`flex h-full min-h-[320px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
		>
			{title || headerExtra ? (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					{title ? (
						<h2 className="text-sm font-bold text-slate-950">{title}</h2>
					) : (
						<span />
					)}
					<div className="flex flex-wrap items-center justify-end gap-2">
						{headerExtra}
						<PanelActionButton onClick={onViewMore} label={viewMoreLabel} />
					</div>
				</div>
			) : null}
			{children}
			{actionTo ? (
				<CardFooterLink to={actionTo}>{actionLabel}</CardFooterLink>
			) : null}
		</section>
	);
}

export function ChartCard({
	title,
	children,
	empty,
	actionTo,
	actionLabel,
	headerExtra,
	onViewMore,
	viewMoreLabel,
	className = "",
	bodyClassName = "",
}) {
	return (
		<section
			className={`flex h-full min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
		>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2 className="text-sm font-bold text-slate-950">{title}</h2>
				<div className="flex flex-wrap items-center justify-end gap-2">
					{headerExtra}
					<PanelActionButton onClick={onViewMore} label={viewMoreLabel} />
				</div>
			</div>
			{empty ? (
				<EmptyState />
			) : (
				<div className={`min-h-[250px] flex-1 ${bodyClassName}`}>
					{children}
				</div>
			)}
			{actionTo ? (
				<CardFooterLink to={actionTo}>{actionLabel}</CardFooterLink>
			) : null}
		</section>
	);
}

export function barOptions(formatter = brl.format) {
	return {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				labels: { boxWidth: 10, font: { weight: "bold" } },
			},
			tooltip: {
				callbacks: {
					label: (context) =>
						`${context.dataset.label}: ${formatter(Number(context.raw || 0))}`,
				},
			},
		},
		scales: {
			x: { grid: { display: false } },
			y: { ticks: { callback: (value) => formatter(Number(value)) } },
		},
	};
}
