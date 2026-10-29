import {
	ArrowLeft,
	CheckCircle2,
	ClipboardList,
	Crosshair,
	Maximize2,
	Minimize2,
	PanelLeftClose,
	PanelLeftOpen,
	RefreshCw,
	Route,
	Search,
	UsersRound,
	Wifi,
	WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import AdminTechniciansMapCanvas from "../components/AdminTechniciansMapCanvas";
import { mapsService } from "../services/mapsService";
import "../styles/maps-admin.css";

const STATUS_LABELS = {
	active: "Ao vivo",
	recent: "Sinal recente",
	stale: "Sem sinal recente",
};

function timeAgo(value, now) {
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) return "sem atualizacao";
	const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
	if (seconds < 60) return `ha ${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `ha ${minutes} min`;
	return `ha ${Math.round(minutes / 60)} h`;
}

export default function AdminTechniciansMapPage() {
	const [items, setItems] = useState([]);
	const [summary, setSummary] = useState({ total: 0, active: 0, recent: 0, stale: 0, completedToday: 0, openOrders: 0 });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("all");
	const [selectedId, setSelectedId] = useState("");
	const [focusId, setFocusId] = useState("");
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
	const [frameRevision, setFrameRevision] = useState(0);
	const [generatedAt, setGeneratedAt] = useState("");
	const [now, setNow] = useState(Date.now());

	const load = useCallback(async ({ quiet = false } = {}) => {
		if (!quiet) setLoading(true);
		try {
			const response = await mapsService.liveTechnicians();
			setItems(response.items || []);
			setSummary(response.summary || {});
			setGeneratedAt(response.generatedAt || new Date().toISOString());
			setError("");
		} catch (loadError) {
			setError(loadError.message || "Nao foi possivel carregar a equipe.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
		return subscribeRealtimeTopics("maps-admin", () => load({ quiet: true }), { debounceMs: 900 });
	}, [load]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 30_000);
		const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
		document.addEventListener("fullscreenchange", onFullscreenChange);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("fullscreenchange", onFullscreenChange);
		};
	}, []);

	const filteredItems = useMemo(() => {
		const term = search.trim().toLocaleLowerCase("pt-BR");
		return items.filter((item) => {
			if (status !== "all" && item.status !== status) return false;
			if (!term) return true;
			return [item.displayName, item.technicianName, item.regional]
				.some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
		});
	}, [items, search, status]);

	const selected = items.find((item) => item.userId === selectedId) || null;

	async function toggleFullscreen() {
		if (document.fullscreenElement) await document.exitFullscreen();
		else await document.documentElement.requestFullscreen();
	}

	function selectTechnician(userId) {
		setSelectedId(userId);
		setFocusId("");
		window.setTimeout(() => setFocusId(userId), 0);
	}

	return (
		<div className="maps-admin-page">
			<AdminTechniciansMapCanvas
				items={filteredItems}
				selectedId={selectedId}
				focusId={focusId}
				frameRevision={frameRevision}
				onSelect={selectTechnician}
				onError={setError}
			/>

			<header className="maps-admin-topbar">
				<div className="maps-admin-brand">
					<Link to="/maps" title="Voltar ao Retiradas Maps"><ArrowLeft size={20} /></Link>
					<span><UsersRound size={21} /></span>
					<div><strong>Equipe em campo</strong><small>{timeAgo(generatedAt, now)} · atualizacao ao vivo</small></div>
				</div>
				<div className="maps-admin-actions">
					<button type="button" onClick={() => setFrameRevision((value) => value + 1)} title="Enquadrar equipe"><Crosshair size={19} /></button>
					<button type="button" onClick={() => load()} title="Atualizar agora" className={loading ? "is-loading" : ""}><RefreshCw size={19} /></button>
					<button type="button" onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Exibir na TV"}>{fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}</button>
				</div>
			</header>

			<section className="maps-admin-summary" aria-label="Resumo da equipe">
				<div><Wifi size={18} /><span><strong>{summary.active || 0}</strong> ao vivo</span></div>
				<div><UsersRound size={18} /><span><strong>{summary.total || 0}</strong> localizados</span></div>
				<div><CheckCircle2 size={18} /><span><strong>{summary.completedToday || 0}</strong> retiradas hoje</span></div>
				<div><ClipboardList size={18} /><span><strong>{summary.openOrders || 0}</strong> OS abertas</span></div>
			</section>

			<button type="button" className="maps-admin-sidebar-toggle" onClick={() => setSidebarOpen((value) => !value)} title={sidebarOpen ? "Ocultar lista" : "Mostrar lista"}>
				{sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
			</button>

			<aside className={`maps-admin-sidebar${sidebarOpen ? " is-open" : ""}`}>
				<div className="maps-admin-sidebar-head">
					<div className="maps-admin-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tecnico ou regional" /></div>
					<div className="maps-admin-status-filter">
						{[["all", "Todos"], ["active", "Ao vivo"], ["recent", "Recentes"], ["stale", "Sem sinal"]].map(([value, label]) => (
							<button type="button" key={value} className={status === value ? "is-active" : ""} onClick={() => setStatus(value)}>{label}</button>
						))}
					</div>
				</div>
				<div className="maps-admin-technician-list">
					{filteredItems.map((item) => (
						<button type="button" key={item.userId} className={`maps-admin-technician-row is-${item.status}${selectedId === item.userId ? " is-selected" : ""}`} onClick={() => selectTechnician(item.userId)}>
							<span className="maps-admin-presence-dot" />
							<span className="maps-admin-technician-copy"><strong>{item.displayName || item.technicianName}</strong><small>{STATUS_LABELS[item.status]} · {timeAgo(item.lastSeenAt, now)}</small></span>
							<span className="maps-admin-technician-score"><strong>{item.completedToday || 0}</strong><small>hoje</small></span>
						</button>
					))}
					{!loading && !filteredItems.length ? <div className="maps-admin-empty"><WifiOff size={24} /><strong>Nenhum tecnico neste filtro</strong><span>A localizacao aparece depois que o tecnico autoriza o GPS no PWA.</span></div> : null}
				</div>
				<footer>Posicoes recentes, sem historico de deslocamento.</footer>
			</aside>

			{selected ? (
				<section className="maps-admin-selected">
					<button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedId("")}>×</button>
					<div><span className={`maps-admin-selected-status is-${selected.status}`} /> <small>{STATUS_LABELS[selected.status]} · {timeAgo(selected.lastSeenAt, now)}</small></div>
					<h2>{selected.displayName || selected.technicianName}</h2>
					<p>{selected.technicianName || "Tecnico HubSoft nao associado"}{selected.regional ? ` · ${selected.regional}` : ""}</p>
					<ul>
						<li><CheckCircle2 size={17} /><strong>{selected.completedToday || 0}</strong><span>retiradas hoje</span></li>
						<li><ClipboardList size={17} /><strong>{selected.openOrders || 0}</strong><span>OS abertas</span></li>
						<li><Route size={17} /><strong>{selected.routeStops || 0}</strong><span>paradas na rota</span></li>
					</ul>
					<small>Precisao do GPS: {Math.round(Number(selected.accuracyMeters || 0))} m</small>
				</section>
			) : null}

			{error ? <div className="maps-admin-error"><WifiOff size={18} /><span>{error}</span><button type="button" onClick={() => load()}>Tentar novamente</button></div> : null}
		</div>
	);
}
