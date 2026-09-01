import { AlertTriangle, Eye, Pencil, Trash2 } from "lucide-react";
import FinancialKpiCard from "../kpi/FinancialKpiCard";

function statusClasses(isOverBudget) {
	return isOverBudget
		? "border-red-200 bg-red-50 text-red-700"
		: "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function BudgetCenterCard({
	centerRow,
	brl,
	decimal,
	budgetCenterCompactLabel,
	budgetConsumptionStatus,
	canManage,
	currentUser,
	insights,
	isBudgetCenterResponsible,
	isCenterInactive,
	saving,
	setModalState,
	setPendenciesState,
	removeOperationalCenter,
}) {
	const { center, planned, realized, deviation, percent } = centerRow;
	const status = budgetConsumptionStatus(percent);
	const isOverBudget = Number(deviation || 0) > 0;
	const pendencies = (insights.approvalsAll || []).filter(
		(approval) =>
			approval.centerId === center?.id &&
			["reprovado", "recusado", "ajuste_solicitado"].includes(
				String(approval.status || "").toLowerCase(),
			),
	);
	const canHandlePendencies =
		isBudgetCenterResponsible(currentUser, center) && pendencies.length > 0;

	return (
		<article
			className={`rounded-xl border p-3 ${
				isCenterInactive(center)
					? "border-slate-200 bg-slate-50 opacity-75"
					: "border-slate-200 bg-white"
			}`}
		>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="text-[11px] font-black uppercase tracking-wide text-blue-700">
						{center?.codigo || center?.id || "sem-codigo"}
					</p>
					<h4
						className="mt-1 line-clamp-2 text-sm font-black text-slate-950"
						title={center?.nome}
					>
						{center?.nome || budgetCenterCompactLabel(center)}
					</h4>
					<p className="mt-1 line-clamp-2 text-xs font-bold text-slate-500">
						Responsável: {center?.responsavel || "Não informado"}
					</p>
				</div>
				<span
					className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-black ${statusClasses(isOverBudget)}`}
				>
					{isOverBudget ? "Estourado" : "Na meta"}
				</span>
			</div>
			<div className="mt-3 h-2 rounded-full bg-slate-100">
				<div
					className={`h-full rounded-full ${status.barClass}`}
					style={{ width: `${Math.min(100, Math.max(4, percent || 0))}%` }}
				/>
			</div>
			<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
				<div>
					<dt className="font-bold text-slate-500">Orçado</dt>
					<dd className="font-black text-slate-950">{brl.format(planned || 0)}</dd>
				</div>
				<div>
					<dt className="font-bold text-slate-500">Realizado</dt>
					<dd className="font-black text-slate-950">
						{brl.format(realized || 0)}
					</dd>
				</div>
				<div>
					<dt className="font-bold text-slate-500">Uso</dt>
					<dd className={`font-black ${status.textClass}`}>
						{decimal.format(percent || 0)}%
					</dd>
				</div>
				<div>
					<dt className="font-bold text-slate-500">Desvio</dt>
					<dd
						className={`font-black ${isOverBudget ? "text-red-600" : "text-emerald-600"}`}
					>
						{isOverBudget ? brl.format(deviation || 0) : "Na meta"}
					</dd>
				</div>
			</dl>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => setModalState({ mode: "view", center })}
					className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-black text-slate-700 hover:bg-slate-50"
				>
					<Eye size={12} /> Ver
				</button>
				{canHandlePendencies ? (
					<button
						type="button"
						onClick={() =>
							setPendenciesState({
								center,
								approvals: pendencies,
							})
						}
						className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-black text-amber-800 hover:bg-amber-100"
					>
						<AlertTriangle size={12} /> Pendências ({pendencies.length})
					</button>
				) : null}
				<button
					type="button"
					onClick={() => setModalState({ mode: "edit", center })}
					disabled={!canManage || saving}
					className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-blue-200 px-2 text-[11px] font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
				>
					<Pencil size={12} /> Editar
				</button>
				<button
					type="button"
					onClick={() => removeOperationalCenter(center?.id)}
					disabled={!canManage || saving || !center?.id}
					className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-200 px-2 text-[11px] font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
				>
					<Trash2 size={12} /> Excluir
				</button>
			</div>
		</article>
	);
}

function BudgetAccountBlock({
	accountRow,
	brl,
	decimal,
	budgetAccountLabel,
	budgetCenterCompactLabel,
	budgetConsumptionStatus,
	canManage,
	currentUser,
	insights,
	isBudgetCenterResponsible,
	isCenterInactive,
	saving,
	setModalState,
	setPendenciesState,
	removeOperationalCenter,
}) {
	const status = budgetConsumptionStatus(accountRow.percent);
	return (
		<details className="rounded-2xl border border-slate-200 bg-white" open>
			<summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-4">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
						Conta financeira
					</p>
					<h3 className="line-clamp-2 text-base font-black text-slate-950">
						{budgetAccountLabel(accountRow.account, accountRow.id)}
					</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">
						{accountRow.centers.length} centro(s) de custo
					</p>
				</div>
				<div className="min-w-[180px] text-left sm:text-right">
					<p className="text-xs font-black text-slate-500">
						{brl.format(accountRow.planned || 0)} orçado
					</p>
					<p className="text-sm font-black text-slate-950">
						{brl.format(accountRow.realized || 0)} realizado
					</p>
					<p className={`text-xs font-black ${status.textClass}`}>
						{decimal.format(accountRow.percent || 0)}% consumido
					</p>
				</div>
			</summary>
			<div className="border-t border-slate-100 p-3">
				<div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
					{accountRow.centers.length ? (
						accountRow.centers.map((centerRow) => (
							<BudgetCenterCard
								key={`${accountRow.id}-${centerRow.center?.id}`}
								centerRow={centerRow}
								brl={brl}
								decimal={decimal}
								budgetCenterCompactLabel={budgetCenterCompactLabel}
								budgetConsumptionStatus={budgetConsumptionStatus}
								canManage={canManage}
								currentUser={currentUser}
								insights={insights}
								isBudgetCenterResponsible={isBudgetCenterResponsible}
								isCenterInactive={isCenterInactive}
								saving={saving}
								setModalState={setModalState}
								setPendenciesState={setPendenciesState}
								removeOperationalCenter={removeOperationalCenter}
							/>
						))
					) : (
						<p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500 md:col-span-2 2xl:col-span-3">
							Nenhum centro de custo vinculado a esta conta no período.
						</p>
					)}
				</div>
			</div>
		</details>
	);
}

function BudgetCategoryBlock(props) {
	const { group, category, brl, decimal, budgetConsumptionStatus } = props;
	const status = budgetConsumptionStatus(category.percent);
	return (
		<details className="rounded-2xl border border-slate-200 bg-slate-50" open>
			<summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-4">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide text-blue-700">
						{group.label}
					</p>
					<h2 className="line-clamp-2 text-lg font-black text-slate-950">
						{category.name}
					</h2>
					<p className="mt-1 text-xs font-bold text-slate-500">
						{category.accounts.length} conta(s) financeira(s)
					</p>
				</div>
				<div className="min-w-[190px] text-left sm:text-right">
					<p className="text-xs font-black text-slate-500">
						{brl.format(category.planned || 0)} orçado
					</p>
					<p className="text-sm font-black text-slate-950">
						{brl.format(category.realized || 0)} realizado
					</p>
					<p className={`text-xs font-black ${status.textClass}`}>
						{decimal.format(category.percent || 0)}% consumido
					</p>
				</div>
			</summary>
			<div className="space-y-3 border-t border-slate-200 p-3">
				{category.accounts.length ? (
					category.accounts.map((accountRow) => (
						<BudgetAccountBlock
							key={accountRow.id}
							{...props}
							accountRow={accountRow}
						/>
					))
				) : (
					<p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
						Nenhuma conta financeira nessa categoria para o período.
					</p>
				)}
			</div>
		</details>
	);
}

function BudgetClassSection(props) {
	const { group, brl, decimal, budgetConsumptionStatus } = props;
	const status = budgetConsumptionStatus(group.percent);
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">
						Categoria orçamentária
					</p>
					<h2 className="text-2xl font-black text-slate-950">{group.label}</h2>
					<p className="mt-1 text-sm font-bold text-slate-500">
						{group.categories.length} categoria(s) com lançamento no período.
					</p>
				</div>
				<div className="grid min-w-full gap-2 sm:min-w-[360px] sm:grid-cols-3">
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-xs font-black uppercase text-slate-500">Orçado</p>
						<p className="mt-1 text-sm font-black text-slate-950">
							{brl.format(group.planned || 0)}
						</p>
					</div>
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-xs font-black uppercase text-slate-500">
							Realizado
						</p>
						<p className="mt-1 text-sm font-black text-slate-950">
							{brl.format(group.realized || 0)}
						</p>
					</div>
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-xs font-black uppercase text-slate-500">Uso</p>
						<p className={`mt-1 text-sm font-black ${status.textClass}`}>
							{decimal.format(group.percent || 0)}%
						</p>
					</div>
				</div>
			</div>
			<div className="mt-4 space-y-3">
				{group.categories.length ? (
					group.categories.map((category) => (
						<BudgetCategoryBlock
							key={category.id}
							{...props}
							category={category}
						/>
					))
				) : (
					<p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
						Nenhuma categoria com orçamento ou realizado neste período.
					</p>
				)}
			</div>
		</section>
	);
}

export default function BudgetCostCentersView({
	BudgetCenterPendenciesModal,
	CostCenterModal,
	FeedbackModal,
	brl,
	budgetAccountLabel,
	budgetCenterCompactLabel,
	budgetConsumptionStatus,
	canManage,
	config,
	costCenterTopCards,
	currentUser,
	decimal,
	feedback,
	getBudgetSettings,
	insights,
	isBudgetCenterResponsible,
	isCenterInactive,
	modalState,
	pendenciesState,
	removeOperationalCenter,
	resendApprovalAdjustment,
	saving,
	setFeedback,
	setModalState,
	setPendenciesState,
	upsertOperationalCenter,
}) {
	const categoryGroups = insights.budgetCategoryGroups || [];

	return (
		<section className="space-y-4">
			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{costCenterTopCards.map((item) => (
					<FinancialKpiCard key={item.id} item={item} />
				))}
			</section>
			<section className="space-y-4">
				{categoryGroups.map((group) => (
					<BudgetClassSection
						key={group.id}
						group={group}
						brl={brl}
						decimal={decimal}
						budgetAccountLabel={budgetAccountLabel}
						budgetCenterCompactLabel={budgetCenterCompactLabel}
						budgetConsumptionStatus={budgetConsumptionStatus}
						canManage={canManage}
						currentUser={currentUser}
						insights={insights}
						isBudgetCenterResponsible={isBudgetCenterResponsible}
						isCenterInactive={isCenterInactive}
						saving={saving}
						setModalState={setModalState}
						setPendenciesState={setPendenciesState}
						removeOperationalCenter={removeOperationalCenter}
					/>
				))}
			</section>
			{modalState ? (
				<CostCenterModal
					center={modalState.center}
					centers={config.centers || []}
					accounts={config.accounts || []}
					companies={config.companies || []}
					branches={config.branches || []}
					settings={getBudgetSettings(config.settings)}
					readOnly={modalState.mode === "view"}
					canManage={canManage}
					onClose={() => setModalState(null)}
					onSave={upsertOperationalCenter}
				/>
			) : null}
			{pendenciesState ? (
				<BudgetCenterPendenciesModal
					center={pendenciesState.center}
					approvals={pendenciesState.approvals}
					saving={saving}
					onClose={() => setPendenciesState(null)}
					onSubmit={resendApprovalAdjustment}
				/>
			) : null}
			<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
		</section>
	);
}
