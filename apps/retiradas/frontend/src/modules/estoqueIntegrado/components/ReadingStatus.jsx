export default function ReadingStatus({ status }) {
	if (!status) return null;
	const percent = Math.min(Math.max(Number(status.percent || 0), 0), 100);
	return (
		<div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-sm font-black">
						{status.stage || "Processando leitura"}
					</p>
					<p className="mt-1 text-xs font-semibold opacity-80">
						{status.processedMacs || 0} de {status.totalMacs || 0} MACs
						processados. Faltam {status.remainingMacs || 0}.
					</p>
				</div>
				<span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
					{percent}%
				</span>
			</div>
			<div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
				<div
					className="h-full rounded-full bg-blue-600 transition-all"
					style={{ width: `${percent}%` }}
				/>
			</div>
			{status.error ? (
				<p className="mt-2 text-xs font-bold text-red-700">{status.error}</p>
			) : null}
		</div>
	);
}
