import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { brl, decimal, integer } from "../../../utils/financeiroFormatters";

export default function CostCentersTreeConfigSection({
	COST_CENTER_TYPES,
	EMPTY_COST_CENTER,
	budgetSettings,
	canManage,
	centerSearch,
	centerStatusFilter,
	centerTotalPages,
	config,
	filteredCenters,
	findDirectorateByName,
	isCenterInactive,
	loading,
	paginatedCenterGroups,
	removeCenter,
	safeCenterPage,
	saving,
	setAnalyticChildrenModal,
	setCenterPage,
	setCenterSearch,
	setCenterStatusFilter,
	setModalState,
	totalAnalyticCount,
	totalSyntheticCount,
	visibleAnalyticCount,
}) {
	return (
			<details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<summary className="flex cursor-pointer list-none flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<span className="flex items-center gap-2 text-sm font-black text-slate-950">
							Centros de custo
							<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
								{integer.format(totalSyntheticCount)} sintético(s)
							</span>
						</span>
					</div>
				</summary>
				<div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-sm font-black text-slate-950">
							Plano de centros
						</p>
					</div>
					<div className="flex flex-col gap-2 lg:min-w-[520px]">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
							<input
								value={centerSearch}
								onChange={(event) => setCenterSearch(event.target.value)}
								placeholder="Buscar por código, reduzida, nome ou classificação"
								className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
							/>
							<button
								type="button"
								onClick={() =>
									setModalState({ mode: "edit", center: EMPTY_COST_CENTER })
								}
								disabled={!canManage || saving}
								className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50"
							>
								<Plus size={14} /> Novo centro
							</button>
						</div>
						<div className="flex flex-wrap justify-end gap-2">
							{[
								["ativos", "Ativos"],
								["inativos", "Inativos"],
								["todos", "Todos"],
							].map(([value, label]) => (
								<button
									key={value}
									type="button"
									onClick={() => setCenterStatusFilter(value)}
									className={`min-h-9 rounded-xl border px-3 text-xs font-black ${centerStatusFilter === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black text-slate-500">
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{integer.format(filteredCenters.length)} sintético(s) exibido(s)
					</span>
					<span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
						{integer.format(visibleAnalyticCount)} analítico(s) exibido(s)
					</span>
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{integer.format(totalAnalyticCount)} analítico(s) no plano
					</span>
					<span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
						{integer.format(
							(config.centers || []).filter(
								(center) => !isCenterInactive(center),
							).length,
						)}{" "}
						ativo(s)
					</span>
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{integer.format(
							(config.centers || []).filter(isCenterInactive).length,
						)}{" "}
						inativo(s)
					</span>
				</div>

				<div className="mt-4 grid gap-4 xl:grid-cols-2">
					{loading ? (
						<div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm font-bold text-slate-500 xl:col-span-2">
							Carregando centros de custo...
						</div>
					) : paginatedCenterGroups.length ? (
						paginatedCenterGroups.map(
							({
								center,
								category,
								children,
								aggregateChildren = children,
								totalChildren,
							}) => {
								const aggregateSource =
									center.tipoPlano === "S" ? aggregateChildren : [center];
								const centerBudget = aggregateSource.reduce(
									(sum, item) =>
										sum + Number(item.valorMensal || item.orcamentoMensal || 0),
									0,
								);
								const centerRealized = aggregateSource.reduce(
									(sum, item) => sum + Number(item.realizadoImportado || 0),
									0,
								);
								const centerCommitted = aggregateSource.reduce(
									(sum, item) => sum + Number(item.comprometidoMes || 0),
									0,
								);
								const used = centerBudget
									? ((centerRealized + centerCommitted) / centerBudget) * 100
									: 0;
								const isInactive = isCenterInactive(center);
								const previewChildren = children.slice(0, 2);
								const directorate = findDirectorateByName(
									budgetSettings.directorates,
									center.diretoria,
								);
								const directorName =
									directorate?.diretor || center.responsavel || "Não informado";
								return (
									<article
										key={center.id}
										className={`rounded-2xl border p-4 shadow-sm ${isInactive ? "border-slate-200 bg-slate-50 opacity-80" : "border-slate-200 bg-white"}`}
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="text-xs font-black uppercase tracking-wide text-indigo-700">
													{center.codigo || center.id}
												</p>
												<h3
													className="mt-1 truncate text-lg font-black text-slate-950"
													title={center.nome}
												>
													{center.nome}
												</h3>
												<p className="mt-1 text-sm font-bold text-slate-500">
													Sintético · Diretoria:{" "}
													{center.diretoria ||
														center.categoriaPrincipal ||
														"Não informada"}
												</p>
												<p className="mt-1 text-sm font-bold text-slate-500">
													Diretor: {directorName} ·{" "}
													{COST_CENTER_TYPES[center.tipoDespesa] || "OPEX"}
												</p>
												{directorate?.emailDiretor ||
												directorate?.numeroDiretor ? (
													<p
														className="mt-1 truncate text-xs font-bold text-slate-400"
														title={[
															directorate.emailDiretor,
															directorate.numeroDiretor,
														]
															.filter(Boolean)
															.join(" · ")}
													>
														{[
															directorate.emailDiretor,
															directorate.numeroDiretor,
														]
															.filter(Boolean)
															.join(" · ")}
													</p>
												) : null}
												{category ? (
													<p
														className="mt-1 truncate text-xs font-bold text-slate-400"
														title={`${category.codigo || category.id} - ${category.nome}`}
													>
														Categoria: {category.codigo || category.id} -{" "}
														{category.nome}
													</p>
												) : null}
											</div>
											<span
												className={`rounded-full px-3 py-1 text-xs font-black ${isInactive ? "bg-slate-200 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}
											>
												{center.status || "ativo"}
											</span>
										</div>
										<div className="mt-4 h-3 rounded-full bg-slate-100">
											<div
												className={`h-full rounded-full ${used > 100 ? "bg-red-500" : used >= Number(center.alertaPercentual || 85) ? "bg-amber-400" : "bg-emerald-500"}`}
												style={{
													width: `${Math.min(100, Math.max(4, used))}%`,
												}}
											/>
										</div>
										<div className="mt-4 grid gap-3 sm:grid-cols-3">
											<div>
												<p className="text-xs font-bold text-slate-500">
													Mensal
												</p>
												<p className="text-sm font-black text-slate-950">
													{brl.format(centerBudget)}
												</p>
											</div>
											<div>
												<p className="text-xs font-bold text-slate-500">
													Realizado
												</p>
												<p className="text-sm font-black text-slate-950">
													{brl.format(centerRealized)}
												</p>
											</div>
											<div>
												<p className="text-xs font-bold text-slate-500">Uso</p>
												<p className="text-sm font-black text-slate-950">
													{decimal.format(used)}%
												</p>
											</div>
										</div>
										<div className="mt-3 flex flex-wrap gap-2">
											{center.classificacao ? (
												<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
													{center.classificacao}
												</span>
											) : null}
											{center.reduzida ? (
												<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
													Reduzida {center.reduzida}
												</span>
											) : null}
											{center.nivel ? (
												<span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-black text-purple-700">
													Nível {center.nivel}
												</span>
											) : null}
										</div>
										<div className="mt-3 flex flex-wrap gap-2">
											{(center.contasFinanceiras || []).length ? (
												(center.contasFinanceiras || [])
													.slice(0, 3)
													.map((accountId) => {
														const account = (config.accounts || []).find(
															(item) => item.id === accountId,
														);
														return account ? (
															<span
																key={accountId}
																className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700"
															>
																{account.nome}
															</span>
														) : null;
													})
											) : (
												<span className="text-xs font-bold text-slate-400">
													Sem conta financeira vinculada.
												</span>
											)}
										</div>
										<div className="mt-4 flex flex-wrap gap-2">
											<button
												type="button"
												onClick={() => setModalState({ mode: "view", center })}
												className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
											>
												<Eye size={14} /> Ver
											</button>
											<button
												type="button"
												onClick={() => setModalState({ mode: "edit", center })}
												disabled={!canManage}
												className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
											>
												<Pencil size={14} /> Editar
											</button>
											<button
												type="button"
												onClick={() => removeCenter(center.id)}
												disabled={!canManage || saving}
												className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
											>
												<Trash2 size={14} /> Excluir
											</button>
										</div>
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
														const childInactive = isCenterInactive(child);
														const childBudget = Number(
															child.valorMensal || child.orcamentoMensal || 0,
														);
														const childRealized = Number(
															child.realizadoImportado || 0,
														);
														return (
															<div
																key={child.id}
																className={`rounded-xl border p-3 ${childInactive ? "border-slate-200 bg-white/70 opacity-75" : "border-white bg-white"}`}
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
																		className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${childInactive ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}
																	>
																		{child.status || "ativo"}
																	</span>
																</div>
																<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
																	<div>
																		<p className="font-bold text-slate-500">
																			Mensal
																		</p>
																		<p className="font-black text-slate-950">
																			{brl.format(childBudget)}
																		</p>
																	</div>
																	<div>
																		<p className="font-bold text-slate-500">
																			Realizado
																		</p>
																		<p className="font-black text-slate-950">
																			{brl.format(childRealized)}
																		</p>
																	</div>
																</div>
																<div className="mt-3 flex flex-wrap gap-2">
																	<button
																		type="button"
																		onClick={() =>
																			setModalState({
																				mode: "view",
																				center: child,
																			})
																		}
																		className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-black text-slate-700 hover:bg-slate-50"
																	>
																		<Eye size={12} /> Ver
																	</button>
																	<button
																		type="button"
																		onClick={() =>
																			setModalState({
																				mode: "edit",
																				center: child,
																			})
																		}
																		disabled={!canManage}
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
														Nenhum centro analítico encontrado para este filtro.
													</div>
												)}
											</div>
										</div>
									</article>
								);
							},
						)
					) : (
						<div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm font-bold text-slate-500 xl:col-span-2">
							Nenhum centro de custo encontrado com os filtros atuais.
						</div>
					)}
				</div>

				{centerTotalPages > 1 ? (
					<div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
						<span className="px-2 text-xs font-black text-slate-500">
							Página {integer.format(safeCenterPage)} de{" "}
							{integer.format(centerTotalPages)} ·{" "}
							{integer.format(filteredCenters.length)} sintético(s)
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
									setCenterPage((value) =>
										Math.min(centerTotalPages, value + 1),
									)
								}
								disabled={safeCenterPage >= centerTotalPages}
								className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
							>
								Próxima
							</button>
						</span>
					</div>
				) : null}
			</details>
	);
}
