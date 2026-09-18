import { Search } from "lucide-react";
import { brl, decimal, integer } from "../../utils/financeiroFormatters";
import { tariffBudgetMonthName } from "../../utils/tariffsViewModels";

function BankBadge({ item = {} }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-white shadow-sm"
				style={{ backgroundColor: item.bankColor || "#0f766e" }}
			>
				{item.bankInitials || String(item.label || item.bank || "?").slice(0, 2)}
			</span>
			<span className="truncate">{item.label || item.bank || item.method || "-"}</span>
		</span>
	);
}

function RankingList({ viewModel }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h3 className="text-lg font-black text-slate-950">{viewModel.rankingTitle}</h3>
			<div className="mt-4 grid gap-2 lg:grid-cols-2">
				{viewModel.doughnutRows.slice(0, 20).map((item, index) => (
					<div
						key={`${item.label}-${index}`}
						className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
					>
						<span className="truncate font-bold text-slate-700">
							{viewModel.type === "faturas" ? item.label : <BankBadge item={item} />}
						</span>
						<span className="shrink-0 font-black text-slate-950">
							{viewModel.type === "faturas"
								? integer.format(item.value)
								: brl.format(item.value)}
							{viewModel.type === "formasPagamento" ? (
								<span className="ml-2 text-xs font-black text-slate-400">
									{decimal.format(item.percentOfTotal || 0)}%
								</span>
							) : null}
						</span>
					</div>
				))}
			</div>
			{!viewModel.doughnutRows.length ? (
				<div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
					Nenhum dado encontrado para o ano selecionado.
				</div>
			) : null}
		</section>
	);
}

function ClientRows({ rows = [] }) {
	return rows.map((item, index) => (
		<tr
			key={`${item.id || item.clientCode || item.method}-${index}`}
			className="border-b border-slate-50 font-bold text-slate-700"
		>
			<td className="px-3 py-2">{item.clientCode || "-"}</td>
			<td className="max-w-[420px] truncate px-3 py-2">{item.clientName || "-"}</td>
			<td className="px-3 py-2">
				{item.year} - {item.monthName || tariffBudgetMonthName(item.month)}
			</td>
			<td className="px-3 py-2 text-right">{brl.format(Number(item.value || 0))}</td>
			<td className="px-3 py-2 text-right">{brl.format(Number(item.total || 0))}</td>
		</tr>
	));
}

function PaymentRows({ rows = [] }) {
	return rows.map((item, index) => (
		<tr
			key={`${item.id || item.clientCode || item.method}-${index}`}
			className="border-b border-slate-50 font-bold text-slate-700"
		>
			<td className="px-3 py-2">{item.year || "-"}</td>
			<td className="px-3 py-2">{item.monthName || tariffBudgetMonthName(item.month)}</td>
			<td className="max-w-[320px] truncate px-3 py-2">{item.method || "-"}</td>
			<td className="px-3 py-2">
				{item.quantity !== undefined
					? "Quantidade"
					: item.value !== undefined
						? "Valor"
						: "Cobrança"}
			</td>
			<td className="px-3 py-2 text-right">
				{item.quantity !== undefined ? integer.format(Number(item.quantity || 0)) : "-"}
			</td>
			<td className="px-3 py-2 text-right">
				{item.value !== undefined ? brl.format(Number(item.value || 0)) : "-"}
			</td>
			<td className="px-3 py-2 text-right">
				{item.percent !== undefined
					? `${decimal.format(Number(item.percent || 0))}%`
					: "-"}
			</td>
		</tr>
	));
}

function TariffsTableHeader({ mode }) {
	return (
		<thead>
			<tr className="border-b border-slate-100 text-xs font-black uppercase text-slate-400">
				{mode === "clients" ? (
					<>
						<th scope="col" className="px-3 py-2">Código</th>
						<th scope="col" className="px-3 py-2">Cliente</th>
						<th scope="col" className="px-3 py-2">Mês</th>
						<th scope="col" className="px-3 py-2 text-right">Receita</th>
						<th scope="col" className="px-3 py-2 text-right">Total anual</th>
					</>
				) : (
					<>
						<th scope="col" className="px-3 py-2">Ano</th>
						<th scope="col" className="px-3 py-2">Mês</th>
						<th scope="col" className="px-3 py-2">Forma</th>
						<th scope="col" className="px-3 py-2">Tipo</th>
						<th scope="col" className="px-3 py-2 text-right">Quantidade</th>
						<th scope="col" className="px-3 py-2 text-right">Valor</th>
						<th scope="col" className="px-3 py-2 text-right">% valor total</th>
					</>
				)}
			</tr>
		</thead>
	);
}

export default function TariffsDetailTable({
	onPageChange,
	onPageSizeChange,
	onSearchChange,
	pageSize,
	searchTerm,
	viewModel,
}) {
	return (
		<>
			<RankingList viewModel={viewModel} />
			{viewModel.showTable ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<h3 className="text-lg font-black text-slate-950">
								{viewModel.tableMode === "clients"
									? "Clientes e receita do período"
									: "Amostra por ano e mês"}
							</h3>
							<p className="mt-1 text-sm font-bold text-slate-500">
								{integer.format(viewModel.searchedRows.length)} registro(s)
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<div className="relative">
								<Search
									size={16}
									className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
								/>
								<input
									value={searchTerm}
									onChange={(event) => onSearchChange(event.target.value)}
									placeholder={viewModel.searchPlaceholder}
									className="min-h-11 w-72 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
								/>
							</div>
							<select
								value={pageSize}
								onChange={(event) => onPageSizeChange(Number(event.target.value))}
								className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700"
							>
								{[50, 100, 150, 200].map((size) => (
									<option key={size} value={size}>
										{size}
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="mt-4 overflow-x-auto">
						<table className="min-w-full text-left text-sm">
							<TariffsTableHeader mode={viewModel.tableMode} />
							<tbody>
								{viewModel.tableMode === "clients" ? (
									<ClientRows rows={viewModel.tableRows} />
								) : (
									<PaymentRows rows={viewModel.tableRows} />
								)}
							</tbody>
						</table>
					</div>
					<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-500">
						<span>
							Página {viewModel.safePageIndex} de {viewModel.totalPages}
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => onPageChange(Math.max(1, viewModel.safePageIndex - 1))}
								disabled={viewModel.safePageIndex <= 1}
								className="rounded-xl border border-slate-200 px-3 py-2 font-black text-slate-700 disabled:opacity-40"
							>
								Anterior
							</button>
							<button
								type="button"
								onClick={() =>
									onPageChange(Math.min(viewModel.totalPages, viewModel.safePageIndex + 1))
								}
								disabled={viewModel.safePageIndex >= viewModel.totalPages}
								className="rounded-xl border border-slate-200 px-3 py-2 font-black text-slate-700 disabled:opacity-40"
							>
								Próxima
							</button>
						</div>
					</div>
				</section>
			) : null}
		</>
	);
}
