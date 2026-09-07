import { Plus, X } from "lucide-react";

function getBranchCompanies(branch, companies) {
	return companies.filter(
		(item) =>
			item.filialId === branch.id ||
			item.branchId === branch.id ||
			(item.filiais || []).includes(branch.id) ||
			(branch.empresas || branch.companies || []).includes(item.id),
	);
}

function getCompanyBranch(company, branchById) {
	return branchById.get(company.filialId || company.branchId || company.filiais?.[0]);
}

export default function CostCenterCompaniesField({
	branchById,
	branchSearchInCenter,
	centerBranchResults = [],
	centerCompanyResults = [],
	companies = [],
	companySearchInCenter,
	canManage,
	readOnly,
	removeCenterBranch,
	removeCenterCompany,
	selectedCenterBranches = [],
	selectedCenterCompanies = [],
	setBranchSearchInCenter,
	setCompanySearchInCenter,
	addCenterBranch,
	addCenterCompany,
}) {
	return (
		<fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
			<legend className="px-1 text-xs font-black uppercase text-slate-500">
				Matrizes e filiais vinculadas
			</legend>
			<p className="mt-1 text-xs font-bold text-slate-500">
				A importação alimenta esse vínculo automaticamente quando a planilha traz
				Empresa e Filial.
			</p>
			<div className="mt-3 grid gap-3 lg:grid-cols-2">
				<div className="space-y-3">
					<label className="block text-xs font-black uppercase text-slate-500">
						Buscar filial para adicionar
						<input
							value={branchSearchInCenter}
							disabled={readOnly || !canManage}
							onChange={(event) => setBranchSearchInCenter(event.target.value)}
							placeholder="Digite código, nome, cidade ou UF"
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
						/>
					</label>
					{centerBranchResults.length ? (
						<div className="grid gap-2">
							{centerBranchResults.map((branch) => {
								const branchCompanies = getBranchCompanies(branch, companies);
								return (
									<button
										key={branch.id}
										type="button"
										onClick={() => addCenterBranch(branch.id)}
										disabled={readOnly || !canManage}
										className="flex min-h-12 items-start justify-between gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-left text-sm font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
									>
										<span className="min-w-0">
											<span className="block truncate text-slate-950">
												{branch.codigo || branch.id} - {branch.nome}
											</span>
											<span className="block text-xs text-slate-500">
												{[branch.cidade, branch.uf].filter(Boolean).join(" / ") ||
													"Sem cidade"}{" "}
												· {branchCompanies.length} matriz(es)
											</span>
										</span>
										<Plus size={14} className="mt-1 shrink-0 text-blue-600" />
									</button>
								);
							})}
						</div>
					) : branchSearchInCenter.trim() ? (
						<p className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-sm font-bold text-slate-500">
							Nenhuma filial encontrada.
						</p>
					) : null}
					{selectedCenterBranches.length ? (
						<div className="flex flex-wrap gap-2">
							{selectedCenterBranches.map((branch) => (
								<span
									key={branch.id}
									className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700"
								>
									{branch.codigo || branch.id} - {branch.nome}
									<button
										type="button"
										disabled={readOnly || !canManage}
										onClick={() => removeCenterBranch(branch.id)}
										className="rounded-full text-cyan-500 hover:text-red-600 disabled:opacity-40"
										aria-label={`Remover ${branch.nome}`}
									>
										<X size={13} />
									</button>
								</span>
							))}
						</div>
					) : (
						<p className="rounded-xl bg-white p-3 text-sm font-bold text-slate-500 ring-1 ring-slate-200">
							Nenhuma filial vinculada a este centro.
						</p>
					)}
				</div>
				<div className="space-y-3">
					<label className="block text-xs font-black uppercase text-slate-500">
						Buscar empresa para adicionar
						<input
							value={companySearchInCenter}
							disabled={readOnly || !canManage}
							onChange={(event) => setCompanySearchInCenter(event.target.value)}
							placeholder="Digite código, nome, CNPJ ou filial"
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
						/>
					</label>
					{centerCompanyResults.length ? (
						<div className="grid gap-2">
							{centerCompanyResults.map((company) => {
								const branch = getCompanyBranch(company, branchById);
								return (
									<button
										key={company.id}
										type="button"
										onClick={() => addCenterCompany(company)}
										disabled={readOnly || !canManage}
										className="flex min-h-12 items-start justify-between gap-3 rounded-xl border border-purple-100 bg-white px-3 py-2 text-left text-sm font-bold text-slate-700 hover:border-purple-300 hover:bg-purple-50 disabled:opacity-60"
									>
										<span className="min-w-0">
											<span className="block truncate text-slate-950">
												{company.codigo || company.id} - {company.nome}
											</span>
											<span className="block text-xs text-slate-500">
												Filial:{" "}
												{branch
													? `${branch.codigo || branch.id} - ${branch.nome}`
													: "não vinculada"}
											</span>
										</span>
										<Plus size={14} className="mt-1 shrink-0 text-purple-600" />
									</button>
								);
							})}
						</div>
					) : companySearchInCenter.trim() ? (
						<p className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-sm font-bold text-slate-500">
							Nenhuma empresa encontrada.
						</p>
					) : null}
					{selectedCenterCompanies.length ? (
						<div className="flex flex-wrap gap-2">
							{selectedCenterCompanies.map((company) => {
								const branch = getCompanyBranch(company, branchById);
								return (
									<span
										key={company.id}
										className="inline-flex items-center gap-2 rounded-full border border-purple-100 bg-purple-50 px-3 py-1 text-xs font-black text-purple-700"
									>
										{company.codigo || company.id} - {company.nome}
										{branch ? ` · ${branch.nome}` : ""}
										<button
											type="button"
											disabled={readOnly || !canManage}
											onClick={() => removeCenterCompany(company.id)}
											className="rounded-full text-purple-500 hover:text-red-600 disabled:opacity-40"
											aria-label={`Remover ${company.nome}`}
										>
											<X size={13} />
										</button>
									</span>
								);
							})}
						</div>
					) : (
						<p className="rounded-xl bg-white p-3 text-sm font-bold text-slate-500 ring-1 ring-slate-200">
							Nenhuma matriz vinculada a este centro.
						</p>
					)}
				</div>
			</div>
		</fieldset>
	);
}
