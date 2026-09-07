import { useState } from "react";
import { Eye, Settings } from "lucide-react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import ModalShell from "../../../../components/ModalShell";
import FinancialKpiCard from "../kpi/FinancialKpiCard";

const CATEGORY_PAGE_SIZE = 5;

function budgetClassVisualState(percent = 0) {
	const safePercent = Number(percent || 0);
	if (safePercent >= 100) {
		return {
			border: "border-red-300",
			shadow: "shadow-[0_14px_34px_rgba(239,68,68,0.14)]",
			dot: "bg-red-500",
			bar: "bg-red-500",
			text: "text-red-700",
			label: "Acima do orçamento",
		};
	}
	if (safePercent >= 80) {
		return {
			border: "border-orange-300",
			shadow: "shadow-[0_14px_34px_rgba(249,115,22,0.14)]",
			dot: "bg-orange-500",
			bar: "bg-orange-500",
			text: "text-orange-700",
			label: "Em atenção",
		};
	}
	return {
		border: "border-emerald-300",
		shadow: "shadow-[0_14px_34px_rgba(16,185,129,0.12)]",
		dot: "bg-emerald-500",
		bar: "bg-emerald-500",
		text: "text-emerald-700",
		label: "Positivo",
	};
}

function BudgetCategoryClassPanel({
	group,
	brl,
	decimal,
	integer,
	budgetAccountLabel,
	budgetCenterCompactLabel,
}) {
	const [open, setOpen] = useState(false);
	const [page, setPage] = useState(1);
	const categories = group.categories || [];
	const totalPages = Math.max(1, Math.ceil(categories.length / CATEGORY_PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const visibleCategories = categories.slice(
		(safePage - 1) * CATEGORY_PAGE_SIZE,
		safePage * CATEGORY_PAGE_SIZE,
	);
	const available = Number(group.planned || 0) - Number(group.realized || 0);
	const isFavorable = available >= 0;
	const progress = Math.min(100, Math.max(0, Number(group.percent || 0)));
	const visualState = budgetClassVisualState(group.percent);
	return (
		<>
			<button
				type="button"
				onClick={() => {
					setPage(1);
					setOpen(true);
				}}
				className={`group min-w-0 rounded-2xl border bg-white p-4 text-left ${visualState.border} ${visualState.shadow} transition hover:-translate-y-0.5`}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span
								className={`h-3 w-3 rounded-full ${visualState.dot}`}
								aria-label={visualState.label}
							/>
							<p className="text-xs font-black uppercase text-slate-500">
								Categoria orçamentária
							</p>
						</div>
						<h3 className="mt-1 break-words text-2xl font-black text-slate-950">
							{group.label}
						</h3>
						<p className="mt-1 text-xs font-bold text-slate-500">
							{integer.format(categories.length)} categoria(s) · clique para detalhar
						</p>
					</div>
					<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 transition group-hover:bg-blue-100">
						Abrir
					</span>
				</div>
				<div className="mt-4 grid gap-2 sm:grid-cols-3">
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-[11px] font-black uppercase text-slate-500">
							Orçado
						</p>
						<p className="mt-1 break-words text-sm font-black text-slate-950">
							{brl.format(group.planned || 0)}
						</p>
					</div>
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-[11px] font-black uppercase text-slate-500">
							Realizado
						</p>
						<p className="mt-1 break-words text-sm font-black text-slate-950">
							{brl.format(group.realized || 0)}
						</p>
					</div>
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-[11px] font-black uppercase text-slate-500">
							Saldo
						</p>
						<p
							className={`mt-1 break-words text-sm font-black ${isFavorable ? "text-emerald-700" : "text-red-700"}`}
						>
							{brl.format(available)}
						</p>
					</div>
				</div>
				<div className="mt-4">
					<div className="flex items-center justify-between gap-3 text-xs font-black text-slate-500">
						<span>{decimal.format(group.percent || 0)}% consumido</span>
						<span className={visualState.text}>{visualState.label}</span>
					</div>
					<div className="mt-2 h-2.5 rounded-full bg-slate-100">
						<div
							className={`h-full rounded-full ${visualState.bar}`}
							style={{ width: `${progress}%` }}
						/>
					</div>
				</div>
			</button>
			{open ? (
				<ModalShell
					title={`Detalhe ${group.label}`}
					description={`${integer.format(categories.length)} categoria(s) do período selecionado.`}
					size="6xl"
					onClose={() => setOpen(false)}
					icon={
						<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<Eye size={22} />
						</span>
					}
				>
					<div className="grid gap-3 md:grid-cols-4">
						<div className="rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								Orçado
							</p>
							<p className="mt-1 break-words text-xl font-black text-slate-950">
								{brl.format(group.planned || 0)}
							</p>
						</div>
						<div className="rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								Realizado
							</p>
							<p className="mt-1 break-words text-xl font-black text-slate-950">
								{brl.format(group.realized || 0)}
							</p>
						</div>
						<div className="rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								Saldo
							</p>
							<p
								className={`mt-1 break-words text-xl font-black ${isFavorable ? "text-emerald-700" : "text-red-700"}`}
							>
								{brl.format(available)}
							</p>
						</div>
						<div className="rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								Uso
							</p>
							<p className="mt-1 break-words text-xl font-black text-slate-950">
								{decimal.format(group.percent || 0)}%
							</p>
						</div>
					</div>
					<div className="mt-4 space-y-3">
						{categories.length ? (
							visibleCategories.map((category) => {
								const categoryAvailable =
									Number(category.planned || 0) - Number(category.realized || 0);
								const categoryFavorable = categoryAvailable >= 0;
								return (
									<section
										key={category.id}
										className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<span
														className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryFavorable ? "bg-emerald-500" : "bg-red-500"}`}
														aria-label={categoryFavorable ? "Dentro do orçamento" : "Acima do orçamento"}
													/>
													<p className="break-words text-base font-black text-slate-950">
														{category.name}
													</p>
												</div>
												<p className="text-xs font-bold text-slate-500">
													{category.accounts.length} conta(s) financeira(s)
												</p>
											</div>
											<div className="grid min-w-[240px] gap-2 text-xs font-black sm:grid-cols-3">
												<span className="rounded-xl bg-white px-3 py-2 text-slate-700">
													Orçado {brl.format(category.planned || 0)}
												</span>
												<span className="rounded-xl bg-white px-3 py-2 text-slate-700">
													Realizado {brl.format(category.realized || 0)}
												</span>
												<span
													className={`rounded-xl bg-white px-3 py-2 ${categoryFavorable ? "text-emerald-700" : "text-red-700"}`}
												>
													Saldo {brl.format(categoryAvailable)}
												</span>
											</div>
										</div>
										<div className="mt-3 grid gap-2">
											{category.accounts.slice(0, 5).map((accountRow) => (
												<div
													key={accountRow.id}
													className="rounded-xl border border-white bg-white p-3"
												>
													<div className="flex flex-wrap items-start justify-between gap-2">
														<p className="min-w-0 break-words text-xs font-black text-slate-800">
															{budgetAccountLabel(accountRow.account, accountRow.id)}
														</p>
														<p className="text-xs font-black text-slate-600">
															{brl.format(accountRow.planned || 0)} /{" "}
															{brl.format(accountRow.realized || 0)}
														</p>
													</div>
													<div className="mt-2 flex flex-wrap gap-1.5">
														{accountRow.centers
															.slice(0, 5)
															.map(({ center, realized }) => (
																<span
																	key={`${accountRow.id}-${center.id}`}
																	className="max-w-full break-words rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600"
																>
																	{budgetCenterCompactLabel(center)} ·{" "}
																	{brl.format(realized || 0)}
																</span>
															))}
														{accountRow.centers.length > 5 ? (
															<span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
																+{integer.format(accountRow.centers.length - 5)}
															</span>
														) : null}
													</div>
												</div>
											))}
										</div>
									</section>
								);
							})
						) : (
							<p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
								Nenhuma conta financeira classificada nesta categoria.
							</p>
						)}
						{totalPages > 1 ? (
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
								<p className="text-xs font-black uppercase text-slate-500">
									Página {integer.format(safePage)} de {integer.format(totalPages)}
								</p>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => setPage((current) => Math.max(1, current - 1))}
										disabled={safePage <= 1}
										className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
									>
										Anterior
									</button>
									<button
										type="button"
										onClick={() =>
											setPage((current) => Math.min(totalPages, current + 1))
										}
										disabled={safePage >= totalPages}
										className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
									>
										Próxima
									</button>
								</div>
							</div>
						) : null}
					</div>
				</ModalShell>
			) : null}
		</>
	);
}

export default function BudgetDashboardView({
	ChartCard,
	EmptyState,
	FinancePanel,
	PanelActionButton,
	accountById,
	accountChart,
	barOptions,
	branchById,
	brl,
	budgetAccountLabel,
	budgetCenterCompactLabel,
	budgetConsumptionStatus,
	centerById,
	centerChart,
	companyById,
	dashboardDetail,
	decimal,
	detailTitles,
	directorateTopRows,
	forecastChart,
	insights,
	integer,
	kpis,
	lineOptions,
	monthlyChart,
	movementSupplierName,
	movementValue,
	onCloseDashboardDetail,
	onOpenDirectoratesConfig,
	onShowDashboardDetail,
	pareto,
	renderDashboardDetail,
	supplierChart,
	supplierTotalTop,
	topAccounts,
	topCenters,
	topSuppliers,
	treemapItems,
	waterfallRows,
}) {
	const primaryKpis = kpis.slice(0, 3);
	const secondaryKpis = kpis.slice(3);
	return (
		<section className="space-y-4">
			<section className="grid items-stretch gap-4 min-[480px]:grid-cols-2 md:grid-cols-3">
				{primaryKpis.map((item) => (
					<FinancialKpiCard key={item.id} item={item} variant="primary" />
				))}
			</section>
			<section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-stretch gap-4">
				{secondaryKpis.map((item) => (
					<FinancialKpiCard key={item.id} item={item} variant="secondary" />
				))}
			</section>
			<section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
				{(insights.budgetCategoryGroups || []).map((group) => (
					<BudgetCategoryClassPanel
						key={group.id}
						group={group}
						brl={brl}
						decimal={decimal}
						integer={integer}
						budgetAccountLabel={budgetAccountLabel}
						budgetCenterCompactLabel={budgetCenterCompactLabel}
					/>
				))}
			</section>
			<section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
				<ChartCard
					title="Ritmo de consumo do mês"
					empty={!insights.plannedMonth}
					onViewMore={() => onShowDashboardDetail("ritmo")}
				>
					<Line
						data={{
							labels: ["Ideal hoje", "Realizado"],
							datasets: [
								{
									label: "Consumo %",
									data: [insights.idealPercent, insights.usedPercent],
									borderColor: "#2563eb",
									backgroundColor: "rgba(37,99,235,.16)",
									fill: true,
									tension: 0.35,
								},
							],
						}}
						options={lineOptions()}
					/>
				</ChartCard>
				<FinancePanel
					title="Vilões do orçamento"
					onViewMore={() => onShowDashboardDetail("viloes")}
					headerExtra={
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-black">
							<span className="inline-flex items-center gap-1 text-emerald-700">
								<span className="h-2 w-2 rounded-full bg-emerald-500" />{" "}
								Positivo - Verde
							</span>
							<span className="inline-flex items-center gap-1 text-amber-700">
								<span className="h-2 w-2 rounded-full bg-amber-400" /> Atenção -
								Amarelo
							</span>
							<span className="inline-flex items-center gap-1 text-red-700">
								<span className="h-2 w-2 rounded-full bg-red-500" /> Estourado -
								Vermelho
							</span>
						</div>
					}
				>
					<div className="flex flex-1 flex-col gap-3">
						{pareto.length ? (
							pareto.map(({ center, deviation, percent }) => {
								const status = budgetConsumptionStatus(percent);
								return (
									<div key={center.id}>
										<div className="flex items-center justify-between gap-3 text-sm font-black">
											<span className="text-slate-700">
												{budgetCenterCompactLabel(center)}
											</span>
											<span className={status.textClass}>
												{decimal.format(percent)}% ·{" "}
												{brl.format(Math.abs(deviation))}
											</span>
										</div>
										<div className="mt-2 h-3 rounded-full bg-slate-100">
											<div
												className={`h-full rounded-full ${status.barClass}`}
												title={status.label}
												style={{
													width: `${Math.min(100, Math.max(4, percent))}%`,
												}}
											/>
										</div>
									</div>
								);
							})
						) : (
							<p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
								Nenhum centro de custo analítico encontrado para o período
								selecionado.
							</p>
						)}
					</div>
				</FinancePanel>
			</section>
			<section className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					title="Orçado x Realizado mensal"
					empty={
						!insights.monthlyEvolution.some(
							(item) => item.planned || item.realized,
						)
					}
					onViewMore={() => onShowDashboardDetail("mensal")}
				>
					<Bar data={monthlyChart} options={barOptions()} />
				</ChartCard>
				<ChartCard
					title="Tendência e forecast até o fim do exercício"
					empty={
						!insights.forecastRows.some(
							(item) => item.cumulativeRealized || item.forecast,
						)
					}
					onViewMore={() => onShowDashboardDetail("forecast")}
				>
					<Line data={forecastChart} options={barOptions()} />
				</ChartCard>
			</section>
			<section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
				<FinancePanel
					title="Cascata por conta financeira"
					onViewMore={() => onShowDashboardDetail("cascata")}
				>
					<div className="space-y-3">
						<div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
							<p className="text-xs font-black uppercase text-emerald-700">
								Orçamento do período
							</p>
							<p className="mt-1 text-xl font-black text-emerald-950">
								{brl.format(insights.plannedMonth)}
							</p>
						</div>
						{waterfallRows.length ? (
							waterfallRows.map((item) => {
								const width = insights.plannedMonth
									? Math.min(
											100,
											Math.max(
												4,
												(item.realized / insights.plannedMonth) * 100,
											),
										)
									: 4;
								return (
									<div
										key={item.id}
										className="rounded-xl border border-slate-100 bg-slate-50 p-3"
									>
										<div className="flex items-center justify-between gap-3 text-xs font-black">
											<span className="truncate text-slate-700">
												{budgetAccountLabel(item.account, item.id)}
											</span>
											<span className="text-red-600">
												- {brl.format(item.realized)}
											</span>
										</div>
										<div className="mt-2 h-2 rounded-full bg-white">
											<div
												className="h-full rounded-full bg-red-400"
												style={{ width: `${width}%` }}
											/>
										</div>
									</div>
								);
							})
						) : (
							<EmptyState text="Nenhuma conta financeira com movimentação no período." />
						)}
						<div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
							<p className="text-xs font-black uppercase text-blue-700">
								Saldo após realizados
							</p>
							<p className="mt-1 text-xl font-black text-blue-950">
								{brl.format(insights.availableMonth)}
							</p>
						</div>
					</div>
				</FinancePanel>
				<ChartCard
					title="Orçado x Realizado por conta financeira"
					empty={!topAccounts.length}
					onViewMore={() => onShowDashboardDetail("contas")}
				>
					<Bar
						data={accountChart}
						options={{ ...barOptions(), indexAxis: "y" }}
					/>
				</ChartCard>
			</section>
			<section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
				<ChartCard
					title="Distribuição por centro de custo analítico"
					empty={!topCenters.length}
					onViewMore={() => onShowDashboardDetail("centros")}
				>
					<Bar
						data={centerChart}
						options={{
							...barOptions(),
							indexAxis: "y",
							scales: {
								x: {
									ticks: { callback: (value) => brl.format(Number(value)) },
								},
								y: { grid: { display: false } },
							},
						}}
					/>
				</ChartCard>
				<FinancePanel
					title="Treemap de peso orçamentário"
					onViewMore={() => onShowDashboardDetail("treemap")}
				>
					<div className="grid auto-rows-[minmax(88px,auto)] grid-cols-2 gap-2">
						{treemapItems.length ? (
							treemapItems.map((item) => {
								const status = budgetConsumptionStatus(item.percent);
								const basis = Math.max(
									34,
									Math.min(
										100,
										insights.realizedMonth
											? (item.realized / insights.realizedMonth) * 100
											: item.percent,
									),
								);
								return (
									<div
										key={item.center.id}
										className={`rounded-2xl p-3 text-white shadow-sm ${status.barClass}`}
										style={{ minHeight: `${basis}px` }}
									>
										<p className="text-xs font-black uppercase">
											{budgetCenterCompactLabel(item.center)}
										</p>
										<p className="mt-2 text-lg font-black">
											{brl.format(item.realized)}
										</p>
										<p className="text-xs font-black opacity-90">
											{decimal.format(item.percent)}% · {status.label}
										</p>
									</div>
								);
							})
						) : (
							<EmptyState text="Nenhum centro analítico com movimentação no período." />
						)}
					</div>
				</FinancePanel>
			</section>
			<section className="grid gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
				<ChartCard
					title="Concentração por fornecedor"
					empty={!topSuppliers.length}
					onViewMore={() => onShowDashboardDetail("fornecedores")}
					headerExtra={
						<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
							Top {integer.format(topSuppliers.length)} ·{" "}
							{brl.format(supplierTotalTop)}
						</span>
					}
					className="min-h-[440px]"
					bodyClassName="flex items-center justify-center"
				>
					<div className="h-[340px] w-full max-w-[520px]">
						<Doughnut
							data={supplierChart}
							options={{
								responsive: true,
								maintainAspectRatio: false,
								plugins: {
									legend: {
										position: "bottom",
										labels: { boxWidth: 10, font: { weight: "bold" } },
									},
									tooltip: {
										callbacks: {
											label: (context) =>
												`${context.label}: ${brl.format(Number(context.raw || 0))}`,
										},
									},
									centerText: {
										title: `Top ${integer.format(topSuppliers.length)}`,
										value: brl.format(supplierTotalTop),
									},
								},
								cutout: "66%",
							}}
						/>
					</div>
				</ChartCard>
				<FinancePanel
					title="Ranking diretoria"
					onViewMore={() => onShowDashboardDetail("diretorias")}
					headerExtra={
						<button
							type="button"
							onClick={onOpenDirectoratesConfig}
							className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
							title="Configurar diretores"
							aria-label="Configurar diretores"
						>
							<Settings size={16} />
						</button>
					}
					className="min-h-[440px]"
				>
					<div className="grid flex-1 gap-3 md:grid-cols-2 2xl:grid-cols-1">
						{directorateTopRows.length ? (
							directorateTopRows.map((item) => {
								const status = budgetConsumptionStatus(item.percent);
								return (
									<div
										key={item.id}
										className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<p className="text-sm font-black text-slate-950">
													{item.nome}
												</p>
												<p className="text-xs font-bold text-slate-500">
													{item.diretor || "Diretor não informado"} ·{" "}
													{integer.format(item.centers)} centro(s)
												</p>
											</div>
											<span
												className={`text-sm font-black ${status.textClass}`}
											>
												{decimal.format(item.percent)}%
											</span>
										</div>
										<div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-black text-slate-600">
											<span>Orçado: {brl.format(item.planned)}</span>
											<span>Realizado: {brl.format(item.realized)}</span>
										</div>
										<div className="mt-2 h-2 rounded-full bg-white">
											<div
												className={`h-full rounded-full ${status.barClass}`}
												style={{
													width: `${Math.min(100, Math.max(4, item.percent))}%`,
												}}
											/>
										</div>
									</div>
								);
							})
						) : (
							<EmptyState text="Nenhuma diretoria vinculada aos centros analíticos do período." />
						)}
					</div>
				</FinancePanel>
			</section>
			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-200 p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-lg font-black text-slate-950">
								Últimas movimentações importadas
							</h2>
							<p className="text-sm font-bold text-slate-500">
								Leitura direta dos dados importados e salvos no orçamento.
							</p>
						</div>
						<PanelActionButton
							onClick={() => onShowDashboardDetail("movimentacoes")}
						/>
					</div>
				</div>
				<div className="overflow-auto">
					<table className="min-w-[980px] divide-y divide-slate-200 text-left text-xs font-bold">
						<thead className="bg-slate-50 text-slate-500">
							<tr>
								<th className="px-3 py-2">Fornecedor</th>
								<th className="px-3 py-2">Conta financeira</th>
								<th className="px-3 py-2">Centro de custo</th>
								<th className="px-3 py-2">Matriz / filial</th>
								<th className="px-3 py-2 text-right">Valor</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{insights.movements.slice(0, 12).map((movement) => {
								const account = accountById.get(movement.accountId);
								const center = centerById.get(movement.centerId);
								const company = companyById.get(movement.companyId);
								const branch = branchById.get(movement.branchId);
								return (
									<tr key={movement.id}>
										<td className="px-3 py-2 font-black text-slate-950">
											{movementSupplierName(movement)}
										</td>
										<td className="px-3 py-2 text-slate-600">
											{account
												? budgetAccountLabel(account, movement.accountId)
												: movement.accountName || movement.accountId || "-"}
										</td>
										<td className="px-3 py-2 text-slate-600">
											{center
												? budgetCenterCompactLabel(center, movement.centerId)
												: movement.centerName || movement.centerId || "-"}
										</td>
										<td className="px-3 py-2 text-slate-600">
											{[
												company?.nome || movement.companyId,
												branch?.nome || movement.branchId,
											]
												.filter(Boolean)
												.join(" / ") || "-"}
										</td>
										<td className="px-3 py-2 text-right font-black text-slate-950">
											{brl.format(movementValue(movement))}
										</td>
									</tr>
								);
							})}
							{!insights.movements.length ? (
								<tr>
									<td colSpan={5}>
										<EmptyState text="Nenhuma movimentação importada no período." />
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>
			{dashboardDetail ? (
				<ModalShell
					title={detailTitles[dashboardDetail] || "Detalhamento"}
					description={`${insights.periodDisplayLabel} · dados completos do período selecionado.`}
					size={dashboardDetail === "diretorias" ? "5xl" : "full"}
					onClose={onCloseDashboardDetail}
					icon={
						<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<Eye size={22} />
						</span>
					}
					bodyClassName={dashboardDetail === "diretorias" ? "py-3 sm:px-5" : ""}
					headerClassName={
						dashboardDetail === "diretorias" ? "py-3 sm:px-5" : ""
					}
				>
					{renderDashboardDetail()}
				</ModalShell>
			) : null}
		</section>
	);
}
