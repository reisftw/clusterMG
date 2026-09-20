import { useEffect, useState } from "react";
import { Check, Download, Edit3, History, Key, Plus, RefreshCw, Trash2, User, X } from "lucide-react";
import {
	approveRotKeyReturn,
	createRotKey,
	deleteRotKey,
	fetchRotKeyHistory,
	fetchRotKeys,
	fetchRotRegionals,
	rejectRotKeyReturn,
	returnRotKey,
	takeRotKey,
	updateRotKey,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const STATUS_LABEL = { available: "Disponível", in_use: "Em uso", awaiting_approval: "Pendente", rejected: "Recusada" };
const STATUS_TONE = {
	available: "bg-emerald-50 text-emerald-700",
	in_use: "bg-blue-50 text-blue-700",
	awaiting_approval: "bg-orange-50 text-orange-700",
	rejected: "bg-red-50 text-red-700",
};

// Fiel a rot/src/pages/KeysPage.tsx — resgate/devolucao/aprovacao de
// chaves de POP, com quem pode gerenciar recebendo edicao/exclusao e
// aprovacao, e qualquer usuario podendo resgatar/devolver.
export default function KeysPage() {
	const { user, hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.keys.manage");
	const currentUserId = user?.id;
	const [items, setItems] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null);
	const [historyFor, setHistoryFor] = useState(null);
	const [busyId, setBusyId] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [keys, regionalList] = await Promise.all([fetchRotKeys(), fetchRotRegionals()]);
			setItems(keys);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as chaves.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const runAction = async (key, action) => {
		setBusyId(key.id);
		setError("");
		try {
			const updated = await action(key.id);
			setItems((current) => current.map((item) => (item.id === key.id ? updated : item)));
		} catch (err) {
			setError(err?.message || "Não foi possível concluir a ação.");
		} finally {
			setBusyId(null);
		}
	};

	const handleDelete = async (key) => {
		if (!window.confirm(`Excluir a chave "${key.name}"?`)) return;
		setError("");
		try {
			await deleteRotKey(key.id);
			setItems((current) => current.filter((item) => item.id !== key.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir a chave.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<Key size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Gestão de Chaves</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} chave(s) · controle de acesso aos POPs.</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					{canManage ? (
						<button type="button" onClick={() => setModal({ key: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
							<Plus size={17} /> Adicionar
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{items.length ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{items.map((key) => (
						<article key={key.id} className="rot-card-hover relative flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<div>
								<div className="mb-3 flex items-start justify-between gap-2">
									<div className="min-w-0">
										<h3 className="truncate font-black text-slate-900">{key.name}</h3>
										<p className="truncate text-xs font-semibold text-slate-400">{key.address || "Sem endereço"}</p>
									</div>
									<span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${STATUS_TONE[key.status]}`}>{STATUS_LABEL[key.status]}</span>
								</div>
								<div className="rounded-xl bg-slate-50 px-3 py-2.5">
									<p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Posse atual</p>
									<div className="flex items-center gap-2">
										<span className={`flex h-8 w-8 items-center justify-center rounded-lg ${key.currentUser ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-400"}`}>
											<User size={16} />
										</span>
										<p className="text-sm font-black text-slate-700">{key.currentUser ? `Com: ${key.currentUser}` : "Na base"}</p>
									</div>
									<p className="mt-1.5 text-[11px] font-semibold text-slate-400">Regional: {regionals.find((r) => r.id === key.regionalId)?.name || "Não definida"}</p>
								</div>
							</div>

							<div className="space-y-2">
								{key.status === "available" ? (
									<button type="button" disabled={busyId === key.id} onClick={() => runAction(key, takeRotKey)} className="rot-btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-black uppercase text-white hover:bg-orange-500 disabled:opacity-60">
										<Download size={16} /> Resgatar Chave
									</button>
								) : null}
								{key.status === "in_use" && key.currentUserId === currentUserId ? (
									<button type="button" disabled={busyId === key.id} onClick={() => runAction(key, returnRotKey)} className="rot-btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-black uppercase text-white hover:bg-blue-700 disabled:opacity-60">
										<RefreshCw size={16} /> Devolver Chave
									</button>
								) : null}
								{key.status === "awaiting_approval" && canManage ? (
									<div className="grid grid-cols-2 gap-2">
										<button type="button" disabled={busyId === key.id} onClick={() => runAction(key, approveRotKeyReturn)} className="rot-btn-tactile flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2.5 text-[11px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-60">
											<Check size={14} /> Aceitar
										</button>
										<button type="button" disabled={busyId === key.id} onClick={() => runAction(key, rejectRotKeyReturn)} className="rot-btn-tactile flex items-center justify-center gap-1 rounded-xl bg-red-600 py-2.5 text-[11px] font-black uppercase text-white hover:bg-red-700 disabled:opacity-60">
											<X size={14} /> Recusar
										</button>
									</div>
								) : null}
							</div>

							<div className="flex items-center gap-2 border-t border-slate-100 pt-3">
								<button type="button" onClick={() => setHistoryFor(key)} className="rot-btn-tactile flex flex-1 items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-orange-50 hover:text-orange-700">
									<span className="flex items-center gap-1.5"><History size={14} /> Ver histórico</span>
								</button>
								{canManage ? (
									<>
										<button type="button" onClick={() => setModal({ key })} className="rot-btn-tactile flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
											<Edit3 size={15} />
										</button>
										<button type="button" onClick={() => handleDelete(key)} className="rot-btn-tactile flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
											<Trash2 size={15} />
										</button>
									</>
								) : null}
							</div>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma chave cadastrada.</div>
			)}

			{modal ? (
				<KeyFormModal
					keyItem={modal.key}
					regionals={regionals}
					onClose={() => setModal(null)}
					onSaved={(saved) => {
						setItems((current) => {
							const exists = current.some((item) => item.id === saved.id);
							return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved];
						});
						setModal(null);
					}}
				/>
			) : null}

			{historyFor ? <KeyHistoryModal keyItem={historyFor} onClose={() => setHistoryFor(null)} /> : null}
		</div>
	);
}

function KeyFormModal({ keyItem, regionals, onClose, onSaved }) {
	const isEdit = Boolean(keyItem);
	const [name, setName] = useState(keyItem?.name || "");
	const [address, setAddress] = useState(keyItem?.address || "");
	const [regionalId, setRegionalId] = useState(keyItem?.regionalId || regionals[0]?.id || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!name.trim()) {
			setError("Informe o nome/identificação do POP.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { name: name.trim(), address, regionalId };
			const saved = isEdit ? await updateRotKey(keyItem.id, payload) : await createRotKey(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a chave.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar chave" : "Nova chave"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Key size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Nome / POP</span>
					<input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Endereço</span>
					<input value={address} onChange={(e) => setAddress(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
					<select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
				</label>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
						{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar chave"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

const ACTION_LABEL = { taken: "Resgatou a chave", return_requested: "Solicitou devolução", return_approved: "Devolução aprovada", return_rejected: "Devolução recusada" };

function KeyHistoryModal({ keyItem, onClose }) {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchRotKeyHistory(keyItem.id)
			.then(setItems)
			.finally(() => setLoading(false));
	}, [keyItem.id]);

	return (
		<ModalShell open title={`Histórico — ${keyItem.name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><History size={22} /></span>} onClose={onClose} size="md">
			{loading ? (
				<Spinner fullScreen={false} />
			) : items.length ? (
				<ul className="space-y-2">
					{items.map((event) => (
						<li key={event.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
							<p className="text-sm font-black text-slate-800">{ACTION_LABEL[event.action] || event.action}</p>
							<p className="text-xs font-semibold text-slate-500">{event.userName || "Sistema"} · {new Date(event.createdAt).toLocaleString("pt-BR")}</p>
						</li>
					))}
				</ul>
			) : (
				<p className="py-6 text-center text-sm font-bold text-slate-400">Nenhum registro de uso ainda.</p>
			)}
		</ModalShell>
	);
}
