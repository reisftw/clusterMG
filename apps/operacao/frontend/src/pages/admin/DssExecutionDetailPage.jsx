import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCheck, ClipboardCheck, Download, FileText, Send, ThumbsDown, ThumbsUp, Trash2, Upload, Users } from "lucide-react";
import { deleteRotAttachment, fetchDssExecution, fetchRotAttachments, markAllDssExecutionMembersPresent, submitDssExecution, updateDssExecutionMemberPresence, validateDssExecution } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";
import { uploadImage, uploadPdf } from "../../utils/imageUpload";
import { exportDssAttendanceList } from "../../utils/exportDssAttendance";
import { EXECUTION_STATUS_BADGE, EXECUTION_STATUS_LABEL } from "./DssScheduleDetailPage";

const EDITABLE_STATUSES = ["planejado", "disponivel", "em_andamento", "rejeitado"];

// Os endpoints de presença/envio/validação devolvem a execução via
// publicExecution() sem `members`/`content` (esses dois só vêm
// completos no GET de detalhe). Um `setExecution(objetoParcial)` direto
// sobrescreve o estado inteiro e apaga a lista de colaboradores da
// tela — bug real visto em produção ("cliquei em ausente e sumiu todos
// os nomes"). Faz merge ignorando chaves undefined em vez de substituir.
function mergeExecution(current, patch) {
	if (!current) return patch;
	const next = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) next[key] = value;
	}
	return next;
}
const PRESENCE_LABEL = { pendente: "Pendente", presente: "Presente", ausente: "Ausente" };
const PRESENCE_BADGE = { pendente: "bg-slate-100 text-slate-500", presente: "bg-emerald-50 text-emerald-700", ausente: "bg-red-50 text-red-700" };
const ABSENCE_REASON_OPTIONS = [
	{ id: "ferias", name: "Férias" },
	{ id: "afastamento", name: "Afastamento" },
	{ id: "folga", name: "Folga" },
	{ id: "atestado", name: "Atestado" },
	{ id: "ausencia_operacional", name: "Ausência operacional" },
	{ id: "outro", name: "Outro" },
];

function ContentBlocksView({ blocks }) {
	if (!blocks?.length) return <p className="text-sm font-semibold text-slate-400">Sem conteúdo cadastrado.</p>;
	return (
		<div className="space-y-3">
			{blocks.map((block, index) => {
				if (block.type === "titulo") return <h3 key={index} className="text-lg font-black text-slate-900">{block.text}</h3>;
				if (block.type === "subtitulo") return <h4 key={index} className="text-sm font-black uppercase tracking-wide text-slate-600">{block.text}</h4>;
				if (block.type === "lista") return (
					<ul key={index} className="list-disc space-y-1 pl-5 text-sm font-semibold text-slate-700">
						{(block.items || []).filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}
					</ul>
				);
				if (block.type === "destaque") return <p key={index} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">{block.text}</p>;
				if (block.type === "conclusao") return <p key={index} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{block.text}</p>;
				return <p key={index} className="text-sm font-semibold leading-relaxed text-slate-700">{block.text}</p>;
			})}
		</div>
	);
}

function ThemePdfLink({ themeId }) {
	const [items, setItems] = useState([]);
	useEffect(() => {
		fetchRotAttachments("DSS_THEME", themeId).then((data) => setItems(data.items || [])).catch(() => setItems([]));
	}, [themeId]);
	if (!items.length) return <p className="text-sm font-semibold text-slate-400">PDF do tema ainda não disponível.</p>;
	return (
		<a href={items[0].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-orange-700 hover:border-orange-300">
			<FileText size={16} /> Abrir PDF do tema
		</a>
	);
}

function EvidenceUploader({ executionId, canEdit, onCountChange }) {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState("");
	const inputRef = useRef(null);

	const load = async () => {
		setLoading(true);
		try {
			const data = await fetchRotAttachments("DSS_EXECUTION", executionId);
			setItems(data.items || []);
			onCountChange?.((data.items || []).length);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as evidências.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [executionId]);

	const addFiles = async (event) => {
		const files = Array.from(event.target.files || []);
		event.target.value = "";
		if (!files.length) return;
		setUploading(true);
		setError("");
		try {
			for (const file of files) {
				if (file.type === "application/pdf") await uploadPdf(file, "DSS_EXECUTION", executionId);
				else await uploadImage(file, "DSS_EXECUTION", executionId);
			}
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar a evidência.");
		} finally {
			setUploading(false);
		}
	};

	const remove = async (attachmentId) => {
		try {
			await deleteRotAttachment(attachmentId);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível remover o arquivo.");
		}
	};

	if (loading) return <Spinner />;
	return (
		<div className="space-y-2">
			{error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<div className="flex flex-wrap gap-2">
				{items.map((item) => (
					<div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
						<a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-orange-700">
							{item.mimeType === "application/pdf" ? <FileText size={15} /> : <img src={item.url} alt="" className="h-6 w-6 rounded object-cover" />}
							{item.originalName || "Evidência"}
						</a>
						{canEdit ? (
							<button type="button" onClick={() => remove(item.id)} className="text-red-500 hover:text-red-700" aria-label="Remover evidência"><Trash2 size={13} /></button>
						) : null}
					</div>
				))}
			</div>
			{!items.length ? <p className="text-sm font-semibold text-slate-400">Nenhuma evidência anexada ainda.</p> : null}
			{canEdit ? (
				<label className="rot-btn-tactile inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-bold text-slate-600 hover:border-orange-300 hover:text-orange-600">
					<Upload size={15} /> {uploading ? "Enviando..." : "Anexar evidência (foto ou PDF)"}
					<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={addFiles} disabled={uploading} />
				</label>
			) : null}
		</div>
	);
}

function PresenceTable({ execution, canEdit, onExecutionUpdated }) {
	const [members, setMembers] = useState(execution.members || []);
	const [busyId, setBusyId] = useState("");
	const [error, setError] = useState("");

	useEffect(() => setMembers(execution.members || []), [execution.members]);

	const patchMember = async (memberId, payload) => {
		setBusyId(memberId);
		setError("");
		try {
			const data = await updateDssExecutionMemberPresence(execution.id, memberId, payload);
			setMembers((current) => current.map((m) => (m.id === memberId ? data.member : m)));
			onExecutionUpdated(data.execution);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar.");
		} finally {
			setBusyId("");
		}
	};

	const markAllPresent = async () => {
		setError("");
		try {
			const data = await markAllDssExecutionMembersPresent(execution.id);
			setMembers(data.members || []);
			onExecutionUpdated(data);
		} catch (err) {
			setError(err?.message || "Não foi possível marcar todos como presentes.");
		}
	};

	return (
		<div>
			{error ? <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			{canEdit ? (
				<button type="button" onClick={markAllPresent} className="rot-btn-tactile mb-3 inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700">
					<CheckCheck size={14} /> Marcar todos como presentes
				</button>
			) : null}
			<table className="w-full min-w-[680px] text-left text-sm">
				<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
					<tr>
						<th className="px-4 py-3">Colaborador</th>
						<th className="px-4 py-3">Cargo</th>
						<th className="px-4 py-3">Presença</th>
						{canEdit ? <th className="px-4 py-3">Justificativa (se ausente)</th> : null}
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{members.map((member) => (
						<tr key={member.id}>
							<td className="px-4 py-3 font-bold text-slate-900">{member.name}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{member.role || "—"}</td>
							<td className="px-4 py-3">
								{canEdit ? (
									<div className="flex gap-1.5">
										<button type="button" disabled={busyId === member.id} onClick={() => patchMember(member.id, { presenceStatus: "presente" })} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${member.presenceStatus === "presente" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-emerald-50"}`}>Presente</button>
										<button type="button" disabled={busyId === member.id} onClick={() => patchMember(member.id, { presenceStatus: "ausente", absenceReason: member.absenceReason || "outro" })} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${member.presenceStatus === "ausente" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-red-50"}`}>Ausente</button>
									</div>
								) : (
									<span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${PRESENCE_BADGE[member.presenceStatus] || ""}`}>{PRESENCE_LABEL[member.presenceStatus] || member.presenceStatus}</span>
								)}
							</td>
							{canEdit ? (
								<td className="px-4 py-3">
									{member.presenceStatus === "ausente" ? (
										<div className="flex flex-col gap-1.5 sm:flex-row">
											<Select value={member.absenceReason || "outro"} onChange={(v) => patchMember(member.id, { presenceStatus: "ausente", absenceReason: v, absenceNote: member.absenceNote })} items={ABSENCE_REASON_OPTIONS} />
											<input
												defaultValue={member.absenceNote || ""}
												onBlur={(e) => patchMember(member.id, { presenceStatus: "ausente", absenceReason: member.absenceReason || "outro", absenceNote: e.target.value })}
												placeholder="Observação (opcional)"
												className="rot-input h-9 text-xs"
											/>
										</div>
									) : null}
								</td>
							) : null}
						</tr>
					))}
				</tbody>
			</table>
			{!members.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum colaborador na equipe prevista.</p> : null}
		</div>
	);
}

function SubmitModal({ execution, evidenceCount, onClose, onSubmitted }) {
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const pendingCount = (execution.members || []).filter((m) => m.presenceStatus === "pendente").length;

	const confirm = async () => {
		setSaving(true);
		setError("");
		try {
			const updated = await submitDssExecution(execution.id);
			onSubmitted(updated);
		} catch (err) {
			setError(err?.message || "Não foi possível enviar para validação.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Enviar DSS para validação" description="Confira o resumo antes de enviar. Depois do envio, presença e evidência ficam bloqueadas até o SST validar ou solicitar correção." onClose={onClose} size="md">
			{error ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
				<p>Previstos: <span className="text-slate-950">{execution.previstosCount}</span></p>
				<p>Presentes: <span className="text-slate-950">{execution.presentesCount}</span></p>
				<p>Ausentes: <span className="text-slate-950">{execution.ausentesCount}</span></p>
				<p>Participação: <span className="text-slate-950">{execution.participationPct ?? 0}%</span></p>
				<p>Evidência anexada: <span className={evidenceCount ? "text-emerald-700" : "text-red-600"}>{evidenceCount ? "Sim" : "Não"}</span></p>
			</div>
			{pendingCount > 0 ? <p className="mt-3 text-xs font-bold text-red-600">Ainda há {pendingCount} colaborador(es) sem presença registrada.</p> : null}
			{!evidenceCount ? <p className="mt-1 text-xs font-bold text-red-600">Anexe a evidência antes de enviar.</p> : null}
			<div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
				<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
				<button type="button" onClick={confirm} disabled={saving || pendingCount > 0 || !evidenceCount} className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
					<Send size={15} /> {saving ? "Enviando..." : "Confirmar envio"}
				</button>
			</div>
		</ModalShell>
	);
}

function ValidationPanel({ execution, onValidated }) {
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState("");
	const [error, setError] = useState("");

	const act = async (approved) => {
		if (!approved && !note.trim()) {
			setError("Informe o motivo da correção solicitada.");
			return;
		}
		setBusy(approved ? "approve" : "reject");
		setError("");
		try {
			const updated = await validateDssExecution(execution.id, approved, note);
			onValidated(updated);
		} catch (err) {
			setError(err?.message || "Não foi possível registrar a validação.");
		} finally {
			setBusy("");
		}
	};

	return (
		<section className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
			<h2 className="mb-2 text-sm font-black uppercase tracking-wide text-purple-700">Validação do SST</h2>
			{error ? <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Observação (obrigatória para solicitar correção)" className="rot-input min-h-16 w-full py-2" />
			<div className="mt-3 flex gap-2">
				<button type="button" disabled={busy} onClick={() => act(true)} className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"><ThumbsUp size={15} /> Validar execução</button>
				<button type="button" disabled={busy} onClick={() => act(false)} className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50 disabled:opacity-60"><ThumbsDown size={15} /> Solicitar correção</button>
			</div>
		</section>
	);
}

export default function DssExecutionDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { user, hasPermission } = useRotAuth();
	const [execution, setExecution] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [evidenceCount, setEvidenceCount] = useState(0);
	const [submitOpen, setSubmitOpen] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setExecution(await fetchDssExecution(id));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a execução.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	if (loading) return <Spinner />;
	if (!execution) return <p className="text-sm font-bold text-red-600">{error || "Execução não encontrada."}</p>;

	const isDssStaff = hasPermission("dss.execucao.visualizar_abrangencia") || hasPermission("dss.execucao.visualizar_todos");
	const isResponsible = user?.id === execution.responsibleId;
	const canEdit = (isResponsible || isDssStaff) && EDITABLE_STATUSES.includes(execution.status);
	const canValidate = hasPermission("dss.execucao.validar") && execution.status === "enviado";

	return (
		<div className="space-y-6">
			<button type="button" onClick={() => navigate("/seguranca-trabalho/dss/execucoes")} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800">
				<ArrowLeft size={15} /> Voltar para execuções
			</button>

			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><ClipboardCheck size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">{execution.themeTitle}</h1>
						<p className="text-sm font-semibold text-slate-500">{execution.weekLabel} · {execution.operationType} · {execution.regionalName}{execution.baseName ? ` · ${execution.baseName}` : ""}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<span className={`rounded-full px-3 py-1.5 text-xs font-black ${EXECUTION_STATUS_BADGE[execution.status] || ""}`}>{EXECUTION_STATUS_LABEL[execution.status] || execution.status}</span>
					<button type="button" onClick={() => exportDssAttendanceList(execution)} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
						<Download size={14} /> Lista de presença
					</button>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{execution.status === "rejeitado" && execution.rejectionReason ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">Correção solicitada pelo SST: {execution.rejectionReason}</div>
			) : null}

			<section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-4">
				<div><p className="text-xs font-black uppercase text-slate-400">Prazo</p><p className="font-bold text-slate-800">{new Date(execution.dueDate).toLocaleDateString("pt-BR")}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Responsável</p><p className="font-bold text-slate-800">{execution.responsibleName || "Não identificado"}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Previstos</p><p className="font-bold text-slate-800">{execution.previstosCount}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Presentes / Ausentes</p><p className="font-bold text-slate-800">{execution.presentesCount} / {execution.ausentesCount}</p></div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
				<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Conteúdo do DSS</h2>
				{execution.content?.contentType === "pdf" ? <ThemePdfLink themeId={execution.themeId} /> : <ContentBlocksView blocks={execution.content?.contentBlocks} />}
			</section>

			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
				<h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500">
					<Users size={16} /> Equipe prevista ({(execution.members || []).length})
				</h2>
				<div className="p-4">
					<PresenceTable execution={execution} canEdit={canEdit} onExecutionUpdated={(patch) => setExecution((current) => mergeExecution(current, patch))} />
				</div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
				<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Evidência</h2>
				<EvidenceUploader executionId={execution.id} canEdit={canEdit} onCountChange={setEvidenceCount} />
			</section>

			{canEdit ? (
				<div className="flex justify-end">
					<button type="button" onClick={() => setSubmitOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-700">
						<Send size={16} /> Enviar DSS para validação
					</button>
				</div>
			) : null}

			{canValidate ? <ValidationPanel execution={execution} onValidated={(patch) => setExecution((current) => mergeExecution(current, patch))} /> : null}

			{submitOpen ? (
				<SubmitModal
					execution={execution}
					evidenceCount={evidenceCount}
					onClose={() => setSubmitOpen(false)}
					onSubmitted={(patch) => {
						setExecution((current) => mergeExecution(current, patch));
						setSubmitOpen(false);
					}}
				/>
			) : null}
		</div>
	);
}
