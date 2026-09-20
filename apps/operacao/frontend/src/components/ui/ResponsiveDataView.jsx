function valueFromColumn(column, item, index) {
	if (typeof column.render === "function") return column.render(item, index);
	return item?.[column.key] ?? "-";
}

function rowKey(getRowKey, item, index) {
	if (typeof getRowKey === "function") return getRowKey(item, index);
	return item?.id || item?.documentId || item?.codigo || index;
}

export default function ResponsiveDataView({
	items = [],
	columns = [],
	getRowKey,
	emptyMessage = "Nenhum registro encontrado.",
	strategy = "cards",
	minTableWidth = "min-w-[760px]",
	cardClassName = "",
	tableClassName = "",
}) {
	const hasItems = Array.isArray(items) && items.length > 0;

	if (!hasItems) {
		return (
			<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
				{emptyMessage}
			</div>
		);
	}

	if (strategy === "scroll-table") {
		return (
			<div className="overflow-x-auto rounded-2xl border border-slate-200">
				<table
					className={`${minTableWidth} w-full divide-y divide-slate-100 text-sm ${tableClassName}`}
				>
					<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
						<tr>
							{columns.map((column) => (
								<th
									key={column.key || column.header}
									className={`px-4 py-3 ${column.headerClassName || ""}`}
								>
									{column.header}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 bg-white">
						{items.map((item, index) => (
							<tr key={rowKey(getRowKey, item, index)} className="align-top">
								{columns.map((column) => (
									<td
										key={column.key || column.header}
										className={`break-anywhere px-4 py-3 ${column.className || ""}`}
									>
										{valueFromColumn(column, item, index)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	}

	return (
		<>
			{/* Card mobile: melhor para listas com poucos campos, onde o usuário lê um registro por vez. */}
			<div className="grid gap-3 md:hidden">
				{items.map((item, index) => (
					<article
						key={rowKey(getRowKey, item, index)}
						className={`space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${cardClassName}`}
					>
						{columns.map((column) => (
							<div key={column.key || column.header}>
								<p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
									{column.cardLabel || column.header}
								</p>
								<div
									className={`mt-1 break-anywhere text-sm font-bold text-slate-800 ${column.className || ""}`}
								>
									{valueFromColumn(column, item, index)}
								</div>
							</div>
						))}
					</article>
				))}
			</div>

			<div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
				<table
					className={`${minTableWidth} w-full divide-y divide-slate-100 text-sm ${tableClassName}`}
				>
					<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
						<tr>
							{columns.map((column) => (
								<th
									key={column.key || column.header}
									className={`px-4 py-3 ${column.headerClassName || ""}`}
								>
									{column.header}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 bg-white">
						{items.map((item, index) => (
							<tr key={rowKey(getRowKey, item, index)} className="align-top">
								{columns.map((column) => (
									<td
										key={column.key || column.header}
										className={`break-anywhere px-4 py-3 ${column.className || ""}`}
									>
										{valueFromColumn(column, item, index)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
