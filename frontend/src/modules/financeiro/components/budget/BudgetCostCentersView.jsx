import { AlertTriangle, Eye, Pencil, Trash2 } from "lucide-react";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import FinancialKpiCard from "../kpi/FinancialKpiCard";

function statusClasses(isOverBudget) {
	return isOverBudget
		? "border-red-200 bg-red-50 text-red-700"
		: "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatBudgetUsageLabel(decimal, percent = 0) {
	const safePercent = Number(percent || 0);
	if (safePercent > 100) {
		return `${decimal.format(safePercent - 100)}% acima`;
	}
	return `${decimal.format(safePercent)}% consumido`;
}

function companyGroupLabel(company = {}) {
	return (
		[company.codigo || company.id, company.nome || company.nomeFantasia]
			.filter(Boolean)
			.join(" - ") || "Grupo não informado"
	);
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
						{formatBudgetUsageLabel(decimal, percent || 0)}
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
					onClick={() => removeOperationalCenter(center)}
					disabled={!canManage || saving || !center?.id}
					aria-label={`Excluir centro de custo ${center?.nome || center?.codigo || ""}`}
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
						{formatBudgetUsageLabel(decimal, accountRow.percent || 0)}
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
		<details className="rounded-2xl border border-slate-200 bg-slate-50">
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
						{formatBudgetUsageLabel(decimal, category.percent || 0)}
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
		<details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
			<summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4 p-4">
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
							{formatBudgetUsageLabel(decimal, group.percent || 0)}
						</p>
					</div>
				</div>
			</summary>
			<div className="space-y-3 border-t border-slate-100 p-4">
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
		</details>
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
	companyOptions = [],
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
	centerDeleteConfirm,
	cancelRemoveOperationalCenter,
	confirmRemoveOperationalCenter,
	resendApprovalAdjustment,
	saving,
	selectedCompanyId = "",
	setFeedback,
	setModalState,
	setPendenciesState,
	setSelectedCompanyId,
	upsertOperationalCenter,
}) {
	const categoryGroups = insights.budgetCategoryGroups || [];

	return (
		<section className="space-y-4">
			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="min-w-0">
						<p className="text-xs font-black uppercase tracking-wide text-blue-700">
							Filtro por grupo empresarial
						</p>
						<h2 className="mt-1 text-lg font-black text-slate-950">
							Orçamento por grupo
						</h2>
						<p className="mt-1 text-sm font-bold text-slate-500">
							Filtra Basal, Não Basal e Projetos por Sempre, On ou Onnet.
						</p>
					</div>
					<label className="min-w-0 lg:w-[340px]">
						<span className="sr-only">Grupo empresarial</span>
						<select
							value={selectedCompanyId}
							onChange={(event) => setSelectedCompanyId?.(event.target.value)}
							className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
						>
							<option value="">Todos os grupos</option>
							{companyOptions.map((company) => (
								<option key={company.id} value={company.id}>
									{companyGroupLabel(company)}
								</option>
							))}
						</select>
					</label>
				</div>
			</section>
			<section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-stretch gap-4">
				{costCenterTopCards.map((item) => (
					<FinancialKpiCard key={item.id} item={item} variant="secondary" />
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

			<ConfirmDialog
				open={Boolean(centerDeleteConfirm)}
				tone="danger"
				title="Excluir este centro de custo?"
				description="O centro some da lista de orçamento. Essa ação não pode ser desfeita."
				items={centerDeleteConfirm ? [{ label: "Centro de custo", value: centerDeleteConfirm.label }] : []}
				confirmLabel="Excluir centro"
				cancelLabel="Voltar"
				loading={saving}
				onConfirm={confirmRemoveOperationalCenter}
				onCancel={cancelRemoveOperationalCenter}
			/>
		</section>
	);
}
