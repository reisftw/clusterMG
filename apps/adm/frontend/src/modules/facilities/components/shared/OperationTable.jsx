import { EmptyState } from "./FacilitiesPrimitives";

export function OperationBadge({ children, tone = "blue" }) {
	const classes = {
		blue: "bg-blue-50 text-blue-700",
		emerald: "bg-emerald-50 text-emerald-700",
		orange: "bg-orange-50 text-orange-700",
		red: "bg-red-50 text-red-700",
		slate: "bg-slate-100 text-slate-600",
	}[tone] || "bg-blue-50 text-blue-700";
	return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${classes}`}>{children || "-"}</span>;
}

export function OperationTable({ columns = [], rows = [], emptyTitle, emptyDescription, onRowClick }) {
	return (
		<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			<div className="overflow-x-auto">
				<table className="min-w-full divide-y divide-slate-100">
					<thead className="bg-slate-50">
						<tr>
							{columns.map((column) => (
								<th key={column.key} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">
									{column.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 bg-white">
						{rows.length ? rows.map((row) => (
							<tr
								key={row.id}
								onClick={onRowClick ? () => onRowClick(row) : undefined}
								className={`${onRowClick ? "cursor-pointer" : ""} hover:bg-slate-50/80`}
							>
								{columns.map((column) => (
									<td key={column.key} className="px-4 py-4 text-sm font-semibold text-slate-700">
										{column.render ? column.render(row) : row[column.key] || "-"}
									</td>
								))}
							</tr>
						)) : (
							<tr>
								<td colSpan={columns.length} className="p-5">
									<EmptyState title={emptyTitle} description={emptyDescription} />
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
