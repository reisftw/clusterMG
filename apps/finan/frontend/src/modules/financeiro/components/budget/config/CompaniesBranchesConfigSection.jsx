import { Pencil, Plus, Trash2 } from "lucide-react";

export default function CompaniesBranchesConfigSection({
	BudgetDropdownSection,
	canManage,
	companies,
	branches,
	onCreateCompany,
	onCreateBranch,
	onEditCompany,
	onEditBranch,
	onRemoveCompany,
	onRemoveBranch,
	saving,
}) {
	return (
		<BudgetDropdownSection
			title="Matrizes e filiais orçamentárias"
			count={companies.length + branches.length}
			className="mt-5 border-cyan-200 bg-cyan-50"
			action={
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={onCreateCompany}
						disabled={!canManage || saving}
						className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-cyan-700 px-3 text-xs font-black text-white hover:bg-cyan-800 disabled:opacity-50"
					>
						<Plus size={14} /> Nova matriz
					</button>
					<button
						type="button"
						onClick={onCreateBranch}
						disabled={!canManage || saving || !companies.length}
						className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 text-xs font-black text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
					>
						<Plus size={14} /> Nova filial
					</button>
				</div>
			}
		>
			<div className="grid gap-4 xl:grid-cols-2">
				<BudgetDropdownSection
					title="Matrizes"
					count={companies.length}
					items={companies}
					pageSize={6}
					emptyText="Nenhuma matriz cadastrada."
					renderItem={(company) => (
						<CompanyCard
							key={company.id}
							company={company}
							branches={branches}
							canManage={canManage}
							saving={saving}
							onEdit={onEditCompany}
							onRemove={onRemoveCompany}
						/>
					)}
				/>
				<BudgetDropdownSection
					title="Filiais"
					count={branches.length}
					items={branches}
					pageSize={6}
					emptyText="Nenhuma filial cadastrada."
					renderItem={(branch) => (
						<BranchCard
							key={branch.id}
							branch={branch}
							companies={companies}
							canManage={canManage}
							saving={saving}
							onEdit={onEditBranch}
							onRemove={onRemoveBranch}
						/>
					)}
				/>
			</div>
		</BudgetDropdownSection>
	);
}

function CompanyCard({ company, branches, canManage, saving, onEdit, onRemove }) {
	return (
		<article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase text-cyan-700">
						ID {company.codigo || company.id}
					</p>
					<h4 className="text-sm font-black text-slate-950">{company.nome}</h4>
					<p className="text-xs font-bold text-slate-500">
						{(company.filiais || []).length} filial(is) vinculada(s)
					</p>
					{(company.filiais || []).length ? (
						<p className="mt-1 text-[11px] font-bold text-cyan-700">
							{(company.filiais || [])
								.slice(0, 3)
								.map(
									(branchId) =>
										branches.find((branch) => branch.id === branchId)?.nome ||
										branchId,
								)
								.join(", ")}
							{(company.filiais || []).length > 3
								? ` +${(company.filiais || []).length - 3}`
								: ""}
						</p>
					) : null}
				</div>
				<span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700">
					{company.status || "ativo"}
				</span>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => onEdit(company)}
					disabled={!canManage || saving}
					className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-blue-200 px-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
				>
					<Pencil size={12} /> Editar
				</button>
				<button
					type="button"
					onClick={() => onRemove(company.id)}
					disabled={!canManage || saving}
					className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-200 px-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
				>
					<Trash2 size={12} /> Excluir
				</button>
			</div>
		</article>
	);
}

function BranchCard({ branch, companies, canManage, saving, onEdit, onRemove }) {
	const branchCompanies = companies.filter(
		(item) =>
			item.filialId === branch.id ||
			item.branchId === branch.id ||
			(item.filiais || []).includes(branch.id) ||
			(branch.empresas || branch.companies || []).includes(item.id),
	);

	return (
		<article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase text-cyan-700">
						ID {branch.codigo || branch.id}
					</p>
					<h4 className="text-sm font-black text-slate-950">{branch.nome}</h4>
					<p className="text-xs font-bold text-slate-500">
						Matriz: {branchCompanies[0]?.nome || "não vinculada"}
						{branch.cidade ? ` · ${branch.cidade}` : ""}
					</p>
				</div>
				<span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700">
					{branch.status || "ativo"}
				</span>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => onEdit(branch)}
					disabled={!canManage || saving}
					className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-blue-200 px-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
				>
					<Pencil size={12} /> Editar
				</button>
				<button
					type="button"
					onClick={() => onRemove(branch.id)}
					disabled={!canManage || saving}
					className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-200 px-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
				>
					<Trash2 size={12} /> Excluir
				</button>
			</div>
		</article>
	);
}
