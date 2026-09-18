import { useEffect, useState } from "react";
import { Activity, ClipboardCheck, Cpu, Edit3, Eye, History, Plus, RefreshCw, Zap } from "lucide-react";
import {
	assignRotEquipmentResponsible,
	createRotEquipment,
	createRotEquipmentAudit,
	deleteRotEquipment,
	fetchRotEquipments,
	fetchRotRegionals,
	updateRotEquipment,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";

// Fiel a rot/src/pages/EquipmentsPage.tsx — cards de ativo (fusion/outro)
// com responsavel + tabela de auditorias recentes.
export default function EquipmentsPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.equipments.manage");
	const [items, setItems] = useState([]);
	const [audits, setAudits] = useState([]);
	const [technicians, setTechnicians] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [formModal, setFormModal] = useState(null);
	const [auditModal, setAuditModal] = useState(null);
	const [auditDetail, setAuditDetail] = useState(null);
	const [transferModal, setTransferModal] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [data, regionalList] = await Promise.all([fetchRotEquipments(), fetchRotRegionals()]);
			setItems(data.items);
			setAudits(data.audits);
			setTechnicians(data.technicians);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os equipamentos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-8">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
						<Cpu size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Equipamentos</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} ativo(s) · controle de equipamentos.</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					{canManage ? (
						<button type="button" onClick={() => setFormModal({ equipment: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-purple-200 hover:bg-purple-700">
							<Plus size={17} /> Adicionar Equipamento
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{items.length ? (
				<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
					{items.map((equipment) => {
						const responsible = technicians.find((t) => t.id === equipment.techId);
						const Icon = equipment.type === "FUSION" ? Zap : Activity;
						return (
							<article key={equipment.id} className="rot-card-hover relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
								{canManage ? (
									<button type="button" onClick={() => setFormModal({ equipment })} className="absolute right-4 top-4 rounded-xl bg-slate-50 p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600">
										<Edit3 size={16} />
									</button>
								) : null}
								<div className="mb-4 flex items-start justify-between">
									<span className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow ${equipment.type === "FUSION" ? "bg-purple-600" : "bg-blue-600"} text-white`}>
										<Icon size={22} />
									</span>
									<div className="pr-10 text-right">
										<p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Série</p>
										<p className="font-mono text-xs font-bold uppercase text-slate-900">{equipment.serialNumber || "—"}</p>
									</div>
								</div>
								<h3 className="text-lg font-black uppercase leading-tight text-slate-900">{equipment.name}</h3>
								<p className="text-xs font-bold uppercase text-slate-400">{equipment.brand}</p>

								<div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
									<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white">
										{responsible?.name?.slice(0, 2).toUpperCase() || "??"}
									</span>
									<div className="min-w-0">
										<p className="truncate text-xs font-black uppercase leading-none text-slate-700">{responsible?.name || "Sem dono"}</p>
										<span className="text-[10px] font-bold uppercase text-purple-600">{regionals.find((r) => r.id === equipment.regionalId)?.name || "Regional n/d"}</span>
									</div>
								</div>

								<div className="mt-4 grid grid-cols-2 gap-2">
									<button type="button" onClick={() => setAuditModal(equipment)} className="rot-btn-tactile flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2.5 text-[10px] font-black uppercase text-white shadow hover:bg-purple-700">
										<ClipboardCheck size={14} /> Auditoria
									</button>
									{canManage ? (
										<button type="button" onClick={() => setTransferModal(equipment)} className="rot-btn-tactile flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 py-2.5 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-200">
											<RefreshCw size={14} /> Trocar resp.
										</button>
									) : null}
								</div>
							</article>
						);
					})}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum equipamento cadastrado.</div>
			)}

			<div className="border-t border-slate-100 pt-6">
				<div className="mb-4 flex items-center gap-3">
					<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><History size={18} /></span>
					<h3 className="text-lg font-black uppercase tracking-tight text-slate-900">Histórico recente</h3>
				</div>
				<div className="overflow-hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
					<table className="w-full min-w-[560px] text-left">
						<thead>
							<tr className="border-b border-slate-100 bg-slate-50/50">
								<th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Data / Hora</th>
								<th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Ativo</th>
								<th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Auditor</th>
								<th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Ver</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-50">
							{audits.slice(0, 10).map((audit) => (
								<tr key={audit.id} className="rot-row-hover">
									<td className="px-6 py-4">
										<p className="text-xs font-bold text-slate-900">{new Date(audit.date).toLocaleDateString("pt-BR")}</p>
										<p className="text-[10px] font-bold uppercase text-slate-400">{new Date(audit.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
									</td>
									<td className="px-6 py-4 text-xs font-black uppercase text-slate-700">{audit.equipmentName}</td>
									<td className="px-6 py-4 text-xs font-bold uppercase text-slate-500">{audit.auditorName}</td>
									<td className="px-6 py-4 text-center">
										<button type="button" onClick={() => setAuditDetail(audit)} className="rot-btn-tactile inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-400 hover:bg-purple-600 hover:text-white">
											<Eye size={16} />
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!audits.length ? <div className="p-10 text-center text-[10px] font-bold uppercase text-slate-300">Nenhuma auditoria realizada ainda.</div> : null}
				</div>
			</div>

			{formModal ? (
				<EquipmentFormModal
					equipment={formModal.equipment}
					regionals={regionals}
					onClose={() => setFormModal(null)}
					onSaved={(saved) => {
						setItems((current) => {
							const exists = current.some((i) => i.id === saved.id);
							return exists ? current.map((i) => (i.id === saved.id ? saved : i)) : [...current, saved];
						});
						setFormModal(null);
					}}
					onDeleted={async () => {
						await deleteRotEquipment(formModal.equipment.id);
						setItems((current) => current.filter((i) => i.id !== formModal.equipment.id));
						setFormModal(null);
					}}
				/>
			) : null}

			{auditModal ? (
				<AuditFormModal
					equipment={auditModal}
					onClose={() => setAuditModal(null)}
					onCreated={(audit) => { setAudits((current) => [audit, ...current]); setAuditModal(null); }}
				/>
			) : null}

			{auditDetail ? <AuditDetailModal audit={auditDetail} onClose={() => setAuditDetail(null)} /> : null}

			{transferModal ? (
				<TransferModal
					equipment={transferModal}
					technicians={technicians.filter((t) => t.regionalId === transferModal.regionalId)}
					onClose={() => setTransferModal(null)}
					onSaved={(updated) => { setItems((current) => current.map((i) => (i.id === updated.id ? updated : i))); setTransferModal(null); }}
				/>
			) : null}
		</div>
	);
}

function EquipmentFormModal({ equipment, regionals, onClose, onSaved, onDeleted }) {
	const isEdit = Boolean(equipment);
	const [name, setName] = useState(equipment?.name || "");
	const [brand, setBrand] = useState(equipment?.brand || "");
	const [serialNumber, setSerialNumber] = useState(equipment?.serialNumber || "");
	const [type, setType] = useState(equipment?.type || "FUSION");
	const [regionalId, setRegionalId] = useState(equipment?.regionalId || regionals[0]?.id || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!name.trim()) {
			setError("Informe o nome do equipamento.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { name: name.trim(), brand, serialNumber, type, regionalId };
			const saved = isEdit ? await updateRotEquipment(equipment.id, payload) : await createRotEquipment(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o equipamento.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar equipamento" : "Novo equipamento"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600"><Cpu size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Nome</span>
					<input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" />
				</label>
				<div className="grid grid-cols-2 gap-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Marca</span>
						<input value={brand} onChange={(e) => setBrand(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Nº de série</span>
						<input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" />
					</label>
				</div>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Tipo</span>
					<select value={type} onChange={(e) => setType(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100">
						<option value="FUSION">Fusão</option>
						<option value="OTHER">Outro</option>
					</select>
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
					<select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100">
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
				</label>
				<div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
					{isEdit ? <button type="button" onClick={onDeleted} className="rot-btn-tactile rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50">Excluir</button> : <span />}
					<div className="flex gap-2">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-purple-600 px-4 py-2 text-sm font-black text-white hover:bg-purple-700 disabled:opacity-60">
							{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar equipamento"}
						</button>
					</div>
				</div>
			</form>
		</ModalShell>
	);
}

const AUDIT_QUESTIONS = ["Estado físico", "Funcionamento", "Limpeza", "Acessórios completos"];

function AuditFormModal({ equipment, onClose, onCreated }) {
	const [responses, setResponses] = useState({});
	const [notes, setNotes] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			const created = await createRotEquipmentAudit(equipment.id, { responses, notes: notes.trim() });
			onCreated(created);
		} catch (err) {
			setError(err?.message || "Não foi possível registrar a auditoria.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={`Auditoria — ${equipment.name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600"><ClipboardCheck size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<div className="space-y-2">
					{AUDIT_QUESTIONS.map((question) => (
						<div key={question} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5">
							<span className="text-sm font-bold text-slate-800">{question}</span>
							<div className="flex gap-1.5">
								{["ok", "issue"].map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setResponses((current) => ({ ...current, [question]: option }))}
										className={`rot-btn-tactile rounded-lg px-2.5 py-1 text-[10px] font-black uppercase ${responses[question] === option ? (option === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "border border-slate-200 text-slate-400"}`}
									>
										{option === "ok" ? "OK" : "Problema"}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
				<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Observações..." className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" />
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-purple-600 px-4 py-2 text-sm font-black text-white hover:bg-purple-700 disabled:opacity-60">{saving ? "Enviando..." : "Registrar auditoria"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function AuditDetailModal({ audit, onClose }) {
	const entries = Object.entries(audit.responses || {});
	return (
		<ModalShell open title={`Auditoria — ${audit.equipmentName}`} description={`${new Date(audit.date).toLocaleString("pt-BR")} · ${audit.auditorName || "—"}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600"><ClipboardCheck size={22} /></span>} onClose={onClose} size="md">
			<div className="space-y-1.5">
				{entries.length ? entries.map(([question, value]) => (
					<div key={question} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
						<span className="text-sm font-bold text-slate-700">{question}</span>
						<span className={`text-xs font-black uppercase ${value === "ok" ? "text-emerald-600" : "text-red-600"}`}>{value === "ok" ? "OK" : "Problema"}</span>
					</div>
				)) : <p className="py-4 text-center text-sm font-bold text-slate-400">Sem respostas registradas.</p>}
				{audit.notes ? <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm italic text-slate-600">"{audit.notes}"</p> : null}
			</div>
		</ModalShell>
	);
}

function TransferModal({ equipment, technicians, onClose, onSaved }) {
	const [techId, setTechId] = useState(equipment.techId || "");
	const [saving, setSaving] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		try {
			const updated = await assignRotEquipmentResponsible(equipment.id, techId || null);
			onSaved(updated);
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={`Trocar responsável — ${equipment.name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><Cpu size={22} /></span>} onClose={onClose} size="sm">
			<form onSubmit={submit} className="space-y-4">
				<select value={techId} onChange={(e) => setTechId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100">
					<option value="">Sem dono</option>
					{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
				</select>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}
