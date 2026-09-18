import { Cloud, ReceiptText, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { buscarEmpresasTecnicos } from "../../empresasTecnicos/services/empresasTecnicosService";
import {
	conectarGoogleDrive,
	criarPastaEmpresa,
	criarSubpastaEmpresa,
	limparHistoricoDocumentos,
	listarCamposDocumentos,
	listarCamposNotasFiscais,
	obterCobrancaDocumentos,
	obterConfigGoogleDrive,
	obterStatusGoogleDrive,
	salvarCampoDocumento,
	salvarCampoNotaFiscal,
	salvarCobrancaDocumentos,
	salvarConfigGoogleDrive,
} from "../services/documentosService";
import { DEFAULT_FINANCEIRO_EMAIL_TEMPLATE } from "../utils/financeiroEmail";

const ADM_GOOGLE_REDIRECT_URI =
	"https://adm.retiradas.tech/api/documentos/google/callback";

function resolveAdmRedirectUri(value) {
	const uri = String(value || "").trim();
	if (!uri || uri.includes("://retiradas.tech/")) return ADM_GOOGLE_REDIRECT_URI;
	return uri;
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
}

export default function DocumentosConfigPage() {
	const [status, setStatus] = useState(null);
	const [form, setForm] = useState({
		folderId: "",
		oauthClientId: "",
		oauthClientSecret: "",
		oauthRedirectUri: ADM_GOOGLE_REDIRECT_URI,
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [success, setSuccess] = useState("");
	const [fields, setFields] = useState([]);
	const [fieldForm, setFieldForm] = useState({
		nome: "",
		obrigatorio: true,
		ordem: 0,
		publicoAlvo: "ambos",
		ativo: true,
	});
	const [invoiceFields, setInvoiceFields] = useState([]);
	const [invoiceFieldForm, setInvoiceFieldForm] = useState({
		nome: "",
		ordem: 0,
		ativo: true,
	});
	const [empresas, setEmpresas] = useState([]);
	const [empresaId, setEmpresaId] = useState("");
	const [subfolderName, setSubfolderName] = useState("");
	const [purgeForm, setPurgeForm] = useState({
		confirmation: "",
		deleteDriveFiles: false,
		resetFolders: false,
	});
	const [billingForm, setBillingForm] = useState({
		enabled: true,
		firstReminderDay: 25,
		repeatDailyAfterFirst: true,
		repeatUntilDay: 31,
		windowStart: "08:00",
		windowEnd: "18:00",
		emailSubject: "Documentação mensal pendente",
		financeEmailTemplate: DEFAULT_FINANCEIRO_EMAIL_TEMPLATE,
	});

	const applyStatusToForm = useCallback((nextStatus) => {
		setStatus(nextStatus);
		setForm((current) => ({
			...current,
			folderId: nextStatus?.folderId || "",
			oauthClientId: nextStatus?.oauthClientId || "",
			oauthClientSecret: "",
			oauthRedirectUri: resolveAdmRedirectUri(nextStatus?.oauthRedirectUri),
		}));
	}, []);

	const load = useCallback(async () => {
		setLoading(true);
		setMessage("");
		setSuccess("");
		try {
			const [
				driveStatus,
				requiredFields,
				invoiceRequiredFields,
				billingConfig,
			] = await Promise.all([
				obterConfigGoogleDrive(),
				listarCamposDocumentos({ includeInactive: true }),
				listarCamposNotasFiscais({ includeInactive: true }),
				obterCobrancaDocumentos(),
			]);
			const empresasList = await buscarEmpresasTecnicos();
			applyStatusToForm(driveStatus);
			setFields(requiredFields);
			setInvoiceFields(invoiceRequiredFields);
			setBillingForm((current) => ({ ...current, ...(billingConfig ?? null) }));
			setEmpresas(empresasList);
			setEmpresaId((current) => current || empresasList[0]?.id || "");
		} catch (error) {
			try {
				applyStatusToForm(await obterStatusGoogleDrive());
			} catch {
				setMessage(
					error?.message ||
						"Não foi possível carregar a configuração do Google Drive.",
				);
			}
		} finally {
			setLoading(false);
		}
	}, [applyStatusToForm]);

	useEffect(() => {
		load();
	}, [load]);

	const handleConnect = async () => {
		setSaving(true);
		setMessage("");
		try {
			await conectarGoogleDrive();
		} catch (error) {
			setMessage(
				error?.message || "Falha ao iniciar conexão com Google Drive.",
			);
			setSaving(false);
		}
	};

	const handleSave = async (event) => {
		event.preventDefault();
		setSaving(true);
		setMessage("");
		setSuccess("");
		try {
			const nextStatus = await salvarConfigGoogleDrive(form);
			applyStatusToForm(nextStatus);
			setSuccess(
				"Configuração salva. Agora você pode conectar ou reconectar o Google Drive.",
			);
		} catch (error) {
			setMessage(
				error?.message || "Falha ao salvar configuração do Google Drive.",
			);
		} finally {
			setSaving(false);
		}
	};

	const updateField = (field) => (event) => {
		setForm((current) => ({ ...current, [field]: event.target.value }));
	};

	const handleSaveField = async (event) => {
		event.preventDefault();
		setSaving(true);
		setMessage("");
		setSuccess("");
		try {
			await salvarCampoDocumento(fieldForm);
			setFieldForm({
				nome: "",
				obrigatorio: true,
				ordem: 0,
				publicoAlvo: "ambos",
				ativo: true,
			});
			setFields(await listarCamposDocumentos({ includeInactive: true }));
			setSuccess("Campo de documento salvo.");
		} catch (error) {
			setMessage(error?.message || "Falha ao salvar campo de documento.");
		} finally {
			setSaving(false);
		}
	};

	const editField = (field) => {
		setFieldForm({
			id: field.id,
			nome: field.nome || "",
			obrigatorio: Boolean(field.obrigatorio),
			ordem: Number(field.ordem || 0),
			publicoAlvo: field.publicoAlvo || "ambos",
			ativo: field.ativo !== false,
		});
	};

	const handleSaveInvoiceField = async (event) => {
		event.preventDefault();
		setSaving(true);
		setMessage("");
		setSuccess("");
		try {
			await salvarCampoNotaFiscal(invoiceFieldForm);
			setInvoiceFieldForm({ nome: "", ordem: 0, ativo: true });
			setInvoiceFields(
				await listarCamposNotasFiscais({ includeInactive: true }),
			);
			setSuccess("Campo de nota fiscal salvo.");
		} catch (error) {
			setMessage(error?.message || "Falha ao salvar campo de nota fiscal.");
		} finally {
			setSaving(false);
		}
	};

	const editInvoiceField = (field) => {
		setInvoiceFieldForm({
			id: field.id,
			nome: field.nome || "",
			ordem: Number(field.ordem || 0),
			ativo: field.ativo !== false,
		});
	};

	const handleEnsureFolder = async () => {
		if (!empresaId) return;
		setSaving(true);
		setMessage("");
		setSuccess("");
		try {
			const response = await criarPastaEmpresa(empresaId);
			setSuccess(
				response?.folder?.driveFolderId
					? `Pasta garantida. ID: ${response.folder.driveFolderId}`
					: "Pasta garantida.",
			);
		} catch (error) {
			setMessage(error?.message || "Falha ao garantir pasta.");
		} finally {
			setSaving(false);
		}
	};

	const handleCreateSubfolder = async () => {
		if (!empresaId || !subfolderName.trim()) return;
		setSaving(true);
		setMessage("");
		setSuccess("");
		try {
			await criarSubpastaEmpresa(empresaId, subfolderName);
			setSubfolderName("");
			setSuccess("Subpasta criada.");
		} catch (error) {
			setMessage(error?.message || "Falha ao criar subpasta.");
		} finally {
			setSaving(false);
		}
	};

	const handleSaveBilling = async (event) => {
		event.preventDefault();
		setSaving(true);
		setMessage("");
		setSuccess("");
		try {
			const config = await salvarCobrancaDocumentos(billingForm);
			setBillingForm((current) => ({ ...current, ...(config ?? null) }));
			setSuccess("Configuração de cobrança salva.");
		} catch (error) {
			setMessage(error?.message || "Falha ao salvar configuração de cobrança.");
		} finally {
			setSaving(false);
		}
	};

	const handlePurgeHistory = async () => {
		const confirmed = window.confirm(
			"Essa ação vai zerar os envios, arquivos e histórico de aprovação de documentos. Deseja continuar?",
		);
		if (!confirmed) return;
		setSaving(true);
		setMessage("");
		setSuccess("");
		try {
			const result = await limparHistoricoDocumentos(purgeForm);
			setPurgeForm({
				confirmation: "",
				deleteDriveFiles: false,
				resetFolders: false,
			});
			setSuccess(
				`Histórico zerado. Envios removidos: ${result?.submissionsDeleted || 0}. Arquivos removidos do banco: ${result?.filesDeleted || 0}.`,
			);
		} catch (error) {
			setMessage(error?.message || "Falha ao zerar histórico de documentos.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
							<Cloud size={23} />
						</div>
						<div>
							<h1 className="text-2xl font-black text-slate-950">
							Configuração de Documentos
						</h1>
						<p className="text-sm text-slate-500">
							Conexão própria do Administrativo para armazenar documentos das
							empresas.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={16} /> Atualizar
					</button>
				</div>
			</section>

			{message ? (
				<div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
					{message}
				</div>
			) : null}

			{success ? (
				<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
					{success}
				</div>
			) : null}

			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase tracking-wide text-slate-500">
							Modo atual
						</p>
						<p className="mt-2 text-xl font-black text-slate-950">
							{status?.mode === "oauth" ? "OAuth" : "Service Account"}
						</p>
					</div>
					<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase tracking-wide text-slate-500">
							OAuth configurado
						</p>
						<p className="mt-2 text-xl font-black text-slate-950">
							{status?.oauthConfigured ? "Sim" : "Não"}
						</p>
					</div>
					<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase tracking-wide text-slate-500">
							OAuth conectado
						</p>
						<p className="mt-2 text-xl font-black text-slate-950">
							{status?.oauthConnected ? "Sim" : "Não"}
						</p>
					</div>
					<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase tracking-wide text-slate-500">
							Pasta raiz
						</p>
						<p className="mt-2 text-xl font-black text-slate-950">
							{status?.folderIdConfigured ? "Configurada" : "Ausente"}
						</p>
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
					<p>Conectado por: {status?.connectedByName || "-"}</p>
					<p>Conectado em: {formatDate(status?.connectedAt)}</p>
					<p>Configuração alterada por: {status?.updatedConfigByName || "-"}</p>
					<p>Configuração alterada em: {formatDate(status?.updatedConfigAt)}</p>
					<p>
						Service Account configurada:{" "}
						{status?.serviceAccountConfigured ? "Sim" : "Não"}
					</p>
				</div>

				<form
					onSubmit={handleSave}
					className="mt-6 rounded-3xl border border-slate-200 bg-white p-5"
				>
					<div className="mb-5">
						<h2 className="text-lg font-black text-slate-950">
							Configurar Drive do Administrativo
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Esses dados ficam salvos somente no ADM e passam a valer como
							configuração de produção do Administrativo.
						</p>
					</div>

					<div className="grid items-start gap-4 lg:grid-cols-2">
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								ID da pasta raiz do Drive
							</span>
							<input
								value={form.folderId}
								onChange={updateField("folderId")}
								placeholder="Cole a URL da pasta ou apenas o ID"
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Redirect URI do Administrativo
							</span>
							<input
								value={form.oauthRedirectUri}
								onChange={updateField("oauthRedirectUri")}
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								OAuth Client ID
							</span>
							<input
								value={form.oauthClientId}
								onChange={updateField("oauthClientId")}
								placeholder="Client ID do Google Cloud"
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								OAuth Client Secret
							</span>
							<input
								type="password"
								value={form.oauthClientSecret}
								onChange={updateField("oauthClientSecret")}
								placeholder={
									status?.oauthClientSecretConfigured
										? "Ja configurado. Preencha apenas para trocar."
										: "Client Secret do Google Cloud"
								}
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
					</div>

					<div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
						<button
							type="submit"
							disabled={saving}
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
						>
							<Save size={17} /> Salvar configuração
						</button>
						<p className="text-xs font-bold text-slate-500">
							O segredo salvo não é exibido novamente por segurança.
						</p>
					</div>
				</form>

				<button
					type="button"
					onClick={handleConnect}
					disabled={saving || status?.oauthConfigured === false}
					className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
				>
					<Cloud size={17} />{" "}
					{status?.oauthConnected
						? "Reconectar Google Drive"
						: "Conectar Google Drive"}
				</button>

				{status?.oauthConfigured === false ? (
					<p className="mt-3 text-sm font-bold text-red-600">
						Configure GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET na VPS
						para habilitar a conexão OAuth.
					</p>
				) : null}
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="mb-5 flex items-start gap-3">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<ReceiptText size={20} />
					</div>
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Notas fiscais exigidas
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Cadastre os campos que serão liberados após a aprovação completa
							dos documentos.
						</p>
					</div>
				</div>

				<form
					onSubmit={handleSaveInvoiceField}
					className="grid gap-3 lg:grid-cols-[1fr_140px_140px_160px]"
				>
					<input
						value={invoiceFieldForm.nome}
						onChange={(event) =>
							setInvoiceFieldForm((current) => ({
								...current,
								nome: event.target.value,
							}))
						}
						placeholder="Nome da nota fiscal"
						className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
					/>
					<input
						type="number"
						value={invoiceFieldForm.ordem}
						onChange={(event) =>
							setInvoiceFieldForm((current) => ({
								...current,
								ordem: Number(event.target.value || 0),
							}))
						}
						placeholder="Ordem"
						className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
					/>
					<label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
						<input
							type="checkbox"
							checked={invoiceFieldForm.ativo}
							onChange={(event) =>
								setInvoiceFieldForm((current) => ({
									...current,
									ativo: event.target.checked,
								}))
							}
						/>
						Ativo
					</label>
					<button
						type="submit"
						disabled={saving}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-60"
					>
						<Save size={17} /> {invoiceFieldForm.id ? "Atualizar" : "Adicionar"}
					</button>
				</form>

				<div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
					<table className="min-w-[760px] w-full divide-y divide-slate-100 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Nome</th>
								<th className="px-4 py-3">Ordem</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3 text-right">Ação</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{invoiceFields.length ? (
								invoiceFields.map((field) => (
									<tr key={field.id}>
										<td className="px-4 py-3 font-black text-slate-950">
											{field.nome}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-600">
											{field.ordem}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-600">
											{field.ativo ? "Ativo" : "Inativo"}
										</td>
										<td className="px-4 py-3 text-right">
											<button
												type="button"
												onClick={() => editInvoiceField(field)}
												className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
											>
												Editar
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={4}
										className="px-4 py-8 text-center text-sm font-bold text-slate-400"
									>
										Nenhum campo de nota fiscal cadastrado.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="mb-5">
					<h2 className="text-lg font-black text-slate-950">
						Documentos exigidos
					</h2>
					<p className="text-sm font-semibold text-slate-500">
						Cadastre os campos que o líder da empresa deverá enviar mensalmente
						em PDF.
					</p>
				</div>

				<form
					onSubmit={handleSaveField}
					className="grid gap-3 lg:grid-cols-[1fr_140px_170px_140px_160px]"
				>
					<input
						value={fieldForm.nome}
						onChange={(event) =>
							setFieldForm((current) => ({
								...current,
								nome: event.target.value,
							}))
						}
						placeholder="Nome do documento"
						className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
					/>
					<input
						type="number"
						value={fieldForm.ordem}
						onChange={(event) =>
							setFieldForm((current) => ({
								...current,
								ordem: Number(event.target.value || 0),
							}))
						}
						placeholder="Ordem"
						className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
					/>
					<select
						value={fieldForm.publicoAlvo}
						onChange={(event) =>
							setFieldForm((current) => ({
								...current,
								publicoAlvo: event.target.value,
							}))
						}
						className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
					>
						<option value="ambos">Ambos</option>
						<option value="tecnico">Técnico</option>
						<option value="agente">Agente</option>
					</select>
					<label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
						<input
							type="checkbox"
							checked={fieldForm.obrigatorio}
							onChange={(event) =>
								setFieldForm((current) => ({
									...current,
									obrigatorio: event.target.checked,
								}))
							}
						/>
						Obrigatório
					</label>
					<button
						type="submit"
						disabled={saving}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
					>
						<Save size={17} /> {fieldForm.id ? "Atualizar" : "Adicionar"}
					</button>
				</form>

				<div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
					<table className="min-w-[760px] w-full divide-y divide-slate-100 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Nome</th>
								<th className="px-4 py-3">Para</th>
								<th className="px-4 py-3">Obrigatório</th>
								<th className="px-4 py-3">Ordem</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3 text-right">Ação</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{fields.length ? (
								fields.map((field) => (
									<tr key={field.id}>
										<td className="px-4 py-3 font-black text-slate-950">
											{field.nome}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-600">
											{field.publicoAlvo === "agente"
												? "Agente"
												: field.publicoAlvo === "tecnico"
													? "Técnico"
													: "Ambos"}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-600">
											{field.obrigatorio ? "Sim" : "Não"}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-600">
											{field.ordem}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-600">
											{field.ativo ? "Ativo" : "Inativo"}
										</td>
										<td className="px-4 py-3 text-right">
											<button
												type="button"
												onClick={() => editField(field)}
												className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
											>
												Editar
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={6}
										className="px-4 py-8 text-center text-sm font-bold text-slate-400"
									>
										Nenhum campo cadastrado.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="mb-5">
					<h2 className="text-lg font-black text-slate-950">
						Cobrança aos técnicos
					</h2>
					<p className="text-sm font-semibold text-slate-500">
						Configure quando o sistema deve cobrar o envio ou correção dos
						documentos pendentes.
					</p>
				</div>

				<form onSubmit={handleSaveBilling} className="space-y-4">
					<div className="grid items-start gap-4 lg:grid-cols-4">
						<label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
							<span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
								Ativar cobrança
							</span>
							<span className="inline-flex items-center gap-2">
								<input
									type="checkbox"
									checked={billingForm.enabled}
									onChange={(event) =>
										setBillingForm((current) => ({
											...current,
											enabled: event.target.checked,
										}))
									}
								/>
								Enviar e-mails
							</span>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Cobrar no dia
							</span>
							<input
								type="number"
								min="1"
								max="31"
								value={billingForm.firstReminderDay}
								onChange={(event) =>
									setBillingForm((current) => ({
										...current,
										firstReminderDay: Number(event.target.value || 25),
									}))
								}
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Cobrar diariamente até
							</span>
							<input
								type="number"
								min="1"
								max="31"
								value={billingForm.repeatUntilDay}
								onChange={(event) =>
									setBillingForm((current) => ({
										...current,
										repeatUntilDay: Number(event.target.value || 31),
									}))
								}
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
							<span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
								Reincidência
							</span>
							<span className="inline-flex items-center gap-2">
								<input
									type="checkbox"
									checked={billingForm.repeatDailyAfterFirst}
									onChange={(event) =>
										setBillingForm((current) => ({
											...current,
											repeatDailyAfterFirst: event.target.checked,
										}))
									}
								/>
								Dia a dia
							</span>
						</label>
					</div>

					<div className="grid items-start gap-4 lg:grid-cols-[1fr_160px_160px_180px]">
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Assunto do e-mail
							</span>
							<input
								value={billingForm.emailSubject}
								onChange={(event) =>
									setBillingForm((current) => ({
										...current,
										emailSubject: event.target.value,
									}))
								}
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<label className="space-y-2 lg:col-span-4">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Modelo do e-mail ao financeiro
							</span>
							<textarea
								value={billingForm.financeEmailTemplate || ""}
								onChange={(event) =>
									setBillingForm((current) => ({
										...current,
										financeEmailTemplate: event.target.value,
									}))
								}
								className="min-h-64 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
								placeholder={DEFAULT_FINANCEIRO_EMAIL_TEMPLATE}
							/>
							<p className="text-xs font-semibold text-slate-500">
								Variáveis disponíveis: {"{empresa_nome}"}, {"{empresa_cnpj}"},{" "}
								{"{regional}"}, {"{supervisor_nome}"}, {"{mes_referencia}"} e{" "}
								{"{documentos_lista}"}.
							</p>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Janela início
							</span>
							<input
								type="time"
								value={billingForm.windowStart}
								onChange={(event) =>
									setBillingForm((current) => ({
										...current,
										windowStart: event.target.value,
									}))
								}
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Janela fim
							</span>
							<input
								type="time"
								value={billingForm.windowEnd}
								onChange={(event) =>
									setBillingForm((current) => ({
										...current,
										windowEnd: event.target.value,
									}))
								}
								className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
							/>
						</label>
						<button
							type="submit"
							disabled={saving}
							className="self-end rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-60"
						>
							Salvar cobrança
						</button>
					</div>
				</form>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="mb-5">
					<h2 className="text-lg font-black text-slate-950">
						Pastas das empresas
					</h2>
					<p className="text-sm font-semibold text-slate-500">
						Ferramentas administrativas para garantir pastas e criar subpastas
						no Google Drive.
					</p>
				</div>
				<div className="grid items-start gap-3 lg:grid-cols-[1fr_220px]">
					<select
						value={empresaId}
						onChange={(event) => setEmpresaId(event.target.value)}
						className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
					>
						<option value="">Selecione uma empresa</option>
						{empresas.map((empresa) => (
							<option key={empresa.id} value={empresa.id}>
								{empresa.nome} {empresa.regional ? `- ${empresa.regional}` : ""}
							</option>
						))}
					</select>
					<button
						type="button"
						disabled={saving || !empresaId}
						onClick={handleEnsureFolder}
						className="rounded-xl border border-blue-200 px-5 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-60"
					>
						Garantir pasta
					</button>
					<input
						value={subfolderName}
						onChange={(event) => setSubfolderName(event.target.value)}
						placeholder="Nome da subpasta"
						className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
					/>
					<button
						type="button"
						disabled={saving || !empresaId || !subfolderName.trim()}
						onClick={handleCreateSubfolder}
						className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
					>
						Criar subpasta
					</button>
				</div>
			</section>

			<section className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
				<div className="mb-5 flex items-start gap-3">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
						<Trash2 size={20} />
					</div>
					<div>
						<h2 className="text-lg font-black text-red-700">Zona de perigo</h2>
						<p className="text-sm font-semibold text-slate-500">
							Use apenas quando precisar zerar os envios, arquivos e histórico
							de aprovação de documentos. As configurações do Drive e os campos
							exigidos serão mantidos.
						</p>
					</div>
				</div>

				<div className="grid items-start gap-4 lg:grid-cols-[1fr_220px]">
					<label className="space-y-2">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Confirmação obrigatória
						</span>
						<input
							value={purgeForm.confirmation}
							onChange={(event) =>
								setPurgeForm((current) => ({
									...current,
									confirmation: event.target.value,
								}))
							}
							placeholder="Digite ZERAR DOCUMENTOS"
							className="w-full rounded-2xl border border-red-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
						/>
					</label>
					<button
						type="button"
						disabled={
							saving ||
							purgeForm.confirmation.toUpperCase() !== "ZERAR DOCUMENTOS"
						}
						onClick={handlePurgeHistory}
						className="self-end rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
					>
						Zerar histórico
					</button>
				</div>

				<div className="mt-4 grid items-start gap-3 md:grid-cols-2">
					<label className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800">
						<input
							type="checkbox"
							checked={purgeForm.deleteDriveFiles}
							onChange={(event) =>
								setPurgeForm((current) => ({
									...current,
									deleteDriveFiles: event.target.checked,
								}))
							}
							className="mt-1"
						/>
						<span>Apagar também os PDFs do Google Drive quando possível.</span>
					</label>
					<label className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
						<input
							type="checkbox"
							checked={purgeForm.resetFolders}
							onChange={(event) =>
								setPurgeForm((current) => ({
									...current,
									resetFolders: event.target.checked,
								}))
							}
							className="mt-1"
						/>
						<span>
							Remover vínculos de pastas das empresas para recriar tudo do zero.
						</span>
					</label>
				</div>
			</section>
		</div>
	);
}
