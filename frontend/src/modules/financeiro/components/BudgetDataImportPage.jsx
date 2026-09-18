// Roteiro UX_AUDIT.md (Fase 5 — extracao incremental de FinanceiroPage.jsx,
// continuacao): pagina "Dados Orcamentarios" (importacao de XLSX)
// extraida do arquivao. Codigo identico ao que estava la — so mudou de
// arquivo.
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import ConfirmDialog from "../../../components/ConfirmDialog";
import {
	buscarDadosOrcamentoFinanceiro,
	buscarImportacaoDadosOrcamentoFinanceiro,
	iniciarImportacaoDadosOrcamentoFinanceiro,
	limparDadosOrcamentoFinanceiro,
} from "../services/financeiroService";
import { brl, formatBudgetCurrency, integer } from "../utils/financeiroFormatters";
import { EmptyState } from "./shared/DashboardPrimitives";
import {
	FeedbackModal,
	formatUpdatedAt,
	getVisibleError,
} from "./shared/FinanceiroSharedHelpers";

const BUDGET_IMPORT_FIELDS = [
	{ key: "quebra", label: "Quebra" },
	{ key: "data", label: "Data" },
	{ key: "fornecedor", label: "Fornecedor" },
	{ key: "codConta", label: "Cod_Conta" },
	{ key: "nomeConta", label: "Nome_Conta" },
	{ key: "codCc", label: "Cod_CC" },
	{ key: "nomeCc", label: "Nome_CC" },
	{ key: "orcado", label: "Orçado" },
	{ key: "realizado", label: "Realizado" },
	{ key: "empresa", label: "Empresa" },
	{ key: "filial", label: "Filial" },
	{ key: "conta", label: "Conta" },
	{ key: "seqMov", label: "SeqMov" },
	{ key: "titulo", label: "Titulo" },
	{ key: "tipo", label: "Tipo" },
	{ key: "observacoes", label: "Observações" },
	{ key: "ano", label: "Ano" },
	{ key: "numMes", label: "Num_Mes" },
	{ key: "mes", label: "Mês" },
	{ key: "categoria", label: "Categoria" },
	{ key: "gestor", label: "Gestor" },
	{ key: "quebra2", label: "Quebra2" },
	{ key: "entidade", label: "Entidade" },
	{ key: "diretoria", label: "Diretoria" },
	{ key: "diretor", label: "Diretor" },
	{ key: "statusProjetos", label: "Status_Projetos" },
	{ key: "grupo", label: "Grupo" },
];

export default function BudgetDataImportPage({ canManage, onConfigUpdated }) {
	const [dataState, setDataState] = useState(null);
	const [importJob, setImportJob] = useState(null);
	const [loading, setLoading] = useState(true);
	const [reading, setReading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [feedback, setFeedback] = useState(null);
	const [confirmClearOpen, setConfirmClearOpen] = useState(false);

	const loadBudgetData = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarDadosOrcamentoFinanceiro();
			setDataState(response.data || {});
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Não foi possível carregar os dados importados.",
			);
			setMessage(visibleError.message);
			setFeedback({
				type: "error",
				title: "Erro ao carregar dados",
				...visibleError,
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadBudgetData();
	}, [loadBudgetData]);

	const pollImportJob = useCallback(
		async (jobId) => {
			let keepPolling = true;
			while (keepPolling) {
				const response = await buscarImportacaoDadosOrcamentoFinanceiro(jobId);
				const job = response.job || {};
				setImportJob(job);
				setMessage(
					`${job.stage || "Processando"} · ${integer.format(job.percent || 0)}%`,
				);
				if (job.status === "completed") {
					setDataState(job.result?.data || {});
					setMessage(
						`Importação concluída: ${integer.format(job.result?.data?.summary?.totalRows || 0)} linha(s) salvas no histórico.`,
					);
					await onConfigUpdated?.({ silent: true });
					keepPolling = false;
					break;
				}
				if (job.status === "failed") {
					const visibleError = {
						message: job.error || "Falha ao importar dados orçamentários.",
						details: "",
					};
					setFeedback({
						type: "error",
						title: "Erro ao importar dados",
						...visibleError,
					});
					setMessage(visibleError.message);
					keepPolling = false;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 1200));
			}
			await loadBudgetData();
		},
		[loadBudgetData, onConfigUpdated],
	);

	const handleFileChange = async (event) => {
		const files = Array.from(event.target.files || []);
		if (!files.length) return;
		setReading(true);
		setSaving(true);
		setMessage("");
		try {
			const response = await iniciarImportacaoDadosOrcamentoFinanceiro(files);
			const job = response.job || {};
			setImportJob(job);
			setMessage(
				`Importação enviada: ${integer.format(files.length)} arquivo(s). Acompanhando processamento...`,
			);
			await pollImportJob(job.id);
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Não foi possível enviar/importar o XLSX selecionado.",
			);
			setMessage(visibleError.message);
			setFeedback({
				type: "error",
				title: "Erro ao importar XLSX",
				...visibleError,
			});
		} finally {
			setReading(false);
			setSaving(false);
			event.target.value = "";
		}
	};

	const clearImport = () => {
		if (!canManage) return;
		setConfirmClearOpen(true);
	};

	const confirmClearImport = async () => {
		setConfirmClearOpen(false);
		setSaving(true);
		setMessage("");
		try {
			const response = await limparDadosOrcamentoFinanceiro();
			setDataState(response.data || {});
			setImportJob(null);
			setMessage("Dados importados zerados. A próxima planilha recriará a estrutura orçamentária.");
			await onConfigUpdated?.({ silent: true });
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Falha ao limpar a leitura importada.",
			);
			setMessage(visibleError.message);
			setFeedback({
				type: "error",
				title: "Erro ao limpar leitura",
				...visibleError,
			});
		} finally {
			setSaving(false);
		}
	};

	const summary = dataState?.summary || {};
	const importInfo = dataState?.importInfo || {};
	const savedRows = dataState?.rows || [];
	const activeFields = new Set(dataState?.detectedFields || []);
	const previewRows = savedRows.slice(0, 20);
	const importProgress = Math.max(0, Math.min(100, Number(importJob?.percent || 0)));
	const importRunning =
		importJob && ["queued", "running"].includes(importJob.status);

	return (
		<section className="space-y-5">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div className="flex items-start gap-3">
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<Upload size={20} />
						</span>
						<div>
							<h2 className="text-lg font-black text-slate-950">
								Importador de dados XLSX
							</h2>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Use a planilha orçamentária para gerar leitura, centro de custo,
								conta financeira, matriz anual, fornecedores e realizado.
							</p>
							<p className="mt-1 text-xs font-bold text-slate-500">
								Última importação: {formatUpdatedAt(importInfo.importedAt)} ·
								Arquivo: {importInfo.fileName || "-"} · Aba:{" "}
								{importInfo.sheetName || "-"}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<label
							className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 ${!canManage || reading || saving ? "pointer-events-none opacity-50" : ""}`}
						>
							{reading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Upload size={16} />
							)}{" "}
							Enviar XLSX
							<input
								type="file"
								accept=".xlsx"
								multiple
								className="hidden"
								disabled={!canManage || reading || saving}
								onChange={handleFileChange}
							/>
						</label>
						<button
							type="button"
							onClick={loadBudgetData}
							disabled={loading || saving}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw size={16} className={loading ? "animate-spin" : ""} />{" "}
							Atualizar
						</button>
						<button
							type="button"
							onClick={clearImport}
							disabled={!canManage || saving || !savedRows.length}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
						>
							<Trash2 size={16} /> Zerar dados teste
						</button>
					</div>
				</div>

				{message ? (
					<div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">
						{message}
					</div>
				) : null}

				{importJob ? (
					<div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-sm font-black text-slate-950">
									{importJob.stage || "Processando importação"}
								</p>
								<p className="mt-1 text-xs font-bold text-slate-500">
									{integer.format(importJob.totalFiles || 0)} arquivo(s) ·{" "}
									{integer.format(importJob.totalRows || 0)} linha(s)
								</p>
							</div>
							<span className="text-sm font-black text-blue-700">
								{integer.format(importProgress)}%
							</span>
						</div>
						<div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
							<div
								className={`h-full rounded-full ${importRunning ? "bg-blue-600" : importJob.status === "failed" ? "bg-red-500" : "bg-emerald-500"}`}
								style={{ width: `${importProgress}%` }}
							/>
						</div>
						{(importJob.fileReports || []).length ? (
							<div className="mt-3 grid gap-2 md:grid-cols-2">
								{importJob.fileReports.map((file, index) => (
									<div
										key={`${file.fileName}-${file.sheetName}-${index}`}
										className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
									>
										<span className="font-black text-slate-950">
											{file.fileName}
										</span>{" "}
										· {file.sheetName} · {file.layout} ·{" "}
										{integer.format(file.rows || 0)} linhas
										{file.recognized ? (
											<span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
												Layout reconhecido · {integer.format(file.timesUsed || 1)}x
											</span>
										) : (
											<span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
												Layout novo · confira os dados
											</span>
										)}
									</div>
								))}
							</div>
						) : null}
					</div>
				) : null}

				<div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
					{[
						["Linhas", summary.totalRows || 0, "number"],
						["Orçado", summary.totalOrcado || 0, "currency"],
						["Realizado", summary.totalRealizado || 0, "currency"],
						["Contas", summary.uniqueAccounts || 0, "number"],
						["Centros", summary.uniqueCostCenters || 0, "number"],
						["Fornecedores", summary.uniqueSuppliers || 0, "number"],
						["Matrizes", summary.uniqueCompanies || 0, "number"],
						["Filiais", summary.uniqueBranches || 0, "number"],
					].map(([label, value, type]) => (
						<div key={label} className="rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								{label}
							</p>
							<p className="mt-1 min-w-0 break-words text-[clamp(0.95rem,1.2vw,1.25rem)] font-black leading-tight text-slate-950">
								{type === "currency"
									? brl.format(Number(value || 0))
									: integer.format(Number(value || 0))}
							</p>
						</div>
					))}
				</div>
			</section>

			<section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h3 className="text-base font-black text-slate-950">
						Campos esperados
					</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">
						A importação reconhece os cabeçalhos abaixo. Campos sem leitura
						ficam marcados para ajuste da planilha.
					</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-2">
						{BUDGET_IMPORT_FIELDS.map((field) => (
							<div
								key={field.key}
								className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-black ${activeFields.has(field.key) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}
							>
								<span>{field.label}</span>
								<span>{activeFields.has(field.key) ? "Lido" : "Pendente"}</span>
							</div>
						))}
					</div>
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h3 className="text-base font-black text-slate-950">
						Resumo por período
					</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">
						Esse resumo será usado para alimentar dashboard, realizado e
						desvios.
					</p>
					<div className="mt-4 max-h-96 overflow-auto rounded-2xl border border-slate-200">
						<table className="min-w-full divide-y divide-slate-200 text-sm">
							<thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
								<tr>
									<th scope="col" className="px-3 py-2">Período</th>
									<th scope="col" className="px-3 py-2">Linhas</th>
									<th scope="col" className="px-3 py-2">Orçado</th>
									<th scope="col" className="px-3 py-2">Realizado</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{(summary.byMonth || []).length ? (
									summary.byMonth.map((row) => (
										<tr key={row.key}>
											<td className="px-3 py-2 font-black text-slate-900">
												{row.key}
											</td>
											<td className="px-3 py-2 font-bold text-slate-600">
												{integer.format(row.rows || 0)}
											</td>
											<td className="px-3 py-2 font-black text-slate-950">
												{brl.format(row.orcado || 0)}
											</td>
											<td className="px-3 py-2 font-black text-slate-950">
												{brl.format(row.realizado || 0)}
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={4}>
											<EmptyState text="Nenhum período importado ainda." />
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h3 className="text-base font-black text-slate-950">
							Prévia da leitura
						</h3>
						<p className="mt-1 text-xs font-bold text-slate-500">
							Mostrando até 20 linhas da planilha lida ou da última importação
							salva.
						</p>
					</div>
					{dataState?.appliedConfig ? (
						<p className="text-xs font-black text-blue-700">
							Criados/atualizados: {dataState.appliedConfig.accounts || 0}{" "}
							conta(s), {dataState.appliedConfig.centers || 0} centro(s),{" "}
							{dataState.appliedConfig.partners || 0} fornecedor(es),{" "}
							{dataState.appliedConfig.companies || 0} matriz(es),{" "}
							{dataState.appliedConfig.branches || 0} filial(is)
						</p>
					) : null}
				</div>
				<div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
					<table className="min-w-[1200px] divide-y divide-slate-200 text-xs">
						<thead className="bg-slate-50 text-left font-black uppercase text-slate-500">
							<tr>
								{BUDGET_IMPORT_FIELDS.slice(0, 14).map((field) => (
									<th scope="col" key={field.key} className="px-3 py-2">
										{field.label}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{previewRows.length ? (
								previewRows.map((row, index) => (
									<tr key={`${row.seqMov || row.id || index}-${index}`}>
										{BUDGET_IMPORT_FIELDS.slice(0, 14).map((field) => (
											<td
												key={field.key}
												className="max-w-48 truncate px-3 py-2 font-bold text-slate-700"
												title={String(row[field.key] || "")}
											>
												{field.key === "orcado" || field.key === "realizado"
													? formatBudgetCurrency(row[field.key])
													: row[field.key] || "-"}
											</td>
										))}
									</tr>
								))
							) : (
								<tr>
									<td colSpan={14}>
										<EmptyState text="Leia um XLSX para visualizar a prévia." />
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
			<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />

			<ConfirmDialog
				open={confirmClearOpen}
				tone="danger"
				title="Zerar dados importados do orçamento?"
				description="A estrutura orçamentária gerada pela importação (contas, centros, empresas, filiais e fornecedores) some. A próxima planilha recria tudo pelas regras atuais."
				confirmLabel="Zerar dados importados"
				cancelLabel="Voltar"
				loading={saving}
				onConfirm={confirmClearImport}
				onCancel={() => setConfirmClearOpen(false)}
			/>
		</section>
	);
}
