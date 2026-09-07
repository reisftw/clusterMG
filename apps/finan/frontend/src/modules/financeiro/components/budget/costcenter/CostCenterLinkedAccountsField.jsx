import { Plus, X } from "lucide-react";

export default function CostCenterLinkedAccountsField({
	accounts = [],
	accountSearchInCenter,
	centerAccountResults = [],
	canManage,
	costCenterTypes,
	readOnly,
	removeCenterAccount,
	selectedCenterAccounts = [],
	setAccountSearchInCenter,
	addCenterAccount,
}) {
	if (!accounts.length) {
		return (
			<fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
				<legend className="px-1 text-xs font-black uppercase text-slate-500">
					Contas financeiras permitidas
				</legend>
				<p className="mt-2 text-sm font-bold text-amber-700">
					Cadastre contas financeiras para vincular a natureza dos lançamentos.
				</p>
			</fieldset>
		);
	}

	return (
		<fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
			<legend className="px-1 text-xs font-black uppercase text-slate-500">
				Contas financeiras permitidas
			</legend>
			<div className="mt-3 space-y-3">
				<label className="block text-xs font-black uppercase text-slate-500">
					Buscar conta para adicionar
					<input
						value={accountSearchInCenter}
						disabled={readOnly || !canManage}
						onChange={(event) => setAccountSearchInCenter(event.target.value)}
						placeholder="Digite código, reduzida ou nome da conta"
						className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
					/>
				</label>
				{centerAccountResults.length ? (
					<div className="grid gap-2 lg:grid-cols-2">
						{centerAccountResults.map((account) => (
							<button
								key={account.id}
								type="button"
								onClick={() => addCenterAccount(account.id)}
								disabled={readOnly || !canManage}
								className="flex min-h-12 items-start justify-between gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-left text-sm font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
							>
								<span className="min-w-0">
									<span className="block truncate text-slate-950">
										{account.codigo || account.reduzida || account.id} -{" "}
										{account.nome}
									</span>
									<span className="block text-xs text-slate-500">
										{account.tipo === "receita" ? "Receita" : "Despesa"} ·{" "}
										{costCenterTypes[account.natureza] || "OPEX"}
									</span>
								</span>
								<Plus size={14} className="mt-1 shrink-0 text-blue-600" />
							</button>
						))}
					</div>
				) : accountSearchInCenter.trim() ? (
					<p className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-sm font-bold text-slate-500">
						Nenhuma conta encontrada com esse código ou nome.
					</p>
				) : null}
				{selectedCenterAccounts.length ? (
					<div className="flex flex-wrap gap-2">
						{selectedCenterAccounts.map((account) => (
							<span
								key={account.id}
								className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700"
							>
								{account.codigo || account.reduzida || account.id} - {account.nome}
								<button
									type="button"
									disabled={readOnly || !canManage}
									onClick={() => removeCenterAccount(account.id)}
									className="rounded-full text-blue-500 hover:text-red-600 disabled:opacity-40"
									aria-label={`Remover ${account.nome}`}
								>
									<X size={13} />
								</button>
							</span>
						))}
					</div>
				) : (
					<p className="rounded-xl bg-white p-3 text-sm font-bold text-slate-500 ring-1 ring-slate-200">
						Nenhuma conta financeira vinculada a este centro.
					</p>
				)}
			</div>
		</fieldset>
	);
}
