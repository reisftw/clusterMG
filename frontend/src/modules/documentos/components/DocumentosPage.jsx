import {
	CheckCircle2,
	Copy,
	Download,
	FileText,
	History,
	Loader2,
	Pencil,
	RefreshCw,
	Save,
	Search,
	Send,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import Spinner from "../../../components/ui/Spinner";
import { ROLES } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { normalizeText } from "../../empresasTecnicos/services/empresasTecnicosService";
import {
	alterarStatusDocumento,
	baixarDocumento,
	baixarEnvioDocumentosZip,
	carregarDocumentoUrl,
	listarEnviosDocumentos,
	obterCobrancaDocumentos,
	renomearDocumento,
} from "../services/documentosService";
import { buildDocumentosFinanceiroEmail } from "../utils/financeiroEmail";

const STATUS_CONFIG = {
	pendente: {
		title: "Documentos Pendentes",
		description:
			"Envios mensais aguardando validação do supervisor ou do administrativo.",
		icon: FileText,
	},
	aprovado: {
		title: "Documentos Aprovados",
		description: "Envios mensais aprovados no rito de documentos.",
		icon: CheckCircle2,
	},
	notas_fiscais: {
		title: "Notas Fiscais",
		description: "Notas fiscais enviadas pelas empresas após aprovação documental.",
		icon: FileText,
	},
	historico: {
		title: "Histórico de Documentos",
		description: "Todos os envios mensais, aprovados, reprovados ou pendentes.",
		icon: History,
	},
};

const STATUS_LABELS = {
	pendente: "Pendente",
	aprovado: "Aprovado",
	reprovado: "Reprovado",
	aguardando_administrativo: "Aguardando administrativo",
};

const inputClass =
	"w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
}

function formatDateOnly(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("pt-BR");
}

function formatTimeOnly(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
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

function formatCurrency(value) {
	const number = Number(value || 0);
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(Number.isFinite(number) ? number : 0);
}

function statusBadge(status) {
	const normalized = String(status || "pendente").toLowerCase();
	const styles = {
		pendente: "bg-amber-50 text-amber-700 border-amber-200",
		aguardando_administrativo: "bg-blue-50 text-blue-700 border-blue-200",
		aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
		reprovado: "bg-red-50 text-red-700 border-red-200",
	};
	return `inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase ${styles[normalized] || styles.pendente}`;
}

function statusLabel(status) {
	const normalized = String(status || "pendente").toLowerCase();
	return STATUS_LABELS[normalized] || status || "Pendente";
}

function isInvoiceFile(file) {
	return String(file?.categoria || "").toLowerCase() === "nota_fiscal";
}

function countInvoiceFiles(submission) {
	return (submission?.files || []).filter(isInvoiceFile).length;
}

function getInvoiceRows(submissions = []) {
	return submissions.flatMap((submission) =>
		(submission.files || [])
			.filter(isInvoiceFile)
			.map((file) => ({
				id: file.id,
				submissionId: submission.id,
				submission,
				empresaNome: submission.empresaNome || file.empresaNome || "-",
				regional: submission.regional || file.regional || "-",
				mesReferencia: submission.mesReferencia || file.mesReferencia,
				nome: file.fieldNome || file.tipo || file.nome || "Nota fiscal",
				arquivo: file.nome || "-",
				valor: Number(file.valor || 0),
				uploadedAt: file.createdAt || file.uploadedAt || submission.submittedAt,
				status: file.status || "aprovado",
			})),
	);
}

function isAdministrativeRole(role) {
	return [
		ROLES.ADMIN,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
		ROLES.ANALISTA_ADMINISTRATIVO,
	].includes(String(role || "").toLowerCase());
}

function isOperationalReviewer(role) {
	return [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.SUPERVISOR_EMPRESA,
		ROLES.BACKOFFICE_RETIRADA,
	].includes(String(role || "").toLowerCase());
}

function FinanceiroEmailModal({ text, onClose }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	};

	return (
		<ModalShell
			onClose={onClose}
			showClose={false}
			size="3xl"
			bodyClassName="p-0"
		>
			<div className="overflow-hidden">
				<header className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">
							Financeiro
						</p>
						<h2 className="mt-1 text-xl font-black text-slate-950">
							E-mail para envio da documentação
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Fechar
					</button>
				</header>
				<div className="p-5">
					<textarea
						readOnly
						value={text}
						className="min-h-[360px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-800 outline-none"
					/>
					<div className="mt-4 flex justify-end">
						<button
							type="button"
							onClick={handleCopy}
							className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
						>
							<Copy size={16} /> {copied ? "Copiado" : "Copiar e-mail"}
						</button>
					</div>
				</div>
			</div>
		</ModalShell>
	);
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
		<div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
			<p>
				Mostrando {start} a {end} de {totalItems} registro(s)
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

// Extraido de SubmissionModal (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) pra reduzir a complexidade cognitiva da funcao
// de render — mesmo estado e mesmas chamadas, sem mudanca de comportamento.
function useSubmissionModalController({ submission, currentUser, onChanged }) {
	const [selectedFileId, setSelectedFileId] = useState(
		submission?.files?.[0]?.id || "",
	);
	const [motivo, setMotivo] = useState("");
	const [showRejectReason, setShowRejectReason] = useState(false);
	const [modalMessage, setModalMessage] = useState("");
	const [pdfUrl, setPdfUrl] = useState("");
	const [loadingPdf, setLoadingPdf] = useState(false);
	const [saving, setSaving] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameName, setRenameName] = useState("");
	const [renaming, setRenaming] = useState(false);
	const motivoRef = useRef(null);
	const selectedFile =
		(submission?.files || []).find((file) => file.id === selectedFileId) ||
		submission?.files?.[0] ||
		null;
	const firstFileId = submission?.files?.[0]?.id || "";
	const role = String(currentUser?.role || "").toLowerCase();

	useEffect(() => {
		setSelectedFileId(firstFileId);
		setMotivo("");
		setShowRejectReason(false);
		setModalMessage("");
		setRenameOpen(false);
	}, [firstFileId, submission?.id]);

	useEffect(() => {
		setRenameName(selectedFile?.nome || "");
		setRenameOpen(false);
	}, [selectedFile?.id, selectedFile?.nome]);

	useEffect(() => {
		let active = true;
		let objectUrl = "";
		async function loadPdf() {
			setPdfUrl("");
			if (!selectedFile) return;
			setLoadingPdf(true);
			try {
				objectUrl = await carregarDocumentoUrl(selectedFile);
				if (active) setPdfUrl(objectUrl);
			} catch {
				if (active) setPdfUrl("");
			} finally {
				if (active) setLoadingPdf(false);
			}
		}
		loadPdf();
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [selectedFile]);

	const selectedStatus = String(
		selectedFile?.status || "pendente",
	).toLowerCase();
	const selectedAdminStatus = String(
		selectedFile?.adminStatus || "pendente",
	).toLowerCase();
	const canReviewAdministrative =
		selectedStatus === "aprovado" &&
		selectedAdminStatus !== "aprovado" &&
		isAdministrativeRole(role);
	const canReviewOperational =
		selectedStatus === "pendente" && isOperationalReviewer(role);
	const canReviewSelected = canReviewAdministrative || canReviewOperational;
	const canRenameSelected = Boolean(selectedFile) && isAdministrativeRole(role);
	const approveLabel = canReviewAdministrative
		? "Aprovar administrativo"
		: "Aprovar documento";
	const rejectLabel = canReviewAdministrative
		? "Reprovar administrativo"
		: "Reprovar documento";

	const reviewFile = async (status) => {
		if (!selectedFile) return;
		setModalMessage("");
		if (status === "reprovado" && !motivo.trim()) {
			setShowRejectReason(true);
			setModalMessage("Informe o motivo para reprovar este documento.");
			window.setTimeout(() => motivoRef.current?.focus(), 50);
			return;
		}
		setSaving(true);
		try {
			await alterarStatusDocumento(selectedFile.id, status, motivo);
			setMotivo("");
			setShowRejectReason(false);
			await onChanged();
		} catch (error) {
			setModalMessage(
				error?.message || "Não foi possível atualizar o documento.",
			);
		} finally {
			setSaving(false);
		}
	};

	const renameFile = async () => {
		if (!selectedFile) return;
		const nextName = renameName.trim();
		if (!nextName) {
			setModalMessage("Informe o novo nome do arquivo.");
			return;
		}
		setRenaming(true);
		setModalMessage("");
		try {
			await renomearDocumento(selectedFile.id, nextName);
			setRenameOpen(false);
			await onChanged();
		} catch (error) {
			setModalMessage(error?.message || "Não foi possível renomear o arquivo.");
		} finally {
			setRenaming(false);
		}
	};

	return {
		setSelectedFileId,
		motivo,
		setMotivo,
		showRejectReason,
		setShowRejectReason,
		modalMessage,
		setModalMessage,
		pdfUrl,
		loadingPdf,
		saving,
		renameOpen,
		setRenameOpen,
		renameName,
		setRenameName,
		renaming,
		motivoRef,
		selectedFile,
		canReviewSelected,
		canRenameSelected,
		approveLabel,
		rejectLabel,
		reviewFile,
		renameFile,
	};
}

// Extraido de SubmissionModal (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — item da lista de arquivos da submissao,
// mesma JSX/logica de antes.
function SubmissionFileListItem({ file, selectedFile, onSelect }) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`w-full rounded-2xl border p-3 text-left transition ${
				selectedFile?.id === file.id
					? "border-blue-300 bg-blue-50"
					: "border-slate-200 bg-white hover:bg-slate-50"
			}`}
		>
			<div className="flex min-w-0 items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="break-words text-sm font-black text-slate-950">
						{file.fieldNome || file.tipo || "Documento"}
					</p>
					<p className="mt-1 line-clamp-2 break-all text-xs font-semibold text-slate-500">
						{file.nome}
					</p>
				</div>
				<span className={`${statusBadge(file.status)} shrink-0`}>
					{statusLabel(file.status)}
				</span>
			</div>
			{String(file.status || "").toLowerCase() === "aprovado" ? (
				<div className="mt-2 flex flex-wrap gap-2">
					<span className={statusBadge(file.adminStatus || "pendente")}>
						Administrativo: {statusLabel(file.adminStatus || "pendente")}
					</span>
				</div>
			) : null}
			{file.motivoReprovacao ? (
				<p className="mt-2 break-words rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700">
					{file.motivoReprovacao}
				</p>
			) : null}
			{file.adminMotivoReprovacao ? (
				<p className="mt-2 break-words rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700">
					Administrativo: {file.adminMotivoReprovacao}
				</p>
			) : null}
		</button>
	);
}

// Extraido de SubmissionModal (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — painel de preview/rename do arquivo
// selecionado, mesma JSX/logica de antes.
function SubmissionFilePreviewPanel({
	selectedFile,
	canRenameSelected,
	setRenameOpen,
	setModalMessage,
	renameOpen,
	renameName,
	setRenameName,
	renaming,
	renameFile,
	loadingPdf,
	pdfUrl,
}) {
	return (
		<div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
			<div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-3">
				<div className="min-w-0">
					<p className="break-words text-sm font-black text-slate-950">
						{selectedFile?.fieldNome || selectedFile?.tipo || "Documento"}
					</p>
					<p className="break-all text-xs font-semibold text-slate-500">
						{selectedFile?.nome || "-"}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap justify-end gap-2">
					{canRenameSelected ? (
						<button
							type="button"
							onClick={() => {
								setRenameOpen((current) => !current);
								setModalMessage("");
							}}
							className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
						>
							<Pencil size={14} /> Editar nome
						</button>
					) : null}
					{selectedFile ? (
						<button
							type="button"
							onClick={() => baixarDocumento(selectedFile)}
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
						>
							<Download size={14} /> Baixar
						</button>
					) : null}
				</div>
			</div>
			{renameOpen ? (
				<div className="border-b border-slate-200 bg-blue-50 p-3">
					<label className="block">
						<span className="mb-1 block text-xs font-black uppercase tracking-wide text-blue-700">
							Nome do arquivo
						</span>
						<input
							value={renameName}
							onChange={(event) => setRenameName(event.target.value)}
							className={inputClass}
							placeholder="Ex: Contrato social - Agosto.pdf"
						/>
					</label>
					<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							disabled={renaming}
							onClick={() => {
								setRenameOpen(false);
								setRenameName(selectedFile?.nome || "");
							}}
							className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
						>
							Cancelar
						</button>
						<button
							type="button"
							disabled={renaming || !renameName.trim()}
							onClick={renameFile}
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
						>
							{renaming ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<Save size={16} />
							)}{" "}
							Salvar nome
						</button>
					</div>
				</div>
			) : null}
			<div className="h-[48vh] min-h-[360px]">
				{loadingPdf ? (
					<div className="flex h-full items-center justify-center text-sm font-black text-slate-500">
						<Loader2 className="mr-2 animate-spin" size={18} /> Carregando
						PDF...
					</div>
				) : pdfUrl &&
					String(selectedFile?.mimeType || "").startsWith("image/") ? (
					<div className="flex h-full items-center justify-center p-3">
						<img
							src={pdfUrl}
							alt={selectedFile?.nome || "Documento"}
							className="max-h-full max-w-full rounded-xl object-contain shadow-sm"
						/>
					</div>
				) : pdfUrl ? (
					<iframe
						title={selectedFile?.nome || "Documento"}
						src={pdfUrl}
						className="h-full w-full"
					/>
				) : (
					<div className="flex h-full items-center justify-center p-6 text-center text-sm font-bold text-slate-400">
						Não foi possível carregar a visualização do PDF.
					</div>
				)}
			</div>
		</div>
	);
}

function SubmissionModal({ submission, currentUser, onClose, onChanged }) {
	const {
		setSelectedFileId,
		motivo,
		setMotivo,
		showRejectReason,
		setShowRejectReason,
		modalMessage,
		setModalMessage,
		pdfUrl,
		loadingPdf,
		saving,
		renameOpen,
		setRenameOpen,
		renameName,
		setRenameName,
		renaming,
		motivoRef,
		selectedFile,
		canReviewSelected,
		canRenameSelected,
		approveLabel,
		rejectLabel,
		reviewFile,
		renameFile,
	} = useSubmissionModalController({ submission, currentUser, onChanged });

	if (!submission) return null;

	return (
		<ModalShell
			onClose={onClose}
			showClose={false}
			size="6xl"
			bodyClassName="p-0"
		>
			<div className="flex min-h-0 flex-col overflow-hidden">
				<header className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<h2 className="break-words text-xl font-black text-slate-950">
							{submission.empresaNome}
						</h2>
						<p className="break-words text-sm font-semibold text-slate-500">
							Mês {formatMonthLabel(submission.mesReferencia)} - enviado em{" "}
							{formatDate(submission.submittedAt)}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Fechar
					</button>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto p-5">
					<div className="mb-4 grid gap-3 md:grid-cols-3">
						<div className="min-w-0 rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								Status
							</p>
							<span className={statusBadge(submission.status)}>
								{statusLabel(submission.status)}
							</span>
						</div>
						<div className="min-w-0 rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								Supervisor
							</p>
							<p className="break-words font-black text-slate-900">
								{submission.supervisorNome || "-"}
							</p>
						</div>
						<div className="min-w-0 rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								Enviado por
							</p>
							<p className="break-words font-black text-slate-900">
								{submission.submittedByName || "-"}
							</p>
						</div>
					</div>

					<div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(260px,310px)_minmax(0,1fr)]">
						<div className="min-w-0 space-y-2">
							{(submission.files || []).map((file) => (
								<SubmissionFileListItem
									key={file.id}
									file={file}
									selectedFile={selectedFile}
									onSelect={() => {
										setSelectedFileId(file.id);
										setMotivo(file.motivoReprovacao || "");
										setShowRejectReason(false);
										setModalMessage("");
									}}
								/>
							))}
						</div>

						<SubmissionFilePreviewPanel
							selectedFile={selectedFile}
							canRenameSelected={canRenameSelected}
							setRenameOpen={setRenameOpen}
							setModalMessage={setModalMessage}
							renameOpen={renameOpen}
							renameName={renameName}
							setRenameName={setRenameName}
							renaming={renaming}
							renameFile={renameFile}
							loadingPdf={loadingPdf}
							pdfUrl={pdfUrl}
						/>
					</div>

					{modalMessage ? (
						<div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">
							{modalMessage}
						</div>
					) : null}

					{showRejectReason ? (
						<div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
							<label className="block">
								<span className="mb-1 block text-xs font-black uppercase tracking-wide text-red-700">
									Motivo da reprovação deste documento
								</span>
								<textarea
									ref={motivoRef}
									value={motivo}
									onChange={(event) => setMotivo(event.target.value)}
									className={`${inputClass} min-h-24 resize-y border-red-200 focus:border-red-400 focus:ring-red-100`}
									placeholder="Explique o que precisa ser corrigido neste PDF"
								/>
							</label>
							<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
								<button
									type="button"
									disabled={saving}
									onClick={() => {
										setShowRejectReason(false);
										setModalMessage("");
									}}
									className="rounded-xl border border-red-200 px-4 py-2 text-sm font-black text-red-700 hover:bg-white disabled:opacity-60"
								>
									Cancelar reprovação
								</button>
								<button
									type="button"
									disabled={saving || !motivo.trim()}
									onClick={() => reviewFile("reprovado")}
									className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
								>
									{saving ? (
										<Loader2 className="animate-spin" size={16} />
									) : (
										<XCircle size={16} />
									)}{" "}
									Confirmar reprovação
								</button>
							</div>
						</div>
					) : null}
				</div>

				<footer className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
					{submission.status === "aprovado" ? (
						<>
							<button
								type="button"
								disabled={saving}
								onClick={() =>
									baixarEnvioDocumentosZip(submission).catch((error) =>
										setModalMessage(
											error?.message || "Não foi possível baixar o ZIP.",
										),
									)
								}
								className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 px-5 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-60"
							>
								<Download size={17} /> Baixar ZIP
							</button>
						</>
					) : null}
					{canReviewSelected ? (
						<>
							<button
								type="button"
								disabled={saving || !selectedFile}
								onClick={() => {
									setShowRejectReason(true);
									setModalMessage("");
									window.setTimeout(() => motivoRef.current?.focus(), 50);
								}}
								className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3 text-sm font-black text-red-700 hover:bg-red-50 disabled:opacity-60"
							>
								<XCircle size={17} /> {rejectLabel}
							</button>
							<button
								type="button"
								disabled={saving || !selectedFile}
								onClick={() => reviewFile("aprovado")}
								className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
							>
								<CheckCircle2 size={17} /> {approveLabel}
							</button>
						</>
					) : null}
				</footer>
			</div>
		</ModalShell>
	);
}

function HistoryTable({ items }) {
	return (
		<table className="min-w-[920px] w-full divide-y divide-slate-100 text-sm">
			<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
				<tr>
					<th className="px-4 py-3">Empresa</th>
					<th className="px-4 py-3">Mês</th>
					<th className="px-4 py-3">Documento</th>
					<th className="px-4 py-3">Status</th>
					<th className="px-4 py-3">Responsável</th>
					<th className="px-4 py-3">Data</th>
					<th className="px-4 py-3">Horário</th>
					<th className="px-4 py-3">Motivo</th>
				</tr>
			</thead>
			<tbody className="divide-y divide-slate-100">
				{items.length ? (
					items.map((item) => (
						<tr key={item.id}>
							<td className="px-4 py-3">
								<p className="font-black text-slate-950">{item.empresaNome}</p>
								<p className="text-xs font-semibold text-slate-500">
									{item.regional || "-"}
								</p>
							</td>
							<td className="px-4 py-3 font-black text-slate-800">
								{formatMonthLabel(item.mesReferencia)}
							</td>
							<td className="max-w-xs px-4 py-3 font-semibold text-slate-700">
								<span className="line-clamp-2 break-words">
									{item.documento}
								</span>
							</td>
							<td className="px-4 py-3">
								<span className={statusBadge(item.status)}>
									{statusLabel(item.status)}
								</span>
							</td>
							<td className="px-4 py-3 font-black text-slate-800">
								{item.responsavel}
							</td>
							<td className="px-4 py-3 font-semibold text-slate-600">
								{formatDateOnly(item.data)}
							</td>
							<td className="px-4 py-3 font-semibold text-slate-600">
								{formatTimeOnly(item.data)}
							</td>
							<td className="max-w-sm px-4 py-3 text-xs font-semibold text-slate-500">
								<span className="line-clamp-2 break-words">
									{item.motivo || "-"}
								</span>
							</td>
						</tr>
					))
				) : (
					<tr>
						<td
							colSpan={8}
							className="px-4 py-10 text-center text-sm font-bold text-slate-400"
						>
							Nenhum histórico de aprovação encontrado.
						</td>
					</tr>
				)}
			</tbody>
		</table>
	);
}

export default function DocumentosPage({ status = "historico" }) {
	const { currentUser } = useAuthContext();
	const config = STATUS_CONFIG[status] || STATUS_CONFIG.historico;
	const HeaderIcon = config.icon;
	const [items, setItems] = useState([]);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(true);
	const [savingMessage, setSavingMessage] = useState("");
	const [selected, setSelected] = useState(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [financeiroTemplate, setFinanceiroTemplate] = useState("");
	const [financeiroEmailText, setFinanceiroEmailText] = useState("");
	const [financeiroLoadingId, setFinanceiroLoadingId] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		setSavingMessage("");
		try {
			const [nextItems, config] = await Promise.all([
				listarEnviosDocumentos({
					status:
						status === "historico" || status === "notas_fiscais"
							? ""
							: status,
					limit: 100,
				}),
				obterCobrancaDocumentos().catch(() => null),
			]);
			setItems(nextItems);
			setFinanceiroTemplate(config?.financeEmailTemplate || "");
		} catch (error) {
			setSavingMessage(
				error?.message || "Não foi possível carregar os documentos.",
			);
		} finally {
			setLoading(false);
		}
	}, [status]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		if (status !== "pendente") return undefined;
		const handlePendingUpdate = () => {
			load();
		};
		window.addEventListener(
			"retiradas:documentos-pendentes-updated",
			handlePendingUpdate,
		);
		return () => {
			window.removeEventListener(
				"retiradas:documentos-pendentes-updated",
				handlePendingUpdate,
			);
		};
	}, [load, status]);

	const filteredItems = useMemo(() => {
		const key = normalizeText(query);
		const baseItems = status === "notas_fiscais" ? getInvoiceRows(items) : items;
		if (!key) return baseItems;
		return baseItems.filter((item) =>
			status === "notas_fiscais"
				? [
						item.empresaNome,
						item.regional,
						item.mesReferencia,
						item.nome,
						item.arquivo,
						item.valor,
					].some((value) => normalizeText(value).includes(key))
				: [
						item.empresaNome,
						item.supervisorNome,
						item.status,
						item.mesReferencia,
						item.submittedByName,
						...(item.files || [])
							.filter(isInvoiceFile)
							.flatMap((file) => [file.nome, file.fieldNome, file.tipo]),
					].some((value) => normalizeText(value).includes(key)),
		);
	}, [items, query, status]);

	const historyItems = useMemo(() => {
		const events = [];
		items.forEach((submission) => {
			(submission.files || []).forEach((file) => {
				if (
					!file.approvedAt ||
					!["aprovado", "reprovado"].includes(file.status)
				)
					return;
				events.push({
					id: `${file.id}-operacional`,
					empresaNome: submission.empresaNome || file.empresaNome,
					regional: submission.regional || file.regional,
					mesReferencia: submission.mesReferencia || file.mesReferencia,
					documento: `${file.fieldNome || file.tipo || file.nome || "Documento"} (Supervisor)`,
					status: file.status,
					responsavel: file.approvedByName || submission.reviewedByName || "-",
					data: file.approvedAt,
					motivo: file.motivoReprovacao || "",
				});
				if (
					file.adminReviewedAt &&
					["aprovado", "reprovado"].includes(
						String(file.adminStatus || "").toLowerCase(),
					)
				) {
					events.push({
						id: `${file.id}-administrativo`,
						empresaNome: submission.empresaNome || file.empresaNome,
						regional: submission.regional || file.regional,
						mesReferencia: submission.mesReferencia || file.mesReferencia,
						documento: `${file.fieldNome || file.tipo || file.nome || "Documento"} (Administrativo)`,
						status: file.adminStatus,
						responsavel:
							file.adminReviewedByName || submission.adminReviewedByName || "-",
						data: file.adminReviewedAt,
						motivo: file.adminMotivoReprovacao || "",
					});
				}
			});
		});

		const key = normalizeText(query);
		const filtered = key
			? events.filter((item) =>
					[
						item.empresaNome,
						item.regional,
						item.mesReferencia,
						item.documento,
						item.status,
						item.responsavel,
						item.motivo,
					].some((value) => normalizeText(value).includes(key)),
				)
			: events;

		return filtered.sort(
			(a, b) =>
				new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime(),
		);
	}, [items, query]);

	const activeItems = status === "historico" ? historyItems : filteredItems;
	const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paginatedItems = useMemo(() => {
		const start = (safePage - 1) * pageSize;
		return activeItems.slice(start, start + pageSize);
	}, [activeItems, pageSize, safePage]);

	useEffect(() => {
		setPage(1);
	}, [query, status, pageSize]);

	const refreshAfterModalChange = async () => {
		const nextItems = await listarEnviosDocumentos({
			status:
				status === "historico" || status === "notas_fiscais" ? "" : status,
			limit: 100,
		});
		setItems(nextItems);
		setSelected(
			(current) => nextItems.find((item) => item.id === current?.id) || null,
		);
	};

	const handleFinanceiroEmail = async (submission) => {
		setFinanceiroLoadingId(submission.id);
		setSavingMessage("");
		try {
			await baixarEnvioDocumentosZip(submission);
			setFinanceiroEmailText(
				buildDocumentosFinanceiroEmail({
					submission,
					template: financeiroTemplate,
				}),
			);
		} catch (error) {
			setSavingMessage(
				error?.message || "Não foi possível gerar o e-mail ao financeiro.",
			);
		} finally {
			setFinanceiroLoadingId("");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			{financeiroEmailText ? (
				<FinanceiroEmailModal
					text={financeiroEmailText}
					onClose={() => setFinanceiroEmailText("")}
				/>
			) : null}
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
							<HeaderIcon size={23} />
						</div>
						<div>
							<h1 className="text-2xl font-black text-slate-950">
								{config.title}
							</h1>
							<p className="text-sm text-slate-500">{config.description}</p>
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

			{savingMessage ? (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">
					{savingMessage}
				</div>
			) : null}

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">
							{status === "historico"
								? "Histórico de aprovação"
								: status === "notas_fiscais"
									? "Notas fiscais enviadas"
								: "Envios mensais"}
						</h2>
						<p className="text-sm text-slate-500">
							{status === "historico"
								? `${historyItems.length} registro(s)`
								: status === "notas_fiscais"
									? `${filteredItems.length} envio(s) com nota fiscal`
								: `${filteredItems.length} envio(s)`}
						</p>
					</div>
					<label className="relative w-full md:max-w-sm">
						<Search
							className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
							size={17}
						/>
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className={`${inputClass} pl-11`}
							placeholder={
								status === "historico"
									? "Buscar por empresa, documento ou aprovador"
									: "Buscar por empresa, mês ou supervisor"
							}
						/>
					</label>
				</div>

				<div className="overflow-hidden rounded-2xl border border-slate-100">
					<div className="overflow-x-auto">
						{status === "historico" ? (
							<HistoryTable items={paginatedItems} />
						) : null}
						<table
							className={`${status === "historico" ? "hidden " : ""}min-w-[860px] w-full divide-y divide-slate-100 text-sm`}
						>
							<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
								{status === "notas_fiscais" ? (
									<tr>
										<th className="px-4 py-3">Empresa</th>
										<th className="px-4 py-3">Mês</th>
										<th className="px-4 py-3">Nota fiscal</th>
										<th className="px-4 py-3">Valor</th>
										<th className="px-4 py-3">Enviada em</th>
										<th className="px-4 py-3 text-right">Ação</th>
									</tr>
								) : (
									<tr>
										<th className="px-4 py-3">Empresa</th>
										<th className="px-4 py-3">Mês</th>
										<th className="px-4 py-3">Arquivos</th>
										<th className="px-4 py-3">Status</th>
										<th className="px-4 py-3">Enviado em</th>
										<th className="px-4 py-3 text-right">Ação</th>
									</tr>
								)}
							</thead>
							<tbody className="divide-y divide-slate-100">
								{paginatedItems.length ? (
									paginatedItems.map((item) =>
										status === "notas_fiscais" ? (
											<tr key={item.id}>
												<td className="px-4 py-3">
													<p className="font-black text-slate-950">
														{item.empresaNome}
													</p>
													<p className="text-xs font-semibold text-slate-500">
														{item.regional || "-"}
													</p>
												</td>
												<td className="px-4 py-3 font-black text-slate-800">
													{formatMonthLabel(item.mesReferencia)}
												</td>
												<td className="px-4 py-3">
													<p className="font-black text-slate-900">
														{item.nome}
													</p>
													<p className="line-clamp-1 break-all text-xs font-semibold text-slate-500">
														{item.arquivo}
													</p>
												</td>
												<td className="px-4 py-3 font-black text-emerald-700">
													{formatCurrency(item.valor)}
												</td>
												<td className="px-4 py-3 font-semibold text-slate-500">
													{formatDate(item.uploadedAt)}
												</td>
												<td className="px-4 py-3 text-right">
													<button
														type="button"
														onClick={() => setSelected(item.submission)}
														className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
													>
														Abrir
													</button>
												</td>
											</tr>
										) : (
											<tr key={item.id}>
												<td className="px-4 py-3">
													<p className="font-black text-slate-950">
														{item.empresaNome}
													</p>
													<p className="text-xs font-semibold text-slate-500">
														{item.regional || "-"}
													</p>
												</td>
												<td className="px-4 py-3 font-black text-slate-800">
													{formatMonthLabel(item.mesReferencia)}
												</td>
												<td className="px-4 py-3 font-semibold text-slate-600">
													{item.files?.length || 0}
												</td>
												<td className="px-4 py-3">
													<span className={statusBadge(item.status)}>
														{statusLabel(item.status)}
													</span>
												</td>
												<td className="px-4 py-3 font-semibold text-slate-500">
													{formatDate(item.submittedAt)}
												</td>
												<td className="px-4 py-3 text-right">
													<div className="flex justify-end gap-2">
														{item.status === "aprovado" ? (
														<>
															<button
																type="button"
																onClick={() =>
																	baixarEnvioDocumentosZip(item).catch(
																		(error) =>
																			setSavingMessage(
																				error?.message ||
																					"Não foi possível baixar o ZIP.",
																			),
																	)
																}
																className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
															>
																ZIP
															</button>
															<button
																type="button"
																disabled={financeiroLoadingId === item.id}
																onClick={() => handleFinanceiroEmail(item)}
																className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
															>
																{financeiroLoadingId === item.id ? (
																	<RefreshCw
																		className="animate-spin"
																		size={13}
																	/>
																) : (
																	<Send size={13} />
																)}
																E-mail
															</button>
														</>
														) : null}
														<button
															type="button"
															onClick={() => setSelected(item)}
															className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
														>
															Abrir
														</button>
													</div>
												</td>
											</tr>
										),
									)
								) : (
									<tr>
										<td
											colSpan={6}
											className="px-4 py-10 text-center text-sm font-bold text-slate-400"
										>
											Nenhum envio encontrado.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<PaginationControls
						page={safePage}
						totalPages={totalPages}
						totalItems={activeItems.length}
						pageSize={pageSize}
						onPageChange={setPage}
						onPageSizeChange={setPageSize}
					/>
				</div>
			</section>

			<SubmissionModal
				submission={selected}
				currentUser={currentUser}
				onClose={() => setSelected(null)}
				onChanged={refreshAfterModalChange}
			/>
		</div>
	);
}
