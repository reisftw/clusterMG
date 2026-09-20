import {
	AlertTriangle,
	CalendarDays,
	CheckCircle2,
	ChevronDown,
	CloudUpload,
	Eye,
	EyeOff,
	FileText,
	Loader2,
	Lock,
	LogIn,
	LogOut,
	Mail,
	ReceiptText,
	RefreshCw,
	Send,
	ShieldCheck,
	Trash2,
	UserRound,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import MelzFooter from "../../components/layout/MelzFooter";
import Spinner from "../../components/ui/Spinner";
import { useAuthContext } from "../../context/AuthContext";
import {
	fetchUserProfile,
	loginWithEmail,
	solicitarRedefinicaoSenha,
	verificarMfaEmail,
} from "../../modules/auth/services/authService";
import {
	enviarDocumentosMensais,
	enviarNotasFiscaisMensais,
	listarCamposDocumentos,
	listarCamposNotasFiscais,
	listarEnviosDocumentos,
} from "../../modules/documentos/services/documentosService";
import { getVpsAuthSession } from "../../services/vpsAuthSession";

const inputClass =
	"w-full rounded-2xl border border-white/20 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-200/40";
const TERCEIRIZADOS_MFA_STORAGE_KEY =
	"retiradas_terceirizados_mfa_challenge_v1";

function readStoredMfaChallenge() {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.sessionStorage.getItem(TERCEIRIZADOS_MFA_STORAGE_KEY);
		if (!raw) return null;
		const challenge = JSON.parse(raw);
		if (
			challenge?.expiresAt &&
			new Date(challenge.expiresAt).getTime() <= Date.now()
		) {
			window.sessionStorage.removeItem(TERCEIRIZADOS_MFA_STORAGE_KEY);
			return null;
		}
		return challenge?.challengeId ? challenge : null;
	} catch {
		return null;
	}
}

function storeMfaChallenge(challenge) {
	if (typeof window === "undefined") return;
	if (!challenge?.challengeId) {
		window.sessionStorage.removeItem(TERCEIRIZADOS_MFA_STORAGE_KEY);
		return;
	}
	window.sessionStorage.setItem(
		TERCEIRIZADOS_MFA_STORAGE_KEY,
		JSON.stringify(challenge),
	);
}

function currentMonth() {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
}

function formatBytes(value) {
	const bytes = Number(value || 0);
	if (!bytes) return "0 KB";
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}

function formatCurrency(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function formatMonthLabel(value) {
	const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
	if (!match) return value || "-";
	const monthNames = [
		"Janeiro",
		"Fevereiro",
		"Março",
		"Abril",
		"Maio",
		"Junho",
		"Julho",
		"Agosto",
		"Setembro",
		"Outubro",
		"Novembro",
		"Dezembro",
	];
	const monthIndex = Number(match[2]) - 1;
	return `${monthNames[monthIndex] || match[2]}/${match[1]}`;
}

function formatMonthLong(value) {
	const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
	if (!match) return value || "-";
	const monthNames = [
		"janeiro",
		"fevereiro",
		"março",
		"abril",
		"maio",
		"junho",
		"julho",
		"agosto",
		"setembro",
		"outubro",
		"novembro",
		"dezembro",
	];
	const monthIndex = Number(match[2]) - 1;
	return `${monthNames[monthIndex] || match[2]} de ${match[1]}`;
}

const documentTones = [
	{
		icon: "from-violet-500 to-indigo-500",
		soft: "bg-violet-50 text-violet-700 border-violet-200",
		dashed: "border-violet-300 bg-violet-50/70 text-violet-700",
		ring: "focus-within:ring-violet-100",
	},
	{
		icon: "from-emerald-500 to-green-500",
		soft: "bg-emerald-50 text-emerald-700 border-emerald-200",
		dashed: "border-emerald-300 bg-emerald-50/70 text-emerald-700",
		ring: "focus-within:ring-emerald-100",
	},
	{
		icon: "from-orange-500 to-amber-500",
		soft: "bg-orange-50 text-orange-700 border-orange-200",
		dashed: "border-orange-300 bg-orange-50/70 text-orange-700",
		ring: "focus-within:ring-orange-100",
	},
	{
		icon: "from-sky-500 to-blue-600",
		soft: "bg-blue-50 text-blue-700 border-blue-200",
		dashed: "border-blue-300 bg-blue-50/70 text-blue-700",
		ring: "focus-within:ring-blue-100",
	},
];

function statusBadge(status) {
	const map = {
		pendente: "border-amber-200 bg-amber-50 text-amber-700",
		aprovado: "border-emerald-200 bg-emerald-50 text-emerald-700",
		reprovado: "border-red-200 bg-red-50 text-red-700",
	};
	return `inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase ${map[status] || map.pendente}`;
}

function PaginationControls({
	page,
	totalPages,
	totalItems,
	pageSize,
	onPageChange,
	onPageSizeChange,
}) {
	const start = totalItems ? (page - 1) * pageSize + 1 : 0;
	const end = Math.min(totalItems, page * pageSize);
	return (
		<div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
			<p>
				Mostrando {start} a {end} de {totalItems} envio(s)
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
					className="rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
				>
					‹
				</button>
				<span className="rounded-xl bg-blue-600 px-3 py-2 text-white">
					{page}
				</span>
				<button
					type="button"
					disabled={page >= totalPages}
					onClick={() => onPageChange(page + 1)}
					className="rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
				>
					›
				</button>
				<select
					value={pageSize}
					onChange={(event) => onPageSizeChange(Number(event.target.value))}
					className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none"
				>
					{[20, 30, 50, 100].map((option) => (
						<option key={option} value={option}>
							{option} por página
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

function getDocumentCardState({ currentFile, selectedFile, saving }) {
	const currentStatus = String(currentFile?.status || "").toLowerCase();
	const currentAdminStatus = String(
		currentFile?.adminStatus || "",
	).toLowerCase();
	const isRejected =
		currentStatus === "reprovado" || currentAdminStatus === "reprovado";
	const rejectionReason =
		currentFile?.adminMotivoReprovacao || currentFile?.motivoReprovacao;
	let helperText = "Envie o arquivo solicitado";
	if (saving) {
		helperText = "Enviando arquivo...";
	} else if (selectedFile) {
		helperText = "Arquivo selecionado";
	} else if (isRejected) {
		helperText = "Reenvie o documento corrigido";
	}

	return { isRejected, rejectionReason, helperText };
}

function DocumentCardIcon({ isRejected, selectedFile, size = 27 }) {
	if (isRejected) return <AlertTriangle size={size} />;
	if (selectedFile) return <CheckCircle2 size={size} />;
	return <FileText size={size} />;
}

function DocumentFileActions({
	inputId,
	fieldName,
	tone,
	selectedFile,
	disabled,
	saving,
	onRemove,
}) {
	if (selectedFile) {
		return (
			<div className="flex shrink-0 items-center gap-2">
				<label
					htmlFor={inputId}
					className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black transition hover:scale-[1.02] ${tone.soft} ${disabled ? "pointer-events-none opacity-60" : ""}`}
				>
					<CloudUpload size={18} />
					Alterar
				</label>
				<button
					type="button"
					disabled={disabled}
					onClick={onRemove}
					className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:opacity-50"
					aria-label={`Remover ${fieldName}`}
				>
					<Trash2 size={17} />
				</button>
			</div>
		);
	}

	return (
		<label
			htmlFor={inputId}
			className={`inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-black transition hover:scale-[1.02] ${tone.dashed} ${disabled ? "pointer-events-none opacity-60" : ""}`}
		>
			{saving ? (
				<Loader2 className="animate-spin" size={18} />
			) : (
				<CloudUpload className="transition group-hover:-translate-y-0.5" size={18} />
			)}
			Enviar arquivo
		</label>
	);
}

function SelectedFileNotice({ file }) {
	if (!file) return null;
	return (
		<div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
			<div className="flex items-start gap-2">
				<CheckCircle2 className="mt-0.5 shrink-0" size={15} />
				<span className="min-w-0 break-words">
					{file.name} · {formatBytes(file.size)}
				</span>
			</div>
		</div>
	);
}

function RejectionNotice({ isRejected, reason }) {
	if (!isRejected || !reason) return null;
	return (
		<div className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-relaxed text-red-700">
			<div className="flex items-start gap-2">
				<AlertTriangle className="mt-0.5 shrink-0" size={15} />
				<span className="min-w-0 break-words">{reason}</span>
			</div>
		</div>
	);
}

function DocumentUploadCard({
	field,
	index,
	currentFile,
	selectedFile,
	disabled,
	saving,
	onSelect,
	onRemove,
}) {
	const tone = documentTones[index % documentTones.length];
	const { isRejected, rejectionReason, helperText } = getDocumentCardState({
		currentFile,
		selectedFile,
		saving,
	});
	const inputId = `terceirizados-documento-${field.id}`;

	return (
		<article
			className={`group rounded-[24px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_36px_rgba(15,23,42,0.06)] transition duration-200 active:scale-[0.99] sm:p-4 ${tone.ring} focus-within:ring-4 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(15,23,42,0.09)]`}
		>
			<div className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<div
						className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tone.icon} text-white shadow-lg shadow-slate-200`}
					>
						<DocumentCardIcon isRejected={isRejected} selectedFile={selectedFile} />
					</div>
					<div className="min-w-0">
						<h3 className="truncate text-base font-black text-slate-950">
							{field.nome}{" "}
							{field.obrigatorio ? (
								<span className="text-red-600">*</span>
							) : null}
						</h3>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							{helperText}
						</p>
					</div>
				</div>

				<input
					id={inputId}
					type="file"
					accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
					disabled={disabled}
					onChange={(event) => onSelect(event.target.files?.[0] || null)}
					className="sr-only"
				/>

				<DocumentFileActions
					inputId={inputId}
					fieldName={field.nome}
					tone={tone}
					selectedFile={selectedFile}
					disabled={disabled}
					saving={saving}
					onRemove={onRemove}
				/>
			</div>

			<SelectedFileNotice file={selectedFile} />
			<RejectionNotice isRejected={isRejected} reason={rejectionReason} />
		</article>
	);
}

function latestFilesByField(files = []) {
	const latest = new Map();
	files.forEach((file) => {
		const key = file.fieldId || file.fieldNome || file.id;
		const current = latest.get(key);
		if (
			!current ||
			new Date(file.createdAt || 0).getTime() >=
				new Date(current.createdAt || 0).getTime()
		) {
			latest.set(key, file);
		}
	});
	return latest;
}

function isInvoiceFile(file) {
	return String(file?.categoria || "").toLowerCase() === "nota_fiscal";
}

function getAudienceFromRole(role) {
	return role === "agente_autorizado" ? "agente" : "tecnico";
}

function fieldAudienceMatches(field, audience) {
	const target = String(field.publicoAlvo || "ambos").toLowerCase();
	return target === "ambos" || target === audience;
}

function findLatestMonthSubmission(items, mesReferencia) {
	const monthItems = items.filter((item) => item.mesReferencia === mesReferencia);
	return (
		monthItems.sort(
			(a, b) =>
				new Date(b.submittedAt || b.createdAt || 0) -
				new Date(a.submittedAt || a.createdAt || 0),
		)[0] || null
	);
}

function getDocumentStatus(file) {
	return {
		status: String(file?.status || "").toLowerCase(),
		adminStatus: String(file?.adminStatus || "").toLowerCase(),
	};
}

function isDocumentApproved(file) {
	const { status, adminStatus } = getDocumentStatus(file);
	return status === "aprovado" && adminStatus === "aprovado";
}

function isDocumentPendingReview(file) {
	const { status, adminStatus } = getDocumentStatus(file);
	return (
		status === "pendente" ||
		(status === "aprovado" &&
			adminStatus !== "aprovado" &&
			adminStatus !== "reprovado")
	);
}

function isDocumentRejected(file) {
	const { status, adminStatus } = getDocumentStatus(file);
	return status === "reprovado" || adminStatus === "reprovado";
}

function shouldShowUploadField(field, latestMonthFiles) {
	const file = latestMonthFiles.get(field.id);
	if (isDocumentRejected(file)) return true;
	return !isDocumentApproved(file) && !isDocumentPendingReview(file);
}

function getApprovedFields(fields, latestMonthFiles) {
	return fields.filter((field) => isDocumentApproved(latestMonthFiles.get(field.id)));
}

function getPendingFields(fields, latestMonthFiles) {
	return fields.filter((field) =>
		isDocumentPendingReview(latestMonthFiles.get(field.id)),
	);
}

function getVisibleFields(fields, latestMonthFiles) {
	return fields.filter((field) => shouldShowUploadField(field, latestMonthFiles));
}

function hasRejectedDocumentFields(fields, latestMonthFiles) {
	return fields.some((field) => isDocumentRejected(latestMonthFiles.get(field.id)));
}

function getSelectedDocumentFiles(visibleFields, filesByField) {
	return visibleFields
		.map((field) => ({ fieldId: field.id, file: filesByField[field.id] }))
		.filter((item) => item.file);
}

function getSelectedInvoiceFiles(invoiceFields, invoiceFilesByField) {
	return invoiceFields
		.map((field) => ({
			fieldId: field.id,
			field,
			file: invoiceFilesByField[field.id]?.file || null,
			valor: invoiceFilesByField[field.id]?.valor || "",
		}))
		.filter((item) => item.file);
}

function getSelectedFilesSize(selectedFiles) {
	return selectedFiles.reduce(
		(total, item) => total + Number(item.file?.size || 0),
		0,
	);
}

function getPaginatedItems(items, page, pageSize) {
	const start = (page - 1) * pageSize;
	return items.slice(start, start + pageSize);
}

function getInvalidInvoice(selectedInvoices) {
	return selectedInvoices.find(
		(item) =>
			Number(String(item.valor).replace(/\./g, "").replace(",", ".")) <= 0,
	);
}

function getInitialLoginMessage() {
	return readStoredMfaChallenge()
		? "Código MFA pendente. Informe o código recebido por e-mail."
		: "";
}

function useTerceirosLoginFlow(onLoggedIn) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [mfaCode, setMfaCode] = useState("");
	const [mfaChallenge, setMfaChallenge] = useState(() =>
		readStoredMfaChallenge(),
	);
	const [saving, setSaving] = useState(false);
	const [recovering, setRecovering] = useState(false);
	const [recoverMessage, setRecoverMessage] = useState("");
	const [localMessage, setLocalMessage] = useState(getInitialLoginMessage);

	const submit = async () => {
		if (!email.trim() || !password) {
			setLocalMessage("Informe e-mail e senha para continuar.");
			return;
		}
		setSaving(true);
		setLocalMessage("Validando credenciais...");
		try {
			const result = await loginWithEmail(email, password);
			if (result?.mfaRequired) {
				storeMfaChallenge(result);
				setMfaChallenge(result);
				setMfaCode("");
				setLocalMessage(
					"Código enviado. Verifique seu e-mail e informe o código para continuar.",
				);
				return;
			}
			setLocalMessage("Login realizado. Carregando perfil...");
			await fetchUserProfile(result.user.uid).catch(() => null);
			onLoggedIn?.();
		} catch (submitError) {
			setLocalMessage(
				submitError?.message ||
					"Não foi possível entrar. Confira e-mail e senha.",
			);
		} finally {
			setSaving(false);
		}
	};

	const submitMfa = async () => {
		if (!mfaChallenge?.challengeId) return;
		if (mfaCode.length !== 6) {
			setLocalMessage("Informe o código de 6 dígitos.");
			return;
		}
		setSaving(true);
		setLocalMessage("Validando código...");
		try {
			const result = await verificarMfaEmail({
				challengeId: mfaChallenge.challengeId,
				code: mfaCode,
			});
			setLocalMessage("Código validado. Carregando perfil...");
			await fetchUserProfile(result.user.uid).catch(() => null);
			storeMfaChallenge(null);
			onLoggedIn?.();
		} catch (mfaError) {
			setLocalMessage(mfaError?.message || "Código inválido ou expirado.");
		} finally {
			setSaving(false);
		}
	};

	const resetMfa = () => {
		storeMfaChallenge(null);
		setMfaChallenge(null);
		setMfaCode("");
		setPassword("");
	};

	const recoverPassword = async () => {
		if (!email.trim()) {
			setRecoverMessage(
				"Informe seu e-mail para receber o link de recuperação.",
			);
			return;
		}
		setRecovering(true);
		setRecoverMessage("");
		try {
			await solicitarRedefinicaoSenha(email.trim());
			setRecoverMessage(
				"Se esse e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
			);
		} catch (recoverError) {
			setRecoverMessage(
				recoverError?.message ||
					"Não foi possível solicitar a redefinição de senha.",
			);
		} finally {
			setRecovering(false);
		}
	};

	return {
		email,
		setEmail,
		password,
		setPassword,
		showPassword,
		setShowPassword,
		mfaCode,
		setMfaCode,
		mfaChallenge,
		saving,
		recovering,
		recoverMessage,
		localMessage,
		submit,
		submitMfa,
		resetMfa,
		recoverPassword,
	};
}

function LoginBoxHeader({ mfaChallenge }) {
	const title = mfaChallenge ? "Confirme seu acesso" : "Portal terceirizado";
	const description = mfaChallenge
		? `Digite o código enviado para ${mfaChallenge.maskedEmail || "seu e-mail"}.`
		: "Entre para enviar documentos mensais.";

	return (
		<div className="mb-6 text-center">
			<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
				<Lock size={22} />
			</div>
			<h1 className="text-2xl font-black">{title}</h1>
			<p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
		</div>
	);
}

function MfaChallengeFields({ mfaCode, setMfaCode, mfaChallenge }) {
	return (
		<div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
			<label className="block">
				<span className="text-xs font-black uppercase tracking-[0.12em] text-blue-700">
					Código de segurança
				</span>
				<input
					type="text"
					required
					inputMode="numeric"
					autoComplete="one-time-code"
					maxLength={6}
					value={mfaCode}
					onChange={(event) =>
						setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
					}
					className="mt-2 w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.35em] text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
					placeholder="000000"
				/>
			</label>
			<p className="mt-2 text-xs font-bold text-blue-700">
				O código expira em {mfaChallenge.ttlMinutes || 10} minuto(s).
			</p>
		</div>
	);
}

function CredentialsFields({
	email,
	setEmail,
	password,
	setPassword,
	showPassword,
	setShowPassword,
}) {
	return (
		<>
			<label className="block">
				<span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
					E-mail
				</span>
				<div className="relative">
					<Mail
						size={18}
						className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
					/>
					<input
						type="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						className={`${inputClass} pl-12`}
						placeholder="seu@email.com"
						autoComplete="email"
					/>
				</div>
			</label>
			<label className="block">
				<span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
					Senha
				</span>
				<div className="relative">
					<Lock
						size={18}
						className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
					/>
					<input
						type={showPassword ? "text" : "password"}
						required
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						className={`${inputClass} pl-12 pr-12`}
						placeholder="Senha"
						autoComplete="current-password"
					/>
					<button
						type="button"
						onClick={() => setShowPassword((value) => !value)}
						className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-blue-600"
						aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
					>
						{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
					</button>
				</div>
			</label>
		</>
	);
}

function LoginNotice({ tone = "blue", children }) {
	if (!children) return null;
	const toneClass =
		tone === "red"
			? "border-red-100 bg-red-50 text-red-700"
			: "border-blue-100 bg-blue-50 text-blue-800";
	return (
		<div className={`rounded-2xl border p-3 text-sm font-bold ${toneClass}`}>
			{children}
		</div>
	);
}

function LoginPrimaryButton({ mfaChallenge, saving, submit, submitMfa }) {
	let label = "Entrar";
	if (saving) {
		label = "Validando...";
	} else if (mfaChallenge) {
		label = "Validar código";
	}
	return (
		<button
			type="button"
			onClick={mfaChallenge ? submitMfa : submit}
			disabled={saving}
			className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-lg hover:bg-orange-600 disabled:opacity-60"
		>
			<LogIn size={18} /> {label}
		</button>
	);
}

function LoginSecondaryButton({
	mfaChallenge,
	saving,
	recovering,
	resetMfa,
	recoverPassword,
}) {
	const isMfa = Boolean(mfaChallenge);
	let label = "Esqueci minha senha";
	if (isMfa) {
		label = "Voltar para login";
	} else if (recovering) {
		label = "Enviando link...";
	}
	return (
		<button
			type="button"
			disabled={isMfa ? saving : recovering}
			onClick={isMfa ? resetMfa : recoverPassword}
			className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
		>
			{label}
		</button>
	);
}

function LoginBox({ onLoggedIn }) {
	const { error } = useAuthContext();
	const loginFlow = useTerceirosLoginFlow(onLoggedIn);
	const {
		email,
		setEmail,
		password,
		setPassword,
		showPassword,
		setShowPassword,
		mfaCode,
		setMfaCode,
		mfaChallenge,
		saving,
		recovering,
		recoverMessage,
		localMessage,
		submit,
		submitMfa,
		resetMfa,
		recoverPassword,
	} = loginFlow;

	const handleKeyDown = (event) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		if (mfaChallenge) {
			submitMfa();
			return;
		}
		submit();
	};

	return (
		<div
			onKeyDown={handleKeyDown}
			className="mx-auto w-full max-w-md rounded-[28px] border border-white/15 bg-white/95 p-6 text-slate-950 shadow-2xl"
		>
			<LoginBoxHeader mfaChallenge={mfaChallenge} />
			<div className="space-y-3">
				{mfaChallenge ? (
					<MfaChallengeFields
						mfaCode={mfaCode}
						setMfaCode={setMfaCode}
						mfaChallenge={mfaChallenge}
					/>
				) : (
					<CredentialsFields
						email={email}
						setEmail={setEmail}
						password={password}
						setPassword={setPassword}
						showPassword={showPassword}
						setShowPassword={setShowPassword}
					/>
				)}
				<LoginNotice tone="red">{error}</LoginNotice>
				<LoginNotice>{localMessage}</LoginNotice>
				<LoginPrimaryButton
					mfaChallenge={mfaChallenge}
					saving={saving}
					submit={submit}
					submitMfa={submitMfa}
				/>
				<LoginSecondaryButton
					mfaChallenge={mfaChallenge}
					saving={saving}
					recovering={recovering}
					resetMfa={resetMfa}
					recoverPassword={recoverPassword}
				/>
				{recoverMessage ? (
					<div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-800">
						{recoverMessage}
					</div>
				) : null}
			</div>
		</div>
	);
}

function PortalHeroHeader() {
	return (
		<header className="relative min-h-72 shrink-0 overflow-hidden rounded-b-[42px] px-2 pb-12 pt-7 sm:min-h-80 sm:px-6 lg:rounded-[42px] lg:border lg:border-white/10 lg:bg-white/5 lg:px-10 lg:shadow-2xl lg:shadow-black/10">
			<div className="pointer-events-none absolute right-0 top-6 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
			<div className="pointer-events-none absolute -right-3 top-11 hidden h-48 w-48 sm:block">
				<div className="absolute right-4 top-5 h-24 w-32 rounded-[34px] bg-gradient-to-br from-sky-300 via-blue-500 to-indigo-700 shadow-[0_24px_60px_rgba(37,99,235,0.45)]" />
				<div className="absolute right-24 top-12 h-20 w-20 rounded-full bg-gradient-to-br from-blue-200 to-blue-600 shadow-xl" />
				<div className="absolute right-14 top-4 h-20 w-20 rounded-full bg-gradient-to-br from-blue-200 to-indigo-500 shadow-xl" />
				<div className="absolute right-24 top-28 h-24 w-32 rotate-6 rounded-[26px] border border-white/10 bg-white/10 shadow-xl backdrop-blur">
					<div className="ml-6 mt-6 h-2 w-16 rounded-full bg-blue-200/80" />
					<div className="ml-6 mt-3 h-2 w-24 rounded-full bg-blue-200/50" />
					<div className="ml-6 mt-6 flex gap-4">
						<span className="h-8 w-8 rounded-xl bg-blue-500" />
						<span className="h-8 w-8 rounded-xl bg-blue-200/70" />
					</div>
				</div>
				<CloudUpload
					className="absolute right-16 top-16 text-white drop-shadow-xl"
					size={54}
				/>
				<div className="absolute right-0 top-20 h-28 w-28 rounded-full border-2 border-dashed border-blue-300/50" />
			</div>
			<div className="relative max-w-xl">
				<img
					src="/cluster-mg.png"
					alt="Cluster MG"
					className="mb-8 h-auto w-40 max-w-full object-contain sm:w-52"
					decoding="async"
				/>
				<p className="text-xs font-black uppercase tracking-[0.34em] text-orange-300 sm:text-sm">
					Portal de documentos
				</p>
				<h1 className="mt-3 text-5xl font-black leading-none tracking-tight text-white sm:text-6xl">
					Terceirizados
				</h1>
				<p className="mt-5 max-w-sm text-xl font-semibold leading-relaxed text-blue-100/90">
					Envie seus documentos para análise e aprovação.
				</p>
			</div>
		</header>
	);
}

function AccessRestrictedCard({ onSignOut }) {
	return (
		<div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-xl">
			<XCircle className="mx-auto mb-3" size={36} />
			<h2 className="text-xl font-black">Acesso restrito</h2>
			<p className="mt-2 text-sm font-bold">
				Esta área é destinada aos líderes de empresa e agentes autorizados.
			</p>
			<button
				type="button"
				onClick={onSignOut}
				className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
			>
				Sair
			</button>
		</div>
	);
}

function DocumentPortalFooter() {
	return (
		<div className="shrink-0">
			<MelzFooter
				variant="dark"
				className="border-white/10 bg-transparent text-white"
			/>
		</div>
	);
}

function CurrentUserSummary({ currentUser, onSignOut }) {
	return (
		<div className="mb-8 flex items-start justify-between gap-3">
			<div className="min-w-0">
				<h2 className="text-3xl font-black tracking-tight text-slate-950">
					Enviar documentos
				</h2>
				<div className="mt-5 flex min-w-0 items-center gap-3">
					<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
						<UserRound size={27} />
					</div>
					<div className="min-w-0">
						<p className="truncate text-xl font-black text-slate-600">
							{currentUser?.nome ||
								currentUser?.name ||
								currentUser?.email ||
								"Usuário"}
						</p>
						<p className="truncate text-sm font-bold text-slate-400">
							{currentUser?.empresaNome ||
								currentUser?.profile?.empresaNome ||
								"Sua empresa"}
						</p>
					</div>
				</div>
			</div>
			<button
				type="button"
				onClick={onSignOut}
				className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
			>
				<LogOut size={18} />
				Sair
			</button>
		</div>
	);
}

function ReferenceMonthPicker({ value, disabled, onChange }) {
	return (
		<div className="mb-8 space-y-3">
			<p className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">
				Mês de referência
			</p>
			<label className="relative block">
				<span className="pointer-events-none absolute inset-y-0 left-0 flex w-16 items-center justify-center rounded-l-2xl border-r border-slate-200 bg-slate-50 text-slate-500">
					<CalendarDays size={24} />
				</span>
				<input
					type="month"
					value={value}
					disabled={disabled}
					aria-label="Mês de referência"
					onChange={(event) => onChange(event.target.value)}
					className="h-16 w-full rounded-2xl border border-slate-200 bg-white pl-20 pr-12 text-base font-black text-transparent caret-transparent shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
				/>
				<span className="pointer-events-none absolute left-20 right-12 top-1/2 -translate-y-1/2 truncate text-base font-black text-slate-950">
					{formatMonthLong(value)}
				</span>
				<ChevronDown
					className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
					size={21}
				/>
			</label>
			<div className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2 text-base font-black text-blue-700">
				<CalendarDays size={18} />
				{formatMonthLabel(value)}
			</div>
		</div>
	);
}

function LoadingDocumentsNotice({ loadingData }) {
	if (!loadingData) return null;
	return (
		<div className="mb-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-800">
			<Loader2 className="animate-spin" size={18} />
			Carregando documentos e status do mês...
		</div>
	);
}

function ApprovedFieldsNotice({ fields }) {
	if (!fields.length) return null;
	return (
		<div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
			<p className="mb-2 font-black">Já aprovado neste mês</p>
			<div className="flex flex-wrap gap-2">
				{fields.map((field) => (
					<span
						key={field.id}
						className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700"
					>
						{field.nome}
					</span>
				))}
			</div>
		</div>
	);
}

function PendingFieldsNotice({ fields, mesReferencia }) {
	if (!fields.length) return null;
	return (
		<div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
			<div className="flex items-start gap-3">
				<Loader2 className="mt-0.5 shrink-0 text-amber-600" size={18} />
				<div>
					<p className="font-black">Envio aguardando avaliação</p>
					<p className="mt-1">
						Você já enviou documento(s) para {formatMonthLabel(mesReferencia)}.
						Novo envio fica bloqueado até o supervisor avaliar.
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{fields.map((field) => (
							<span
								key={field.id}
								className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700"
							>
								{field.nome}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function DocumentsEmptyState({ fields, waitingReview }) {
	if (fields.length && !waitingReview) {
		return (
			<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
				Todos os documentos deste mês estão aprovados.
			</div>
		);
	}

	return (
		<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
			Nenhum documento exigido foi cadastrado ainda.
		</div>
	);
}

function DocumentCardsSection({
	fields,
	visibleFields,
	approvedFields,
	pendingFields,
	latestMonthFiles,
	filesByField,
	saving,
	waitingReview,
	mesReferencia,
	onSelect,
	onRemove,
}) {
	return (
		<div className="border-t border-slate-200 pt-7">
			<h3 className="mb-5 text-sm font-black uppercase tracking-[0.14em] text-slate-500">
				Documentos para envio
			</h3>
			<ApprovedFieldsNotice fields={approvedFields} />
			<PendingFieldsNotice fields={pendingFields} mesReferencia={mesReferencia} />
			<div className="space-y-4">
				{visibleFields.length ? (
					visibleFields.map((field, index) => (
						<DocumentUploadCard
							key={field.id}
							field={field}
							index={index}
							currentFile={latestMonthFiles.get(field.id)}
							selectedFile={filesByField[field.id]}
							disabled={saving || waitingReview}
							saving={saving}
							onSelect={(file) => onSelect(field.id, file)}
							onRemove={() => onRemove(field.id)}
						/>
					))
				) : (
					<DocumentsEmptyState fields={fields} waitingReview={waitingReview} />
				)}
			</div>
		</div>
	);
}

function ExistingInvoicesList({ invoices }) {
	if (!invoices.length) return null;
	return (
		<div className="mb-4 rounded-2xl border border-emerald-100 bg-white p-3 text-sm font-bold text-emerald-800">
			<p className="mb-2 font-black">Notas já enviadas</p>
			<div className="space-y-2">
				{invoices.map((invoice) => (
					<div
						key={invoice.id}
						className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2"
					>
						<span>{invoice.fieldNome || invoice.nome}</span>
						<span>{formatCurrency(invoice.valor)}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function InvoiceUploadCard({ field, index, current, saving, onChange }) {
	const inputId = `terceirizados-nota-${field.id}`;
	const tone = documentTones[index % documentTones.length];
	return (
		<article className="rounded-2xl border border-orange-100 bg-white p-4">
			<div className="grid gap-3 lg:grid-cols-[1fr_150px_190px] lg:items-end">
				<div>
					<p className="text-sm font-black text-slate-950">{field.nome}</p>
					<p className="text-xs font-bold text-slate-500">
						Anexe a nota fiscal e informe o valor.
					</p>
				</div>
				<label className="space-y-1">
					<span className="text-xs font-black uppercase tracking-wide text-slate-500">
						Valor
					</span>
					<input
						value={current.valor || ""}
						disabled={saving}
						onChange={(event) => onChange(field.id, { valor: event.target.value })}
						placeholder="0,00"
						className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-800 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
					/>
				</label>
				<div>
					<input
						id={inputId}
						type="file"
						accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
						disabled={saving}
						onChange={(event) =>
							onChange(field.id, { file: event.target.files?.[0] || null })
						}
						className="sr-only"
					/>
					<label
						htmlFor={inputId}
						className={`inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-black transition hover:scale-[1.02] ${tone.dashed}`}
					>
						<CloudUpload size={18} />
						{current.file ? "Alterar nota" : "Enviar nota"}
					</label>
				</div>
			</div>
			{current.file ? (
				<p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
					{current.file.name} · {formatBytes(current.file.size)}
				</p>
			) : null}
		</article>
	);
}

function InvoicesSection({
	monthApproved,
	existingInvoices,
	invoiceFields,
	invoiceFilesByField,
	selectedInvoices,
	saving,
	onInvoiceChange,
	onSubmitInvoices,
}) {
	if (!monthApproved) return null;
	return (
		<section className="mt-7 rounded-[28px] border border-orange-100 bg-orange-50/70 p-4 sm:p-5">
			<div className="mb-4 flex items-start gap-3">
				<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white">
					<ReceiptText size={21} />
				</span>
				<div>
					<h3 className="text-lg font-black text-slate-950">
						Notas fiscais do mês
					</h3>
					<p className="text-sm font-bold text-orange-800">
						Documentos aprovados. Agora você pode anexar as notas fiscais e
						informar o valor de cada uma.
					</p>
				</div>
			</div>
			<ExistingInvoicesList invoices={existingInvoices} />
			<div className="space-y-3">
				{invoiceFields.length ? (
					invoiceFields.map((field, index) => (
						<InvoiceUploadCard
							key={field.id}
							field={field}
							index={index}
							current={invoiceFilesByField[field.id] || {}}
							saving={saving}
							onChange={onInvoiceChange}
						/>
					))
				) : (
					<p className="rounded-2xl border border-amber-100 bg-white p-4 text-sm font-bold text-amber-800">
						Nenhum campo de nota fiscal foi cadastrado ainda.
					</p>
				)}
			</div>
			<button
				type="button"
				disabled={saving || !invoiceFields.length || !selectedInvoices.length}
				onClick={onSubmitInvoices}
				className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[20px] bg-orange-500 px-5 py-3 text-base font-black text-white shadow-[0_16px_36px_rgba(249,115,22,0.25)] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
			>
				{saving ? <Loader2 className="animate-spin" size={20} /> : <ReceiptText size={20} />}
				Enviar notas fiscais
			</button>
		</section>
	);
}

function SubmissionFormFeedback({
	selectedFiles,
	waitingReview,
	selectedFilesSize,
	saving,
	successMessage,
	message,
}) {
	return (
		<>
			{selectedFiles.length && !waitingReview ? (
				<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
					{selectedFiles.length} arquivo(s) pronto(s) para envio -{" "}
					{formatBytes(selectedFilesSize)} no total.
				</div>
			) : null}
			{saving ? (
				<div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-black text-orange-800">
					<div className="flex items-center gap-3">
						<Loader2 className="animate-spin" size={18} />
						Enviando arquivos. Não feche esta tela até finalizar.
					</div>
				</div>
			) : null}
			{successMessage ? (
				<div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
					{successMessage}
				</div>
			) : null}
			{message ? (
				<div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-800">
					{message}
				</div>
			) : null}
		</>
	);
}

function SecurityNotice() {
	return (
		<div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-blue-900">
			<div className="flex items-start gap-3">
				<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
					<ShieldCheck size={20} />
				</span>
				<div>
					<p className="font-black">Seus arquivos estão protegidos</p>
					<p className="mt-1 text-sm font-semibold text-blue-800/80">
						O envio passa pelo backend autenticado do sistema e não gera links
						públicos.
					</p>
				</div>
			</div>
		</div>
	);
}

function SubmitDocumentsButton({
	saving,
	loadingData,
	waitingReview,
	visibleFields,
	selectedFiles,
	hasRejectedFields,
}) {
	const disabled =
		saving ||
		loadingData ||
		waitingReview ||
		!visibleFields.length ||
		!selectedFiles.length;
	let label = "Enviar para aprovação";
	if (saving) {
		label = "Enviando arquivos...";
	} else if (waitingReview) {
		label = "Aguardando avaliação";
	} else if (hasRejectedFields) {
		label = "Reenviar para aprovação";
	}

	return (
		<button
			type="submit"
			disabled={disabled}
			className="mt-5 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-[22px] bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-lg font-black text-white shadow-[0_20px_42px_rgba(37,99,235,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_rgba(37,99,235,0.38)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
		>
			{saving ? <Loader2 className="animate-spin" size={22} /> : <Send size={22} />}
			{label}
		</button>
	);
}

function DocumentsSubmissionForm({
	state,
	actions,
}) {
	return (
		<form
			onSubmit={actions.submit}
			className="relative z-10 rounded-[34px] border border-white/80 bg-white p-5 text-slate-950 shadow-[0_28px_90px_rgba(15,23,42,0.22)] sm:p-8"
		>
			<CurrentUserSummary currentUser={state.currentUser} onSignOut={actions.signOut} />
			<ReferenceMonthPicker
				value={state.mesReferencia}
				disabled={state.saving}
				onChange={actions.setMesReferencia}
			/>
			<LoadingDocumentsNotice loadingData={state.loadingData} />
			<DocumentCardsSection
				fields={state.fields}
				visibleFields={state.visibleFields}
				approvedFields={state.approvedFields}
				pendingFields={state.pendingFields}
				latestMonthFiles={state.latestMonthFiles}
				filesByField={state.filesByField}
				saving={state.saving}
				waitingReview={state.waitingReview}
				mesReferencia={state.mesReferencia}
				onSelect={actions.selectDocumentFile}
				onRemove={actions.removeDocumentFile}
			/>
			<InvoicesSection
				monthApproved={state.monthApproved}
				existingInvoices={state.existingInvoices}
				invoiceFields={state.invoiceFields}
				invoiceFilesByField={state.invoiceFilesByField}
				selectedInvoices={state.selectedInvoices}
				saving={state.saving}
				onInvoiceChange={actions.updateInvoiceField}
				onSubmitInvoices={actions.submitInvoices}
			/>
			<SubmissionFormFeedback
				selectedFiles={state.selectedFiles}
				waitingReview={state.waitingReview}
				selectedFilesSize={state.selectedFilesSize}
				saving={state.saving}
				successMessage={state.successMessage}
				message={state.message}
			/>
			<SecurityNotice />
			<SubmitDocumentsButton
				saving={state.saving}
				loadingData={state.loadingData}
				waitingReview={state.waitingReview}
				visibleFields={state.visibleFields}
				selectedFiles={state.selectedFiles}
				hasRejectedFields={state.hasRejectedFields}
			/>
		</form>
	);
}

function SubmissionStatusDetails({ item }) {
	if (item.status === "reprovado") {
		return (
			<div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">
				{item.motivoReprovacao || "Reprovado sem motivo informado."}
			</div>
		);
	}
	if (item.status === "aprovado") {
		return (
			<div className="mt-3 inline-flex items-center gap-2 text-sm font-black text-emerald-700">
				<CheckCircle2 size={16} /> Documentos aprovados
			</div>
		);
	}
	return null;
}

function SubmissionHistoryPanel({
	items,
	paginatedItems,
	page,
	totalPages,
	pageSize,
	onRefresh,
	onPageChange,
	onPageSizeChange,
}) {
	return (
		<section className="rounded-[30px] border border-white/80 bg-white/95 p-5 text-slate-950 shadow-[0_22px_70px_rgba(15,23,42,0.16)] lg:sticky lg:top-6">
			<div className="mb-5 flex items-center justify-between gap-3">
				<div>
					<h2 className="text-xl font-black">Meus envios</h2>
					<p className="text-sm font-semibold text-slate-500">
						Acompanhe aprovados, pendentes e reprovados.
					</p>
				</div>
				<button
					type="button"
					onClick={onRefresh}
					className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
				>
					<RefreshCw size={17} />
				</button>
			</div>
			<div className="space-y-3">
				{paginatedItems.length ? (
					paginatedItems.map((item) => (
						<article key={item.id} className="rounded-2xl border border-slate-200 p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-lg font-black text-slate-950">
										{formatMonthLabel(item.mesReferencia)}
									</p>
									<p className="text-xs font-semibold text-slate-500">
										{formatDate(item.submittedAt)}
									</p>
								</div>
								<span className={statusBadge(item.status)}>{item.status}</span>
							</div>
							<p className="mt-2 text-sm font-semibold text-slate-600">
								{item.files?.length || 0} arquivo(s)
							</p>
							<SubmissionStatusDetails item={item} />
						</article>
					))
				) : (
					<div className="rounded-2xl border border-slate-100 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
						Nenhum envio encontrado.
					</div>
				)}
			</div>
			<PaginationControls
				page={page}
				totalPages={totalPages}
				totalItems={items.length}
				pageSize={pageSize}
				onPageChange={onPageChange}
				onPageSizeChange={onPageSizeChange}
			/>
		</section>
	);
}

function AuthenticatedDocumentsWorkspace({ state, actions }) {
	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
			<DocumentsSubmissionForm state={state} actions={actions} />
			<SubmissionHistoryPanel
				items={state.items}
				paginatedItems={state.paginatedItems}
				page={state.safePage}
				totalPages={state.totalPages}
				pageSize={state.pageSize}
				onRefresh={actions.load}
				onPageChange={actions.setPage}
				onPageSizeChange={actions.setPageSize}
			/>
		</div>
	);
}

function PortalAccessContent({ currentUser, isLeader, state, actions }) {
	if (!currentUser) {
		return <LoginBox onLoggedIn={actions.onLoggedIn} />;
	}
	if (!isLeader) {
		return <AccessRestrictedCard onSignOut={actions.signOut} />;
	}
	return <AuthenticatedDocumentsWorkspace state={state} actions={actions} />;
}

export default function TerceirizadosDocumentosPage() {
	const { currentUser: authUser, loading, signOut } = useAuthContext();
	const [, setSessionTick] = useState(0);
	const [fields, setFields] = useState([]);
	const [invoiceFields, setInvoiceFields] = useState([]);
	const [items, setItems] = useState([]);
	const [mesReferencia, setMesReferencia] = useState(currentMonth());
	const [filesByField, setFilesByField] = useState({});
	const [invoiceFilesByField, setInvoiceFilesByField] = useState({});
	const [message, setMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [loadingData, setLoadingData] = useState(false);
	const [saving, setSaving] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);

	const storedSession = getVpsAuthSession();
	const currentUser = authUser || storedSession?.user || null;
	const currentUserId = currentUser?.id;
	const currentRole = String(currentUser?.role || "").toLowerCase();
	const isLeader = ["lider_empresa", "agente_autorizado"].includes(currentRole);
	const audience = getAudienceFromRole(currentRole);

	const load = useCallback(async () => {
		if (!currentUserId) return;
		setMessage("");
		setLoadingData(true);
		try {
			const [requiredFields, requiredInvoiceFields, submissions] =
				await Promise.all([
					listarCamposDocumentos(),
					listarCamposNotasFiscais(),
					listarEnviosDocumentos({ mine: true, limit: 100 }),
				]);
			setFields(
				requiredFields.filter((field) => fieldAudienceMatches(field, audience)),
			);
			setInvoiceFields(requiredInvoiceFields);
			setItems(submissions);
		} finally {
			setLoadingData(false);
		}
	}, [audience, currentUserId]);

	useEffect(() => {
		load().catch((error) =>
			setMessage(error?.message || "Não foi possível carregar documentos."),
		);
	}, [load]);

	useEffect(() => {
		setFilesByField({});
		setInvoiceFilesByField({});
		setMessage("");
		setSuccessMessage("");
	}, [mesReferencia]);

	const monthSubmission = useMemo(
		() => findLatestMonthSubmission(items, mesReferencia),
		[items, mesReferencia],
	);

	const latestMonthFiles = useMemo(
		() =>
			latestFilesByField(
				(monthSubmission?.files || []).filter((file) => !isInvoiceFile(file)),
			),
		[monthSubmission],
	);

	const approvedFields = useMemo(
		() => getApprovedFields(fields, latestMonthFiles),
		[fields, latestMonthFiles],
	);

	const pendingFields = useMemo(
		() => getPendingFields(fields, latestMonthFiles),
		[fields, latestMonthFiles],
	);

	const visibleFields = useMemo(
		() => getVisibleFields(fields, latestMonthFiles),
		[fields, latestMonthFiles],
	);
	const hasRejectedFields = useMemo(
		() => hasRejectedDocumentFields(visibleFields, latestMonthFiles),
		[latestMonthFiles, visibleFields],
	);

	const selectedFiles = useMemo(
		() => getSelectedDocumentFiles(visibleFields, filesByField),
		[visibleFields, filesByField],
	);
	const selectedInvoices = useMemo(
		() => getSelectedInvoiceFiles(invoiceFields, invoiceFilesByField),
		[invoiceFields, invoiceFilesByField],
	);

	const waitingReview = pendingFields.length > 0;
	const monthApproved =
		String(monthSubmission?.status || "").toLowerCase() === "aprovado";
	const existingInvoices = useMemo(
		() => (monthSubmission?.files || []).filter(isInvoiceFile),
		[monthSubmission],
	);
	const selectedFilesSize = useMemo(
		() => getSelectedFilesSize(selectedFiles),
		[selectedFiles],
	);
	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paginatedItems = useMemo(
		() => getPaginatedItems(items, safePage, pageSize),
		[items, pageSize, safePage],
	);

	useEffect(() => {
		setPage(1);
	}, [pageSize, currentUser?.id]);

	const submit = async (event) => {
		event.preventDefault();
		if (waitingReview) {
			setMessage(
				"Existe envio aguardando avaliação para este mês. Aguarde o supervisor avaliar antes de enviar novamente.",
			);
			return;
		}
		if (!selectedFiles.length) {
			setMessage("Selecione ao menos um arquivo PDF, PNG ou JPG para enviar.");
			return;
		}
		setSaving(true);
		setMessage("");
		setSuccessMessage("");
		try {
			const response = await enviarDocumentosMensais({
				mesReferencia,
				filesByField: selectedFiles,
			});
			setFilesByField({});
			if (response?.submission) {
				setItems((current) => [
					response.submission,
					...current.filter((item) => item.id !== response.submission.id),
				]);
			}
			setSuccessMessage(
				`Documentos de ${formatMonthLabel(mesReferencia)} enviados com sucesso. Novo envio bloqueado até a avaliação do supervisor.`,
			);
			setSaving(false);
			load().catch((error) =>
				setMessage(
					error?.message ||
						"Envio salvo, mas não foi possível atualizar a lista automaticamente.",
				),
			);
		} catch (error) {
			setMessage(error?.message || "Falha ao enviar documentos.");
			setSaving(false);
		}
	};

	const submitInvoices = async () => {
		if (!monthSubmission?.id || !monthApproved) {
			setMessage(
				"As notas fiscais só ficam disponíveis após a aprovação completa dos documentos.",
			);
			return;
		}
		if (!selectedInvoices.length) {
			setMessage("Selecione ao menos uma nota fiscal para enviar.");
			return;
		}
		const withoutValue = getInvalidInvoice(selectedInvoices);
		if (withoutValue) {
			setMessage(
				`Informe o valor da nota fiscal "${withoutValue.field?.nome || "selecionada"}".`,
			);
			return;
		}
		setSaving(true);
		setMessage("");
		setSuccessMessage("");
		try {
			const response = await enviarNotasFiscaisMensais({
				submissionId: monthSubmission.id,
				filesByField: selectedInvoices,
			});
			setInvoiceFilesByField({});
			if (response?.submission) {
				setItems((current) => [
					response.submission,
					...current.filter((item) => item.id !== response.submission.id),
				]);
			}
			setSuccessMessage(
				`Notas fiscais de ${formatMonthLabel(mesReferencia)} enviadas com sucesso.`,
			);
			setSaving(false);
			load().catch((error) =>
				setMessage(
					error?.message ||
						"Notas salvas, mas não foi possível atualizar a lista automaticamente.",
				),
			);
		} catch (error) {
			setMessage(error?.message || "Falha ao enviar notas fiscais.");
			setSaving(false);
		}
	};

	const selectDocumentFile = (fieldId, file) => {
		setFilesByField((current) => ({
			...current,
			[fieldId]: file,
		}));
	};

	const removeDocumentFile = (fieldId) => {
		setFilesByField((current) => {
			const next = { ...current };
			delete next[fieldId];
			return next;
		});
	};

	const updateInvoiceField = (fieldId, patch) => {
		setInvoiceFilesByField((state) => ({
			...state,
			[fieldId]: {
				...(state[fieldId] || {}),
				...patch,
			},
		}));
	};

	if (loading && !currentUser) return <Spinner fullScreen />;

	const portalState = {
		currentUser,
		fields,
		invoiceFields,
		items,
		mesReferencia,
		filesByField,
		invoiceFilesByField,
		message,
		successMessage,
		loadingData,
		saving,
		pageSize,
		monthSubmission,
		latestMonthFiles,
		approvedFields,
		pendingFields,
		visibleFields,
		hasRejectedFields,
		selectedFiles,
		selectedInvoices,
		waitingReview,
		monthApproved,
		existingInvoices,
		selectedFilesSize,
		totalPages,
		safePage,
		paginatedItems,
	};
	const portalActions = {
		load,
		submit,
		submitInvoices,
		signOut,
		setPage,
		setPageSize,
		setMesReferencia,
		selectDocumentFile,
		removeDocumentFile,
		updateInvoiceField,
		onLoggedIn: () => setSessionTick((value) => value + 1),
	};

	return (
		<div className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_78%_8%,rgba(70,125,255,0.26),transparent_30%),linear-gradient(180deg,#061b38_0%,#06294d_48%,#04162c_100%)] text-white">
			<main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-5 sm:px-6 lg:px-8">
				<PortalHeroHeader />

				<section className="-mt-10 flex flex-1 flex-col pb-7 lg:mt-7">
					<PortalAccessContent
						currentUser={currentUser}
						isLeader={isLeader}
						state={portalState}
						actions={portalActions}
					/>
				</section>

				<DocumentPortalFooter />
			</main>
		</div>
	);
}
