import { useEffect, useState } from "react";
import { CheckCircle, Clock, CloudLightning, Plus, RefreshCw, Trash2, Umbrella, User } from "lucide-react";
import { createRotRainAlert, deleteRotRainAlert, fetchRotRainAlerts, fetchRotRegionals, stopRotRainAlert } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { enqueueRotAction, isNetworkFailure, queuedRotActionCount } from "../../utils/offlineRotQueue";
import { useRotAuth } from "../../state/RotAuthContext";

const RAIN_CACHE_KEY = "rot-rain-cache";

function formatDate(value) {
	return new Date(value).toLocaleDateString("pt-BR");
}
function formatTime(value) {
	return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Fiel a rot/src/pages/RainPage.tsx — historico/alertas ativos de chuva
// por regional, tecnico declara inicio e ele mesmo (ou gestor) encerra.
export default function RainPage() {
	const { user, hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.rain.manage");
	const [alerts, setAlerts] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [filtroRegional, setFiltroRegional] = useState("all");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [info, setInfo] = useState("");
	const [queued, setQueued] = useState(0);
	const [showModal, setShowModal] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		setInfo("");
		try {
			const [items, regionalList] = await Promise.all([fetchRotRainAlerts(), fetchRotRegionals()]);
			setAlerts(items);
			setRegionals(regionalList);
			localStorage.setItem(RAIN_CACHE_KEY, JSON.stringify({ alerts: items, regionals: regionalList, savedAt: new Date().toISOString() }));
		} catch (err) {
			const cached = JSON.parse(localStorage.getItem(RAIN_CACHE_KEY) || "null");
			if (cached?.regionals?.length) {
				setAlerts(cached.alerts || []);
				setRegionals(cached.regionals || []);
				setInfo("Você está offline. Usando histórico salvo neste aparelho; novas chuvas serão sincronizadas quando a internet voltar.");
			} else {
				setError(err?.message || "Não foi possível carregar os alertas de chuva.");
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

	const visible = alerts.filter((a) => filtroRegional === "all" || a.regionalId === filtroRegional);

	const handleStop = async (alert) => {
		try {
			const updated = await stopRotRainAlert(alert.id);
			setAlerts((current) => current.map((a) => (a.id === updated.id ? updated : a)));
		} catch (err) {
			setError(err?.message || "Não foi possível encerrar o alerta.");
		}
	};

	const handleDelete = async (alert) => {
		if (!window.confirm("Apagar este registro?")) return;
		try {
			await deleteRotRainAlert(alert.id);
			setAlerts((current) => current.filter((a) => a.id !== alert.id));
		} catch (err) {
			setError(err?.message || "Não foi possível apagar o registro.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<CloudLightning size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Monitoramento de Chuvas</h1>
						<p className="text-sm font-semibold text-slate-500">Histórico e alertas ativos por regional.</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<select value={filtroRegional} onChange={(e) => setFiltroRegional(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
						<option value="all">Todas Regionais</option>
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					<button type="button" onClick={() => setShowModal(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 hover:bg-blue-700">
						<Plus size={17} /> Declarar Chuva
					</button>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			{info ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{info}</div> : null}
			{queued ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">{queued} registro(s) offline aguardando sincronização.</div> : null}

			{visible.length ? (
				<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
					{visible.map((alert) => {
						const isMine = alert.techId === user?.id;
						const regionalName = regionals.find((r) => r.id === alert.regionalId)?.name || "Regional";
						return (
							<article key={alert.id} className={`rot-card-hover relative overflow-hidden rounded-2xl border shadow-sm ${alert.active ? "border-blue-300 bg-white ring-1 ring-blue-100" : "border-slate-200 bg-slate-50 opacity-75"}`}>
								<div className="p-5">
									<div className="mb-3 flex items-start justify-between">
										<div>
											{alert.active ? (
												<span className="mb-1 inline-flex w-fit items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
													<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" /> Chovendo
												</span>
											) : (
												<span className="mb-1 inline-flex w-fit rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Finalizado</span>
											)}
											<h3 className="text-lg font-bold leading-tight text-slate-800">{alert.city}</h3>
											<p className="text-sm text-slate-500">{alert.district}</p>
										</div>
										{canManage ? (
											<button type="button" onClick={() => handleDelete(alert)} title="Apagar registro" className="p-1 text-slate-300 transition-colors hover:text-red-500">
												<Trash2 size={16} />
											</button>
										) : null}
									</div>

									<div className="mb-4 space-y-2 rounded border border-slate-100 bg-slate-50/50 p-2 text-xs text-slate-600">
										<div className="flex items-center gap-2">
											<Clock size={14} className="text-blue-400" />
											<span>Início: <b>{formatTime(alert.startTime)}</b> · {formatDate(alert.startTime)}</span>
										</div>
										{alert.endTime ? (
											<div className="flex items-center gap-2">
												<CheckCircle size={14} className="text-emerald-500" />
												<span>Fim: <b>{formatTime(alert.endTime)}</b></span>
											</div>
										) : null}
										<div className="flex items-center gap-2">
											<User size={14} className="text-slate-400" />
											<span>{alert.techName?.split(" ")[0] || "—"} ({regionalName})</span>
										</div>
									</div>

									{alert.active && (isMine || canManage) ? (
										<button type="button" onClick={() => handleStop(alert)} className="rot-btn-tactile flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 py-2 text-xs font-bold text-blue-700 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">
											<Umbrella size={14} /> PARAR CHUVA
										</button>
									) : null}
								</div>
							</article>
						);
					})}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm font-bold text-slate-400">
					<CloudLightning size={40} className="mx-auto mb-3 opacity-30" />
					Nenhum histórico de chuva.
				</div>
			)}

			{showModal ? (
				<DeclareRainModal
					onClose={() => setShowModal(false)}
					onCreated={(created) => {
						setAlerts((current) => [created, ...current]);
						setShowModal(false);
					}}
					onQueued={(created) => {
						setAlerts((current) => [created, ...current]);
						setInfo("Chuva salva offline. Ela será enviada automaticamente quando a internet voltar.");
						queuedRotActionCount().then(setQueued);
						setShowModal(false);
					}}
					user={user}
				/>
			) : null}
		</div>
	);
}

function DeclareRainModal({ onClose, onCreated, onQueued, user }) {
	const [city, setCity] = useState("");
	const [district, setDistrict] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!city.trim()) {
			setError("Informe a cidade.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { city: city.trim(), district: district.trim() };
			const created = await createRotRainAlert(payload);
			onCreated(created);
		} catch (err) {
			if (isNetworkFailure(err)) {
				const queued = await enqueueRotAction("rain:create", { city: city.trim(), district: district.trim() }, { city: city.trim(), district: district.trim() });
				onQueued({
					id: queued.id,
					city: city.trim(),
					district: district.trim(),
					active: true,
					techId: user?.id,
					techName: user?.name || user?.username || "Você",
					regionalId: user?.regionalId || "",
					startTime: new Date().toISOString(),
					endTime: null,
					offline: true,
				});
				return;
			}
			setError(err?.message || "Não foi possível declarar a chuva.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Declarar chuva" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CloudLightning size={22} /></span>} onClose={onClose} size="sm">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Cidade</span>
					<input value={city} onChange={(e) => setCity(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Bairro</span>
					<input value={district} onChange={(e) => setDistrict(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Salvando..." : "Declarar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}
