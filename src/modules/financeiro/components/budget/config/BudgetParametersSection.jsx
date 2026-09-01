import { Settings } from "lucide-react";

export default function BudgetParametersSection({
	budgetSettings,
	canManage,
	disabled,
	DirectoratesDropdownSection,
	ListConfigInput,
	onChangeSettings,
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
		</>
	);
}
