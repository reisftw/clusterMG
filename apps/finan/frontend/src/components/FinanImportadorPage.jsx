// Central de Importações (Roteiro Finan #35, Fase 4B — Importador
// universal com templates, estende #17): mapear colunas de qualquer
// planilha uma vez ("Coluna A = fornecedor"), salvar como template e
// reaplicar quando o layout mudar — diferente do importador de
// orçamento (financeiroBudgetXlsxImport.js), que é sob medida pro
// layout fixo do Sênior.
//
// UX_AUDIT.md, Fase 1 (correção crítica #3): aplicar um template (criação/
// atualização de registros reais em lote) rodava direto no clique, sem
// nenhum resumo do impacto antes — planilha errada ou template desatualizado
// podia corromper dados reais sem chance de revisão. Os dois pontos de
// entrada (aplicar template salvo, e "salvar e importar agora" no
// mapeamento novo) agora passam por ConfirmDialog.jsx mostrando entidade-
// alvo, arquivo e quantidade de linhas que serão processadas.
import { CheckCircle2, FileSpreadsheet, PlayCircle, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import {
	aplicarFinanImportTemplate,
	createFinanImportTemplate,
	deleteFinanImportTemplate,
	fetchFinanImportadorCamposAlvo,
	fetchFinanImportTemplates,
	previewFinanImportadorArquivo,
} from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import PageLoading from "./PageLoading";
import { useFinanToast } from "../state/useFinanToast";

export default function FinanImportadorPage() {
	const [entidades, setEntidades] = useState([]);
	const [templates, setTemplates] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const toast = useFinanToast();

	const [file, setFile] = useState(null);
	const [preview, setPreview] = useState(null);
	const [entidadeAlvo, setEntidadeAlvo] = useState("fornecedores");
	const [mapping, setMapping] = useState({});
	const [templateNome, setTemplateNome] = useState("");
	const [previewLoading, setPreviewLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [applyingId, setApplyingId] = useState("");
	const [applyConfirm, setApplyConfirm] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");
	const [deleteTemplateTarget, setDeleteTemplateTarget] = useState(null);
	const [deletingTemplate, setDeletingTemplate] = useState(false);
	const [deleteTemplateError, setDeleteTemplateError] = useState("");

	const camposAlvo = entidades.find((item) => item.entidade === entidadeAlvo)?.campos || [];

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [entidadesResp, templatesResp] = await Promise.all([
				fetchFinanImportadorCamposAlvo(),
				fetchFinanImportTemplates(),
			]);
			setEntidades(entidadesResp);
			setTemplates(templatesResp);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a Central de Importações.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleFileChange = async (event) => {
		const selected = event.target.files?.[0];
		if (!selected) return;
		setFile(selected);
		setPreview(null);
		setMapping({});
		setPreviewLoading(true);
		setError("");
		try {
			const result = await previewFinanImportadorArquivo(selected);
			setPreview(result);
		} catch (err) {
			setError(err?.message || "Não foi possível ler a planilha.");
		} finally {
			setPreviewLoading(false);
		}
	};

	const handleSaveTemplate = async () => {
		if (!templateNome.trim()) {
			setError("Dê um nome ao template antes de salvar.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await createFinanImportTemplate({ nome: templateNome.trim(), entidadeAlvo, mapeamento: mapping });
			toast.success("Template salvo. Reaplique quando a planilha desse sistema mudar de layout.");
			setTemplateNome("");
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o template.");
		} finally {
			setSaving(false);
		}
	};

	// Abre a confirmação em vez de aplicar direto — pedido pelo usuário na
	// TemplateRow, já com a contagem de linhas (obtida via preview) pra
	// mostrar o impacto antes de gravar em lote.
	const openApplyTemplateConfirm = (template, templateFile, totalRows) => {
		setApplyConfirm({
			kind: "template",
			templateId: template.id,
			nome: template.nome,
			entidadeAlvo: template.entidadeAlvo,
			file: templateFile,
			totalRows,
		});
	};

	const openApplyInlineConfirm = () => {
		if (!file) return;
		setApplyConfirm({
			kind: "inline",
			nome: templateNome.trim() || `Importação ${new Date().toLocaleString("pt-BR")}`,
			entidadeAlvo,
			file,
			totalRows: preview?.totalRows,
		});
	};

	const handleConfirmApply = async () => {
		if (!applyConfirm) return;
		setConfirming(true);
		setConfirmError("");
		try {
			let resultado;
			if (applyConfirm.kind === "template") {
				setApplyingId(applyConfirm.templateId);
				resultado = await aplicarFinanImportTemplate(applyConfirm.templateId, applyConfirm.file);
			} else {
				setApplyingId("preview");
				const template = await createFinanImportTemplate({
					nome: applyConfirm.nome,
					entidadeAlvo: applyConfirm.entidadeAlvo,
					mapeamento: mapping,
				});
				resultado = await aplicarFinanImportTemplate(template.id, applyConfirm.file);
				setTemplateNome("");
			}
			toast.success(
				`Importação concluída: ${resultado.created} criado(s), ${resultado.updated} atualizado(s)${
					resultado.invalidos ? `, ${resultado.invalidos} linha(s) sem os campos obrigatórios` : ""
				}.`,
			);
			setApplyConfirm(null);
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Falha ao aplicar o template.");
		} finally {
			setConfirming(false);
			setApplyingId("");
		}
	};

	const closeApplyConfirm = () => {
		if (confirming) return;
		setApplyConfirm(null);
		setConfirmError("");
	};

	const handleDeleteTemplate = (template) => setDeleteTemplateTarget(template);

	const closeDeleteTemplateConfirm = () => {
		setDeleteTemplateTarget(null);
		setDeleteTemplateError("");
	};

	const confirmDeleteTemplate = async () => {
		if (!deleteTemplateTarget) return;
		setDeletingTemplate(true);
		setDeleteTemplateError("");
		try {
			await deleteFinanImportTemplate(deleteTemplateTarget.id);
			toast.success(`Template "${deleteTemplateTarget.nome}" excluído.`);
			closeDeleteTemplateConfirm();
			await load();
		} catch (err) {
			setDeleteTemplateError(err?.message || "Não foi possível excluir o template.");
		} finally {
			setDeletingTemplate(false);
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex items-start gap-4">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<FileSpreadsheet size={24} />
					</span>
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
						<h1 className="mt-1 text-2xl font-black text-slate-950">Central de Importações</h1>
						<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
							Mapeie as colunas de qualquer planilha uma vez, salve como template e reaplique quando o sistema
							externo mudar o layout do arquivo exportado.
						</p>
					</div>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-base font-black text-slate-950">Novo mapeamento</h2>
				<p className="mt-1 text-xs font-bold text-slate-500">
					Envie uma planilha de exemplo, mapeie as colunas e salve como template reutilizável.
				</p>

				<div className="mt-4 flex flex-wrap items-center gap-3">
					<label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">
						<Upload size={16} />
						{file ? file.name : "Selecionar planilha"}
						<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
					</label>
					<label className="text-xs font-bold uppercase text-slate-500">
						Entidade-alvo
						<select
							value={entidadeAlvo}
							onChange={(event) => {
								setEntidadeAlvo(event.target.value);
								setMapping({});
							}}
							className="ml-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
						>
							{entidades.map((item) => (
								<option key={item.entidade} value={item.entidade}>
									{item.entidade}
								</option>
							))}
						</select>
					</label>
				</div>

				{previewLoading ? <p className="mt-4 text-sm font-semibold text-slate-500">Lendo planilha...</p> : null}

				{preview ? (
					<div className="mt-5 space-y-4">
						<div className="grid gap-3 sm:grid-cols-2">
							{camposAlvo.map((campo) => (
								<label key={campo.key} className="text-xs font-black uppercase text-slate-500">
									{campo.label}
									{campo.required ? <span className="text-red-500"> *</span> : null}
									<select
										value={mapping[campo.key] || ""}
										onChange={(event) => setMapping((prev) => ({ ...prev, [campo.key]: event.target.value }))}
										className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
									>
										<option value="">Não mapeado</option>
										{preview.columns.map((col) => (
											<option key={col} value={col}>
												{col}
											</option>
										))}
									</select>
								</label>
							))}
						</div>

						<div className="overflow-auto rounded-xl border border-slate-200">
							<table className="min-w-full divide-y divide-slate-200 text-xs">
								<thead className="bg-slate-50 text-left font-black uppercase text-slate-500">
									<tr>
										{preview.columns.map((col) => (
											<th scope="col" key={col} className="px-3 py-2">
												{col}
											</th>
										))}
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{preview.sampleRows.map((row, index) => (
										<tr key={index}>
											{preview.columns.map((col) => (
												<td key={col} className="max-w-40 truncate px-3 py-2 font-bold text-slate-700">
													{row[col] || "-"}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<p className="text-xs font-bold text-slate-400">{preview.totalRows} linha(s) na planilha.</p>

						<div className="flex flex-wrap items-center gap-3">
							<input
								value={templateNome}
								onChange={(event) => setTemplateNome(event.target.value)}
								placeholder="Nome do template (ex.: Fornecedores Sistema X)"
								className="min-w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
							/>
							<button
								type="button"
								onClick={handleSaveTemplate}
								disabled={saving}
								className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:opacity-50"
							>
								<Save size={16} /> Salvar template
							</button>
							<button
								type="button"
								onClick={openApplyInlineConfirm}
								disabled={!file || applyingId === "preview"}
								// UX_AUDIT.md, Fase 5 (paleta de botão primário): este é o
								// CTA principal da tela — bg-blue-600, igual a todo outro
								// botão primário do Finan ("Nova conta", "Nova meta" etc.).
								// Era bg-emerald-600, que no resto do app é reservado pra
								// estado de sucesso/confirmação, não pra ação primária.
								className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
							>
								<CheckCircle2 size={16} /> Salvar e importar agora
							</button>
						</div>
					</div>
				) : null}
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-base font-black text-slate-950">Templates salvos</h2>
				<div className="mt-4 space-y-3">
					{loading ? (
						<PageLoading label="Carregando templates..." />
					) : templates.length ? (
						templates.map((template) => (
							<TemplateRow
								key={template.id}
								template={template}
								applying={applyingId === template.id}
								onApply={(templateFile, totalRows) => openApplyTemplateConfirm(template, templateFile, totalRows)}
								onDelete={() => handleDeleteTemplate(template)}
							/>
						))
					) : (
						<EmptyState
							icon={FileSpreadsheet}
							title="Nenhum template salvo ainda"
							description="Envie uma planilha de exemplo acima, mapeie as colunas e salve como template pra reaplicar sempre que o layout desse sistema externo mudar."
						/>
					)}
				</div>
			</section>

			<ConfirmDialog
				open={Boolean(applyConfirm)}
				tone="danger"
				title="Aplicar esta importação?"
				description="Isso cria e atualiza registros reais no sistema a partir do arquivo selecionado. Confira o resumo antes de continuar."
				items={
					applyConfirm
						? [
								{ label: "Template", value: applyConfirm.nome },
								{ label: "Entidade-alvo", value: applyConfirm.entidadeAlvo },
								{ label: "Arquivo", value: applyConfirm.file?.name || "-" },
								{
									label: "Linhas na planilha",
									value: Number.isFinite(applyConfirm.totalRows) ? `${applyConfirm.totalRows} linha(s)` : "não foi possível contar",
								},
							]
						: []
				}
				confirmLabel="Aplicar importação"
				cancelLabel="Revisar antes"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmApply}
				onCancel={closeApplyConfirm}
			/>

			<ConfirmDialog
				open={Boolean(deleteTemplateTarget)}
				tone="danger"
				title="Excluir este template de importação?"
				description="O template some da lista. Os dados já importados com ele não são afetados."
				items={deleteTemplateTarget ? [{ label: "Template", value: deleteTemplateTarget.nome }] : []}
				confirmLabel="Excluir template"
				cancelLabel="Voltar"
				loading={deletingTemplate}
				error={deleteTemplateError}
				onConfirm={confirmDeleteTemplate}
				onCancel={closeDeleteTemplateConfirm}
			/>
		</div>
	);
}

function TemplateRow({ template, applying, onApply, onDelete }) {
	const [templateFile, setTemplateFile] = useState(null);
	// Contagem de linhas pra mostrar no resumo de impacto do ConfirmDialog
	// (best-effort: se o preview falhar por algum motivo, ainda dá pra
	// confirmar e aplicar, só sem o número de linhas na tela).
	const [totalRows, setTotalRows] = useState(null);
	const [readingFile, setReadingFile] = useState(false);

	const handleFilePicked = async (selected) => {
		setTemplateFile(selected);
		setTotalRows(null);
		if (!selected) return;
		setReadingFile(true);
		try {
			const result = await previewFinanImportadorArquivo(selected);
			setTotalRows(result?.totalRows ?? null);
		} catch {
			setTotalRows(null);
		} finally {
			setReadingFile(false);
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0">
				<p className="truncate text-sm font-black text-slate-950">{template.nome}</p>
				<p className="text-xs font-bold text-slate-500">
					{template.entidadeAlvo} · {Object.keys(template.mapeamento || {}).length} campo(s) mapeado(s)
				</p>
			</div>
			<div className="flex shrink-0 flex-wrap items-center gap-2">
				<label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100">
					<Upload size={13} />
					{templateFile ? templateFile.name : "Escolher planilha"}
					<input
						type="file"
						accept=".xlsx,.xls,.csv"
						className="hidden"
						onChange={(event) => handleFilePicked(event.target.files?.[0] || null)}
					/>
				</label>
				<button
					type="button"
					onClick={() => onApply(templateFile, totalRows)}
					disabled={applying || !templateFile || readingFile}
					className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
				>
					<PlayCircle size={13} className={applying ? "animate-pulse" : ""} /> Aplicar
				</button>
				<button
					type="button"
					onClick={onDelete}
					title="Excluir template"
					aria-label={`Excluir template "${template.nome}"`}
					className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-700 hover:bg-red-50"
				>
					<Trash2 size={13} />
				</button>
			</div>
		</div>
	);
}
