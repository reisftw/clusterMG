import {
	AlertTriangle,
	CheckCircle2,
	FileSpreadsheet,
	Loader2,
	RefreshCw,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buildDreStatementViewModel,
	parseDreWorkbook,
} from "../../domain/financialStatement";
import {
	buscarDreOrcamentoFinanceiro,
	importarDreOrcamentoFinanceiro,
} from "../../services/financeiroService";
import { DRE_STATEMENT_LINES } from "../../utils/dreStatement";
import { brl, integer } from "../../utils/financeiroFormatters";

function DreLineBadge({ type }) {
	const className =
		type === "result"
			? "bg-blue-50 text-blue-700 ring-blue-100"
			: "bg-slate-50 text-slate-600 ring-slate-100";
	return (
		<span
			className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ring-1 ${className}`}
		>
			{type === "result" ? "Calculado" : "Base"}
		</span>
	);
}

export default function BudgetDreView({ canManage, setFeedback }) {
	const now = new Date();
	const [ano, setAno] = useState(now.getFullYear());
	const [mes, setMes] = useState(now.getMonth() + 1);
	const [isFake, setIsFake] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [data, setData] = useState({
		totalsByLine: {},
		rows: [],
		competencias: [],
	});
	const [preview, setPreview] = useState(null);

	const loadDre = useCallback(async () => {
		setLoading(true);
		try {
			const response = await buscarDreOrcamentoFinanceiro({ ano, mes, isFake });
			setData(response || { totalsByLine: {}, rows: [], competencias: [] });
		} catch (error) {
			setFeedback?.({
				type: "error",
				title: "Erro ao carregar DRE",
				message: error?.message || "Não foi possível carregar a DRE.",
			});
		} finally {
			setLoading(false);
		}
	}, [ano, isFake, mes, setFeedback]);

	useEffect(() => {
		loadDre();
	}, [loadDre]);

	const viewModel = useMemo(
		() => buildDreStatementViewModel(data, preview),
		[data, preview],
	);
	const { classifiedRows, kpis, statement, unclassifiedRows } = viewModel;

	const handleFile = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		try {
			const buffer = await file.arrayBuffer();
			const parsed = parseDreWorkbook(file, buffer);
			setPreview(parsed);
			const first = parsed.rows.find(
				(row) => row.competenciaAno && row.competenciaMes,
			);
			if (first) {
				setAno(first.competenciaAno);
				setMes(first.competenciaMes);
			}
		} catch (error) {
			setFeedback?.({
				type: "error",
				title: "Erro ao ler XLSX",
				message: error?.message || "Não foi possível ler a planilha DRE.",
			});
		}
	};

	const confirmImport = async () => {
		if (!classifiedRows.length || unclassifiedRows.length) return;
		setSaving(true);
		try {
			await importarDreOrcamentoFinanceiro({
				fileName: preview.fileName,
				sheetName: preview.sheetName,
				rows: classifiedRows,
				isFake: false,
			});
			setPreview(null);
			setIsFake(false);
			await loadDre();
		} catch (error) {
			setFeedback?.({
				type: "error",
				title: "Erro ao importar DRE",
				message: error?.message || "Não foi possível salvar a DRE.",
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="space-y-4">
			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">DRE</h2>
						<p className="mt-1 text-sm font-bold text-slate-500">
							Importe as linhas-base e confira os resultados calculados pela
							tela.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<select
							value={mes}
							onChange={(event) => setMes(Number(event.target.value))}
							className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
						>
							{Array.from({ length: 12 }, (_, index) => index + 1).map(
								(month) => (
									<option key={month} value={month}>
										{String(month).padStart(2, "0")}
									</option>
								),
							)}
						</select>
						<input
							type="number"
							value={ano}
							onChange={(event) => setAno(Number(event.target.value))}
							className="min-h-11 w-28 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
						/>
						<label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700">
							<input
								type="checkbox"
								checked={isFake}
								onChange={(event) => setIsFake(event.target.checked)}
							/>
							Dados fictícios
						</label>
						<button
							type="button"
							onClick={loadDre}
							disabled={loading}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw
								size={16}
								className={loading ? "animate-spin" : ""}
							/>{" "}
							Atualizar
						</button>
						<label
							className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 ${
								!canManage ? "pointer-events-none opacity-50" : ""
							}`}
						>
							<Upload size={16} /> Importar XLSX
							<input
								type="file"
								accept=".xlsx,.xls"
								onChange={handleFile}
								disabled={!canManage || saving}
								className="hidden"
							/>
						</label>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-4">
				{kpis.map(([label, value]) => (
					<div
						key={label}
						className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
					>
						<p className="text-xs font-black uppercase text-slate-500">
							{label}
						</p>
						<p
							className={`mt-2 text-2xl font-black ${
								value < 0 ? "text-red-600" : "text-slate-950"
							}`}
						>
							{brl.format(value)}
						</p>
					</div>
				))}
			</section>

			{preview ? (
				<section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
						<div>
							<h3 className="flex items-center gap-2 text-sm font-black text-slate-950">
								<FileSpreadsheet size={16} /> Prévia da importação
							</h3>
							<p className="mt-1 text-xs font-bold text-blue-900">
								{preview.fileName} · {integer.format(classifiedRows.length)}{" "}
								linha(s) classificadas
								{unclassifiedRows.length
									? ` · ${integer.format(unclassifiedRows.length)} revisar`
									: ""}
							</p>
						</div>
						<button
							type="button"
							onClick={confirmImport}
							disabled={
								saving || !classifiedRows.length || unclassifiedRows.length
							}
							className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
						>
							{saving ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<CheckCircle2 size={16} />
							)}
							Confirmar importação
						</button>
					</div>
					{unclassifiedRows.length ? (
						<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
							<AlertTriangle className="mr-2 inline" size={16} />
							Existem categorias sem correspondência DRE. A importação fica
							bloqueada para evitar descarte silencioso.
						</div>
					) : null}
				</section>
			) : null}

			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-200 p-4">
					<h3 className="text-base font-black text-slate-950">
						Demonstrativo de Resultado
					</h3>
					<p className="text-xs font-bold text-slate-500">
						Linhas de resultado calculadas automaticamente a partir dos
						lançamentos base.
					</p>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full table-fixed text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="w-20 px-4 py-3">Ordem</th>
								<th className="px-4 py-3">Linha DRE</th>
								<th className="w-32 px-4 py-3">Tipo</th>
								<th className="w-48 px-4 py-3 text-right">Valor</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{loading ? (
								<tr>
									<td
										colSpan={4}
										className="px-4 py-10 text-center text-sm font-bold text-slate-500"
									>
										Carregando DRE...
									</td>
								</tr>
							) : (
								statement.map((line) => (
									<tr
										key={line.id}
										className={
											line.type === "result" ? "bg-blue-50/40" : "bg-white"
										}
									>
										<td className="px-4 py-3 font-black text-slate-500">
											{line.order}
										</td>
										<td className="px-4 py-3 font-black text-slate-950">
											{line.label}
										</td>
										<td className="px-4 py-3">
											<DreLineBadge type={line.type} />
										</td>
										<td
											className={`px-4 py-3 text-right font-black ${
												line.value < 0 ? "text-red-600" : "text-slate-950"
											}`}
										>
											{brl.format(line.value)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<h3 className="text-base font-black text-slate-950">
					Lançamentos lidos
				</h3>
				<div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200">
					<table className="min-w-full text-left text-xs font-bold">
						<thead className="sticky top-0 bg-slate-50 text-slate-500">
							<tr>
								<th className="px-3 py-2">Categoria</th>
								<th className="px-3 py-2">Descrição</th>
								<th className="px-3 py-2">Arquivo</th>
								<th className="px-3 py-2 text-right">Valor</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{(data.rows || []).length ? (
								data.rows.map((row) => (
									<tr key={row.id}>
										<td className="px-3 py-2 text-slate-950">
											{DRE_STATEMENT_LINES.find(
												(line) => line.id === row.linhaDre,
											)?.label || row.categoriaOriginal}
										</td>
										<td className="px-3 py-2 text-slate-600">
											{row.descricao || "-"}
										</td>
										<td className="px-3 py-2 text-slate-600">
											{row.origemArquivo || "-"}
										</td>
										<td className="px-3 py-2 text-right text-slate-950">
											{brl.format(Number(row.valor || 0))}
										</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={4}
										className="px-3 py-8 text-center text-sm text-slate-500"
									>
										Nenhum lançamento DRE encontrado para a competência
										selecionada.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</section>
	);
}
