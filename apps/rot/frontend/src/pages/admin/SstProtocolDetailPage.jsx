import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Eye, HardHat, ListChecks, Lock, MessageSquare } from "lucide-react";
import { answerSstInformationRequest, assignSstProtocol, changeSstProtocolPriority, changeSstProtocolStatus, closeSstProtocol, createSstActionPlan, createSstInformationRequest, fetchSstProtocol, fetchSstTeam, sendSstProtocolMessage, submitSstActionPlan, updateSstProtocol, validateSstActionPlan } from "../../api/rotApi";
import Field from "../../components/ui/Field";
import ImageUploader from "../../components/ImageUploader";
import Select from "../../components/ui/Select";
import SearchableSelect from "../../components/ui/SearchableSelect";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { exportSstProtocol } from "../../utils/exportSstProtocol";
import { CONSEQUENCE_OPTIONS, MAX_REQUEST_PHOTOS, MIN_REQUEST_PHOTOS, PRIORITY_BADGE, PRIORITY_OPTIONS, STATUS_BADGE, STATUS_OPTIONS, typeLabel } from "./SstProtocolsPage";

const ACTION_STATUS_LABEL = {
	ABERTO: { label: "Aberto", className: "bg-blue-50 text-blue-700" },
	EM_ANDAMENTO: { label: "Em andamento", className: "bg-amber-50 text-amber-700" },
	AGUARDANDO_VALIDACAO: { label: "Aguardando validação", className: "bg-purple-50 text-purple-700" },
	CONCLUIDO: { label: "Concluído", className: "bg-emerald-50 text-emerald-700" },
	CANCELADO: { label: "Cancelado", className: "bg-slate-100 text-slate-500" },
};

export default function SstProtocolDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { hasPermission, user } = useRotAuth();
	const [protocol, setProtocol] = useState(null);
	const [timeline, setTimeline] = useState([]);
	const [messages, setMessages] = useState([]);
	const [informationRequests, setInformationRequests] = useState([]);
	const [actionPlans, setActionPlans] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [team, setTeam] = useState([]);
	const [assignTarget, setAssignTarget] = useState("");
	const [exporting, setExporting] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchSstProtocol(id);
			setProtocol(data.protocol);
			setTimeline(data.timeline || []);
			setMessages(data.messages || []);
			setInformationRequests(data.informationRequests || []);
			setActionPlans(data.actionPlans || []);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o protocolo.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	useEffect(() => {
		if (hasPermission("sst.protocolo.atribuir")) {
			fetchSstTeam().then(setTeam).catch(() => setTeam([]));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (protocol) setAssignTarget(protocol.assignedTo || "");
	}, [protocol?.assignedTo]);

	const runExport = async (format) => {
		setExporting(format);
		try {
			await exportSstProtocol(protocol, format);
		} catch (err) {
			setError(err?.message || "Não foi possível exportar o protocolo.");
		} finally {
			setExporting("");
		}
	};

	if (loading) return <Spinner fullScreen />;
	if (error || !protocol) {
		return (
			<div className="space-y-4">
				<button type="button" onClick={() => navigate("/seguranca-trabalho/protocolos")} className="rot-btn-tactile inline-flex items-center gap-1.5 text-sm font-bold text-slate-600"><ArrowLeft size={16} /> Protocolos</button>
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error || "Protocolo não encontrado."}</div>
			</div>
		);
	}

	const isReadOnly = protocol.viewMode !== "sst";
	const canAssign = hasPermission("sst.protocolo.atribuir");
	const canChangePriority = hasPermission("sst.protocolo.alterar_prioridade");
	const canChangeStatus = hasPermission("sst.protocolo.alterar_status");
	const canClose = hasPermission("sst.protocolo.concluir") && protocol.status !== "CONCLUIDO";
	const canRespond = hasPermission("sst.protocolo.responder");
	const canRequestInfo = hasPermission("sst.protocolo.solicitar_informacao");
	const canEdit = hasPermission("sst.protocolo.editar");
	const canCreateAction = hasPermission("sst.protocolo.criar_acao");
	const canValidateAction = hasPermission("sst.plano_acao.validar");

	const runAction = async (fn) => {
		setBusy(true);
		setError("");
		try {
			await fn();
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível concluir a ação.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="space-y-6">
			<button type="button" onClick={() => navigate("/seguranca-trabalho/protocolos")} className="rot-btn-tactile inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> Protocolos</button>

			{isReadOnly ? (
				<div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
					<Eye size={16} />
					Você está acompanhando esta tratativa. Alterações técnicas são realizadas exclusivamente pela equipe de Segurança do Trabalho.
				</div>
			) : null}

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><HardHat size={24} /></span>
						<div>
							<p className="font-mono text-sm font-black text-orange-600">{protocol.protocolNumber}</p>
							<h1 className="text-xl font-black text-slate-950">{protocol.subject}</h1>
							<p className="text-xs font-bold uppercase text-slate-500">{typeLabel(protocol.type)}</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className={`rounded-full px-3 py-1.5 text-xs font-black ${PRIORITY_BADGE[protocol.priority] || ""}`}>{PRIORITY_OPTIONS.find((p) => p.id === protocol.priority)?.name || protocol.priority}</span>
						<span className={`rounded-full px-3 py-1.5 text-xs font-black ${STATUS_BADGE[protocol.status] || ""}`}>{STATUS_OPTIONS.find((s) => s.id === protocol.status)?.name || protocol.status}</span>
						<button type="button" disabled={exporting === "pdf"} onClick={() => runExport("pdf")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
							<Download size={13} /> {exporting === "pdf" ? "Gerando..." : "PDF"}
						</button>
						<button type="button" disabled={exporting === "docx"} onClick={() => runExport("docx")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
							<Download size={13} /> {exporting === "docx" ? "Gerando..." : "DOCX"}
						</button>
					</div>
				</div>
				<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<MiniInfo label="Responsável SST" value={protocol.assignedToName || "Não atribuído"} />
					<MiniInfo label="Colaborador" value={protocol.employeeName || "—"} />
					<MiniInfo label="Solicitante" value={protocol.requestedByName || "—"} />
					<MiniInfo label="Operação" value={[protocol.operationScope, protocol.regionalName, protocol.baseName].filter(Boolean).join(" · ") || "—"} />
					<MiniInfo label="Empresa" value={protocol.companyName || "—"} />
					<MiniInfo label="Ativo relacionado" value={protocol.assetCode ? `${protocol.assetCode} · ${protocol.assetName}` : "—"} />
					<MiniInfo label="Criado em" value={new Date(protocol.createdAt).toLocaleString("pt-BR")} />
					<MiniInfo label="Concluído em" value={protocol.closedAt ? new Date(protocol.closedAt).toLocaleString("pt-BR") : "—"} />
				</div>
				{protocol.riskPresent ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">⚠ Risco ainda presente no local.</p> : null}
			</header>

			{!isReadOnly ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<h2 className="text-lg font-black text-slate-950">Ações</h2>
					<div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
						{canAssign ? (
							<div className="sm:col-span-2">
								<Field label="Responsável SST" hint="Assuma para você ou direcione para outra pessoa da equipe.">
									<div className="flex flex-wrap gap-2">
										{protocol.assignedTo !== user?.id ? (
											<button type="button" disabled={busy} onClick={() => runAction(() => assignSstProtocol(protocol.id, { assignedTo: user?.id }))} className="rot-btn-tactile inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-60">
												Assumir para mim
											</button>
										) : null}
										<div className="min-w-[220px] flex-1"><SearchableSelect value={assignTarget} onChange={setAssignTarget} items={team} placeholder="Buscar pessoa da equipe SST..." /></div>
										<button type="button" disabled={busy || !assignTarget} onClick={() => runAction(() => assignSstProtocol(protocol.id, { assignedTo: assignTarget }))} className="rot-btn-tactile inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60">
											Atribuir
										</button>
									</div>
								</Field>
							</div>
						) : null}
						{canChangeStatus ? (
							<Field label="Status"><Select value={protocol.status} onChange={(v) => runAction(() => changeSstProtocolStatus(protocol.id, v))} items={STATUS_OPTIONS} /></Field>
						) : null}
						{canChangePriority ? (
							<Field label="Prioridade"><Select value={protocol.priority} onChange={(v) => runAction(() => changeSstProtocolPriority(protocol.id, v))} items={PRIORITY_OPTIONS} /></Field>
						) : null}
					</div>
					{canClose ? (
						<button type="button" disabled={busy} onClick={() => { if (window.confirm("Concluir este protocolo?")) runAction(() => closeSstProtocol(protocol.id)); }} className="rot-btn-tactile mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-60">
							Concluir
						</button>
					) : null}
				</section>
			) : null}

			<ResumoSection protocol={protocol} canEdit={canEdit && !isReadOnly} onSaved={load} />

			{protocol.details?.potentialConsequence || protocol.details?.immediateAction || protocol.details?.rootCause || protocol.details?.correctiveMeasures || !isReadOnly ? (
				<InvestigationSection protocol={protocol} isReadOnly={isReadOnly} onSaved={load} />
			) : null}

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-black text-slate-950">Plano de ação</h2>
				</div>
				<div className="mt-4 space-y-3">
					{actionPlans.map((plan) => (
						<ActionPlanCard key={plan.id} plan={plan} canValidate={canValidateAction} onChanged={load} />
					))}
					{!actionPlans.length ? <p className="text-sm font-bold text-slate-400">Nenhum plano de ação criado.</p> : null}
				</div>
				{!isReadOnly && canCreateAction ? (
					<div className="mt-5 border-t border-slate-100 pt-4">
						<CreateActionPlanForm protocolId={protocol.id} employeeId={protocol.employeeId} employeeName={protocol.employeeName} assignedTo={protocol.assignedTo} assignedToName={protocol.assignedToName} onCreated={load} />
					</div>
				) : null}
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<h2 className="text-lg font-black text-slate-950">Comunicação</h2>
				<div className="mt-4 space-y-3">
					{messages.map((item) => (
						<div key={item.id} className={`rounded-2xl border p-4 ${item.visibility === "interno" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
							<div className="flex items-center gap-2">
								{item.visibility === "interno" ? <Lock size={13} className="text-amber-700" /> : <MessageSquare size={13} className="text-blue-700" />}
								<span className={`text-[10px] font-black uppercase ${item.visibility === "interno" ? "text-amber-700" : "text-blue-700"}`}>{item.visibility === "interno" ? "Nota interna SST" : "Resposta ao solicitante"}</span>
								<span className="text-xs font-bold text-slate-400">{item.authorName} · {new Date(item.createdAt).toLocaleString("pt-BR")}</span>
							</div>
							<p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-700">{item.body}</p>
						</div>
					))}
					{!messages.length ? <p className="text-sm font-bold text-slate-400">Nenhuma mensagem registrada.</p> : null}
				</div>

				{informationRequests.length ? (
					<div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
						<p className="text-xs font-black uppercase text-slate-500">Solicitações de informação</p>
						{informationRequests.map((item) => (
							<div key={item.id} className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
								<p className="text-xs font-bold text-purple-700">Para {item.targetUserName} · {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
								<p className="mt-1 text-sm font-bold text-slate-800">{item.question}</p>
								{item.status === "answered" ? (
									<div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
										<p className="text-[10px] font-black uppercase text-emerald-700">Respondido em {new Date(item.answeredAt).toLocaleString("pt-BR")}</p>
										<p className="mt-1 text-sm font-semibold text-slate-700">{item.answer}</p>
									</div>
								) : item.canAnswer ? (
									<AnswerRequestForm protocolId={protocol.id} requestId={item.id} onAnswered={load} />
								) : (
									<p className="mt-2 text-xs font-bold uppercase text-amber-700">Aguardando resposta</p>
								)}
							</div>
						))}
					</div>
				) : null}

				{!isReadOnly && (canRespond || canRequestInfo) ? (
					<div className="mt-5 border-t border-slate-100 pt-4">
						<CommunicationComposer protocolId={protocol.id} canRespond={canRespond} canRequestInfo={canRequestInfo} employeeId={protocol.employeeId} employeeName={protocol.employeeName} requestedBy={protocol.requestedBy} requestedByName={protocol.requestedByName} onSent={load} />
					</div>
				) : null}
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<h2 className="text-lg font-black text-slate-950">Histórico</h2>
				<div className="mt-4 space-y-3">
					{timeline.map((item) => (
						<div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-black text-slate-950">{item.title}</p>
									<p className="text-sm font-semibold text-slate-500">{item.description}</p>
								</div>
								<p className="shrink-0 text-xs font-bold text-slate-400">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
							</div>
							<p className="mt-2 text-xs font-bold text-slate-500">{item.createdByName}</p>
						</div>
					))}
					{!timeline.length ? <p className="py-6 text-center text-sm font-bold text-slate-400">Sem eventos registrados.</p> : null}
				</div>
			</section>
		</div>
	);
}

function MiniInfo({ label, value }) {
	return (
		<div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
			<p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
			<p className="truncate text-sm font-black text-slate-900">{value}</p>
		</div>
	);
}

function AnswerRequestForm({ protocolId, requestId, onAnswered }) {
	const [answer, setAnswer] = useState("");
	const [photoCount, setPhotoCount] = useState(0);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!answer.trim()) {
			setError("Escreva sua resposta.");
			return;
		}
		if (photoCount < MIN_REQUEST_PHOTOS) {
			setError(`Anexe pelo menos ${MIN_REQUEST_PHOTOS} foto antes de responder.`);
			return;
		}
		setSaving(true);
		setError("");
		try {
			await answerSstInformationRequest(protocolId, requestId, answer.trim());
			await onAnswered();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar a resposta.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={submit} className="mt-3 space-y-3">
			{error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}
			<textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} className="rot-input min-h-16 py-2" placeholder="Escreva sua resposta..." />
			<ImageUploader entityType="SST_PROTOCOL" entityId={protocolId} required minImages={MIN_REQUEST_PHOTOS} maxImages={MAX_REQUEST_PHOTOS} onCountChange={setPhotoCount} />
			<button type="submit" disabled={saving} className="rot-btn-tactile inline-flex h-9 items-center rounded-xl bg-purple-600 px-4 text-xs font-black text-white hover:bg-purple-700 disabled:opacity-60">{saving ? "Enviando..." : "Responder"}</button>
		</form>
	);
}

function CommunicationComposer({ protocolId, canRespond, canRequestInfo, employeeId, employeeName, requestedBy, requestedByName, onSent }) {
	const [mode, setMode] = useState(canRespond ? "compartilhado" : "solicitar");
	const [body, setBody] = useState("");
	const [targetUserId, setTargetUserId] = useState(employeeId || requestedBy || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const targets = [
		employeeId ? { id: employeeId, name: `${employeeName || "Colaborador"} (colaborador)` } : null,
		requestedBy && requestedBy !== employeeId ? { id: requestedBy, name: `${requestedByName || "Solicitante"} (solicitante)` } : null,
	].filter(Boolean);

	const submit = async (event) => {
		event.preventDefault();
		if (!body.trim()) {
			setError("Escreva o conteúdo.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			if (mode === "solicitar") {
				if (!targetUserId) { setError("Selecione o destinatário."); setSaving(false); return; }
				await createSstInformationRequest(protocolId, { targetUserId, question: body.trim() });
			} else {
				await sendSstProtocolMessage(protocolId, { visibility: mode, body: body.trim() });
			}
			setBody("");
			await onSent();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={submit} className="space-y-3">
			{error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}
			<div className="flex flex-wrap gap-2">
				{canRespond ? (
					<>
						<ModeButton active={mode === "compartilhado"} onClick={() => setMode("compartilhado")} label="Resposta ao solicitante" />
						<ModeButton active={mode === "interno"} onClick={() => setMode("interno")} label="Nota interna SST" />
					</>
				) : null}
				{canRequestInfo ? <ModeButton active={mode === "solicitar"} onClick={() => setMode("solicitar")} label="Solicitar informação" /> : null}
			</div>
			{mode === "solicitar" ? (
				<Field label="Destinatário"><Select value={targetUserId} onChange={setTargetUserId} items={targets} /></Field>
			) : null}
			<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="rot-input min-h-20 py-2" placeholder={mode === "solicitar" ? "O que você precisa perguntar?" : "Escreva sua mensagem..."} />
			<button type="submit" disabled={saving} className="rot-btn-tactile inline-flex h-10 items-center rounded-xl bg-slate-900 px-5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60">{saving ? "Enviando..." : "Enviar"}</button>
		</form>
	);
}

function ResumoSection({ protocol, canEdit, onSaved }) {
	const [editing, setEditing] = useState(false);
	const [subject, setSubject] = useState(protocol.subject);
	const [description, setDescription] = useState(protocol.description || "");
	const [location, setLocation] = useState(protocol.location || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const startEdit = () => {
		setSubject(protocol.subject);
		setDescription(protocol.description || "");
		setLocation(protocol.location || "");
		setEditing(true);
	};

	const submit = async (event) => {
		event.preventDefault();
		if (!subject.trim()) {
			setError("Informe o assunto.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await updateSstProtocol(protocol.id, { subject: subject.trim(), description, location });
			setEditing(false);
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar as alterações.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-lg font-black text-slate-950">Resumo</h2>
				{canEdit && !editing ? <button type="button" onClick={startEdit} className="rot-btn-tactile text-xs font-black text-orange-600 hover:text-orange-700">Editar</button> : null}
			</div>
			{error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
			{editing ? (
				<form onSubmit={submit} className="mt-3 space-y-3">
					<Field label="Assunto"><input value={subject} onChange={(e) => setSubject(e.target.value)} className="rot-input" /></Field>
					<Field label="Descrição"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="rot-input min-h-28 py-3" /></Field>
					<Field label="Local"><input value={location} onChange={(e) => setLocation(e.target.value)} className="rot-input" /></Field>
					<div className="flex justify-end gap-2">
						<button type="button" onClick={() => setEditing(false)} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
					</div>
				</form>
			) : (
				<>
					<p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-600">{protocol.description || "Sem descrição adicional."}</p>
					{protocol.location ? <p className="mt-3 text-xs font-bold uppercase text-slate-400">Local: <span className="text-slate-600">{protocol.location}</span></p> : null}
				</>
			)}
		</section>
	);
}

function InvestigationSection({ protocol, isReadOnly, onSaved }) {
	const [editing, setEditing] = useState(false);
	const [rootCause, setRootCause] = useState(protocol.details?.rootCause || "");
	const [correctiveMeasures, setCorrectiveMeasures] = useState(protocol.details?.correctiveMeasures || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const consequenceLabel = CONSEQUENCE_OPTIONS.find((c) => c.id === protocol.details?.potentialConsequence)?.name;

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			await updateSstProtocol(protocol.id, { details: { rootCause, correctiveMeasures } });
			setEditing(false);
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a investigação.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-lg font-black text-slate-950">Investigação</h2>
				{!isReadOnly && !editing ? <button type="button" onClick={() => setEditing(true)} className="rot-btn-tactile text-xs font-black text-orange-600 hover:text-orange-700">Editar</button> : null}
			</div>
			{error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
			<div className="mt-3 grid gap-3 sm:grid-cols-2">
				{consequenceLabel ? <MiniInfo label="Potencial de consequência" value={consequenceLabel} /> : null}
				{protocol.details?.immediateAction ? <MiniInfo label="Ação imediata tomada" value={protocol.details.immediateAction} /> : null}
			</div>
			{editing ? (
				<form onSubmit={submit} className="mt-4 space-y-3">
					<Field label="Causa raiz"><textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={3} className="rot-input min-h-20 py-2" placeholder="O que causou a ocorrência?" /></Field>
					<Field label="Medidas corretivas"><textarea value={correctiveMeasures} onChange={(e) => setCorrectiveMeasures(e.target.value)} rows={3} className="rot-input min-h-20 py-2" placeholder="O que será feito para evitar recorrência?" /></Field>
					<div className="flex justify-end gap-2">
						<button type="button" onClick={() => setEditing(false)} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
					</div>
				</form>
			) : (
				<div className="mt-3 space-y-2">
					{protocol.details?.rootCause ? <p className="text-sm font-semibold text-slate-600"><span className="font-black text-slate-800">Causa raiz: </span>{protocol.details.rootCause}</p> : null}
					{protocol.details?.correctiveMeasures ? <p className="text-sm font-semibold text-slate-600"><span className="font-black text-slate-800">Medidas corretivas: </span>{protocol.details.correctiveMeasures}</p> : null}
					{!protocol.details?.rootCause && !protocol.details?.correctiveMeasures ? <p className="text-sm font-bold text-slate-400">Investigação ainda não registrada.</p> : null}
				</div>
			)}
		</section>
	);
}

function ActionPlanCard({ plan, canValidate, onChanged }) {
	const [submitting, setSubmitting] = useState(false);
	const [note, setNote] = useState("");
	const [validating, setValidating] = useState(false);
	const [error, setError] = useState("");
	const statusInfo = ACTION_STATUS_LABEL[plan.status] || ACTION_STATUS_LABEL.ABERTO;

	const submit = async () => {
		if (!note.trim()) {
			setError("Descreva o que foi feito.");
			return;
		}
		setValidating(true);
		setError("");
		try {
			await submitSstActionPlan(plan.id, note.trim());
			await onChanged();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar para validação.");
		} finally {
			setValidating(false);
		}
	};

	const validate = async (approved) => {
		setValidating(true);
		setError("");
		try {
			await validateSstActionPlan(plan.id, approved, note.trim() || null);
			await onChanged();
		} catch (err) {
			setError(err?.message || "Não foi possível validar.");
		} finally {
			setValidating(false);
		}
	};

	return (
		<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<p className="text-sm font-black text-slate-900">{plan.title}</p>
					<p className="text-xs font-bold text-slate-500">Responsável: {plan.responsibleName || "—"} {plan.dueDate ? `· Prazo: ${new Date(plan.dueDate).toLocaleDateString("pt-BR")}` : ""}</p>
				</div>
				<div className="flex items-center gap-2">
					{plan.overdue ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-700">ATRASADO</span> : null}
					<span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusInfo.className}`}>{statusInfo.label}</span>
				</div>
			</div>
			{plan.description ? <p className="mt-2 text-xs font-semibold text-slate-600">{plan.description}</p> : null}
			{plan.completionNote ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600"><span className="font-black text-slate-800">Conclusão do responsável: </span>{plan.completionNote}</p> : null}
			{plan.validationNote ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600"><span className="font-black text-slate-800">Parecer da validação: </span>{plan.validationNote}</p> : null}
			{error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
			{plan.canSubmit ? (
				<div className="mt-3 space-y-2">
					<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" placeholder="O que foi feito? Descreva a evidência/conclusão." />
					<button type="button" disabled={submitting || validating} onClick={submit} className="rot-btn-tactile inline-flex h-9 items-center rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60">{validating ? "Enviando..." : "Enviar para validação"}</button>
				</div>
			) : null}
			{canValidate && plan.status === "AGUARDANDO_VALIDACAO" ? (
				<div className="mt-3 space-y-2">
					<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" placeholder="Parecer da validação (opcional)." />
					<div className="flex gap-2">
						<button type="button" disabled={validating} onClick={() => validate(true)} className="rot-btn-tactile inline-flex h-9 items-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-60">Validar e concluir</button>
						<button type="button" disabled={validating} onClick={() => validate(false)} className="rot-btn-tactile inline-flex h-9 items-center rounded-xl border border-red-200 bg-white px-4 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-60">Devolver</button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function CreateActionPlanForm({ protocolId, employeeId, employeeName, assignedTo, assignedToName, onCreated }) {
	const targets = [
		employeeId ? { id: employeeId, name: `${employeeName || "Colaborador"} (colaborador)` } : null,
		assignedTo && assignedTo !== employeeId ? { id: assignedTo, name: `${assignedToName || "Responsável SST"} (responsável SST)` } : null,
	].filter(Boolean);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [responsibleId, setResponsibleId] = useState(targets[0]?.id || "");
	const [dueDate, setDueDate] = useState("");
	const [priority, setPriority] = useState("media");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!title.trim() || !responsibleId) {
			setError("Preencha título e responsável.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await createSstActionPlan(protocolId, { title: title.trim(), description: description.trim(), responsibleId, dueDate: dueDate || null, priority });
			setTitle("");
			setDescription("");
			setDueDate("");
			await onCreated();
		} catch (err) {
			setError(err?.message || "Não foi possível criar o plano de ação.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={submit} className="space-y-3">
			{error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}
			<Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} className="rot-input" placeholder="Ex.: Trocar escada danificada" /></Field>
			<Field label="Descrição"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
			<div className="grid gap-3 sm:grid-cols-3">
				<Field label="Responsável"><Select value={responsibleId} onChange={setResponsibleId} items={targets} /></Field>
				<Field label="Prazo"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rot-input" /></Field>
				<Field label="Prioridade"><Select value={priority} onChange={setPriority} items={PRIORITY_OPTIONS} /></Field>
			</div>
			<button type="submit" disabled={saving} className="rot-btn-tactile inline-flex h-10 items-center rounded-xl bg-slate-900 px-5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60"><ListChecks size={14} className="mr-1.5" />{saving ? "Criando..." : "Criar plano de ação"}</button>
		</form>
	);
}

function ModeButton({ active, onClick, label }) {
	return (
		<button type="button" onClick={onClick} className={`rot-btn-tactile rounded-xl px-3 py-1.5 text-xs font-black ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
			{label}
		</button>
	);
}
