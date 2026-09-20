import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Clipboard, Edit3, Eye, MapPin, Package, Plus, Route, Trash2, Zap } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
	createRotRompimento,
	createRotRompimentoDraft,
	deleteRotRompimento,
	fetchRotMaterialCatalog,
	fetchRotRegionals,
	fetchRotRompimentoBases,
	fetchRotRompimentos,
	saveRotRompimentoBase,
	updateRotRompimento,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import ImageUploader from "../../components/ImageUploader";
import { captureLocation } from "../../utils/captureLocation";
import { enqueueRotAction, isNetworkFailure, queuedRotActionCount } from "../../utils/offlineRotQueue";
import { useRotAuth } from "../../state/useRotAuth";
import { buildRompimentoPayload } from "./rompimentoPayload";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ROMPIMENTOS_CACHE_KEY = "rot-rompimentos-cache";
const DEFAULT_ROMPIMENTO_MATERIALS = [
	"CEO",
	"CTO",
	"SUPRA",
	"OLHAU",
	"BAP",
	"FITA DE AÇO",
	"FECHO",
	"PLAQUETA",
	"ALÇA 06FO",
	"ALÇA 12FO",
	"ALÇA 24FO",
	"ALÇA 36FO",
	"ALÇA 48FO",
	"ALÇA 72FO",
	"TUBETE",
];
const FIBRA_OPTIONS = ["06FO", "12FO", "24FO", "36FO", "72FO", "144FO"].map((item) => `AS80 ${item}`);

function normalizeMateriais(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.entries(value).reduce((acc, [name, quantity]) => {
		const label = String(name || "").trim().toUpperCase();
		const parsed = Number(quantity);
		if (label && Number.isFinite(parsed) && parsed > 0) acc[label] = parsed;
		return acc;
	}, {});
}

function materialOptions(catalog = []) {
	const activeCatalog = catalog
		.filter((item) => item?.active !== false && item?.name)
		.map((item) => String(item.name).trim().toUpperCase())
		.filter(Boolean);
	return Array.from(new Set([...DEFAULT_ROMPIMENTO_MATERIALS, ...activeCatalog]));
}

function buildRompimentoTicketText(item, regionals = []) {
	const regionalName = regionals.find((r) => r.id === item.regionalId)?.name || "Regional não informada";
	const materiais = Object.entries(normalizeMateriais(item.materiais));
	const materiaisText = materiais.length
		? materiais.map(([name, quantity]) => `- ${name}: ${quantity}`).join("\n")
		: "- Sem materiais informados";
	const fibra = item.fibraGasta?.tipo ? `${item.fibraGasta.tipo} (${item.fibraGasta.metros || 0}m)` : "Não informada";
	const pontoA = item.pontoA ? `https://www.google.com/maps?q=${item.pontoA.lat},${item.pontoA.lng}` : "Não informado";
	const pontoB = item.pontoB ? `https://www.google.com/maps?q=${item.pontoB.lat},${item.pontoB.lng}` : "Não informado";
	const rota = item.pontoA && item.pontoB ? `https://www.google.com/maps/dir/${item.pontoA.lat},${item.pontoA.lng}/${item.pontoB.lat},${item.pontoB.lng}` : "Não informada";
	return [
		"*ROMPIMENTO REGISTRADO*",
		item.ticketNumber ? `Ticket: ${item.ticketNumber}` : null,
		item.status === "em_tratativa" ? "Status: Em tratativa" : "Status: Concluído",
		item.createdByName ? `Responsável: ${item.createdByName}` : null,
		item.status === "em_tratativa" && item.updatedAt ? `Última atualização: ${formatDateTime(item.updatedAt)}` : null,
		item.status !== "em_tratativa" && item.updatedAt ? `Finalizado em: ${formatDateTime(item.updatedAt)}` : null,
		`Cidade/Local: ${item.cidade || "Não informada"}`,
		`Regional: ${regionalName}`,
		item.distanciaBase !== null && item.distanciaBase !== undefined ? `Distância da base: ${item.distanciaBase} km` : null,
		"",
		"*MATERIAIS GASTOS:*",
		materiaisText,
		`- Fibra: ${fibra}`,
		item.outros ? `- Outros: ${item.outros}` : null,
		"",
		`Ponto A: ${pontoA}`,
		`Ponto B: ${pontoB}`,
		`Rota: ${rota}`,
	].filter((line) => line !== null).join("\n");
}

function formatDateTime(value) {
	if (!value) return "";
	return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Fiel a rot/src/pages/RompimentosPage.tsx: pontos A/B, bases regionais,
// fibra lancada e materiais consumidos com quantidade por item.
export default function RompimentosPage() {
	const { user, hasPermission } = useRotAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const canManage = hasPermission("rot.rompimentos.manage");
	const canCreate = canManage || hasPermission("rot.rompimentos.view");
	const [items, setItems] = useState([]);
	const [bases, setBases] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [catalog, setCatalog] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [info, setInfo] = useState("");
	const [queued, setQueued] = useState(0);
	const [mes, setMes] = useState(new Date().getMonth());
	const [regionalFiltro, setRegionalFiltro] = useState("all");
	const [modal, setModal] = useState(null);
	const [ticketModal, setTicketModal] = useState(false);
	const [baseModal, setBaseModal] = useState(false);
	const [basesModal, setBasesModal] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		setInfo("");
		try {
			const [rompimentos, basesList, regionalList, catalogList] = await Promise.all([fetchRotRompimentos(), fetchRotRompimentoBases(), fetchRotRegionals(), fetchRotMaterialCatalog()]);
			setItems(rompimentos);
			setBases(basesList);
			setRegionals(regionalList);
			setCatalog(catalogList);
			localStorage.setItem(ROMPIMENTOS_CACHE_KEY, JSON.stringify({ items: rompimentos, bases: basesList, regionals: regionalList, catalog: catalogList, savedAt: new Date().toISOString() }));
		} catch (err) {
			const cached = JSON.parse(localStorage.getItem(ROMPIMENTOS_CACHE_KEY) || "null");
			if (cached?.regionals?.length) {
				setItems(cached.items || []);
				setBases(cached.bases || []);
				setRegionals(cached.regionals || []);
				setCatalog(cached.catalog || []);
				setInfo("Você está offline. Usando dados salvos neste aparelho; novos rompimentos serão sincronizados quando a internet voltar.");
			} else {
				setError(err?.message || "Não foi possível carregar os rompimentos.");
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	useEffect(() => {
		let active = true;
		const refreshQueue = () => queuedRotActionCount().then((count) => { if (active) setQueued(count); });
		const synced = () => {
			setInfo("Registros offline sincronizados.");
			load();
		};
		refreshQueue();
		window.addEventListener("rot-offline-action-queue-changed", refreshQueue);
		window.addEventListener("rot-offline-action-synced", synced);
		return () => {
			active = false;
			window.removeEventListener("rot-offline-action-queue-changed", refreshQueue);
			window.removeEventListener("rot-offline-action-synced", synced);
		};
	}, []);

	const filtrados = useMemo(
		() => items.filter((item) => {
			const data = new Date(item.createdAt);
			if (data.getMonth() !== Number(mes)) return false;
			if (regionalFiltro !== "all" && item.regionalId !== regionalFiltro) return false;
			return true;
		}),
		[items, mes, regionalFiltro],
	);

	const totalKm = filtrados.reduce((sum, item) => sum + Number(item.distanciaBase || 0), 0);
	const minhaTratativaAberta = items.find((item) => item.status === "em_tratativa" && item.createdBy === user?.id);

	const handleDelete = async (item) => {
		if (!window.confirm(`Excluir o rompimento ${item.ticketNumber ? `do ticket ${item.ticketNumber}` : "selecionado"}?`)) return;
		try {
			await deleteRotRompimento(item.id);
			setItems((current) => current.filter((i) => i.id !== item.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o rompimento.");
		}
	};

	const handleCopy = async (item) => {
		const text = buildRompimentoTicketText(item, regionals);
		try {
			await navigator.clipboard.writeText(text);
			setInfo("Conteúdo do rompimento copiado para colar no ticket.");
		} catch (_) {
			window.prompt("Copie o conteúdo do rompimento:", text);
		}
	};

	const handleNewRompimento = useCallback(() => {
		if (minhaTratativaAberta) {
			setInfo("Você já tem um rompimento em tratativa. Finalize ele antes de abrir outro.");
			setModal({ item: minhaTratativaAberta });
			return;
		}
		setTicketModal(true);
	}, [minhaTratativaAberta]);

	useEffect(() => {
		if (loading || searchParams.get("novo") !== "1" || !canCreate) return;
		handleNewRompimento();
		setSearchParams({}, { replace: true });
	}, [loading, searchParams, canCreate, setSearchParams, handleNewRompimento]);

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
						<Zap size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Rompimentos</h1>
						<p className="text-sm font-semibold text-slate-500">{filtrados.length} registro(s) · {totalKm.toFixed(2)} km até a base.</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100">
						{MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
					</select>
					<select value={regionalFiltro} onChange={(e) => setRegionalFiltro(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100">
						<option value="all">Todas Regionais</option>
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
					{canCreate ? (
						<>
							{canManage ? (
								<>
									<button type="button" onClick={() => setBasesModal(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-950 shadow-sm hover:bg-blue-50">
										<Eye size={16} /> Ver Bases
									</button>
									<button type="button" onClick={() => setBaseModal(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-950 px-4 text-sm font-bold text-white shadow hover:bg-blue-900">
										<MapPin size={16} /> Configurar Base
									</button>
								</>
							) : null}
							<button type="button" onClick={handleNewRompimento} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-red-200 hover:bg-red-700">
								<Plus size={17} /> Novo Rompimento
							</button>
						</>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			{info ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{info}</div> : null}
			{queued ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">{queued} registro(s) offline aguardando sincronização.</div> : null}

			{filtrados.length ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{filtrados.map((item) => (
						<article key={item.id} className="rot-card-hover relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							{canManage || item.createdBy === user?.id ? (
								<div className="absolute right-3 top-3 flex gap-1">
									<button type="button" onClick={() => handleCopy(item)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Copiar para ticket"><Clipboard size={14} /></button>
									<button type="button" onClick={() => setModal({ item })} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 size={14} /></button>
									{canManage ? <button type="button" onClick={() => handleDelete(item)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button> : null}
								</div>
							) : null}
							<div className="pr-16">
								{item.status === "em_tratativa" ? (
									<span className="mb-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-700">Em tratativa</span>
								) : null}
								<h3 className="text-base font-black text-slate-900">{item.ticketNumber ? `Ticket ${item.ticketNumber}` : "Rompimento"}</h3>
								<p className="text-xs font-bold uppercase text-slate-400">{item.cidade || "Cidade n/d"} · {regionals.find((r) => r.id === item.regionalId)?.name}</p>
								{item.createdByName ? <p className="mt-1 text-[11px] font-bold text-slate-400">Responsável: {item.createdByName}</p> : null}
								{item.status === "em_tratativa" && item.updatedAt ? <p className="mt-1 text-[11px] font-black text-amber-700">Última atualização: {formatDateTime(item.updatedAt)}</p> : null}
								{item.status !== "em_tratativa" && item.updatedAt ? <p className="mt-1 text-[11px] font-black text-emerald-700">Finalizado em: {formatDateTime(item.updatedAt)}</p> : null}
							</div>
							<div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
								{item.distanciaBase !== null ? (
									<div className="flex items-center gap-2"><Route size={13} className="text-orange-500" /> <span>{item.distanciaBase} km até a base</span></div>
								) : null}
								{item.fibraGasta?.tipo ? <p>Fibra: {item.fibraGasta.tipo} ({item.fibraGasta.metros || 0}m)</p> : null}
								<p className={Number(item.imageCount || 0) > 0 ? "font-bold text-emerald-700" : "font-bold text-red-600"}>
									Fotos: {Number(item.imageCount || 0)}
								</p>
								<MaterialSummary materiais={item.materiais} outros={item.outros} />
								{item.pontoA&&<a className="block text-blue-700 underline" href={`https://www.google.com/maps?q=${item.pontoA.lat},${item.pontoA.lng}`} target="_blank" rel="noreferrer">Ponto A (início): {Number(item.pontoA.lat).toFixed(6)}, {Number(item.pontoA.lng).toFixed(6)}</a>}
								{item.pontoB&&<a className="block text-blue-700 underline" href={`https://www.google.com/maps?q=${item.pontoB.lat},${item.pontoB.lng}`} target="_blank" rel="noreferrer">Ponto B (fim): {Number(item.pontoB.lat).toFixed(6)}, {Number(item.pontoB.lng).toFixed(6)}</a>}
								{item.pontoA&&item.pontoB&&<a className="block text-blue-700 underline" href={`https://www.google.com/maps/dir/${item.pontoA.lat},${item.pontoA.lng}/${item.pontoB.lat},${item.pontoB.lng}`} target="_blank" rel="noreferrer">Rota entre A e B</a>}
							</div>
							<button type="button" onClick={() => handleCopy(item)} className="rot-btn-tactile mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase text-emerald-700 hover:bg-emerald-100">
								<Clipboard size={14} /> Copiar para ticket
							</button>
							<p className="mt-2 text-[10px] font-bold text-slate-400">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</p>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm font-bold text-slate-400">Nenhum rompimento neste período.</div>
			)}

			{modal ? (
				<RompimentoFormModal
					item={modal.item}
					regionals={regionals}
					catalog={catalog}
					user={user}
					onClose={() => setModal(null)}
					onSaved={(saved, options = {}) => {
						setItems((current) => {
							const exists = current.some((i) => i.id === saved.id);
							return exists ? current.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...current];
						});
						if (options.keepOpen) {
							setModal({ item: saved });
							setInfo("Andamento do rompimento salvo.");
						} else {
							setModal(null);
						}
					}}
					onQueued={(saved) => {
						setItems((current) => [saved, ...current]);
						setInfo("Rompimento salvo offline. Ele será enviado automaticamente quando a internet voltar.");
						queuedRotActionCount().then(setQueued);
						setModal(null);
					}}
				/>
			) : null}

			{ticketModal ? (
				<TicketStartModal
					regionals={regionals}
					defaultRegionalId={user?.regionalId || regionals[0]?.id || ""}
					onClose={() => setTicketModal(false)}
					onCreated={(draft) => {
						setItems((current) => [draft, ...current]);
						setTicketModal(false);
						setModal({ item: draft });
					}}
				/>
			) : null}

			{baseModal ? (
				<BaseConfigModal regionals={regionals} bases={bases} onClose={() => setBaseModal(false)} onSaved={load} />
			) : null}

			{basesModal ? (
				<BasesListModal regionals={regionals} bases={bases} onClose={() => setBasesModal(false)} />
			) : null}
		</div>
	);
}

function MaterialSummary({ materiais, outros }) {
	const entries = Object.entries(normalizeMateriais(materiais));
	if (!entries.length && !outros) {
		return <p className="italic text-slate-400">Sem materiais informados.</p>;
	}
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-1.5 font-black uppercase text-slate-500">
				<Package size={12} /> Materiais gastos
			</div>
			{entries.length ? (
				<div className="flex flex-wrap gap-1.5">
					{entries.map(([name, quantity]) => (
						<span key={name} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
							{name}: {quantity}
						</span>
					))}
				</div>
			) : null}
			{outros ? <p className="italic text-slate-500">Outros: {outros}</p> : null}
		</div>
	);
}

function TicketStartModal({ regionals, defaultRegionalId, onClose, onCreated }) {
	const [ticketNumber, setTicketNumber] = useState("");
	const [regionalId, setRegionalId] = useState(defaultRegionalId);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!ticketNumber.trim()) {
			setError("Informe o número do ticket.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const draft = await createRotRompimentoDraft({ ticketNumber: ticketNumber.trim(), regionalId });
			onCreated(draft);
		} catch (err) {
			setError(err?.message || "Não foi possível abrir a tratativa do rompimento.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Abrir rompimento" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Zap size={22} /></span>} onClose={onClose} size="sm">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Número do ticket</span>
					<input value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} autoFocus placeholder="Ex: 123456" className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-black outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
					<select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100">
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
				</label>
				<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
					Esse ticket ficará como <b>Em tratativa</b> até o rompimento ser finalizado. Enquanto ele estiver aberto, não será possível abrir outro rompimento para o mesmo usuário.
				</div>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">{saving ? "Abrindo..." : "Continuar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function RompimentoFormModal({ item, regionals, catalog, user, onClose, onSaved, onQueued }) {
	const isEdit = Boolean(item);
	const isTratativa = item?.status === "em_tratativa";
	const [regionalId, setRegionalId] = useState(item?.regionalId || regionals[0]?.id || "");
	const [ticketNumber, setTicketNumber] = useState(item?.ticketNumber || "");
	const [cidade, setCidade] = useState(item?.cidade || "");
	const [pontoALat, setPontoALat] = useState(item?.pontoA?.lat ?? "");
	const [pontoALng, setPontoALng] = useState(item?.pontoA?.lng ?? "");
	const [pontoB, setPontoB] = useState(item?.pontoB || null);
	const [gps, setGps] = useState("");
	const markPoint = async (point) => {
		setGps(point); setError("");
		try { const position = await captureLocation();
			if (point === "A") { setPontoALat(position.lat); setPontoALng(position.lng); }
			else setPontoB({lat:position.lat,lng:position.lng});
		} catch (e) { setError(e.message); } finally { setGps(""); }
	};
	const [materiais, setMateriais] = useState(normalizeMateriais(item?.materiais));
	const [outros, setOutros] = useState(item?.outros || "");
	const [fibraTipo, setFibraTipo] = useState(item?.fibraGasta?.tipo || "AS80 06FO");
	const [fibraMetros, setFibraMetros] = useState(item?.fibraGasta?.metros ?? "");
	const [imageCount, setImageCount] = useState(Number(item?.imageCount || 0));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [materialModal, setMaterialModal] = useState(false);
	const options = materialOptions(catalog);
	const materiaisSelecionados = Object.entries(normalizeMateriais(materiais));
	const canFinalize = Boolean(
		ticketNumber.trim()
			&& regionalId
			&& cidade.trim()
			&& pontoALat !== ""
			&& pontoALng !== ""
			&& pontoB
			&& fibraTipo.trim()
			&& Number(fibraMetros) > 0
			&& materiaisSelecionados.length > 0
			&& imageCount > 0,
	);

	const setMaterialQty = (name, value) => {
		const quantity = Math.max(0, Number.parseInt(value, 10) || 0);
		setMateriais((current) => {
			const next = { ...current };
			if (quantity > 0) next[name] = quantity;
			else delete next[name];
			return next;
		});
	};

	const persist = async (nextStatus) => {
		if (!regionalId) {
			setError("Informe a regional.");
			return;
		}
		if (nextStatus === "concluido") {
			if (!canFinalize) { setError("Preencha todos os campos obrigatórios e anexe pelo menos 1 imagem antes de finalizar."); return; }
		}
		setSaving(true);
		setError("");
		// payload declarado fora do try: o catch precisa dele pra enfileirar
		// a acao offline (era declarado com `const` dentro do try, fora de
		// escopo no catch — ReferenceError sempre que a criacao falhasse por
		// rede, exatamente o cenario que esse fallback deveria tratar).
		const payload = buildRompimentoPayload({
			regionalId,
			ticketNumber,
			nextStatus,
			cidade,
			pontoALat,
			pontoALng,
			pontoB,
			materiais,
			outros,
			fibraTipo,
			fibraMetros,
		});
		try {
			const saved = isEdit ? await updateRotRompimento(item.id, payload) : await createRotRompimento(payload);
			onSaved(saved, { keepOpen: nextStatus === "em_tratativa" });
		} catch (err) {
			if (!isEdit && isNetworkFailure(err)) {
				const queued = await enqueueRotAction("rompimento:create", payload, { clienteNome: payload.clienteNome, cidade: payload.cidade });
				onQueued({
					id: queued.id,
					regionalId: payload.regionalId,
					clienteNome: "",
					cidade: payload.cidade,
					pontoA: payload.pontoA,
					pontoB: payload.pontoB,
					distanciaBase: null,
					materiais: payload.materiais,
					outros: payload.outros,
					fibraGasta: { tipo: payload.fibraTipo, metros: payload.fibraMetros ? Number(payload.fibraMetros) : null },
					createdBy: user?.id,
					createdAt: new Date().toISOString(),
					offline: true,
				});
				return;
			}
			setError(err?.message || "Não foi possível salvar o rompimento.");
		} finally {
			setSaving(false);
		}
	};

	const submit = (event) => {
		event.preventDefault();
		persist("concluido");
	};

	return (
		<ModalShell open title={isEdit ? "Editar rompimento" : "Novo rompimento"} description={ticketNumber ? `Ticket ${ticketNumber}${isTratativa ? " · Em tratativa" : ""}` : ""} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Zap size={22} /></span>} onClose={onClose} size="lg">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
					<p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Ticket em atendimento</p>
					<input value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-amber-200 bg-white px-4 text-sm font-black text-amber-950 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
				</div>
				{item?.id ? (
					<ImageUploader entityType="ROMPIMENTO" entityId={item.id} required onCountChange={setImageCount} />
				) : (
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">Abra a tratativa para anexar imagens.</div>
				)}
				<div className="grid gap-3 sm:grid-cols-2">
					<button type="button" disabled={!!gps || saving} onClick={()=>markPoint("A")} className="flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 font-bold text-blue-900 disabled:opacity-50"><MapPin size={18}/>{gps==="A"?"Buscando GPS...":pontoALat!==""?"Marcar novamente ponto A":"Marcar ponto A (início)"}</button>
					<button type="button" disabled={!!gps || saving} onClick={()=>markPoint("B")} className="flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 p-3 font-bold text-orange-900 disabled:opacity-50"><MapPin size={18}/>{gps==="B"?"Buscando GPS...":pontoB?"Marcar novamente ponto B":"Marcar ponto B (fim)"}</button>
				</div>
				{pontoB&&<p className="text-sm break-words">Ponto B: {Number(pontoB.lat).toFixed(6)}, {Number(pontoB.lng).toFixed(6)}</p>}
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Cidade / local *</span>
						<input value={cidade} onChange={(e) => setCidade(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
					</label>
					<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
						<p className="font-black uppercase text-slate-700">Obrigatórios</p>
						<p>Ticket, regional, cidade/local, ponto A, ponto B, fibra, metragem, materiais e pelo menos 1 imagem.</p>
					</div>
				</div>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional *</span>
					<select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100">
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
				</label>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Latitude do ponto A</span>
						<input type="number" step="any" value={pontoALat} onChange={(e) => setPontoALat(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Longitude do ponto A</span>
						<input type="number" step="any" value={pontoALng} onChange={(e) => setPontoALng(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
					</label>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Tipo de fibra *</span>
						<select value={fibraTipo} onChange={(e) => setFibraTipo(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-black outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100">
							{FIBRA_OPTIONS.map((option) => <option key={option} value={option}>{option.replace("AS80 ", "")}</option>)}
						</select>
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Metros gastos *</span>
						<input type="number" value={fibraMetros} onChange={(e) => setFibraMetros(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
					</label>
				</div>
				<section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-2">
							<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Box size={18} /></span>
							<div>
								<h3 className="text-sm font-black uppercase text-slate-900">Materiais Utilizados</h3>
								<p className="text-xs font-semibold text-slate-500">Adicione somente os itens usados neste rompimento.</p>
							</div>
						</div>
						<button type="button" onClick={() => setMaterialModal(true)} className="rot-btn-tactile inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 text-xs font-black uppercase text-white shadow-sm hover:bg-blue-900">
							<Plus size={16} /> Adicionar material
						</button>
					</div>

					{materiaisSelecionados.length ? (
						<div className="grid gap-2 sm:grid-cols-2">
							{materiaisSelecionados.map(([name, quantity]) => (
								<div key={name} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
									<div className="min-w-0">
										<p className="truncate text-xs font-black uppercase text-slate-800">{name}</p>
										<p className="text-[11px] font-semibold text-slate-400">Quantidade: {quantity}</p>
									</div>
									<div className="flex items-center gap-2">
										<input
											type="number"
											min="1"
											value={quantity}
											onChange={(e) => setMaterialQty(name, e.target.value)}
											className="h-9 w-20 rounded-xl border border-slate-200 px-2 text-center text-sm font-black text-blue-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
											aria-label={`Quantidade de ${name}`}
										/>
										<button type="button" onClick={() => setMaterialQty(name, 0)} className="rot-btn-tactile flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remover ${name}`}>
											<Trash2 size={16} />
										</button>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center">
							<Package size={28} className="mx-auto mb-2 text-slate-300" />
							<p className="text-sm font-black text-slate-600">Nenhum material adicionado.</p>
							<p className="text-xs font-semibold text-slate-400">Clique em “Adicionar material” e informe apenas o que foi gasto.</p>
						</div>
					)}
				</section>
				{materialModal ? (
					<MaterialPickerModal
						options={options}
						selected={materiais}
						onAdd={(name, quantity) => {
							setMaterialQty(name, quantity);
							setMaterialModal(false);
						}}
						onClose={() => setMaterialModal(false)}
					/>
				) : null}
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Outros materiais / observações</span>
					<input value={outros} onChange={(e) => setOutros(e.target.value.toUpperCase())} placeholder="Ex: ALÇAS EXTRAS, CONECTORES..." className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
				</label>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					{isTratativa ? (
						<button type="button" onClick={() => persist("em_tratativa")} disabled={saving} className="rot-btn-tactile rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60">{saving ? "Salvando..." : "Salvar andamento"}</button>
					) : null}
					{canFinalize ? (
						<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">{saving ? "Salvando..." : "Finalizar rompimento"}</button>
					) : (
						<span className="inline-flex items-center rounded-xl bg-slate-100 px-4 py-2 text-xs font-black uppercase text-slate-500">Preencha os obrigatórios e 1 imagem</span>
					)}
				</div>
			</form>
		</ModalShell>
	);
}

function MaterialPickerModal({ options, selected, onAdd, onClose }) {
	const availableOptions = options.filter((name) => !selected[name]);
	const [search, setSearch] = useState("");
	const [material, setMaterial] = useState(availableOptions[0] || "");
	const [quantity, setQuantity] = useState(1);
	const filtered = availableOptions.filter((name) => name.includes(search.trim().toUpperCase()));
	const chosen = filtered.includes(material) ? material : filtered[0] || "";

	const addMaterial = () => {
		if (!chosen) return;
		onAdd(chosen, quantity);
	};

	return (
		<ModalShell open title="Adicionar material" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Package size={22} /></span>} onClose={onClose} size="sm">
			<div className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Buscar material</span>
					<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite para filtrar..." autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Material</span>
					<select value={chosen} onChange={(e) => setMaterial(e.target.value)} disabled={!filtered.length} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400">
						{filtered.length ? filtered.map((name) => <option key={name} value={name}>{name}</option>) : <option value="">Nenhum item disponível</option>}
					</select>
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Quantidade</span>
					<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-black text-blue-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
					<button type="button" onClick={addMaterial} disabled={!chosen} className="rot-btn-tactile rounded-xl bg-blue-950 px-4 py-2 text-sm font-black text-white hover:bg-blue-900 disabled:opacity-60">Adicionar</button>
				</div>
			</div>
		</ModalShell>
	);
}

function BasesListModal({ regionals, bases, onClose }) {
	return (
		<ModalShell open title="Bases cadastradas" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-900"><MapPin size={22} /></span>} onClose={onClose} size="lg">
			<div className="grid gap-3 sm:grid-cols-2">
				{regionals.map((regional) => {
					const base = bases.find((item) => item.regionalId === regional.id);
					return (
						<article key={regional.id} className={`rounded-2xl border p-4 ${base ? "border-blue-100 bg-blue-50/40" : "border-slate-200 bg-slate-50"}`}>
							<div className="flex items-start justify-between gap-3">
								<div>
									<h3 className="text-sm font-black text-slate-900">{regional.name}</h3>
									{base ? (
										<p className="mt-1 text-xs font-semibold text-slate-600">{Number(base.lat).toFixed(6)}, {Number(base.lng).toFixed(6)}</p>
									) : (
										<p className="mt-1 text-xs font-bold text-slate-400">Sem base cadastrada.</p>
									)}
								</div>
								{base ? (
									<a className="rot-btn-tactile rounded-xl bg-blue-950 px-3 py-2 text-xs font-black text-white" href={`https://www.google.com/maps?q=${base.lat},${base.lng}`} target="_blank" rel="noreferrer">
										Mapa
									</a>
								) : null}
							</div>
						</article>
					);
				})}
			</div>
		</ModalShell>
	);
}

function BaseConfigModal({ regionals, bases, onClose, onSaved }) {
	const [regionalId, setRegionalId] = useState(regionals[0]?.id || "");
	const base = bases.find((b) => b.regionalId === regionalId);
	const [lat, setLat] = useState(base?.lat ?? "");
	const [lng, setLng] = useState(base?.lng ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const trocarRegional = (id) => {
		setRegionalId(id);
		const b = bases.find((item) => item.regionalId === id);
		setLat(b?.lat ?? "");
		setLng(b?.lng ?? "");
	};

	const submit = async (event) => {
		event.preventDefault();
		if (lat === "" || lng === "") {
			setError("Informe latitude e longitude.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await saveRotRompimentoBase(regionalId, { lat: Number(lat), lng: Number(lng) });
			await onSaved();
			onClose();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a base.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Configurar base da regional" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-900"><MapPin size={22} /></span>} onClose={onClose} size="sm">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
					<select value={regionalId} onChange={(e) => trocarRegional(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
				</label>
				<div className="grid grid-cols-2 gap-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Latitude</span>
						<input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Longitude</span>
						<input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					</label>
				</div>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-900 px-4 py-2 text-sm font-black text-white hover:bg-blue-950 disabled:opacity-60">{saving ? "Salvando..." : "Salvar base"}</button>
				</div>
			</form>
		</ModalShell>
	);
}
