export default function TariffsDetectedBlocks({ report }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h3 className="text-lg font-black text-slate-950">Blocos lidos da planilha</h3>
			<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{(report?.blocosDetectados || []).slice(0, 12).map((block, index) => (
					<div
						key={`${block.sheetName}-${block.type}-${index}`}
						className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-800"
					>
						<p className="font-black">{block.label}</p>
						<p className="mt-1 text-xs">
							{block.sheetName} · {block.type}
						</p>
					</div>
				))}
				{(report?.blocosNaoMapeados || []).map((block) => (
					<div
						key={block.sheetName}
						className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-bold text-amber-800"
					>
						<p className="font-black">{block.sheetName}</p>
						<p className="mt-1 text-xs">
							Bloco salvo como não mapeado para ajuste futuro.
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
