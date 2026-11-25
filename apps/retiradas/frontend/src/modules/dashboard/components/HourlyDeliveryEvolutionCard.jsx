import {
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	Clock3,
	ExternalLink,
	TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import { buscarResumoOperacionalAcompanhamento } from "../../mapas/services/mapasAtualizacoesService";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import {
	buildHourlyEvolution,
	saoPauloDateKey,
} from "../utils/hourlyDeliveryEvolution";

function formatValue(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		maximumFractionDigits: 1,
	});
}

function ChangeBadge({ difference, percentage }) {
	const positive = difference > 0;
	const negative = difference < 0;
	let Icon = ArrowRight;
	let colors = "bg-slate-100 text-slate-600";
	if (positive) {
		Icon = ArrowUpRight;
		colors = "bg-emerald-50 text-emerald-700";
	} else if (negative) {
		Icon = ArrowDownRight;
		colors = "bg-rose-50 text-rose-700";
	}
	let label = `${percentage > 0 ? "+" : ""}${formatValue(percentage)}%`;
	if (percentage === null) label = difference > 0 ? "novo volume" : "sem base";

	return (
		<span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${colors}`}>
			<Icon className="h-3.5 w-3.5" aria-hidden="true" />
			{difference > 0 ? "+" : ""}{formatValue(difference)} · {label}
		</span>
	);
}

function PeriodTable({ period, currentLabel, previousLabel }) {
	if (!period.currentDays && !period.previousDays) {
		return <p className="py-10 text-center text-sm text-slate-500">Ainda não há dados suficientes para este período.</p>;
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="rounded-xl bg-blue-50 p-4">
					<p className="text-xs font-bold uppercase text-blue-700">{currentLabel}</p>
					<p className="mt-1 text-2xl font-black text-slate-950">{formatValue(period.currentTotalAverage)}</p>
					<p className="text-xs text-slate-500">média por dia · {period.currentDays} dia(s)</p>
				</div>
				<div className="rounded-xl bg-slate-100 p-4">
					<p className="text-xs font-bold uppercase text-slate-600">{previousLabel}</p>
					<p className="mt-1 text-2xl font-black text-slate-950">{formatValue(period.previousTotalAverage)}</p>
					<p className="text-xs text-slate-500">média por dia · {period.previousDays} dia(s)</p>
				</div>
				<div className="rounded-xl border border-slate-200 p-4">
					<p className="text-xs font-bold uppercase text-slate-600">Evolução</p>
					<div className="mt-2"><ChangeBadge difference={period.difference} percentage={period.percentage} /></div>
				</div>
			</div>

			<div className="overflow-x-auto rounded-xl border border-slate-200">
				<table className="min-w-full text-left text-sm">
					<thead className="bg-slate-50 text-xs uppercase text-slate-500">
						<tr>
							<th className="px-4 py-3">Horário</th>
							<th className="px-4 py-3">{currentLabel}</th>
							<th className="px-4 py-3">{previousLabel}</th>
							<th className="px-4 py-3">Evolução</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{period.hours.map((item) => (
							<tr key={item.hour}>
								<td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">{item.hour}</td>
								<td className="px-4 py-3">{formatValue(item.current)}</td>
								<td className="px-4 py-3 text-slate-500">{formatValue(item.previous)}</td>
								<td className="px-4 py-3"><ChangeBadge difference={item.difference} percentage={item.percentage} /></td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export default function HourlyDeliveryEvolutionCard() {
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [period, setPeriod] = useState("week");
	const [entries, setEntries] = useState([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let active = true;
		const load = async () => {
			try {
				const summary = await buscarResumoOperacionalAcompanhamento();
				if (active) setEntries(summary?.hourlyEvolution || []);
			} finally {
				if (active) setLoading(false);
			}
		};
		load().catch(() => {});
		const timer = window.setInterval(load, 60000);
		const unsubscribe = subscribeRealtimeTopics(
			["mapa", "metas", "acompanhamento"],
			() => load().catch(() => {}),
			{ debounceMs: 1500 },
		);
		return () => {
			active = false;
			window.clearInterval(timer);
			unsubscribe();
		};
	}, []);
	const model = useMemo(
		() => buildHourlyEvolution(saoPauloDateKey(), entries),
		[entries],
	);
	let cardContent = (
		<p className="py-8 text-center text-sm text-slate-500">As entregas por horário aparecerão após a próxima atualização.</p>
	);
	if (loading) {
		cardContent = <p className="py-8 text-center text-sm text-slate-500">Carregando evolução...</p>;
	} else if (model.hasToday || model.hasYesterday) {
		cardContent = (
			<>
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<p className="text-xs font-bold uppercase text-slate-500">Entregas registradas por horário</p>
						<p className="mt-1 text-3xl font-black text-slate-950">{formatValue(model.todayTotal)}</p>
						<p className="text-xs text-slate-500">Ontem: {formatValue(model.yesterdayTotal)}</p>
					</div>
					<ChangeBadge difference={model.difference} percentage={model.percentage} />
				</div>
				<div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
					{model.hours.map((item) => (
						<div key={item.hour} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
							<div className="flex items-center gap-2">
								<Clock3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
								<div>
									<p className="text-xs font-bold text-slate-500">{item.hour}</p>
									<p className="font-black text-slate-950">{formatValue(item.current)} <span className="font-medium text-slate-400">/ {formatValue(item.previous)}</span></p>
								</div>
							</div>
							<ChangeBadge difference={item.difference} percentage={item.percentage} />
						</div>
					))}
				</div>
			</>
		);
	}

	return (
		<>
			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
					<div className="flex min-w-0 items-center gap-3">
						<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
							<TrendingUp className="h-5 w-5" aria-hidden="true" />
						</span>
						<div className="min-w-0">
							<h2 className="text-base font-black text-slate-950">Evolução das entregas</h2>
							<p className="text-xs font-medium text-slate-500">Hoje comparado com ontem, por horário</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() => setDetailsOpen(true)}
						className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900"
					>
						Ver mais <ExternalLink className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>

				<div className="p-5">{cardContent}</div>
			</section>

			<ModalShell
				open={detailsOpen}
				onClose={() => setDetailsOpen(false)}
				title="Evolução das entregas por horário"
				description="Compare o ritmo da operação usando a média diária de cada período."
				icon={<TrendingUp className="h-5 w-5" />}
				size="5xl"
				bodyClassName="p-4 sm:p-6"
			>
				<div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Período da evolução">
					{[
						["week", "Semana"],
						["month", "Mês"],
					].map(([value, label]) => (
						<button
							key={value}
							type="button"
							role="tab"
							aria-selected={period === value}
							onClick={() => setPeriod(value)}
							className={`rounded-lg px-4 py-2 text-sm font-bold ${period === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}
						>
							{label}
						</button>
					))}
				</div>
				{period === "week" ? (
					<PeriodTable period={model.week} currentLabel="Últimos 7 dias" previousLabel="7 dias anteriores" />
				) : (
					<PeriodTable period={model.month} currentLabel="Mês atual" previousLabel="Mês anterior" />
				)}
			</ModalShell>
		</>
	);
}
