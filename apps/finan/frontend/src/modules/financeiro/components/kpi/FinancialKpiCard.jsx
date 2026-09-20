import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getKpiColorVariant } from "./financialKpiStyles";
import KpiIcon from "./KpiIcon";
import KpiTrend from "./KpiTrend";
import KpiValue from "./KpiValue";

function clampProgress(value = 0) {
	const numeric = Number(value || 0);
	if (!Number.isFinite(numeric)) return 0;
	return Math.max(0, Math.min(100, numeric));
}

function KpiProgress({ item, colorVariant }) {
	if (!item.progress) return null;
	const progress = clampProgress(item.progress.value);
	return (
		<div className="mt-4 min-w-0">
			<div className="flex min-w-0 items-center justify-between gap-3 text-[11px] font-black uppercase text-slate-500">
				<span className="truncate">{item.progress.label || "Progresso"}</span>
				<span className="shrink-0 text-slate-700">{Math.round(progress)}%</span>
			</div>
			<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
				<div
					className={`h-full rounded-full ${colorVariant.progress}`}
					style={{ width: `${progress}%` }}
				/>
			</div>
		</div>
	);
}

// Roteiro Finan #32 (Fase 4B — Drill-down universal, incremental):
// quando `item.to` vem preenchido, o card inteiro vira um link pra tela
// de origem do número (ex.: KPI de orçado/realizado -> lançamentos do
// período). Quando o drill-down abre um painel local em vez de navegar
// (caso do Dashboard Orçamentário, que já tem um sistema de "detail" em
// modal — ver budget/details/), usa `item.onClick` em vez de `to`. Os
// dois são opcionais e por padrao ausentes — nenhum uso existente de
// FinancialKpiCard muda de comportamento so por causa desses props.
export default function FinancialKpiCard({
	item,
	loading,
	index,
	compact = false,
	centered = false,
	variant = "primary",
}) {
	const colorVariant = getKpiColorVariant(item);
	const isSecondary = variant === "secondary" || compact;
	const cardPadding = isSecondary ? "p-3" : "p-5";
	const cardMinHeight = isSecondary ? "min-h-[112px]" : "min-h-[156px]";
	const iconCompact = isSecondary;
	const isLinkable = Boolean(item.to) && !loading;
	const isButton = !isLinkable && Boolean(item.onClick) && !loading;
	const isClickable = isLinkable || isButton;
	const Wrapper = isLinkable ? Link : isButton ? "button" : "article";
	const wrapperProps = isLinkable
		? { to: item.to }
		: isButton
			? { type: "button", onClick: item.onClick }
			: {};

	return (
		<Wrapper
			{...wrapperProps}
			className={`group relative flex min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 ${cardMinHeight} ${cardPadding} ${centered ? "items-center" : ""} ${colorVariant.hover} ${isClickable ? "cursor-pointer text-left hover:border-blue-200" : ""}`}
		>
			<div
				className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${colorVariant.stripe}`}
			/>
			{isClickable ? (
				<ChevronRight
					size={16}
					className="pointer-events-none absolute right-3 top-3 text-slate-300 opacity-0 transition group-hover:opacity-100"
				/>
			) : null}
			<div
				className={`flex w-full min-w-0 gap-3 ${centered ? "items-center justify-center text-center" : "items-start"}`}
			>
				<KpiIcon
					name={item.icon}
					compact={iconCompact}
					colorVariant={colorVariant}
				/>
				<div className={`min-w-0 flex-1 ${centered ? "flex flex-col items-center" : ""}`}>
					<p
						className={`break-words font-black leading-tight text-slate-950 ${isSecondary ? "text-[11px] uppercase tracking-wide" : "text-[12px] uppercase tracking-wide text-slate-600"}`}
						style={{ overflowWrap: "anywhere" }}
					>
						{typeof index === "number" ? `${index + 1}. ` : ""}
						{item.title}
					</p>
					<KpiValue item={item} loading={loading} compact={isSecondary} />
					<KpiProgress item={item} colorVariant={colorVariant} />
					<KpiTrend item={item} />
					{item.helper ? (
						<p className="mt-1 break-words text-xs font-bold text-slate-500">
							{item.helper}
						</p>
					) : null}
				</div>
			</div>
		</Wrapper>
	);
}
