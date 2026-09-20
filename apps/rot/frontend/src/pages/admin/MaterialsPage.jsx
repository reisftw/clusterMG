import { useEffect, useState } from "react";
import { Activity, Box, Check, ChevronDown, Eye, History, Package, Plus, Send, Trash2 } from "lucide-react";
import {
	acceptRotSupply,
	approveRotChecklist,
	createRotChecklist,
	createRotMaterialCatalogItem,
	deleteRotChecklist,
	deleteRotMaterialCatalogItem,
	deleteRotSupply,
	deleteRotSupplyHistory,
	fetchRotMaterialCatalog,
	fetchRotMaterials,
	fetchRotSupplyHistory,
	sendRotSupply,
	updateRotMaterialCatalogItem,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import UserAvatar from "../../components/UserAvatar";
import { useRotAuth } from "../../state/RotAuthContext";

// Fiel a rot/src/pages/MaterialsPage.tsx — cards por tecnico com estoque
// aceito/pendente, remessas (envio + aceite) e vistorias (checklist).
// Simplificacao consciente frente ao legado: aceite de material/vistoria
// usa confirmacao simples (nome + horário) em vez de assinatura desenhada
// a mão — o registro de quem aceitou e quando continua fiel.
export default function MaterialsPage() {
	const { user, hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.materials.manage");
	const [technicians, setTechnicians] = useState([]);
	const [supplies, setSupplies] = useState([]);
	const [checklists, setChecklists] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [openHistoryFor, setOpenHistoryFor] = useState(null);
	const [openChecklistsFor, setOpenChecklistsFor] = useState(null);
	const [catalogOpen, setCatalogOpen] = useState(false);
	const [sendModalTech, setSendModalTech] = useState(null);
	const [checklistModalTech, setChecklistModalTech] = useState(null);
	const [checklistDetail, setChecklistDetail] = useState(null);
	const [busyId, setBusyId] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchRotMaterials();
			setTechnicians(data.technicians);
			setSupplies(data.supplies);
			setChecklists(data.checklists);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os materiais.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleAccept = async (supply) => {
		setBusyId(supply.id);
		setError("");
		try {
			const signature = `Aceito por ${user?.name} em ${new Date().toLocaleString("pt-BR")}`;
			const updated = await acceptRotSupply(supply.id, signature);
			setSupplies((current) => current.map((item) => (item.id === updated.id ? updated : item)));
		} catch (err) {
			setError(err?.message || "Não foi possível aceitar o material.");
		} finally {
			setBusyId(null);
		}
	};

	const handleDeleteSupply = async (supply) => {
		if (!window.confirm("Remover este item de estoque?")) return;
		try {
			await deleteRotSupply(supply.id);
			setSupplies((current) => current.filter((item) => item.id !== supply.id));
		} catch (err) {
			setError(err?.message || "Não foi possível remover o item.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<Package size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Materiais / Insumos</h1>
						<p className="text-sm font-semibold text-slate-500">{technicians.length} técnico(s) · estoque, remessas e vistorias.</p>
					</div>
				</div>
				{canManage ? (
					<button type="button" onClick={() => setCatalogOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-extrabold text-white shadow-lg hover:bg-blue-700">
						<Box size={17} /> Gerenciar Catálogo
					</button>
				) : null}
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{technicians.length ? (
				<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
					{technicians.map((tech) => {
						const techSupplies = supplies.filter((s) => s.techId === tech.id);
						const accepted = techSupplies.filter((s) => s.status === "ACCEPTED");
						const pending = techSupplies.filter((s) => s.status === "PENDING");
						const techChecklists = checklists.filter((c) => c.techId === tech.id);
						const isSelf = tech.id === user?.id;

						return (
							<article key={tech.id} className="rot-card-hover flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
								<div className="p-5">
									<div className="mb-4 flex items-start justify-between gap-2">
										<div className="flex items-center gap-3">
											<UserAvatar
												src={tech.avatarUrl}
												name={tech.name}
												className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-sm font-black text-white"
											/>
											<div>
												<h3 className="font-black text-slate-900">{tech.name}</h3>
												<span className="text-xs font-bold text-slate-400">@{tech.username}</span>
											</div>
										</div>
										{canManage ? (
											<div className="flex gap-1.5">
												<button type="button" onClick={() => setChecklistModalTech(tech)} title="Nova vistoria" className="rot-btn-tactile flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-100">
													<Activity size={16} />
												</button>
												<button type="button" onClick={() => setSendModalTech(tech)} title="Enviar material" className="rot-btn-tactile flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow hover:bg-blue-700">
													<Plus size={16} />
												</button>
											</div>
										) : null}
									</div>

									{pending.length ? (
										<div className="mb-4 space-y-1.5">
											<p className="px-1 text-[10px] font-black uppercase tracking-widest text-orange-600">Aguardando aceite</p>
											{pending.map((item) => (
												<div key={item.id} className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
													<span className="text-xs font-black text-orange-800">{item.itemName} · Qtd: {item.quantity}</span>
													{isSelf ? (
														<button type="button" disabled={busyId === item.id} onClick={() => handleAccept(item)} className="rot-btn-tactile flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white hover:bg-emerald-700 disabled:opacity-60">
															<Check size={12} /> Aceitar
														</button>
													) : null}
												</div>
											))}
										</div>
									) : null}

									<p className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Estoque atual</p>
									<div className="mt-1.5 max-h-40 space-y-1.5 overflow-y-auto pr-1">
										{accepted.length ? (
											accepted.map((item) => (
												<div key={item.id} className="group flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
													<span className="text-xs font-black text-slate-700">{item.itemName}</span>
													<div className="flex items-center gap-2">
														<span className="text-xs font-black text-blue-600">Qtd: {item.quantity}</span>
														{canManage ? (
															<button type="button" onClick={() => handleDeleteSupply(item)} className="text-red-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100">
																<Trash2 size={13} />
															</button>
														) : null}
													</div>
												</div>
											))
										) : (
											<p className="p-3 text-center text-xs italic text-slate-300">Vazio.</p>
										)}
									</div>
								</div>

								<div className="space-y-1.5 border-t border-slate-100 bg-slate-50 p-3">
									<CollapsibleRow
										label="Remessas"
										icon={History}
										open={openHistoryFor === tech.id}
										onToggle={() => setOpenHistoryFor((current) => (current === tech.id ? null : tech.id))}
									>
										<SupplyHistoryList techId={tech.id} canManage={canManage} onDeleted={(id) => setSupplies((current) => current.filter((s) => s.historyId !== id))} />
									</CollapsibleRow>
									<CollapsibleRow
										label="Vistorias"
										icon={Activity}
										open={openChecklistsFor === tech.id}
										onToggle={() => setOpenChecklistsFor((current) => (current === tech.id ? null : tech.id))}
									>
										{techChecklists.length ? (
											<div className="space-y-1.5 px-1 py-1">
												{techChecklists.map((checklist) => (
													<div key={checklist.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2">
														<div>
															<p className="text-xs font-black text-slate-900">{new Date(checklist.createdAt).toLocaleDateString("pt-BR")}</p>
															<span className={`text-[10px] font-black uppercase ${checklist.status === "APPROVED" ? "text-emerald-600" : "text-orange-500"}`}>
																{checklist.status === "APPROVED" ? "Aprovada" : "Pendente"}
															</span>
														</div>
														<div className="flex gap-1.5">
															{canManage ? (
																<button type="button" onClick={() => deleteRotChecklist(checklist.id).then(() => setChecklists((c) => c.filter((x) => x.id !== checklist.id)))} className="text-slate-300 hover:text-red-500">
																	<Trash2 size={14} />
																</button>
															) : null}
															<button type="button" onClick={() => setChecklistDetail(checklist)} className="text-slate-400 hover:text-blue-600">
																<Eye size={14} />
															</button>
														</div>
													</div>
												))}
											</div>
										) : (
											<p className="p-3 text-center text-xs italic text-slate-300">Nenhuma vistoria.</p>
										)}
									</CollapsibleRow>
								</div>
							</article>
						);
					})}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum técnico na sua regional.</div>
			)}

			{catalogOpen ? <MaterialCatalogModal onClose={() => setCatalogOpen(false)} /> : null}
			{sendModalTech ? (
				<SendSupplyModal
					tech={sendModalTech}
					onClose={() => setSendModalTech(null)}
					onSent={(created) => {
						setSupplies((current) => [created, ...current]);
						setSendModalTech(null);
					}}
				/>
			) : null}
			{checklistModalTech ? (
				<ChecklistModal
					tech={checklistModalTech}
					onClose={() => setChecklistModalTech(null)}
					onCreated={(created) => {
						setChecklists((current) => [created, ...current]);
						setChecklistModalTech(null);
					}}
				/>
			) : null}
			{checklistDetail ? (
				<ChecklistDetailModal
					checklist={checklistDetail}
					isSelf={checklistDetail.techId === user?.id}
					onClose={() => setChecklistDetail(null)}
					onApproved={(updated) => {
						setChecklists((current) => current.map((c) => (c.id === updated.id ? updated : c)));
						setChecklistDetail(null);
					}}
				/>
			) : null}
		</div>
	);
}

function CollapsibleRow({ label, icon: Icon, open, onToggle, children }) {
	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				className={`rot-btn-tactile flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wide transition ${open ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500"}`}
			>
				<span className="flex items-center gap-2"><Icon size={14} /> {label}</span>
				<ChevronDown size={15} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
			</button>
			{open ? <div className="pt-1.5">{children}</div> : null}
		</div>
	);
}

function SupplyHistoryList({ techId, canManage, onDeleted }) {
	const [items, setItems] = useState(null);

	useEffect(() => {
		fetchRotSupplyHistory(techId).then(setItems);
	}, [techId]);

	if (items === null) return <Spinner fullScreen={false} />;
	if (!items.length) return <p className="p-3 text-center text-xs italic text-slate-300">Nenhuma remessa.</p>;

	return (
		<div className="space-y-1.5 px-1 py-1">
			{items.map((history) => (
				<div key={history.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2">
					<div>
						<p className="text-xs font-black text-slate-900">{history.itemName} · Qtd: {history.quantity}</p>
						<span className={`text-[10px] font-black uppercase ${history.status === "ACCEPTED" ? "text-emerald-600" : "text-orange-500"}`}>
							{history.status === "ACCEPTED" ? "Aceito" : "Pendente"} · {new Date(history.sentAt).toLocaleDateString("pt-BR")}
						</span>
					</div>
					{canManage ? (
						<button
							type="button"
							onClick={() => deleteRotSupplyHistory(history.id).then(() => { setItems((current) => current.filter((x) => x.id !== history.id)); onDeleted(history.id); })}
							className="text-slate-300 hover:text-red-500"
						>
							<Trash2 size={14} />
						</button>
					) : null}
				</div>
			))}
		</div>
	);
}

function MaterialCatalogModal({ onClose }) {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [name, setName] = useState("");
	const [unit, setUnit] = useState("un");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const load = () => fetchRotMaterialCatalog().then((data) => { setItems(data); setLoading(false); });

	useEffect(() => {
		load();
	}, []);

	const submit = async (event) => {
		event.preventDefault();
		if (!name.trim()) return;
		setSaving(true);
		setError("");
		try {
			const created = await createRotMaterialCatalogItem({ name: name.trim(), unit });
			setItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
			setName("");
		} catch (err) {
			setError(err?.message || "Não foi possível adicionar o item.");
		} finally {
			setSaving(false);
		}
	};

	const toggleActive = async (item) => {
		const updated = await updateRotMaterialCatalogItem(item.id, { active: !item.active });
		setItems((current) => current.map((i) => (i.id === updated.id ? updated : i)));
	};

	const remove = async (item) => {
		if (!window.confirm(`Remover "${item.name}" do catálogo?`)) return;
		await deleteRotMaterialCatalogItem(item.id);
		setItems((current) => current.filter((i) => i.id !== item.id));
	};

	return (
		<ModalShell open title="Catálogo de materiais" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Box size={22} /></span>} onClose={onClose} size="lg">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="mb-4 flex gap-2">
				<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do material" className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Un." className="h-11 w-20 rounded-xl border border-slate-200 px-3 text-center text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
					<Plus size={17} />
				</button>
			</form>
			{loading ? (
				<Spinner fullScreen={false} />
			) : (
				<div className="space-y-1.5">
					{items.map((item) => (
						<div key={item.id} className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${item.active ? "border-slate-200" : "border-slate-100 opacity-50"}`}>
							<span className="text-sm font-bold text-slate-800">{item.name} <span className="text-xs text-slate-400">({item.unit})</span></span>
							<div className="flex gap-2">
								<button type="button" onClick={() => toggleActive(item)} className="rot-btn-tactile rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50">
									{item.active ? "Desativar" : "Ativar"}
								</button>
								<button type="button" onClick={() => remove(item)} className="rot-btn-tactile flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
									<Trash2 size={14} />
								</button>
							</div>
						</div>
					))}
					{!items.length ? <p className="py-6 text-center text-sm font-bold text-slate-400">Nenhum material cadastrado.</p> : null}
				</div>
			)}
		</ModalShell>
	);
}

function SendSupplyModal({ tech, onClose, onSent }) {
	const [catalog, setCatalog] = useState([]);
	const [itemName, setItemName] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		fetchRotMaterialCatalog().then((items) => {
			const active = items.filter((i) => i.active);
			setCatalog(active);
			if (active[0]) setItemName(active[0].name);
		});
	}, []);

	const submit = async (event) => {
		event.preventDefault();
		if (!itemName.trim() || !quantity) {
			setError("Selecione o item e a quantidade.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const created = await sendRotSupply({ techId: tech.id, itemName: itemName.trim(), quantity: Number(quantity) });
			onSent(created);
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o material.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={`Enviar material — ${tech.name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Send size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Item</span>
					{catalog.length ? (
						<select value={itemName} onChange={(e) => setItemName(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
							{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
						</select>
					) : (
						<input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Nome do item" className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					)}
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Quantidade</span>
					<input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Enviando..." : "Enviar material"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

function ChecklistModal({ tech, onClose, onCreated }) {
	const [catalog, setCatalog] = useState([]);
	const [responses, setResponses] = useState({});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		fetchRotMaterialCatalog().then((items) => setCatalog(items.filter((i) => i.active)));
	}, []);

	const setResponse = (name, value) => setResponses((current) => ({ ...current, [name]: value }));

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			const created = await createRotChecklist({ techId: tech.id, responses });
			onCreated(created);
		} catch (err) {
			setError(err?.message || "Não foi possível registrar a vistoria.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={`Nova vistoria — ${tech.name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Activity size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				{catalog.length ? (
					<div className="max-h-80 space-y-2 overflow-y-auto pr-1">
						{catalog.map((item) => (
							<div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5">
								<span className="text-sm font-bold text-slate-800">{item.name}</span>
								<div className="flex gap-1.5">
									{["ok", "missing", "damaged"].map((option) => (
										<button
											key={option}
											type="button"
											onClick={() => setResponse(item.name, option)}
											className={`rot-btn-tactile rounded-lg px-2.5 py-1 text-[10px] font-black uppercase ${
												responses[item.name] === option
													? option === "ok" ? "bg-emerald-600 text-white" : option === "missing" ? "bg-orange-500 text-white" : "bg-red-600 text-white"
													: "border border-slate-200 text-slate-400"
											}`}
										>
											{option === "ok" ? "OK" : option === "missing" ? "Falta" : "Avariado"}
										</button>
									))}
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm font-bold text-slate-400">Cadastre itens no catálogo para montar a vistoria.</p>
				)}
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
						{saving ? "Enviando..." : "Enviar vistoria"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

const RESPONSE_LABEL = { ok: "OK", missing: "Falta", damaged: "Avariado" };

function ChecklistDetailModal({ checklist, isSelf, onClose, onApproved }) {
	const [approving, setApproving] = useState(false);
	const [error, setError] = useState("");
	const entries = Object.entries(checklist.responses || {});

	const approve = async () => {
		setApproving(true);
		setError("");
		try {
			const signature = `Aprovado por ${checklist.techName} em ${new Date().toLocaleString("pt-BR")}`;
			const updated = await approveRotChecklist(checklist.id, signature);
			onApproved(updated);
		} catch (err) {
			setError(err?.message || "Não foi possível aprovar a vistoria.");
		} finally {
			setApproving(false);
		}
	};

	return (
		<ModalShell
			open
			title={`Vistoria — ${checklist.techName}`}
			description={`${new Date(checklist.createdAt).toLocaleString("pt-BR")} · Inspetor: ${checklist.inspectorName || "—"}`}
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Activity size={22} /></span>}
			onClose={onClose}
			size="md"
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<div className="space-y-1.5">
				{entries.length ? entries.map(([itemName, value]) => (
					<div key={itemName} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
						<span className="text-sm font-bold text-slate-700">{itemName}</span>
						<span className={`text-xs font-black uppercase ${value === "ok" ? "text-emerald-600" : value === "missing" ? "text-orange-500" : "text-red-600"}`}>{RESPONSE_LABEL[value] || value}</span>
					</div>
				)) : <p className="py-4 text-center text-sm font-bold text-slate-400">Sem itens registrados.</p>}
			</div>
			<div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
				<span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${checklist.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
					{checklist.status === "APPROVED" ? "Aprovada" : "Aguardando aprovação do técnico"}
				</span>
				{isSelf && checklist.status !== "APPROVED" ? (
					<button type="button" onClick={approve} disabled={approving} className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
						<Check size={16} /> {approving ? "Aprovando..." : "Aprovar vistoria"}
					</button>
				) : null}
			</div>
		</ModalShell>
	);
}
