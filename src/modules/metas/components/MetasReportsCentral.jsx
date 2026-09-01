import { Download, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import {
	exportMetasCentralReport,
	getAvailableMetasReportMonths,
	METAS_CENTRAL_REPORT_ITEMS,
} from "../services/metasCentralReportService";

export default function MetasReportsCentral({
	allData,
	agentesData,
	currentMonth,
}) {
	const availableMonths = useMemo(
		() => getAvailableMetasReportMonths(allData, agentesData),
		[agentesData, allData],
	);
	const [open, setOpen] = useState(false);
	const [selectedMonth, setSelectedMonth] = useState(
		availableMonths.includes(currentMonth)
			? currentMonth
			: availableMonths[0] || currentMonth,
	);
	const [selectedItems, setSelectedItems] = useState(() =>
		METAS_CENTRAL_REPORT_ITEMS.map((item) => item.id),
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const hasData = availableMonths.length > 0;
	const allSelected = selectedItems.length === METAS_CENTRAL_REPORT_ITEMS.length;

	useEffect(() => {
		if (!availableMonths.length) return;
		setSelectedMonth((current) =>
			availableMonths.includes(current)
				? current
				: availableMonths.includes(currentMonth)
					? currentMonth
					: availableMonths[0],
		);
	}, [availableMonths, currentMonth]);

	const toggleItem = (itemId) => {
		setSelectedItems((current) =>
			current.includes(itemId)
				? current.filter((id) => id !== itemId)
				: [...current, itemId],
		);
	};

	const handleExport = async () => {
		setError("");
		setLoading(true);
		try {
			await exportMetasCentralReport({
				month: selectedMonth,
				allData,
				agentesData,
				selectedItems,
			});
			setOpen(false);
		} catch (err) {
			setError(err?.message || "Não foi possível gerar o relatório.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={!hasData}
				className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
				title={
					hasData
						? "Abrir central de relatórios de metas"
						: "Sem meses salvos para gerar relatório"
				}
			>
				<FileText size={16} />
				Central de relatório
			</button>

			{open ? (
				<ModalShell
					open
					title="Central de relatório"
					description="Escolha o mês e os blocos que serão baixados em PDF."
					onClose={() => setOpen(false)}
					size="3xl"
					footer={
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							{error ? (
								<p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
									{error}
								</p>
							) : (
								<p className="text-xs font-semibold text-slate-500">
									Cada item selecionado vira uma seção do PDF.
								</p>
							)}
							<div className="flex justify-end gap-2">
								<button
									type="button"
									onClick={() => setOpen(false)}
									className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
								>
									Cancelar
								</button>
								<button
									type="button"
									onClick={handleExport}
									disabled={loading || !selectedItems.length}
									className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
								>
									<Download size={16} />
									{loading ? "Gerando..." : "Baixar relatório"}
								</button>
							</div>
						</div>
					}
				>
					<div className="space-y-5">
						<label className="block space-y-1.5">
							<span className="text-xs font-bold uppercase text-slate-500">
								Mês
							</span>
							<select
								value={selectedMonth}
								onChange={(event) => setSelectedMonth(event.target.value)}
								className="input-field bg-white"
							>
								{availableMonths.map((month) => (
									<option key={month} value={month}>
										{month}
									</option>
								))}
							</select>
						</label>

						<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="text-sm font-black text-slate-900">
										Itens do relatório
									</p>
									<p className="text-xs text-slate-500">
										Marque apenas o que precisa conferir ou enviar.
									</p>
								</div>
								<button
									type="button"
									onClick={() =>
										setSelectedItems(
											allSelected
												? []
												: METAS_CENTRAL_REPORT_ITEMS.map((item) => item.id),
										)
									}
									className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
								>
									{allSelected ? "Desmarcar todos" : "Selecionar todos"}
								</button>
							</div>

							<div className="mt-4 grid gap-2 sm:grid-cols-2">
								{METAS_CENTRAL_REPORT_ITEMS.map((item) => (
									<label
										key={item.id}
										className="flex items-center gap-3 rounded-xl border border-white bg-white px-3 py-3 text-sm font-bold text-slate-700 shadow-sm"
									>
										<input
											type="checkbox"
											checked={selectedItems.includes(item.id)}
											onChange={() => toggleItem(item.id)}
											className="h-4 w-4 rounded border-slate-300 text-blue-600"
										/>
										<span>{item.label}</span>
									</label>
								))}
							</div>
						</div>
					</div>
				</ModalShell>
			) : null}
		</>
	);
}
