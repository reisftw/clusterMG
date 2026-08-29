import { AlertTriangle, Eye, Pencil, Trash2 } from "lucide-react";
import FinancialKpiCard from "../kpi/FinancialKpiCard";

export default function BudgetCostCentersView({
	BudgetCenterPendenciesModal,
	CostCenterAnalyticChildrenModal,
	CostCenterModal,
	EmptyState,
	FeedbackModal,
	allRowByCenterId,
	analyticChildrenModal,
	brl,
	budgetCenterCompactLabel,
	budgetConsumptionStatus,
	canManage,
	centerPage,
	centerTotalPages,
	config,
	costCenterTopCards,
	currentUser,
	decimal,
	feedback,
	findDirectorateByName,
	getBudgetSettings,
	insights,
	integer,
	isBudgetCenterResponsible,
	isCenterInactive,
	metricForCenter,
	modalState,
	operationalCenterGroups,
	paginatedOperationalGroups,
	pendenciesState,
	removeOperationalCenter,
	resendApprovalAdjustment,
	responsibleOnly,
	rowByCenterId,
	safeCenterPage,
	saving,
	setAnalyticChildrenModal,
	setCenterPage,
	setFeedback,
	setModalState,
	setPendenciesState,
	upsertOperationalCenter,
}) {
	return (
		<section className="space-y-4">
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{costCenterTopCards.map((item) => (
					<FinancialKpiCard key={item.id} item={item} />
				))}
			</section>
			<section className="grid gap-4 xl:grid-cols-2">
				{paginatedOperationalGroups.map(
					({ center, category, children, totalChildren, aggregate }) => {
						const status = budgetConsumptionStatus(aggregate.percent);
						const isOverBudget = aggregate.deviation > 0;
						const previewChildren = children.slice(0, 2);
						const directorate = findDirectorateByName(
							getBudgetSettings(config.settings).directorates,
							center.diretoria,
						);
						return (
							<article
								key={center.id}
								className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="text-xs font-black uppercase tracking-wide text-indigo-700">
											{center.codigo || center.id}
										</p>
										<h2 className="mt-1 text-lg font-black text-slate-950">
											{center.nome}
										</h2>
										<p className="text-sm font-bold text-slate-500">
											Sintético · Diretoria:{" "}
											{center.diretoria ||
												center.categoriaPrincipal ||
												"Não informada"}
										</p>
										<p className="text-sm font-bold text-slate-500">
											Diretor:{" "}
											{directorate?.diretor ||
												center.responsavel ||
												"Não informado"}
										</p>
										{category ? (
											<p className="mt-1 text-xs font-bold text-slate-400">
												Categoria: {category.codigo || category.id} -{" "}
												{category.nome}
											</p>
										) : null}
									</div>
									<span
										className={`rounded-full px-3 py-1 text-xs font-black ${isOverBudget ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
									>
										{isOverBudget ? "Estourado" : "Na meta"}
									</span>
								</div>
								<div className="mt-4 h-3 rounded-full bg-slate-100">
									<div
										className={`h-full rounded-full ${status.barClass}`}
										style={{
											width: `${Math.min(100, Math.max(4, aggregate.percent))}%`,
										}}
									/>
								</div>
								<dl className="mt-4 grid gap-3 sm:grid-cols-4">
									<div>
										<dt className="text-xs font-bold text-slate-500">Orçado</dt>
										<dd className="text-sm font-black text-slate-950">
											{brl.format(aggregate.planned)}
										</dd>
									</div>
									<div>
										<dt className="text-xs font-bold text-slate-500">Usado</dt>
										<dd className="text-sm font-black text-slate-950">
											{brl.format(aggregate.realized)}
										</dd>
									</div>
									<div>
										<dt className="text-xs font-bold text-slate-500">Desvio</dt>
										<dd
											className={`text-sm font-black ${isOverBudget ? "text-red-600" : "text-emerald-600"}`}
										>
											{isOverBudget ? brl.format(aggregate.deviation) : "Na meta"}
										</dd>
									</div>
									<div>
										<dt className="text-xs font-bold text-slate-500">Uso</dt>
										<dd className={`text-sm font-black ${status.textClass}`}>
											{decimal.format(aggregate.percent)}%
										</dd>
									</div>
								</dl>
								<div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="text-xs font-black uppercase tracking-wide text-slate-500">
											Centros analíticos
										</p>
										<div className="flex flex-wrap items-center gap-2">
											<span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
												{integer.format(children.length)} de{" "}
												{integer.format(totalChildren)}
											</span>
											{children.length > 2 ? (
												<button
													type="button"
													onClick={() =>
														setAnalyticChildrenModal({
															synthetic: center,
															category,
															children,
														})
													}
													className="inline-flex min-h-8 items-center rounded-lg border border-blue-200 bg-white px-2.5 text-xs font-black text-blue-700 hover:bg-blue-50"
												>
													Ver mais
												</button>
											) : null}
										</div>
									</div>
									<div className="mt-3 grid gap-2 sm:grid-cols-2">
										{previewChildren.length ? (
											previewChildren.map((child) => {
												const childMetric = metricForCenter(
													child,
													responsibleOnly ? rowByCenterId : allRowByCenterId,
												);
												const childStatus = budgetConsumptionStatus(
													childMetric.percent,
												);
												const childDeviation = Number(childMetric.deviation || 0);
												const childOverBudget = childDeviation > 0;
												const childPendencies = (
													insights.approvalsAll || []
												).filter(
													(approval) =>
														approval.centerId === child.id &&
														[
															"reprovado",
															"recusado",
															"ajuste_solicitado",
														].includes(
															String(approval.status || "").toLowerCase(),
														),
												);
												const canHandleChildPendencies =
													isBudgetCenterResponsible(currentUser, child) &&
													childPendencies.length > 0;
												return (
													<div
														key={child.id}
														className={`rounded-xl border p-3 ${isCenterInactive(child) ? "border-slate-200 bg-white/70 opacity-75" : "border-white bg-white"}`}
													>
														<div className="flex items-start justify-between gap-2">
															<div className="min-w-0">
																<p className="text-[11px] font-black uppercase tracking-wide text-blue-700">
																	{child.codigo || child.id}
																</p>
																<p
																	className="mt-1 truncate text-sm font-black text-slate-950"
																	title={child.nome}
																>
																	{child.nome}
																</p>
																<p
																	className="mt-1 truncate text-xs font-bold text-slate-500"
																	title={child.responsavel || ""}
																>
																	Responsável:{" "}
																	{child.responsavel || "Não informado"}
																</p>
															</div>
															<span
																className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${childOverBudget ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
															>
																{childOverBudget ? "Estourado" : "Na meta"}
															</span>
														</div>
														<div className="mt-3 h-2 rounded-full bg-slate-100">
															<div
																className={`h-full rounded-full ${childStatus.barClass}`}
																style={{
																	width: `${Math.min(100, Math.max(4, childMetric.percent))}%`,
																}}
															/>
														</div>
														<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
															<div>
																<p className="font-bold text-slate-500">Orçado</p>
																<p className="font-black text-slate-950">
																	{brl.format(childMetric.planned || 0)}
																</p>
															</div>
															<div>
																<p className="font-bold text-slate-500">Usado</p>
																<p className="font-black text-slate-950">
																	{brl.format(childMetric.realized || 0)}
																</p>
															</div>
														</div>
														<div className="mt-3 flex flex-wrap gap-2">
															<button
																type="button"
																onClick={() =>
																	setModalState({ mode: "view", center: child })
																}
																className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-black text-slate-700 hover:bg-slate-50"
															>
																<Eye size={12} /> Ver
															</button>
															{canHandleChildPendencies ? (
																<button
																	type="button"
																	onClick={() =>
																		setPendenciesState({
																			center: child,
																			approvals: childPendencies,
																		})
																	}
																	className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-black text-amber-800 hover:bg-amber-100"
																>
																	<AlertTriangle size={12} /> Pendências (
																	{childPendencies.length})
																</button>
															) : null}
															<button
																type="button"
																onClick={() =>
																	setModalState({ mode: "edit", center: child })
																}
																disabled={!canManage || saving}
																className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-blue-200 px-2 text-[11px] font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
															>
																<Pencil size={12} /> Editar
															</button>
														</div>
													</div>
												);
											})
										) : (
											<div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs font-bold text-slate-500 sm:col-span-2">
												Nenhum centro analítico encontrado para este sintético.
											</div>
										)}
									</div>
								</div>
								<div className="mt-4 flex flex-wrap gap-2">
									<button
										type="button"
										onClick={() => setModalState({ mode: "view", center })}
										className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
									>
										<Eye size={14} /> Ver sintético
									</button>
									<button
										type="button"
										onClick={() => setModalState({ mode: "edit", center })}
										disabled={!canManage || saving}
										className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
									>
										<Pencil size={14} /> Editar sintético
									</button>
									<button
										type="button"
										onClick={() => removeOperationalCenter(center.id)}
										disabled={!canManage || saving}
										className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
									>
										<Trash2 size={14} /> Excluir
									</button>
								</div>
							</article>
						);
					},
				)}
				{!operationalCenterGroups.length ? (
					<EmptyState text="Nenhum centro de custo vinculado ao seu e-mail." />
				) : null}
			</section>
			{centerTotalPages > 1 ? (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
					<span className="px-2 text-xs font-black text-slate-500">
						Página {integer.format(safeCenterPage)} de{" "}
						{integer.format(centerTotalPages)} ·{" "}
						{integer.format(operationalCenterGroups.length)} sintético(s)
					</span>
					<span className="flex gap-2">
						<button
							type="button"
							onClick={() => setCenterPage((value) => Math.max(1, value - 1))}
							disabled={safeCenterPage <= 1}
							className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
						>
							Anterior
						</button>
						<button
							type="button"
							onClick={() =>
								setCenterPage((value) => Math.min(centerTotalPages, value + 1))
							}
							disabled={safeCenterPage >= centerTotalPages}
							className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
						>
							Próxima
						</button>
					</span>
				</div>
			) : null}
			{analyticChildrenModal ? (
				<CostCenterAnalyticChildrenModal
					synthetic={analyticChildrenModal.synthetic}
					category={analyticChildrenModal.category}
					children={analyticChildrenModal.children}
					canManage={canManage}
					onClose={() => setAnalyticChildrenModal(null)}
					onView={(center) => {
						setAnalyticChildrenModal(null);
						setModalState({ mode: "view", center });
					}}
					onEdit={(center) => {
						setAnalyticChildrenModal(null);
						setModalState({ mode: "edit", center });
					}}
				/>
			) : null}
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
