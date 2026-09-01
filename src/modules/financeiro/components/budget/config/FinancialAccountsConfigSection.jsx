import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { integer } from "../../../utils/financeiroFormatters";

export default function FinancialAccountsConfigSection({
	BudgetDropdownSection,
	EMPTY_FINANCIAL_ACCOUNT,
	accountCategoriesByCode,
	accountGroups,
	accountSearch,
	accountStatusFilter,
	accountTotalPages,
	canManage,
	isAccountInactive,
	paginatedAccountGroups,
	removeAccount,
	safeAccountPage,
	saving,
	setAccountChildrenModal,
	setAccountModal,
	setAccountPage,
	setAccountSearch,
	setAccountStatusFilter,
	setAccountViewModal,
	sortedAccounts,
	totalAnalyticAccountCount,
	totalSyntheticAccountCount,
}) {
	return (
			<BudgetDropdownSection
				title="Contas financeiras"
				count={sortedAccounts.length}
				className="mt-5 border-emerald-200 bg-emerald-50"
				action={
					<div className="flex flex-col gap-2 lg:flex-row lg:items-center">
						<input
							value={accountSearch}
							onChange={(event) => setAccountSearch(event.target.value)}
							placeholder="Buscar por código ou nome"
							className="min-h-10 w-full min-w-64 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
						/>
						<select
							value={accountStatusFilter}
							onChange={(event) => setAccountStatusFilter(event.target.value)}
							className="min-h-10 min-w-28 shrink-0 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
						>
							<option value="ativos">Ativos</option>
							<option value="inativos">Inativos</option>
							<option value="todos">Todos</option>
						</select>
						<button
							type="button"
							onClick={() =>
								setAccountModal({ account: EMPTY_FINANCIAL_ACCOUNT })
							}
							disabled={!canManage || saving}
							className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
						>
							<Plus size={14} /> Nova conta financeira
						</button>
					</div>
				}
			>
				<div className="mb-4 grid gap-3 md:grid-cols-3">
					<div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-100">
						<p className="text-xs font-black uppercase text-emerald-700">
							Sintéticas
						</p>
						<p className="mt-1 text-2xl font-black text-slate-950">
							{integer.format(totalSyntheticAccountCount)}
						</p>
					</div>
					<div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-100">
						<p className="text-xs font-black uppercase text-emerald-700">
							Analíticas
						</p>
						<p className="mt-1 text-2xl font-black text-slate-950">
							{integer.format(totalAnalyticAccountCount)}
						</p>
					</div>
					<div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-100">
						<p className="text-xs font-black uppercase text-emerald-700">
							Categorias
						</p>
						<p className="mt-1 text-2xl font-black text-slate-950">
							{integer.format(accountCategoriesByCode.size)}
						</p>
					</div>
				</div>
				{paginatedAccountGroups.length ? (
					<>
						<div className="grid gap-4 xl:grid-cols-2">
							{paginatedAccountGroups.map(
								({ account, category, children, totalChildren }) => {
									const inactive = isAccountInactive(account);
									const firstChildren = children.slice(0, 2);
									const categoryClassLabel =
										account.categoriaClasseLabel ||
										(account.categoriaClasse === "nao_basal"
											? "NÃO BASAL"
											: "BASAL");
									return (
										<article
											key={account.id}
											className={`rounded-2xl border bg-white p-4 shadow-sm ${inactive ? "border-slate-200 opacity-75" : "border-emerald-100"}`}
										>
											<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
												<div>
													<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
														{account.codigo || account.id} ·{" "}
														{account.reduzida || account.classificacao}
													</p>
													<h3 className="text-base font-black text-slate-950">
														{account.nome}
													</h3>
													<p className="mt-1 text-xs font-bold text-slate-500">
														{account.categoriaMae ||
															category?.nome ||
															"Sem categoria"}{" "}
														· {categoryClassLabel} ·{" "}
														{account.naturezaPlano === "C"
															? "Crédito/Receita"
															: "Débito/Despesa"}{" "}
														· Nível {account.nivel || "-"}
													</p>
												</div>
												<div className="flex flex-wrap gap-2">
													<span
														className={`rounded-full px-2.5 py-1 text-[11px] font-black ${inactive ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}
													>
														{account.status || "ativo"}
													</span>
													<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
														{integer.format(totalChildren)} analítica(s)
													</span>
												</div>
											</div>
											<div className="mt-3 grid gap-2">
												{firstChildren.length ? (
													firstChildren.map((child) => (
														<div
															key={child.id}
															className="rounded-xl border border-slate-100 bg-slate-50 p-3"
														>
															<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
																<div>
																	<p className="text-[11px] font-black uppercase text-slate-500">
																		{child.codigo || child.id} ·{" "}
																		{child.reduzida || child.classificacao}
																	</p>
																	<p className="text-sm font-black text-slate-950">
																		{child.nome}
																	</p>
																	<p className="text-[11px] font-bold text-slate-500">
																		{child.naturezaPlano === "C"
																			? "Receita"
																			: "Despesa"}{" "}
																		· Rateio {child.rateio || "-"}
																	</p>
																</div>
																<span
																	className={`rounded-full px-2 py-1 text-[10px] font-black ${isAccountInactive(child) ? "bg-slate-200 text-slate-600" : "bg-white text-emerald-700 ring-1 ring-emerald-100"}`}
																>
																	{child.status || "ativo"}
																</span>
															</div>
														</div>
													))
												) : (
													<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">
														Nenhuma conta analítica visível neste filtro.
													</div>
												)}
											</div>
											<div className="mt-2 flex flex-wrap items-center gap-2">
												{children.length > firstChildren.length ? (
													<button
														type="button"
														onClick={() =>
															setAccountChildrenModal({
																synthetic: account,
																category,
																children,
															})
														}
														className="inline-flex min-h-8 items-center rounded-lg border border-emerald-200 bg-white px-2.5 text-xs font-black text-emerald-700 hover:bg-emerald-50"
													>
														Ver mais
													</button>
												) : null}
												{children.length > firstChildren.length ? (
													<span className="text-xs font-bold text-slate-500">
														+{" "}
														{integer.format(
															children.length - firstChildren.length,
														)}{" "}
														conta(s) analítica(s)
													</span>
												) : null}
											</div>
											<div className="mt-3 flex flex-wrap gap-2">
												<button
													type="button"
													onClick={() => setAccountViewModal({ account })}
													className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-2 text-xs font-black text-slate-700 hover:bg-slate-50"
												>
													<Eye size={13} /> Ver
												</button>
												<button
													type="button"
													onClick={() => setAccountModal({ account })}
													disabled={!canManage || saving}
													className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-blue-200 px-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
												>
													<Pencil size={13} /> Editar sintética
												</button>
												<button
													type="button"
													onClick={() => removeAccount(account.id)}
													disabled={!canManage || saving}
													className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-red-200 px-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
												>
													<Trash2 size={13} /> Excluir
												</button>
											</div>
										</article>
									);
								},
							)}
						</div>
						{accountTotalPages > 1 ? (
							<div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-white p-2">
								<span className="px-2 text-xs font-black text-slate-500">
									Página {integer.format(safeAccountPage)} de{" "}
									{integer.format(accountTotalPages)} ·{" "}
									{integer.format(accountGroups.length)} grupo(s)
								</span>
								<span className="flex gap-2">
									<button
										type="button"
										onClick={() =>
											setAccountPage((value) => Math.max(1, value - 1))
										}
										disabled={safeAccountPage <= 1}
										className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
									>
										Anterior
									</button>
									<button
										type="button"
										onClick={() =>
											setAccountPage((value) =>
												Math.min(accountTotalPages, value + 1),
											)
										}
										disabled={safeAccountPage >= accountTotalPages}
										className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
									>
										Próxima
									</button>
								</span>
							</div>
						) : null}
					</>
				) : (
					<p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
						Nenhuma conta financeira encontrada com os filtros atuais.
					</p>
				)}
			</BudgetDropdownSection>
	);
}
