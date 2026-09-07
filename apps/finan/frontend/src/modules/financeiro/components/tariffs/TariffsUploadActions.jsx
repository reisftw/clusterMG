import { CalendarClock, Download, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";

export default function TariffsUploadActions({
	action,
	canManage,
	lastUpdatedLabel,
	loading,
	onClear,
	onOpenReport,
	onRefresh,
	onUpload,
	report,
}) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">Dashboard Tarifas</h2>
					<p className="mt-1 text-sm font-bold text-slate-500">
						Todas as abas da planilha
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white hover:bg-orange-700 ${!canManage || action ? "pointer-events-none opacity-50" : ""}`}>
						{action === "upload" ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<Upload size={16} />
						)}
						Ler XLSX Tarifas
						<input
							type="file"
							accept=".xlsx"
							className="hidden"
							disabled={!canManage || Boolean(action)}
							onChange={onUpload}
						/>
					</label>
					<button
						type="button"
						onClick={onRefresh}
						disabled={loading || Boolean(action)}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
					>
						<RefreshCw size={16} className={loading ? "animate-spin" : ""} />
						Atualizar
					</button>
					<button
						type="button"
						onClick={onOpenReport}
						disabled={loading || !report}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
					>
						<Download size={16} />
						Gerar Relatório
					</button>
					<span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-500">
						<CalendarClock size={16} className="text-slate-700" />
						<span>
							<span className="block leading-tight">Última atualização</span>
							<span className="block text-sm text-slate-950">{lastUpdatedLabel}</span>
						</span>
					</span>
					<button
						type="button"
						onClick={onClear}
						disabled={!canManage || loading || Boolean(action)}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
					>
						<Trash2 size={16} />
						Zerar dados
					</button>
				</div>
			</div>
		</section>
	);
}
