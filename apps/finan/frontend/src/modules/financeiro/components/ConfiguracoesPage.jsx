// Roteiro UX_AUDIT.md (Fase 5 — extracao incremental de FinanceiroPage.jsx,
// continuacao): pagina "Configuracoes Financeiras" (integracao com Google
// Sheets) extraida do arquivao. Codigo identico ao que estava la — so
// mudou de arquivo.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, TableProperties } from "lucide-react";
import {
	buscarConfigPlanilhasFinanceiro,
	buscarLogsPlanilhasFinanceiro,
	salvarConfigPlanilhasFinanceiro,
	sincronizarPlanilhasFinanceiro,
	testarPlanilhaFinanceiro,
} from "../services/financeiroService";
import { integer } from "../utils/financeiroFormatters";
import {
	DEFAULT_SHEETS_CONFIG,
	formatUpdatedAt,
	getVisibleError,
} from "./shared/FinanceiroSharedHelpers";
import { FeedbackModal } from "./shared/FinanceiroSharedModals";

export default function ConfiguracoesPage({ canManage }) {
	const [sheetsConfig, setSheetsConfig] = useState(DEFAULT_SHEETS_CONFIG);
	const [logs, setLogs] = useState([]);
	const [sheetsLoading, setSheetsLoading] = useState(true);
	const [sheetsAction, setSheetsAction] = useState("");
	const [sheetsMessage, setSheetsMessage] = useState("");
	const [sheetsFeedback, setSheetsFeedback] = useState(null);

	const loadSheetsConfig = useCallback(async () => {
		setSheetsLoading(true);
		setSheetsMessage("");
		try {
			const [config, logsResponse] = await Promise.all([
				buscarConfigPlanilhasFinanceiro(),
				buscarLogsPlanilhasFinanceiro(8).catch(() => ({ items: [] })),
			]);
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...config,
				sources: config.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			setLogs(logsResponse.items || []);
		} catch (error) {
			setSheetsMessage(
				error?.message ||
					"Não foi possível carregar a configuração das planilhas.",
			);
		} finally {
			setSheetsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSheetsConfig();
	}, [loadSheetsConfig]);

	const updateSource = (sourceId, field, value) => {
		setSheetsConfig((current) => ({
			...current,
			sources: (current.sources || []).map((source) =>
				source.id === sourceId ? { ...source, [field]: value } : source,
			),
		}));
	};

	const handleSaveSheets = async () => {
		setSheetsAction("save");
		setSheetsMessage("");
		try {
			const response = await salvarConfigPlanilhasFinanceiro(sheetsConfig);
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...response.config,
				sources: response.config?.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			setSheetsMessage("Configuração das Google Planilhas salva.");
		} catch (error) {
			setSheetsMessage(
				error?.message || "Falha ao salvar a configuração das planilhas.",
			);
		} finally {
			setSheetsAction("");
		}
	};

	const handleSyncSheets = async () => {
		setSheetsAction("sync");
		setSheetsMessage("");
		try {
			const response = await sincronizarPlanilhasFinanceiro();
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...response.config,
				sources: response.config?.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			setSheetsMessage(response.message || "Leitura das planilhas concluída.");
			setSheetsFeedback({
				type: response.ok ? "success" : "error",
				title: response.ok ? "Leitura concluída" : "Leitura com falhas",
				message: response.message || "Leitura das planilhas concluída.",
				details: (response.results || [])
					.map(
						(item) =>
							`${item.label}: ${item.status} · ${integer.format(item.totalRows || 0)} linha(s)${item.message ? ` · ${item.message}` : ""}`,
					)
					.join("\n"),
			});
			await loadSheetsConfig();
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Falha ao ler as planilhas financeiras.",
			);
			setSheetsMessage(visibleError.message);
			setSheetsFeedback({
				type: "error",
				title: "Erro na leitura",
				...visibleError,
			});
		} finally {
			setSheetsAction("");
		}
	};

	const handleTestSource = async (sourceId) => {
		setSheetsAction(`test:${sourceId}`);
		setSheetsMessage("");
		try {
			const saved = await salvarConfigPlanilhasFinanceiro(sheetsConfig);
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...saved.config,
				sources: saved.config?.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			const response = await testarPlanilhaFinanceiro(sourceId);
			const totalRows = response.result?.totalRows ?? 0;
			setSheetsMessage(
				`Teste concluído: ${totalRows} linha(s) lida(s) na origem selecionada.`,
			);
			setSheetsFeedback({
				type: "success",
				title: "Teste concluído",
				message: `${integer.format(totalRows)} linha(s) lida(s) na origem selecionada.`,
				details: `Range: ${response.result?.range || "-"}\nColunas: ${integer.format(response.result?.totalColumns || 0)}`,
			});
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Falha ao testar a planilha.",
			);
			setSheetsMessage(visibleError.message);
			setSheetsFeedback({
				type: "error",
				title: "Erro no teste",
				...visibleError,
			});
		} finally {
			setSheetsAction("");
		}
	};

	const handleCopyServiceAccount = async () => {
		const email = sheetsConfig.serviceAccountEmail || "";
		if (!email) return;
		try {
			await navigator.clipboard.writeText(email);
			setSheetsMessage("E-mail da Service Account copiado.");
		} catch {
			setSheetsMessage(
				"Não foi possível copiar automaticamente. Selecione o e-mail e copie manualmente.",
			);
		}
	};

	return (
		<section className="space-y-5">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex items-start gap-3">
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
							<TableProperties size={20} />
						</span>
						<div>
							<h2 className="text-lg font-bold text-slate-950">
								Google Planilhas
							</h2>
							<p className="text-sm font-semibold text-slate-500">
								Configure a leitura automática das planilhas financeiras a cada
								intervalo definido.
							</p>
							<p className="mt-1 text-xs font-bold text-slate-500">
								Service Account:{" "}
								{sheetsConfig.serviceAccountConfigured
									? "configurada"
									: "não configurada"}{" "}
								· Última leitura: {formatUpdatedAt(sheetsConfig.lastRunAt)} ·
								Próxima: {formatUpdatedAt(sheetsConfig.nextRunAt)}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={loadSheetsConfig}
							disabled={sheetsLoading}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw
								size={16}
								className={sheetsLoading ? "animate-spin" : ""}
							/>{" "}
							Atualizar
						</button>
						<button
							type="button"
							onClick={handleSaveSheets}
							disabled={!canManage || Boolean(sheetsAction)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
						>
							{sheetsAction === "save" ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<CheckCircle2 size={16} />
							)}{" "}
							Salvar
						</button>
						{/* UX_AUDIT.md, Fase 5 (paleta de botão primário): era
						bg-emerald-600 sólido, competindo com "Salvar" (bg-blue-600)
						pela mesma hierarquia visual de CTA principal. */}
						<button
							type="button"
							onClick={handleSyncSheets}
							disabled={!canManage || Boolean(sheetsAction)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
						>
							{sheetsAction === "sync" ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<RefreshCw size={16} />
							)}{" "}
							Ler agora
						</button>
					</div>
				</div>

				{sheetsMessage ? (
					<div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">
						{sheetsMessage}
					</div>
				) : null}

				<div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]">
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-900">
							<span>Automação ativa</span>
							<input
								type="checkbox"
								checked={Boolean(sheetsConfig.enabled)}
								disabled={!canManage}
								onChange={(event) =>
									setSheetsConfig((current) => ({
										...current,
										enabled: event.target.checked,
									}))
								}
								className="h-5 w-5 rounded border-slate-300 text-blue-600"
							/>
						</label>
						<label className="mt-4 block text-xs font-bold uppercase text-slate-500">
							Intervalo de leitura
							<input
								type="number"
								min="5"
								max="1440"
								value={sheetsConfig.intervalMinutes || 30}
								disabled={!canManage}
								onChange={(event) =>
									setSheetsConfig((current) => ({
										...current,
										intervalMinutes: event.target.value,
									}))
								}
								className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
							/>
						</label>
						<p className="mt-3 text-xs font-semibold text-slate-500">
							A planilha precisa ser compartilhada com o e-mail da Service
							Account usada no Google Drive.
						</p>
						<div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
							<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
								Usuário de leitura
							</p>
							<p className="mt-1 break-all text-sm font-black text-slate-950">
								{sheetsConfig.serviceAccountEmail ||
									"Service Account não identificada"}
							</p>
							{sheetsConfig.serviceAccountProjectId ? (
								<p className="mt-1 break-all text-xs font-bold text-emerald-800">
									Projeto: {sheetsConfig.serviceAccountProjectId}
								</p>
							) : null}
							{sheetsConfig.serviceAccountError ? (
								<p className="mt-2 text-xs font-bold text-red-700">
									{sheetsConfig.serviceAccountError}
								</p>
							) : (
								<p className="mt-2 text-xs font-semibold text-emerald-800">
									Compartilhe cada planilha com este e-mail como Leitor.
								</p>
							)}
							<button
								type="button"
								onClick={handleCopyServiceAccount}
								disabled={!sheetsConfig.serviceAccountEmail}
								className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Copy size={14} /> Copiar e-mail
							</button>
						</div>
					</div>

					<div className="space-y-4">
						{(sheetsConfig.sources || []).map((source) => (
							<div
								key={source.id}
								className="rounded-2xl border border-slate-200 p-4"
							>
								<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
									<label className="flex items-center gap-3 text-sm font-bold text-slate-950">
										<input
											type="checkbox"
											checked={Boolean(source.enabled)}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(source.id, "enabled", event.target.checked)
											}
											className="h-5 w-5 rounded border-slate-300 text-blue-600"
										/>
										{source.label}
									</label>
									<button
										type="button"
										disabled={!canManage || Boolean(sheetsAction)}
										onClick={() => handleTestSource(source.id)}
										className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
									>
										{sheetsAction === `test:${source.id}` ? (
											<Loader2 className="animate-spin" size={14} />
										) : (
											<TableProperties size={14} />
										)}{" "}
										Testar
									</button>
								</div>
								<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
									<label className="text-xs font-bold uppercase text-slate-500">
										ID ou link da planilha
										<input
											value={
												source.spreadsheetUrl ?? source.spreadsheetId ?? ""
											}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(
													source.id,
													"spreadsheetUrl",
													event.target.value,
												)
											}
											placeholder="https://docs.google.com/spreadsheets/d/..."
											className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</label>
									<label className="text-xs font-bold uppercase text-slate-500">
										Aba
										<input
											value={source.sheetName || ""}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(source.id, "sheetName", event.target.value)
											}
											placeholder="Ex: Agosto"
											className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</label>
									<label className="text-xs font-bold uppercase text-slate-500">
										Linha do cabeçalho
										<input
											type="number"
											min="1"
											value={source.headerRow || 1}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(source.id, "headerRow", event.target.value)
											}
											className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</label>
									{source.id === "serasa" ? (
										<label className="text-xs font-bold uppercase text-slate-500">
											Atualizar a cada
											<select
												value={source.intervalMinutes || 60}
												disabled={!canManage}
												onChange={(event) =>
													updateSource(
														source.id,
														"intervalMinutes",
														event.target.value,
													)
												}
												className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
											>
												<option value="30">30 minutos</option>
												<option value="60">1 hora</option>
												<option value="120">2 horas</option>
												<option value="240">4 horas</option>
												<option value="720">12 horas</option>
											</select>
										</label>
									) : null}
								</div>
								<p className="mt-3 text-xs font-bold text-slate-500">
									Última leitura: {formatUpdatedAt(source.lastReadAt)} · Status:{" "}
									{source.lastStatus || "-"} · Linhas: {source.lastRows || 0} ·{" "}
									{source.lastMessage || "Sem leitura ainda."}
								</p>
							</div>
						))}
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<h3 className="text-sm font-bold text-slate-950">
						Últimos logs de leitura
					</h3>
					<div className="mt-3 divide-y divide-slate-200">
						{logs.length ? (
							logs.map((item) => (
								<div
									key={item.id}
									className="flex flex-col gap-1 py-3 text-xs font-bold text-slate-600 md:flex-row md:items-center md:justify-between"
								>
									<span>
										{formatUpdatedAt(item.createdAt)} · {item.status}
									</span>
									<span className="text-slate-900">{item.message}</span>
								</div>
							))
						) : (
							<p className="py-4 text-sm font-bold text-slate-500">
								Nenhum log de leitura registrado.
							</p>
						)}
					</div>
				</div>
			</section>
			<FeedbackModal
				feedback={sheetsFeedback}
				onClose={() => setSheetsFeedback(null)}
			/>
		</section>
	);
}
