import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import ModalShell from "../../../../../components/ui/ModalShell";
import {
	BUDGET_CATEGORY_CLASSES,
	enrichFinancialAccountWithCategory,
	getFinancialAccountCategoryCatalog,
	normalizeFinancialAccountCategories,
} from "../../../utils/budgetAccountCategories";
import { integer } from "../../../utils/financeiroFormatters";

function classLabel(classType) {
	return classType === BUDGET_CATEGORY_CLASSES.NAO_BASAL ? "NÃO BASAL" : "BASAL";
}

function buildCategoryGroups({
	accounts = [],
	isAccountInactive,
	accountStatusFilter,
	accountTextMatches,
	budgetSettings,
}) {
	const accountVisibleByStatus = (account) => {
		const inactive = isAccountInactive(account);
		if (accountStatusFilter === "ativos") return !inactive;
		if (accountStatusFilter === "inativos") return inactive;
		return true;
	};
	const categoryCatalog = budgetSettings?.financialAccountCategories || [];
	const enrichedAccounts = accounts.map((account) =>
		enrichFinancialAccountWithCategory(account, categoryCatalog),
	);
	const catalog = getFinancialAccountCategoryCatalog(
		budgetSettings?.financialAccountCategories || [],
	);
	const baseGroups = [
		...catalog,
		{
			name: "Sem categoria",
			classType: BUDGET_CATEGORY_CLASSES.BASAL,
			accounts: [],
		},
	].map((category) => ({
		...category,
		key: `${category.classType}:${category.name}`,
		items: [],
	}));
	for (const account of enrichedAccounts) {
		const classType = account.categoriaClasse || BUDGET_CATEGORY_CLASSES.BASAL;
		const categoryName = account.categoriaMae || "Sem categoria";
		const key = `${classType}:${categoryName}`;
		const group =
			baseGroups.find((item) => item.key === key) ||
			baseGroups.find((item) => item.key === `${classType}:Sem categoria`) ||
			baseGroups.at(-1);
		group.items.push(account);
	}
	return baseGroups
		.map((group) => {
			const visibleItems = group.items
				.filter(accountVisibleByStatus)
				.filter((account) => accountTextMatches(account, [group]))
				.sort((left, right) =>
					String(left.codigo || left.nome).localeCompare(
						String(right.codigo || right.nome),
						"pt-BR",
						{ numeric: true },
					),
				);
			return { ...group, visibleItems };
		})
		.filter((group) => group.visibleItems.length || !group.items.length);
}

export function FinancialAccountCategoriesModal({
	budgetSettings,
	canManage,
	onChangeSettings,
	onClose,
	saving,
}) {
	const [newCategoryName, setNewCategoryName] = useState("");
	const [newCategoryClass, setNewCategoryClass] = useState(
		BUDGET_CATEGORY_CLASSES.BASAL,
	);
	const categoryCatalog = getFinancialAccountCategoryCatalog(
		budgetSettings?.financialAccountCategories || [],
	);
	const saveCategoryCatalog = (nextCategories) =>
		onChangeSettings?.(
			"financialAccountCategories",
			normalizeFinancialAccountCategories(nextCategories, []),
		);
	const createCategory = (category) => {
		const name = String(category?.name || "").trim();
		if (!name || !canManage || saving) return;
		const normalizedName = name
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase();
		const classType = category.classType || BUDGET_CATEGORY_CLASSES.BASAL;
		const nextCategories = [...categoryCatalog];
		const alreadyExists = nextCategories.some(
			(item) =>
				item.classType === classType &&
				item.name
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.toLowerCase() === normalizedName,
		);
		if (!alreadyExists) {
			nextCategories.push({
				name,
				classType,
				accounts: [],
			});
		}
		saveCategoryCatalog(nextCategories);
		setNewCategoryName("");
	};
	const updateCategoryClass = (category, classType) => {
		const nextCategories = categoryCatalog.map((item) =>
			item.name === category.name && item.classType === category.classType
				? { ...item, classType }
				: item,
		);
		saveCategoryCatalog(nextCategories);
	};

	return (
		<ModalShell title="Categorias BASAL e NÃO BASAL" onClose={onClose} size="xl">
			<div className="space-y-4">
				<section className="rounded-2xl border border-emerald-100 bg-white p-4">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-end">
						<label className="flex-1 text-xs font-black uppercase text-slate-500">
							Nova categoria
							<input
								value={newCategoryName}
								disabled={!canManage || saving}
								onChange={(event) => setNewCategoryName(event.target.value)}
								placeholder="Ex: Auditoria, Expansão, Projetos especiais"
								className="mt-2 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm normal-case text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
							/>
						</label>
						<label className="text-xs font-black uppercase text-slate-500">
							Tipo
							<select
								value={newCategoryClass}
								disabled={!canManage || saving}
								onChange={(event) => setNewCategoryClass(event.target.value)}
								className="mt-2 min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
							>
								<option value={BUDGET_CATEGORY_CLASSES.BASAL}>BASAL</option>
								<option value={BUDGET_CATEGORY_CLASSES.NAO_BASAL}>
									NÃO BASAL
								</option>
							</select>
						</label>
						<button
							type="button"
							disabled={!canManage || saving || !newCategoryName.trim()}
							onClick={() =>
								createCategory({
									name: newCategoryName,
									classType: newCategoryClass,
								})
							}
							className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
						>
							Cadastrar categoria
						</button>
					</div>
				</section>
				<section className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
					{categoryCatalog.map((category) => (
						<div
							key={`${category.classType}:${category.name}`}
							className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
						>
							<div className="min-w-0">
								<p className="break-words text-sm font-black text-slate-950">
									{category.name}
								</p>
								<p className="text-[11px] font-bold text-slate-500">
									{integer.format(category.accounts?.length || 0)} conta(s)
									referência
								</p>
							</div>
							<select
								value={category.classType}
								disabled={!canManage || saving}
								onChange={(event) =>
									updateCategoryClass(category, event.target.value)
								}
								className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
							>
								<option value={BUDGET_CATEGORY_CLASSES.BASAL}>BASAL</option>
								<option value={BUDGET_CATEGORY_CLASSES.NAO_BASAL}>
									NÃO BASAL
								</option>
							</select>
						</div>
					))}
				</section>
			</div>
		</ModalShell>
	);
}

export default function FinancialAccountsConfigSection({
	BudgetDropdownSection,
	EMPTY_FINANCIAL_ACCOUNT,
	accountSearch,
	accountStatusFilter,
	budgetSettings,
	canManage,
	isAccountInactive,
	removeAccount,
	saving,
	setAccountModal,
	setAccountSearch,
	setAccountStatusFilter,
	setAccountViewModal,
	sortedAccounts,
}) {
	const configuredCategoryCatalog = budgetSettings?.financialAccountCategories || [];
	const enrichedAccounts = sortedAccounts.map((account) =>
		enrichFinancialAccountWithCategory(account, configuredCategoryCatalog),
	);
	const categoryGroups = buildCategoryGroups({
		accounts: enrichedAccounts,
		budgetSettings,
		isAccountInactive,
		accountStatusFilter,
		accountTextMatches: (account, related = []) => {
			const text = [
				account?.codigo,
				account?.reduzida,
				account?.classificacao,
				account?.nome,
				account?.tipoPlano,
				account?.naturezaPlano,
				account?.status,
				account?.categoriaMae,
				account?.categoriaClasseLabel,
				...related.flatMap((item) => [item?.name, item?.classType]),
			]
				.filter(Boolean)
				.join(" ");
			return (
				!accountSearch ||
				text
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.toLowerCase()
					.includes(
						String(accountSearch || "")
							.normalize("NFD")
							.replace(/[\u0300-\u036f]/g, "")
							.toLowerCase(),
					)
			);
		},
	});
	const basalGroups = categoryGroups.filter(
		(group) => group.classType === BUDGET_CATEGORY_CLASSES.BASAL,
	);
	const nonBasalGroups = categoryGroups.filter(
		(group) => group.classType === BUDGET_CATEGORY_CLASSES.NAO_BASAL,
	);
	const classifiedCount = sortedAccounts.filter(
		(account) =>
			enrichFinancialAccountWithCategory(account, configuredCategoryCatalog)
				.categoriaMae !== "Sem categoria",
	).length;
	const totalSyntheticAccountCount = enrichedAccounts.filter(
		(account) => account.tipoPlano === "S" && Number(account.nivel || 0) > 2,
	).length;
	const totalAnalyticAccountCount = enrichedAccounts.filter(
		(account) => account.tipoPlano === "A",
	).length;
	const renderCategory = (group) => (
		<details
			key={group.key}
			className="rounded-2xl border border-slate-200 bg-white shadow-sm"
		>
			<summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
				<div>
					<p className="text-xs font-black uppercase text-slate-500">
						{classLabel(group.classType)}
					</p>
					<h3 className="text-base font-black text-slate-950">
						{group.name}
					</h3>
				</div>
				<div className="flex flex-wrap gap-2">
					<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
						{integer.format(group.items.length)} conta(s)
					</span>
					<span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
						{integer.format(group.visibleItems.length)} visível(is)
					</span>
				</div>
			</summary>
			<div className="grid gap-3 border-t border-slate-100 p-4 md:grid-cols-2">
				{group.visibleItems.length ? (
					group.visibleItems.map((account) => {
						const inactive = isAccountInactive(account);
						return (
							<article
								key={account.id}
								className={`rounded-2xl border p-4 ${inactive ? "border-slate-200 bg-slate-50 opacity-75" : "border-emerald-100 bg-emerald-50/50"}`}
							>
								<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
											{account.codigo || account.id} ·{" "}
											{account.reduzida || account.classificacao || "sem reduzida"}
										</p>
										<h4 className="text-sm font-black text-slate-950">
											{account.nome}
										</h4>
										<p className="mt-1 text-xs font-bold text-slate-500">
											{classLabel(account.categoriaClasse)} ·{" "}
											{account.naturezaPlano === "C"
												? "Crédito/Receita"
												: "Débito/Despesa"}{" "}
											· Nível {account.nivel || "-"}
										</p>
									</div>
									<span
										className={`rounded-full px-2.5 py-1 text-[11px] font-black ${inactive ? "bg-slate-200 text-slate-600" : "bg-white text-emerald-700 ring-1 ring-emerald-100"}`}
									>
										{account.status || "ativo"}
									</span>
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									<button
										type="button"
										onClick={() => setAccountViewModal({ account })}
										className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 hover:bg-slate-50"
									>
										<Eye size={13} /> Ver
									</button>
									<button
										type="button"
										onClick={() => setAccountModal({ account })}
										disabled={!canManage || saving}
										className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-blue-200 bg-white px-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
									>
										<Pencil size={13} /> Editar conta
									</button>
									<button
										type="button"
										onClick={() => removeAccount(account.id)}
										disabled={!canManage || saving}
										className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-red-200 bg-white px-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
									>
										<Trash2 size={13} /> Excluir
									</button>
								</div>
							</article>
						);
					})
				) : (
					<p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500 md:col-span-2">
						Nenhuma conta financeira vinculada nesta categoria.
					</p>
				)}
			</div>
		</details>
	);

	return (
		<BudgetDropdownSection
			title="Categorias e contas financeiras"
			count={sortedAccounts.length}
			className="mt-5 border-emerald-200 bg-emerald-50"
			action={
				<div className="flex flex-col gap-2 lg:flex-row lg:items-center">
					<input
						value={accountSearch}
						onChange={(event) => setAccountSearch(event.target.value)}
						placeholder="Buscar por categoria, código ou conta"
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
						onClick={() => setAccountModal({ account: EMPTY_FINANCIAL_ACCOUNT })}
						disabled={!canManage || saving}
						className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
					>
						<Plus size={14} /> Nova conta financeira
					</button>
				</div>
			}
		>
			<div className="mb-4 grid gap-3 md:grid-cols-4">
				<div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-100">
					<p className="text-xs font-black uppercase text-emerald-700">
						BASAL
					</p>
					<p className="mt-1 text-2xl font-black text-slate-950">
						{integer.format(basalGroups.length)}
					</p>
				</div>
				<div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-100">
					<p className="text-xs font-black uppercase text-emerald-700">
						NÃO BASAL
					</p>
					<p className="mt-1 text-2xl font-black text-slate-950">
						{integer.format(nonBasalGroups.length)}
					</p>
				</div>
				<div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-100">
					<p className="text-xs font-black uppercase text-emerald-700">
						Contas
					</p>
					<p className="mt-1 text-2xl font-black text-slate-950">
						{integer.format(sortedAccounts.length)}
					</p>
					<p className="text-xs font-bold text-slate-500">
						{integer.format(totalSyntheticAccountCount)} sint. ·{" "}
						{integer.format(totalAnalyticAccountCount)} anal.
					</p>
				</div>
				<div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-100">
					<p className="text-xs font-black uppercase text-emerald-700">
						Classificadas
					</p>
					<p className="mt-1 text-2xl font-black text-slate-950">
						{integer.format(classifiedCount)}
					</p>
				</div>
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<section className="space-y-3">
					<div className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-800">
						Custos BASAL
					</div>
					{basalGroups.map(renderCategory)}
				</section>
				<section className="space-y-3">
					<div className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-black text-amber-800">
						Custos NÃO BASAL
					</div>
					{nonBasalGroups.map(renderCategory)}
				</section>
			</div>
		</BudgetDropdownSection>
	);
}
