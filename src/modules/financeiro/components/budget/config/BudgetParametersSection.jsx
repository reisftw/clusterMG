import { Database, Loader2, Settings, Trash2 } from "lucide-react";

export default function BudgetParametersSection({
	budgetSettings,
	canManage,
	disabled,
	DirectoratesDropdownSection,
	ListConfigInput,
	dreFakeLoading = false,
	onChangeSettings,
	onCreateFakeDreData,
	onDeleteFakeDreData,
	open,
	setOpen,
	centers,
}) {
	return (
		<>
			<details
				open={open}
				onToggle={(event) => setOpen(event.currentTarget.open)}
				className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"
			>
				<summary className="flex cursor-pointer list-none items-start gap-3">
					<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200">
						<Settings size={18} />
					</span>
					<span>
						<span className="block text-sm font-black text-slate-950">
							Parâmetros configuráveis
						</span>
					</span>
				</summary>
				<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					<ListConfigInput
						label="Tipos de centro"
						value={budgetSettings.centerTypes}
						disabled={disabled}
						onChange={(value) => onChangeSettings("centerTypes", value)}
					/>
					<ListConfigInput
						label="Categorias principais"
						value={budgetSettings.mainCategories}
						disabled={disabled}
						onChange={(value) => onChangeSettings("mainCategories", value)}
					/>
					<ListConfigInput
						label="Grupos de conta"
						value={budgetSettings.accountGroups}
						disabled={disabled}
						onChange={(value) => onChangeSettings("accountGroups", value)}
					/>
					<ListConfigInput
						label="Grupos DRE"
						value={budgetSettings.dreGroups}
						disabled={disabled}
						onChange={(value) => onChangeSettings("dreGroups", value)}
					/>
					<ListConfigInput
						label="Status do centro"
						value={budgetSettings.centerStatuses}
						disabled={disabled}
						onChange={(value) => onChangeSettings("centerStatuses", value)}
					/>
				</div>
			</details>

			<DirectoratesDropdownSection
				value={budgetSettings.directorates}
				centers={centers}
				disabled={!canManage || disabled}
				onChange={(value) => onChangeSettings("directorates", value)}
			/>

			<section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h3 className="text-sm font-black text-slate-950">
							Dados de Teste — DRE
						</h3>
						<p className="mt-1 text-xs font-bold text-amber-900">
							Crie ou remova somente lançamentos fictícios da DRE, sem alterar
							dados reais.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={onCreateFakeDreData}
							disabled={!canManage || disabled || dreFakeLoading}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
						>
							{dreFakeLoading ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<Database size={16} />
							)}
							Criar dados fictícios
						</button>
						<button
							type="button"
							onClick={onDeleteFakeDreData}
							disabled={!canManage || disabled || dreFakeLoading}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50"
						>
							<Trash2 size={16} />
							Apagar dados fictícios
						</button>
					</div>
				</div>
			</section>
		</>
	);
}
