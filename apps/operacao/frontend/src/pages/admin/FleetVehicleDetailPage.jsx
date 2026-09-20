import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	AlertTriangle, ArrowLeft, ArrowLeftRight, Ban, Car, CheckCircle2, FileText,
	Gauge, History, Lock, Plus, ShieldAlert, Store, Trash2, Unlock, Upload, UserCog, Wrench, XCircle,
} from "lucide-react";
import {
	blockRotVehicle, cancelRotVehicleMovement, confirmRotVehicleMovement, correctRotVehicleKm,
	createRotVehicleClaim, createRotVehicleDocument, createRotVehicleMaintenance, deleteRotVehicleClaim,
	deleteRotVehicleDocument, deleteRotVehicleMaintenance, fetchRotAttachments, fetchRotFleet,
	fetchRotVehicleDetail, finishRotVehicleMaintenance, inactivateRotVehicle, recordRotVehicleKm,
	retrieveRotVehicleFromBase, returnRotVehicleToBase, transferRotVehicle, unblockRotVehicle,
} from "../../api/rotApi";
import Field from "../../components/ui/Field";
import ModalShell from "../../components/ui/ModalShell";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { uploadImage, uploadPdf } from "../../utils/imageUpload";
import { formatDateTime, formatKm, submitKmAware, VEHICLE_STATUS_BADGE, VEHICLE_STATUS_LABEL } from "../../utils/fleetKm";

const TABS = [
	{ id: "overview", label: "Visão Geral" },
	{ id: "custody", label: "Custódia" },
	{ id: "movements", label: "Movimentações" },
	{ id: "km", label: "Quilometragem" },
	{ id: "maintenance", label: "Manutenções" },
	{ id: "claims", label: "Sinistros" },
	{ id: "documents", label: "Documentos" },
	{ id: "timeline", label: "Histórico" },
];

const MOVEMENT_TYPE_LABEL = { TRANSFERENCIA: "Transferência", DEVOLUCAO_BASE: "Devolução à base", RETIRADA_BASE: "Retirada da base" };
const ORIGIN_LABEL = {
	CADASTRO: "Cadastro", TRANSFERENCIA_ENTREGA: "Entrega (transferência)", TRANSFERENCIA_RECEBIMENTO: "Recebimento (transferência)",
	DEVOLUCAO_BASE: "Devolução à base", RETIRADA_BASE: "Retirada da base", ENTRADA_MANUTENCAO: "Entrada em manutenção",
	RETORNO_MANUTENCAO: "Retorno de manutenção", LEITURA_MANUAL: "Leitura manual", CORRECAO_ADMINISTRATIVA: "Correção administrativa",
	INATIVACAO: "Inativação", MIGRACAO_LEGADO: "Migração de dado legado",
};

function StatusBadge({ status }) {
	return <span className={`rounded-full px-3 py-1.5 text-xs font-black ${VEHICLE_STATUS_BADGE[status] || "bg-slate-600 text-white"}`}>{VEHICLE_STATUS_LABEL[status] || status}</span>;
}

function ActionButton({ icon: Icon, label, onClick, tone = "border border-slate-200 text-slate-700 hover:bg-slate-50" }) {
	return (
		<button type="button" onClick={onClick} className={`rot-btn-tactile inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-black ${tone}`}>
			<Icon size={14} /> {label}
		</button>
	);
}

export default function FleetVehicleDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { user, hasPermission } = useRotAuth();
	const [detail, setDetail] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [tab, setTab] = useState("overview");
	const [modal, setModal] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setDetail(await fetchRotVehicleDetail(id));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o veículo.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	if (loading) return <Spinner fullScreen />;
	if (!detail) return <p className="text-sm font-bold text-red-600">{error || "Veículo não encontrado."}</p>;

	const { vehicle } = detail;
	const canManage = hasPermission("rot.fleet.manage");
	const canTransfer = canManage || hasPermission("rot.fleet.transfer");
	const canBlock = canManage || hasPermission("rot.fleet.block");
	const canUnblock = canManage || hasPermission("rot.fleet.unblock");
	const canMaintenance = canManage || hasPermission("rot.fleet.maintenance.manage");
	const canKm = canManage || hasPermission("rot.fleet.km.manage");
	const canKmCorrect = canManage || hasPermission("rot.fleet.km.correct");
	const canDocuments = canManage || hasPermission("rot.fleet.documents.manage");
	const canInactivate = canManage || hasPermission("rot.fleet.inactivate");
	const canReceive = canManage || hasPermission("rot.fleet.receive");

	const pendingMovement = detail.movements.find((m) => m.type === "TRANSFERENCIA" && m.status === "PENDENTE");
	const isRecipient = pendingMovement && pendingMovement.toResponsibleId === user?.id;
	const openMaintenance = detail.maintenances.find((m) => m.status === "OPEN");

	const refresh = () => load();

	return (
		<div className="space-y-6">
			<button type="button" onClick={() => navigate("/frota")} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800">
				<ArrowLeft size={15} /> Voltar para frota
			</button>

			<header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card lg:flex-row lg:items-start lg:justify-between">
				<div className="flex items-start gap-3">
					<span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-900 text-white"><Car size={26} /></span>
					<div>
						<h1 className="text-2xl font-black uppercase text-slate-950">{vehicle.model}</h1>
						<div className="mt-1 flex flex-wrap items-center gap-2">
							<span className="rounded bg-orange-500 px-2 py-0.5 font-mono text-sm font-bold text-white">{vehicle.plate}</span>
							<span className="text-xs font-bold uppercase text-slate-400">{vehicle.manufacturer}{vehicle.year ? ` · ${vehicle.year}` : ""}</span>
							<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{vehicle.operationScope}</span>
							<StatusBadge status={vehicle.status} />
						</div>
						{vehicle.status === "BLOQUEADO" && vehicle.blockedReason ? <p className="mt-1.5 text-xs font-bold text-red-600">Motivo: {vehicle.blockedReason}</p> : null}
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					{pendingMovement && (isRecipient || canReceive) ? <ActionButton icon={CheckCircle2} label="Confirmar recebimento" onClick={() => setModal({ type: "confirm", movement: pendingMovement })} tone="bg-emerald-600 text-white hover:bg-emerald-700" /> : null}
					{pendingMovement && canTransfer ? <ActionButton icon={XCircle} label="Cancelar transferência" onClick={() => setModal({ type: "cancel", movement: pendingMovement })} /> : null}
					{canTransfer && vehicle.status === "EM_OPERACAO" ? <ActionButton icon={ArrowLeftRight} label="Transferir" onClick={() => setModal({ type: "transfer" })} tone="bg-orange-600 text-white hover:bg-orange-700" /> : null}
					{canTransfer && vehicle.status === "EM_OPERACAO" ? <ActionButton icon={Store} label="Devolver à base" onClick={() => setModal({ type: "return" })} /> : null}
					{canTransfer && vehicle.status === "DISPONIVEL_BASE" ? <ActionButton icon={UserCog} label="Retirar da base" onClick={() => setModal({ type: "retrieve" })} tone="bg-orange-600 text-white hover:bg-orange-700" /> : null}
					{canKm && !["INATIVO", "AGUARDANDO_RECEBIMENTO"].includes(vehicle.status) ? <ActionButton icon={Gauge} label="Registrar KM" onClick={() => setModal({ type: "km" })} /> : null}
					{canKmCorrect ? <ActionButton icon={Gauge} label="Corrigir KM" onClick={() => setModal({ type: "kmCorrect" })} /> : null}
					{canMaintenance && ["EM_OPERACAO", "DISPONIVEL_BASE"].includes(vehicle.status) ? <ActionButton icon={Wrench} label="Entrada em manutenção" onClick={() => setModal({ type: "maintenanceStart" })} /> : null}
					{canMaintenance && openMaintenance ? <ActionButton icon={CheckCircle2} label="Retorno de manutenção" onClick={() => setModal({ type: "maintenanceFinish", maintenance: openMaintenance })} tone="bg-emerald-600 text-white hover:bg-emerald-700" /> : null}
					{canManage ? <ActionButton icon={AlertTriangle} label="Registrar sinistro" onClick={() => setModal({ type: "claim" })} /> : null}
					{canBlock && !["BLOQUEADO", "INATIVO"].includes(vehicle.status) ? <ActionButton icon={Lock} label="Bloquear" onClick={() => setModal({ type: "block" })} tone="bg-slate-900 text-white hover:bg-black" /> : null}
					{canUnblock && vehicle.status === "BLOQUEADO" ? <ActionButton icon={Unlock} label="Desbloquear" onClick={() => setModal({ type: "unblock" })} tone="bg-emerald-600 text-white hover:bg-emerald-700" /> : null}
					{canInactivate && vehicle.status !== "INATIVO" ? <ActionButton icon={Ban} label="Dar baixa" onClick={() => setModal({ type: "inactivate" })} tone="border border-red-200 text-red-700 hover:bg-red-50" /> : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card">
				{TABS.map((t) => (
					<button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-xl px-3.5 py-2 text-xs font-black ${tab === t.id ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
						{t.label}
					</button>
				))}
			</div>

			{tab === "overview" ? <OverviewTab detail={detail} /> : null}
			{tab === "custody" ? <CustodyTab custody={detail.custody} /> : null}
			{tab === "movements" ? <MovementsTab movements={detail.movements} /> : null}
			{tab === "km" ? <KmTab readings={detail.odometerReadings} /> : null}
			{tab === "maintenance" ? <MaintenanceTab maintenances={detail.maintenances} workshops={detail.workshops} canManage={canManage} onChanged={refresh} /> : null}
			{tab === "claims" ? <ClaimsTab claims={detail.claims} canManage={canManage} onChanged={refresh} /> : null}
			{tab === "documents" ? <DocumentsTab vehicleId={vehicle.id} documents={detail.documents} canManage={canDocuments} onChanged={refresh} /> : null}
			{tab === "timeline" ? <TimelineTab detail={detail} /> : null}

			{modal ? (
				<ActionModals
					modal={modal}
					vehicle={vehicle}
					onClose={() => setModal(null)}
					onDone={() => { setModal(null); refresh(); }}
					setError={setError}
				/>
			) : null}
		</div>
	);
}

function InfoRow({ label, value }) {
	return (
		<div>
			<p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
			<p className="text-sm font-bold text-slate-800">{value ?? "—"}</p>
		</div>
	);
}

function OverviewTab({ detail }) {
	const { vehicle } = detail;
	const nextMaintenance = detail.maintenances.find((m) => m.status === "OPEN" && m.nextKm);
	const lastFinishedMaintenance = detail.maintenances.find((m) => m.status === "FINISHED");
	const upcomingDocuments = detail.documents.filter((d) => d.expiresAt).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt)).slice(0, 3);
	return (
		<section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:grid-cols-2 lg:grid-cols-4">
			<InfoRow label="Veículo" value={vehicle.model} />
			<InfoRow label="Placa" value={vehicle.plate} />
			<InfoRow label="Fabricante" value={vehicle.manufacturer} />
			<InfoRow label="Ano/modelo" value={vehicle.year} />
			<InfoRow label="Operação" value={vehicle.operationScope} />
			<InfoRow label="Status" value={VEHICLE_STATUS_LABEL[vehicle.status] || vehicle.status} />
			<InfoRow label="Responsável" value={vehicle.responsibleName} />
			<InfoRow label="KM atual" value={formatKm(vehicle.currentKm)} />
			<InfoRow label="Última leitura" value={formatDateTime(vehicle.currentKmAt)} />
			<InfoRow label="Cadastrado em" value={formatDateTime(vehicle.createdAt)} />
			<InfoRow label="Última manutenção" value={lastFinishedMaintenance ? formatDateTime(lastFinishedMaintenance.finishedAt) : "—"} />
			<InfoRow label="Próxima manutenção (KM)" value={nextMaintenance ? formatKm(nextMaintenance.nextKm) : "—"} />
			{upcomingDocuments.length ? (
				<div className="sm:col-span-2 lg:col-span-4">
					<p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Documentos com vencimento cadastrado</p>
					<div className="flex flex-wrap gap-2">
						{upcomingDocuments.map((d) => (
							<span key={d.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{d.type} · vence {new Date(d.expiresAt).toLocaleDateString("pt-BR")}</span>
						))}
					</div>
				</div>
			) : null}
		</section>
	);
}

function CustodyTab({ custody }) {
	return (
		<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
			<table className="w-full min-w-[720px] text-left text-sm">
				<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
					<tr><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Início</th><th className="px-4 py-3">KM inicial</th><th className="px-4 py-3">Fim</th><th className="px-4 py-3">KM final</th><th className="px-4 py-3">Rodado</th></tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{custody.map((c) => (
						<tr key={c.id}>
							<td className="px-4 py-3 font-bold text-slate-900">{c.responsibleName || "—"}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{formatDateTime(c.startedAt)}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{formatKm(c.startedKm)}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{c.endedAt ? formatDateTime(c.endedAt) : "Em curso"}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{c.endedKm !== null ? formatKm(c.endedKm) : "—"}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{c.endedKm !== null && c.startedKm !== null ? formatKm(c.endedKm - c.startedKm) : "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
			{!custody.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma custódia registrada.</p> : null}
		</section>
	);
}

function MovementsTab({ movements }) {
	return (
		<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
			<table className="w-full min-w-[780px] text-left text-sm">
				<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
					<tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">De</th><th className="px-4 py-3">Para</th><th className="px-4 py-3">KM saída</th><th className="px-4 py-3">KM entrada</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data</th></tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{movements.map((m) => (
						<tr key={m.id}>
							<td className="px-4 py-3 font-bold text-slate-900">{MOVEMENT_TYPE_LABEL[m.type] || m.type}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{m.fromResponsibleName || "—"}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{m.toResponsibleName || "—"}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{formatKm(m.kmOut)}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{formatKm(m.kmIn)}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{m.status}</td>
							<td className="px-4 py-3 font-bold text-slate-500">{formatDateTime(m.createdAt)}</td>
						</tr>
					))}
				</tbody>
			</table>
			{!movements.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma movimentação registrada.</p> : null}
		</section>
	);
}

function KmTab({ readings }) {
	return (
		<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
			<table className="w-full min-w-[680px] text-left text-sm">
				<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
					<tr><th className="px-4 py-3">KM</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Data/hora</th><th className="px-4 py-3">Observação</th></tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{readings.map((r) => (
						<tr key={r.id}>
							<td className="px-4 py-3 font-bold text-slate-900">{formatKm(r.km)}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{ORIGIN_LABEL[r.origin] || r.origin}</td>
							<td className="px-4 py-3 font-bold text-slate-600">{r.recordedByName || "—"}</td>
							<td className="px-4 py-3 font-bold text-slate-500">{formatDateTime(r.recordedAt)}</td>
							<td className="px-4 py-3 text-slate-500">{r.reason || r.note || "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
			{!readings.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma leitura registrada.</p> : null}
		</section>
	);
}

function MaintenanceTab({ maintenances, workshops, canManage, onChanged }) {
	return (
		<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
			<table className="w-full min-w-[760px] text-left text-sm">
				<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
					<tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Oficina</th><th className="px-4 py-3">KM entrada</th><th className="px-4 py-3">KM saída</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Observação</th>{canManage ? <th className="px-4 py-3" /> : null}</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{maintenances.map((m) => {
						const workshop = workshops.find((w) => w.id === m.workshopId);
						return (
							<tr key={m.id}>
								<td className="px-4 py-3 font-bold text-slate-900">{new Date(m.date).toLocaleDateString("pt-BR")} {m.time}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{workshop?.name || "—"}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{formatKm(m.kmIn)}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{formatKm(m.kmOut)}</td>
								<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${m.status === "FINISHED" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{m.status === "FINISHED" ? "Concluída" : "Em aberto"}</span></td>
								<td className="px-4 py-3 text-slate-500">{m.resolutionNote || m.reason || "—"}</td>
								{canManage ? (
									<td className="px-4 py-3 text-right">
										<button type="button" onClick={() => deleteRotVehicleMaintenance(m.id).then(onChanged)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
									</td>
								) : null}
							</tr>
						);
					})}
				</tbody>
			</table>
			{!maintenances.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma manutenção registrada.</p> : null}
		</section>
	);
}

function ClaimsTab({ claims, canManage, onChanged }) {
	return (
		<section className="space-y-2">
			{claims.map((c) => (
				<div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border-l-4 border-red-500 bg-white p-4 shadow-sm">
					<div>
						<p className="text-xs font-bold text-slate-400">{new Date(c.date).toLocaleDateString("pt-BR")} · {c.createdByName}</p>
						<p className="mt-1 text-sm font-semibold text-slate-700">{c.description}</p>
					</div>
					{canManage ? <button type="button" onClick={() => deleteRotVehicleClaim(c.id).then(onChanged)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button> : null}
				</div>
			))}
			{!claims.length ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum sinistro registrado.</p> : null}
		</section>
	);
}

function DocumentAttachment({ documentId, canManage }) {
	const [items, setItems] = useState([]);
	const [uploading, setUploading] = useState(false);

	const load = () => fetchRotAttachments("VEHICLE_DOCUMENT", documentId).then((data) => setItems(data.items || [])).catch(() => setItems([]));
	useEffect(() => { load(); }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

	const onSelect = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setUploading(true);
		try {
			if (file.type === "application/pdf") await uploadPdf(file, "VEHICLE_DOCUMENT", documentId);
			else await uploadImage(file, "VEHICLE_DOCUMENT", documentId);
			await load();
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="mt-2 flex flex-wrap items-center gap-2">
			{items.map((item) => (
				<a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-orange-700 hover:border-orange-300">
					<FileText size={12} /> {item.originalName || "arquivo"}
				</a>
			))}
			{canManage ? (
				<label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-500 hover:border-orange-300">
					<Upload size={12} /> {uploading ? "Enviando..." : "Anexar"}
					<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onSelect} disabled={uploading} />
				</label>
			) : null}
		</div>
	);
}

function DocumentsTab({ vehicleId, documents, canManage, onChanged }) {
	const [creating, setCreating] = useState(false);
	return (
		<section className="space-y-3">
			{canManage ? (
				<button type="button" onClick={() => setCreating(true)} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-xs font-black text-white hover:bg-orange-700">
					<Plus size={14} /> Novo documento
				</button>
			) : null}
			{documents.map((doc) => (
				<div key={doc.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-start justify-between gap-2">
						<div>
							<p className="text-sm font-black text-slate-900">{doc.type}{doc.number ? ` · ${doc.number}` : ""}</p>
							<p className="text-xs font-semibold text-slate-500">
								{doc.issuedAt ? `Emissão ${new Date(doc.issuedAt).toLocaleDateString("pt-BR")}` : ""}
								{doc.expiresAt ? ` · Vence ${new Date(doc.expiresAt).toLocaleDateString("pt-BR")}` : ""}
							</p>
							{doc.note ? <p className="mt-1 text-xs text-slate-500">{doc.note}</p> : null}
						</div>
						{canManage ? <button type="button" onClick={() => deleteRotVehicleDocument(doc.id).then(onChanged)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button> : null}
					</div>
					<DocumentAttachment documentId={doc.id} canManage={canManage} />
				</div>
			))}
			{!documents.length ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum documento cadastrado.</p> : null}
			{creating ? (
				<ModalShell open title="Novo documento" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><FileText size={22} /></span>} onClose={() => setCreating(false)} size="md">
					<DocumentForm vehicleId={vehicleId} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); onChanged(); }} />
				</ModalShell>
			) : null}
		</section>
	);
}

function DocumentForm({ vehicleId, onClose, onCreated }) {
	const [form, setForm] = useState({ type: "", number: "", issuedAt: "", expiresAt: "", note: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const setField = (key, value) => setForm((c) => ({ ...c, [key]: value }));
	const submit = async (event) => {
		event.preventDefault();
		if (!form.type.trim()) { setError("Informe o tipo do documento."); return; }
		setSaving(true);
		setError("");
		try {
			await createRotVehicleDocument(vehicleId, form);
			onCreated();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o documento.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<form onSubmit={submit} className="space-y-4">
			{error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<Field label="Tipo" required><input value={form.type} onChange={(e) => setField("type", e.target.value)} className="rot-input" placeholder="Ex.: Licenciamento, Seguro" autoFocus /></Field>
			<Field label="Número"><input value={form.number} onChange={(e) => setField("number", e.target.value)} className="rot-input" /></Field>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Emissão"><input type="date" value={form.issuedAt} onChange={(e) => setField("issuedAt", e.target.value)} className="rot-input" /></Field>
				<Field label="Vencimento"><input type="date" value={form.expiresAt} onChange={(e) => setField("expiresAt", e.target.value)} className="rot-input" /></Field>
			</div>
			<Field label="Observação"><textarea value={form.note} onChange={(e) => setField("note", e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
			<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
				<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
				<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
			</div>
		</form>
	);
}

function describeTransition(h) {
	const from = VEHICLE_STATUS_LABEL[h.fromStatus] || h.fromStatus;
	const to = VEHICLE_STATUS_LABEL[h.toStatus] || h.toStatus;
	return h.fromStatus ? `${from} → ${to}` : to;
}

function TimelineTab({ detail }) {
	const events = detail.statusHistory.map((h) => ({
		at: h.changedAt,
		icon: History,
		title: describeTransition(h),
		description: [h.reason, h.note, h.changedByName ? `por ${h.changedByName}` : null].filter(Boolean).join(" · "),
	}));
	events.sort((a, b) => new Date(b.at) - new Date(a.at));
	return (
		<section className="space-y-3">
			{events.map((event, index) => (
				<div key={index} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600"><event.icon size={15} /></span>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<p className="text-sm font-black text-slate-900">{event.title}</p>
							<p className="shrink-0 text-xs font-bold text-slate-400">{formatDateTime(event.at)}</p>
						</div>
						{event.description ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{event.description}</p> : null}
					</div>
				</div>
			))}
			{!events.length ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum evento registrado ainda.</p> : null}
		</section>
	);
}

// ---------------------------------------------------------------------
// Modais de ação
// ---------------------------------------------------------------------

function KmField({ value, onChange, label = "Quilometragem atual" }) {
	return (
		<Field label={label} required>
			<input type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(e.target.value)} className="rot-input" placeholder="Ex.: 84521" />
		</Field>
	);
}

function ActionModals({ modal, vehicle, onClose, onDone, setError }) {
	const [saving, setSaving] = useState(false);
	const [localError, setLocalError] = useState("");
	const [technicians, setTechnicians] = useState(null);

	useEffect(() => {
		if (["transfer", "retrieve"].includes(modal.type) && technicians === null) {
			fetchRotFleet().then((data) => setTechnicians(data.technicians || []));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [modal.type]);

	const run = async (fn) => {
		setSaving(true);
		setLocalError("");
		try {
			await fn();
			onDone();
		} catch (err) {
			setLocalError(err?.message || "Não foi possível concluir a ação.");
		} finally {
			setSaving(false);
		}
	};

	const eligibleTechnicians = (technicians || []).filter((t) => (t.operationScopes || ["ROT"]).includes(vehicle.operationScope));

	if (modal.type === "transfer") {
		const [toResponsibleId, setToResponsibleId] = useStatePatch("");
		const [km, setKm] = useStatePatch(vehicle.currentKm ?? "");
		const [note, setNote] = useStatePatch("");
		return (
			<ModalShell open title="Transferir veículo" description={`Veículo ${vehicle.plate}. Responsável atual: ${vehicle.responsibleName || "—"}.`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><ArrowLeftRight size={22} /></span>} onClose={onClose} size="md">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<Field label="Novo responsável" required>
						<Select value={toResponsibleId} onChange={setToResponsibleId} items={eligibleTechnicians.map((t) => ({ id: t.id, name: t.name }))} empty="Selecione" />
					</Field>
					<KmField value={km} onChange={setKm} />
					<Field label="Observação"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || !toResponsibleId || km === ""} onClick={() => run(() => submitKmAware((p) => transferRotVehicle(vehicle.id, p), { toResponsibleId, km: Number(km), note }))} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
							{saving ? "Enviando..." : "Confirmar transferência"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "confirm") {
		const [km, setKm] = useStatePatch(vehicle.currentKm ?? "");
		const [note, setNote] = useStatePatch("");
		return (
			<ModalShell open title="Confirmar recebimento" description={`Entrega registrada com ${formatKm(modal.movement.kmOut)}.`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<KmField value={km} onChange={setKm} label="Quilometragem no recebimento" />
					<Field label="Observação"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || km === ""} onClick={() => run(() => submitKmAware((p) => confirmRotVehicleMovement(modal.movement.id, p), { km: Number(km), note }))} className="rot-btn-tactile rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
							{saving ? "Confirmando..." : "Confirmar recebimento"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "cancel") {
		return (
			<ModalShell open title="Cancelar transferência" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><XCircle size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<p className="text-sm font-semibold text-slate-600">O veículo volta para o responsável anterior. Confirma o cancelamento?</p>
				<div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Voltar</button>
					<button type="button" disabled={saving} onClick={() => run(() => cancelRotVehicleMovement(modal.movement.id))} className="rot-btn-tactile rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">{saving ? "Cancelando..." : "Cancelar transferência"}</button>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "return") {
		const [km, setKm] = useStatePatch(vehicle.currentKm ?? "");
		const [reason, setReason] = useStatePatch("");
		const [note, setNote] = useStatePatch("");
		return (
			<ModalShell open title="Devolver à base" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Store size={22} /></span>} onClose={onClose} size="md">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<KmField value={km} onChange={setKm} />
					<Field label="Motivo" required><input value={reason} onChange={(e) => setReason(e.target.value)} className="rot-input" /></Field>
					<Field label="Observação"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || !reason.trim() || km === ""} onClick={() => run(() => submitKmAware((p) => returnRotVehicleToBase(vehicle.id, p), { km: Number(km), reason, note }))} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
							{saving ? "Enviando..." : "Confirmar devolução"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "retrieve") {
		const [responsibleId, setResponsibleId] = useStatePatch("");
		const [km, setKm] = useStatePatch(vehicle.currentKm ?? "");
		const [note, setNote] = useStatePatch("");
		return (
			<ModalShell open title="Retirar da base" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><UserCog size={22} /></span>} onClose={onClose} size="md">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<Field label="Responsável" required><Select value={responsibleId} onChange={setResponsibleId} items={eligibleTechnicians.map((t) => ({ id: t.id, name: t.name }))} empty="Selecione" /></Field>
					<KmField value={km} onChange={setKm} />
					<Field label="Observação"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || !responsibleId || km === ""} onClick={() => run(() => submitKmAware((p) => retrieveRotVehicleFromBase(vehicle.id, p), { responsibleId, km: Number(km), note }))} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
							{saving ? "Enviando..." : "Confirmar retirada"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "km") {
		const [km, setKm] = useStatePatch(vehicle.currentKm ?? "");
		const [note, setNote] = useStatePatch("");
		return (
			<ModalShell open title="Registrar quilometragem" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Gauge size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<KmField value={km} onChange={setKm} />
					<Field label="Observação"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || km === ""} onClick={() => run(() => submitKmAware((p) => recordRotVehicleKm(vehicle.id, p), { km: Number(km), note }))} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
							{saving ? "Salvando..." : "Registrar"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "kmCorrect") {
		const [km, setKm] = useStatePatch("");
		const [reason, setReason] = useStatePatch("");
		return (
			<ModalShell open title="Corrigir quilometragem" description={`Última leitura: ${formatKm(vehicle.currentKm)}.`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Gauge size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<KmField value={km} onChange={setKm} label="Quilometragem correta" />
					<Field label="Motivo da correção" required><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || km === "" || !reason.trim()} onClick={() => run(() => correctRotVehicleKm(vehicle.id, { km: Number(km), reason }))} className="rot-btn-tactile rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">
							{saving ? "Salvando..." : "Corrigir"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "maintenanceStart") {
		const [km, setKm] = useStatePatch(vehicle.currentKm ?? "");
		const [date, setDate] = useStatePatch("");
		const [time, setTime] = useStatePatch("");
		const [reason, setReason] = useStatePatch("");
		const [intervalKm, setIntervalKm] = useStatePatch("");
		return (
			<ModalShell open title="Entrada em manutenção" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Wrench size={22} /></span>} onClose={onClose} size="md">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<KmField value={km} onChange={setKm} />
					<div className="grid grid-cols-2 gap-3">
						<Field label="Data" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rot-input" /></Field>
						<Field label="Hora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rot-input" /></Field>
					</div>
					<Field label="Motivo"><input value={reason} onChange={(e) => setReason(e.target.value)} className="rot-input" placeholder="Ex.: Troca de óleo" /></Field>
					<Field label="Intervalo até a próxima revisão (KM)" hint="Opcional — calcula a próxima revisão automaticamente."><input type="number" inputMode="numeric" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} className="rot-input" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || km === "" || !date} onClick={() => run(() => submitKmAware((p) => createRotVehicleMaintenance(vehicle.id, p), { km: Number(km), date, time, reason, intervalKm: intervalKm ? Number(intervalKm) : null }))} className="rot-btn-tactile rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
							{saving ? "Enviando..." : "Confirmar entrada"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "maintenanceFinish") {
		const [km, setKm] = useStatePatch("");
		const [resolutionNote, setResolutionNote] = useStatePatch("");
		return (
			<ModalShell open title="Retorno de manutenção" description={`Entrada registrada com ${formatKm(modal.maintenance.kmIn)}.`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<KmField value={km} onChange={setKm} label="Quilometragem de saída" />
					<Field label="O que foi feito?"><textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={3} className="rot-input min-h-20 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || km === ""} onClick={() => run(() => submitKmAware((p) => finishRotVehicleMaintenance(modal.maintenance.id, p), { km: Number(km), resolutionNote }))} className="rot-btn-tactile rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
							{saving ? "Salvando..." : "Concluir manutenção"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "claim") {
		const [description, setDescription] = useStatePatch("");
		const [affectsAvailability, setAffectsAvailability] = useStatePatch(true);
		return (
			<ModalShell open title="Registrar sinistro" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><ShieldAlert size={22} /></span>} onClose={onClose} size="md">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<Field label="Descrição" required><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="rot-input min-h-28 py-2" autoFocus /></Field>
					<label className="flex items-center gap-2 text-sm font-bold text-slate-700">
						<input type="checkbox" checked={affectsAvailability} onChange={(e) => setAffectsAvailability(e.target.checked)} />
						Este sinistro tira o veículo de operação
					</label>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || !description.trim()} onClick={() => run(() => createRotVehicleClaim(vehicle.id, { description, affectsAvailability }))} className="rot-btn-tactile rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">
							{saving ? "Salvando..." : "Registrar"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "block") {
		const [reason, setReason] = useStatePatch("");
		const [note, setNote] = useStatePatch("");
		return (
			<ModalShell open title="Bloquear veículo" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white"><Lock size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<Field label="Motivo" required><input value={reason} onChange={(e) => setReason(e.target.value)} className="rot-input" placeholder="Ex.: Manutenção crítica, Sinistro, Documentação..." autoFocus /></Field>
					<Field label="Observação"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || !reason.trim()} onClick={() => run(() => blockRotVehicle(vehicle.id, { reason, note }))} className="rot-btn-tactile rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-black disabled:opacity-60">
							{saving ? "Bloqueando..." : "Bloquear"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "unblock") {
		const [reason, setReason] = useStatePatch("");
		return (
			<ModalShell open title="Desbloquear veículo" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Unlock size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<Field label="Motivo da liberação" required><input value={reason} onChange={(e) => setReason(e.target.value)} className="rot-input" autoFocus /></Field>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || !reason.trim()} onClick={() => run(() => unblockRotVehicle(vehicle.id, { reason }))} className="rot-btn-tactile rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
							{saving ? "Desbloqueando..." : "Desbloquear"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	if (modal.type === "inactivate") {
		const [reason, setReason] = useStatePatch("");
		const [km, setKm] = useStatePatch(vehicle.currentKm ?? "");
		const [note, setNote] = useStatePatch("");
		return (
			<ModalShell open title="Dar baixa no veículo" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Ban size={22} /></span>} onClose={onClose} size="sm">
				{localError ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{localError}</p> : null}
				<div className="space-y-4">
					<Field label="Motivo" required><input value={reason} onChange={(e) => setReason(e.target.value)} className="rot-input" autoFocus /></Field>
					<KmField value={km} onChange={setKm} label="Quilometragem final" />
					<Field label="Observação"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
					<p className="text-xs font-bold text-red-600">Depois da baixa, o veículo não recebe mais movimentações normais.</p>
					<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="button" disabled={saving || !reason.trim() || km === ""} onClick={() => run(() => inactivateRotVehicle(vehicle.id, { reason, km: Number(km), note }))} className="rot-btn-tactile rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">
							{saving ? "Salvando..." : "Confirmar baixa"}
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	return null;
}

// Pequeno atalho pra useState com nome estavel dentro do bloco condicional
// de ActionModals (cada "modal.type" so renderiza um bloco por vez, entao
// os hooks continuam sendo chamados na mesma ordem a cada render).
function useStatePatch(initial) {
	return useState(initial);
}
