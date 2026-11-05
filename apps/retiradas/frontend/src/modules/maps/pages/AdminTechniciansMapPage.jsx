import {
	Activity,
	AlertTriangle,
	ArrowLeft,
	BatteryMedium,
	Building2,
	CheckCircle2,
	CirclePause,
	CirclePlay,
	ClipboardList,
	Clock3,
	Crosshair,
	Gauge,
	Layers3,
	LocateFixed,
	MapPin,
	Maximize2,
	Minimize2,
	Phone,
	RefreshCw,
	Route,
	Search,
	Settings2,
	Signal,
	Target,
	Trophy,
	UsersRound,
	UserRoundCheck,
	Wifi,
	WifiOff,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import AdminOrderAssignmentModal from "../components/AdminOrderAssignmentModal";
import AdminTechniciansMapCanvas from "../components/AdminTechniciansMapCanvas";
import { mapsService } from "../services/mapsService";
import {
	buildPresentationPlan,
	nextPresentationIndex,
	phaseDurationMs,
	PRESENTATION_PHASES,
} from "../utils/adminMapPresentation";
import "../styles/maps-admin.css";

const STATUS_LABELS = {
	active: "Atualizado",
	recent: "Atenção",
	stale: "Sem sinal recente",
	never: "Nunca localizado",
};

const PHASE_LABELS = {
	OVERVIEW_MG: "Visão geral de Minas Gerais",
	REGIONAL_FOCUS: "Destaque regional",
	CITY_FOCUS: "Destaque por cidade",
	TOP_TECHNICIAN: "Técnico destaque",
	TECHNICIAN_ROUTE: "Rota do técnico",
	OPERATION_ALERT: "Alerta operacional",
	RETURN_OVERVIEW: "Retornando à visão geral",
};

const DEFAULT_LAYERS = {
	technicians: true,
	openOrders: true,
	assignedOrders: true,
	priorityOrders: true,
	routes: true,
	regionals: true,
	cities: true,
	stops: true,
};

function todayKey() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function timeAgo(value, now = Date.now()) {
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) return "sem registro";
	const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
	if (seconds < 60) return `há ${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `há ${minutes} min`;
	const hours = Math.round(minutes / 60);
	return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} d`;
}

function formatTime(value, fallback = "--:--") {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return fallback;
	return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDistance(value) {
	const meters = Number(value);
	if (!Number.isFinite(meters)) return "Sem dados";
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function metricValue(value) {
	return value === null || value === undefined ? "Sem dados" : Number(value).toLocaleString("pt-BR");
}

function validCoordinates(item) {
	return Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude));
}

function comparisonLabel(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return "comparação indisponível";
	return `${numeric >= 0 ? "+" : ""}${numeric.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. ontem`;
}

function KpiCard({ icon: Icon, label, value, detail, tone = "blue" }) {
	return (
		<article className={`maps-command-kpi is-${tone}`}>
			<span><Icon size={19} /></span>
			<div><small>{label}</small><strong className={value === "Sem dados" ? "is-empty" : ""}>{value}</strong><em>{detail}</em></div>
		</article>
	);
}

function SettingsDialog({ value, onClose, onSave, saving }) {
	const [draft, setDraft] = useState(value);
	const update = (key, next) => setDraft((current) => ({ ...current, [key]: next }));
	const numericFields = [
		["overviewSeconds", "Visão geral de MG", 5, 120],
		["regionalSeconds", "Destaque regional", 5, 120],
		["citySeconds", "Destaque por cidade", 5, 120],
		["technicianSeconds", "Destaque de técnico", 5, 120],
		["routeSeconds", "Exibição da rota", 5, 120],
		["inactivitySeconds", "Retomar após inatividade", 15, 600],
		["rankingLimit", "Técnicos no ranking", 1, 10],
		["activeSignalMinutes", "Sinal atualizado até", 1, 30],
		["attentionSignalMinutes", "Sinal em atenção até", 2, 120],
	];
	return (
		<div className="maps-command-modal-backdrop" role="presentation" onMouseDown={onClose}>
			<section className="maps-command-settings" role="dialog" aria-modal="true" aria-labelledby="maps-settings-title" onMouseDown={(event) => event.stopPropagation()}>
				<header><div><Settings2 size={19} /><span><strong id="maps-settings-title">Configuração da apresentação</strong><small>Preferências salvas para este usuário</small></span></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
				<div className="maps-command-settings-grid">
					{numericFields.map(([key, label, min, max]) => (
						<label key={key}>{label}<span><input type="number" min={min} max={max} value={draft[key]} onChange={(event) => update(key, Number(event.target.value))} />{key === "rankingLimit" ? "itens" : key.includes("Minutes") ? "min" : "s"}</span></label>
					))}
				</div>
				<div className="maps-command-setting-toggles">
					{[
						["automaticMovement", "Movimentação automática"],
						["rotateRegionals", "Rotatividade entre regionais"],
						["showPriorityOrders", "Exibir O.S. prioritárias"],
						["showDailyRoute", "Exibir rota do dia"],
						["autoResume", "Retomar ciclo automaticamente"],
					].map(([key, label]) => <label key={key}><input type="checkbox" checked={draft[key] !== false} onChange={(event) => update(key, event.target.checked)} /><span>{label}</span></label>)}
				</div>
				<footer><button type="button" className="is-secondary" onClick={onClose}>Cancelar</button><button type="button" disabled={saving} onClick={() => onSave(draft)}>{saving ? "Salvando..." : "Salvar configuração"}</button></footer>
			</section>
		</div>
	);
}

export default function AdminTechniciansMapPage() {
	const { currentUser } = useAuthContext();
	const tvMode = useMemo(() => new URLSearchParams(window.location.search).get("mode") === "tv", []);
	const canManageSettings = hasPermission(currentUser, "retiradas.maps.v2.manage_settings");
	const canAssignOrders = hasPermission(currentUser, "retiradas.maps.v2.approve_request");
	const [overview, setOverview] = useState(null);
	const [orders, setOrders] = useState([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");
	const [connected, setConnected] = useState(true);
	const [now, setNow] = useState(Date.now());
	const [selectedId, setSelectedId] = useState("");
	const [selectedOrderId, setSelectedOrderId] = useState("");
	const [detailTab, setDetailTab] = useState("summary");
	const [search, setSearch] = useState("");
	const [regional, setRegional] = useState("all");
	const [status, setStatus] = useState("all");
	const [productivity, setProductivity] = useState("all");
	const [directoryMode, setDirectoryMode] = useState("technicians");
	const [layersOpen, setLayersOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [settingsSaving, setSettingsSaving] = useState(false);
	const [layers, setLayers] = useState(DEFAULT_LAYERS);
	const [trackDate, setTrackDate] = useState(todayKey());
	const [track, setTrack] = useState(null);
	const [trackLoading, setTrackLoading] = useState(false);
	const [presentationIndex, setPresentationIndex] = useState(0);
	const [presentationPaused, setPresentationPaused] = useState(!tvMode);
	const [manualExploration, setManualExploration] = useState(!tvMode);
	const [interactionRevision, setInteractionRevision] = useState(0);
	const [cameraCommand, setCameraCommand] = useState({ type: "overview", revision: 1 });
	const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
	const [assignmentOpen, setAssignmentOpen] = useState(false);
	const [assignmentTechnicians, setAssignmentTechnicians] = useState([]);
	const [assignmentLoading, setAssignmentLoading] = useState(false);
	const [assignmentSaving, setAssignmentSaving] = useState(false);
	const [assignmentError, setAssignmentError] = useState("");
	const [assignmentNotice, setAssignmentNotice] = useState("");
	const recentHighlightsRef = useRef([]);

	const settings = useMemo(() => overview?.settings || {}, [overview?.settings]);
	const technicians = useMemo(() => overview?.technicians || [], [overview?.technicians]);
	const summary = overview?.summary || {};

	const loadOverview = useCallback(async ({ quiet = false } = {}) => {
		if (!quiet) setRefreshing(true);
		try {
			const response = await mapsService.adminMonitoringOverview();
			setOverview(response);
			setLayers((current) => ({ ...current, ...(response.settings?.layers || {}) }));
			setConnected(true);
			setError("");
		} catch (loadError) {
			setConnected(false);
			setError(loadError.message || "Não foi possível atualizar a central.");
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	const loadOrders = useCallback(async () => {
		try {
			const response = await mapsService.points();
			setOrders((response.items || []).filter((item) => item.locationAvailable));
			setConnected(true);
		} catch (loadError) {
			setConnected(false);
			setError(loadError.message || "Não foi possível carregar as ordens no mapa.");
		}
	}, []);

	const refreshAll = useCallback(async () => {
		await Promise.all([loadOverview(), loadOrders()]);
	}, [loadOrders, loadOverview]);

	useEffect(() => {
		refreshAll();
		const unsubscribeAdmin = subscribeRealtimeTopics("maps-admin", () => loadOverview({ quiet: true }), { debounceMs: 800 });
		const unsubscribeMaps = subscribeRealtimeTopics("maps", () => Promise.all([loadOverview({ quiet: true }), loadOrders()]), { debounceMs: 1200 });
		const fallback = window.setInterval(() => loadOverview({ quiet: true }), 60_000);
		return () => {
			unsubscribeAdmin();
			unsubscribeMaps();
			window.clearInterval(fallback);
		};
	}, [loadOrders, loadOverview, refreshAll]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
		document.addEventListener("fullscreenchange", onFullscreenChange);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("fullscreenchange", onFullscreenChange);
		};
	}, []);

	const presentationPlan = useMemo(() => buildPresentationPlan(overview || {}, {
		recentTechnicianIds: recentHighlightsRef.current,
	}), [overview]);
	const presentationStep = useMemo(
		() => presentationPlan[presentationIndex] || presentationPlan[0] || { phase: PRESENTATION_PHASES.OVERVIEW_MG },
		[presentationIndex, presentationPlan],
	);

	const applyPresentationStep = useCallback((step) => {
		if (!step) return;
		if (step.phase === PRESENTATION_PHASES.REGIONAL_FOCUS && step.regional?.bounds) {
			setCameraCommand({ type: "bounds", bounds: step.regional.bounds, revision: Date.now() });
			return;
		}
		if (step.phase === PRESENTATION_PHASES.CITY_FOCUS && validCoordinates(step.city)) {
			setCameraCommand({ type: "point", latitude: step.city.latitude, longitude: step.city.longitude, zoom: 12, revision: Date.now() });
			return;
		}
		if ((step.phase === PRESENTATION_PHASES.TOP_TECHNICIAN || step.phase === PRESENTATION_PHASES.TECHNICIAN_ROUTE) && step.technician) {
			setSelectedId(step.technician.userId);
			setSelectedOrderId("");
			setDetailTab(step.phase === PRESENTATION_PHASES.TECHNICIAN_ROUTE ? "route" : "summary");
			if (validCoordinates(step.technician)) setCameraCommand({ type: "point", latitude: step.technician.latitude, longitude: step.technician.longitude, zoom: 15, revision: Date.now() });
			recentHighlightsRef.current = [...recentHighlightsRef.current.filter((id) => id !== step.technician.userId), step.technician.userId].slice(-8);
			return;
		}
		if (step.phase === PRESENTATION_PHASES.OPERATION_ALERT && step.alert?.technicianUserId) {
			const technician = technicians.find((item) => item.userId === step.alert.technicianUserId);
			if (technician && validCoordinates(technician)) {
				setSelectedId(technician.userId);
				setCameraCommand({ type: "point", latitude: technician.latitude, longitude: technician.longitude, zoom: 14, revision: Date.now() });
				return;
			}
		}
		setSelectedId("");
		setSelectedOrderId("");
		setCameraCommand({ type: "overview", revision: Date.now() });
	}, [technicians]);

	useEffect(() => {
		if (presentationIndex >= presentationPlan.length) setPresentationIndex(0);
	}, [presentationIndex, presentationPlan.length]);

	useEffect(() => {
		if (presentationPaused || settings.automaticMovement === false || !presentationPlan.length) return undefined;
		applyPresentationStep(presentationStep);
		const timer = window.setTimeout(() => {
			setPresentationIndex((current) => nextPresentationIndex(current, presentationPlan.length));
		}, phaseDurationMs(presentationStep, settings));
		return () => window.clearTimeout(timer);
	}, [applyPresentationStep, presentationPaused, presentationPlan.length, presentationStep, settings]);

	useEffect(() => {
		if (!manualExploration || settings.autoResume === false) return undefined;
		const timer = window.setTimeout(() => {
			setManualExploration(false);
			setPresentationPaused(false);
			setPresentationIndex(0);
		}, Math.max(15, Number(settings.inactivitySeconds || 60)) * 1000);
		return () => window.clearTimeout(timer);
	}, [interactionRevision, manualExploration, settings.autoResume, settings.inactivitySeconds]);

	useEffect(() => {
		if (!selectedId || detailTab !== "route") {
			setTrack(null);
			return undefined;
		}
		let active = true;
		setTrackLoading(true);
		mapsService.technicianTrack(selectedId, { date: trackDate }).then((response) => {
			if (active) setTrack(response);
		}).catch((trackError) => {
			if (active) setError(trackError.message || "Não foi possível carregar a rota do técnico.");
		}).finally(() => {
			if (active) setTrackLoading(false);
		});
		return () => { active = false; };
	}, [detailTab, selectedId, trackDate]);

	const registerManualInteraction = useCallback(() => {
		setPresentationPaused(true);
		setManualExploration(true);
		setInteractionRevision((value) => value + 1);
	}, []);

	const selectTechnician = useCallback((userId) => {
		const technician = technicians.find((item) => item.userId === userId);
		setSelectedId(userId);
		setSelectedOrderId("");
		setDetailTab("summary");
		registerManualInteraction();
		if (validCoordinates(technician)) setCameraCommand({ type: "point", latitude: technician.latitude, longitude: technician.longitude, zoom: 16, revision: Date.now() });
	}, [registerManualInteraction, technicians]);

	const selectOrder = useCallback((orderId) => {
		const order = orders.find((item) => item.id === orderId);
		setSelectedOrderId(orderId);
		setSelectedId("");
		registerManualInteraction();
		if (validCoordinates(order)) setCameraCommand({ type: "point", latitude: order.latitude, longitude: order.longitude, zoom: 17, revision: Date.now() });
	}, [orders, registerManualInteraction]);

	const regionals = useMemo(() => (overview?.regionals || []).map((item) => item.name), [overview]);
	const filteredTechnicians = useMemo(() => {
		const term = search.trim().toLocaleLowerCase("pt-BR");
		return technicians.filter((item) => {
			if (regional !== "all" && (item.regional || "Sem regional") !== regional) return false;
			if (status !== "all" && item.status !== status) return false;
			if (productivity === "productive" && Number(item.completedToday || 0) <= 0) return false;
			if (productivity === "orders" && Number(item.openOrders || 0) <= 0) return false;
			if (!term) return true;
			return [item.displayName, item.technicianName, item.regional].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
		});
	}, [productivity, regional, search, status, technicians]);

	const filteredOrders = useMemo(() => {
		const term = search.trim().toLocaleLowerCase("pt-BR");
		return orders.filter((item) => {
			if (regional !== "all" && (item.regional || "Sem regional") !== regional) return false;
			if (!term) return true;
			return [item.orderNumber, item.city, item.regional, item.technician].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
		}).slice(0, 500);
	}, [orders, regional, search]);

	const visibleTechnicianIds = useMemo(() => new Set(filteredTechnicians.map((item) => item.userId)), [filteredTechnicians]);
	const visibleOrders = useMemo(() => orders.filter((item) => regional === "all" || (item.regional || "Sem regional") === regional), [orders, regional]);
	const selected = technicians.find((item) => item.userId === selectedId) || null;
	const selectedOrder = orders.find((item) => item.id === selectedOrderId) || null;

	async function toggleFullscreen() {
		if (document.fullscreenElement) await document.exitFullscreen();
		else await document.documentElement.requestFullscreen();
	}

	function resumePresentation() {
		setManualExploration(false);
		setPresentationPaused(false);
		setPresentationIndex(0);
		setSelectedId("");
		setSelectedOrderId("");
	}

	async function saveSettings(next) {
		setSettingsSaving(true);
		try {
			const saved = await mapsService.saveAdminMonitoringSettings({ ...next, layers });
			setOverview((current) => ({ ...current, settings: saved }));
			setSettingsOpen(false);
			setError("");
		} catch (saveError) {
			setError(saveError.message || "Não foi possível salvar a configuração.");
		} finally {
			setSettingsSaving(false);
		}
	}

	async function openAssignment() {
		if (!selectedOrder || !canAssignOrders) return;
		setAssignmentOpen(true);
		setAssignmentError("");
		if (assignmentTechnicians.length) return;
		setAssignmentLoading(true);
		try {
			const response = await mapsService.assignableTechnicians();
			setAssignmentTechnicians(response.items || []);
		} catch (loadError) {
			setAssignmentError(loadError.message || "Não foi possível carregar os técnicos.");
		} finally {
			setAssignmentLoading(false);
		}
	}

	async function assignSelectedOrder(technician) {
		if (!selectedOrder || !technician) return;
		setAssignmentSaving(true);
		setAssignmentError("");
		try {
			await mapsService.assignOrderToTechnician(selectedOrder.id, technician);
			setAssignmentOpen(false);
			setAssignmentNotice(`Transferência da O.S. ${selectedOrder.orderNumber} para ${technician.displayName || technician.name} iniciada.`);
			await loadOrders();
		} catch (saveError) {
			setAssignmentError(saveError.message || "Não foi possível atribuir a O.S.");
		} finally {
			setAssignmentSaving(false);
		}
	}

	return (
		<main className={`maps-command-page${tvMode ? " is-tv" : ""}`}>
			<header className="maps-command-header">
				<div className="maps-command-title">
					<Link to="/maps" title="Voltar ao Retiradas Maps"><ArrowLeft size={18} /></Link>
					<span><LocateFixed size={20} /></span>
					<div><strong>REVO <b>| Equipe em Campo</b></strong><small>{PHASE_LABELS[presentationStep.phase] || "Central de monitoramento geográfico"}</small></div>
				</div>
				<div className="maps-command-header-status">
					<span className={connected ? "is-online" : "is-offline"}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />}{connected ? "Tempo real" : "Reconectando"}</span>
					<span><Clock3 size={15} />{new Date(now).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
					<span>Atualizado {formatTime(overview?.generatedAt)}</span>
				</div>
				<div className="maps-command-actions">
					<button type="button" onClick={refreshAll} title="Atualizar agora" className={refreshing ? "is-loading" : ""}><RefreshCw size={18} /></button>
					<button type="button" onClick={presentationPaused ? resumePresentation : () => setPresentationPaused(true)} title={presentationPaused ? "Retomar apresentação" : "Pausar apresentação"}>{presentationPaused ? <CirclePlay size={19} /> : <CirclePause size={19} />}</button>
					{canManageSettings ? <button type="button" onClick={() => setSettingsOpen(true)} title="Configurar apresentação"><Settings2 size={18} /></button> : null}
					<button type="button" onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
					<em>{tvMode ? "MODO TV" : "INTERATIVO"}</em>
				</div>
			</header>

			<section className="maps-command-kpis" aria-label="Indicadores operacionais">
				<KpiCard icon={UsersRound} label="Equipe em campo" value={metricValue(summary.teamInField)} detail={`${overview?.locationHealth?.located || 0} com localização`} tone="green" />
				<KpiCard icon={ClipboardList} label="O.S. abertas" value={metricValue(summary.openOrders)} detail={`${summary.priorityOrders || 0} prioritárias`} />
				<KpiCard icon={Activity} label="Em andamento" value={metricValue(summary.ordersInProgress)} detail="com técnico atribuído" tone="orange" />
				<KpiCard icon={CheckCircle2} label="Concluídas hoje" value={metricValue(summary.completedToday)} detail={comparisonLabel(summary.comparisons?.completedToday)} tone="green" />
				<KpiCard icon={Route} label="Paradas na rota" value={metricValue(summary.stopsDetected)} detail={summary.stopsDetected == null ? "histórico insuficiente" : "paradas confirmadas"} tone="purple" />
				<KpiCard icon={WifiOff} label="Técnicos sem sinal" value={metricValue(summary.techniciansNoSignal)} detail={`${overview?.locationHealth?.never || 0} nunca localizados`} tone="red" />
			</section>

			<section className="maps-command-workspace">
				<aside className="maps-command-directory">
					<div className="maps-command-directory-head">
						<div className="maps-command-search"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); registerManualInteraction(); }} placeholder="Técnico, cidade ou regional" /></div>
						<div className="maps-command-segment"><button type="button" className={directoryMode === "technicians" ? "is-active" : ""} onClick={() => setDirectoryMode("technicians")}>Técnicos</button><button type="button" className={directoryMode === "orders" ? "is-active" : ""} onClick={() => setDirectoryMode("orders")}>Ordens</button></div>
						<div className="maps-command-filters">
							<select value={regional} onChange={(event) => { setRegional(event.target.value); registerManualInteraction(); }} aria-label="Filtrar regional"><option value="all">Todas as regionais</option>{regionals.map((item) => <option key={item} value={item}>{item}</option>)}</select>
							<select value={status} onChange={(event) => { setStatus(event.target.value); registerManualInteraction(); }} aria-label="Filtrar situação"><option value="all">Todos os sinais</option><option value="active">Atualizados</option><option value="recent">Atenção</option><option value="stale">Sem sinal</option><option value="never">Nunca localizados</option></select>
							<select value={productivity} onChange={(event) => { setProductivity(event.target.value); registerManualInteraction(); }} aria-label="Filtrar produtividade"><option value="all">Toda produtividade</option><option value="productive">Produziram hoje</option><option value="orders">Com O.S. abertas</option></select>
						</div>
					</div>
					<div className="maps-command-directory-list">
						{directoryMode === "technicians" ? filteredTechnicians.map((item) => (
							<button type="button" key={item.userId} className={`maps-command-person is-${item.status}${selectedId === item.userId ? " is-selected" : ""}`} onClick={() => selectTechnician(item.userId)}>
								<span className="maps-command-signal-dot" /><span className="maps-command-person-copy"><strong>{item.displayName || item.technicianName}</strong><small>{item.regional || "Sem regional"} · {STATUS_LABELS[item.status]}</small><em>{timeAgo(item.lastSeenAt, now)}</em></span><span className="maps-command-person-score"><strong>{item.completedToday || 0}</strong><small>hoje</small></span>
							</button>
						)) : filteredOrders.map((item) => (
							<button type="button" key={item.id} className={`maps-command-order${selectedOrderId === item.id ? " is-selected" : ""}`} onClick={() => selectOrder(item.id)}><span className={item.priority === "high" ? "is-priority" : ""}><Target size={15} /></span><div><strong>O.S. {item.orderNumber}</strong><small>{item.city} · {item.regional || "Sem regional"}</small></div><em>{item.technician || "Disponível"}</em></button>
						))}
						{!loading && ((directoryMode === "technicians" && !filteredTechnicians.length) || (directoryMode === "orders" && !filteredOrders.length)) ? <div className="maps-command-empty"><Search size={22} /><strong>Nenhum registro neste filtro</strong></div> : null}
					</div>
					<footer><Signal size={14} />{filteredTechnicians.length} de {technicians.length} técnicos</footer>
				</aside>

				<div className="maps-command-map-shell">
					<AdminTechniciansMapCanvas
						items={technicians}
						visibleTechnicianIds={visibleTechnicianIds}
						orders={visibleOrders}
						selectedId={selectedId}
						selectedOrderId={selectedOrderId}
						trackPoints={layers.routes ? track?.points || [] : []}
						layers={layers}
						cameraCommand={cameraCommand}
						privacyMode={tvMode}
						onSelect={selectTechnician}
						onOrderSelect={selectOrder}
						onUserInteraction={registerManualInteraction}
						onError={setError}
					/>
					<div className="maps-command-map-badge"><Crosshair size={15} /><span>{PHASE_LABELS[presentationStep.phase]}</span><strong>{presentationIndex + 1}/{presentationPlan.length}</strong></div>
					<div className="maps-command-map-tools">
						<button type="button" className={layersOpen ? "is-active" : ""} onClick={() => setLayersOpen((value) => !value)} title="Camadas"><Layers3 size={18} /></button>
						<button type="button" onClick={() => { registerManualInteraction(); setCameraCommand({ type: "overview", revision: Date.now() }); }} title="Enquadrar Minas Gerais"><LocateFixed size={18} /></button>
					</div>
					{layersOpen ? <div className="maps-command-layers"><strong>Camadas operacionais</strong>{[
						["technicians", "Técnicos"], ["openOrders", "O.S. abertas"], ["assignedOrders", "O.S. atribuídas"], ["priorityOrders", "O.S. prioritárias"], ["routes", "Rota do dia"],
					].map(([key, label]) => <label key={key}><input type="checkbox" checked={layers[key] !== false} onChange={(event) => { setLayers((current) => ({ ...current, [key]: event.target.checked })); registerManualInteraction(); }} /><span>{label}</span></label>)}</div> : null}
					{manualExploration ? <div className="maps-command-manual"><CirclePause size={16} /><span><strong>Exploração manual</strong>Apresentação pausada</span><button type="button" onClick={resumePresentation}>Retomar</button></div> : null}
				</div>

				<aside className="maps-command-details">
					{selected ? <>
						<header className="maps-command-selected-head"><div><span className={`maps-command-avatar is-${selected.status}`}>{String(selected.displayName || selected.technicianName || "T").slice(0, 1)}</span><span><small>{STATUS_LABELS[selected.status]}</small><strong>{selected.displayName || selected.technicianName}</strong><em>{selected.regional || "Sem regional"}</em></span></div><button type="button" onClick={() => setSelectedId("")} aria-label="Fechar"><X size={17} /></button></header>
						<nav className="maps-command-tabs">{[["summary", "Resumo"], ["route", "Rota"], ["orders", "Ordens de Serviço"]].map(([key, label]) => <button type="button" key={key} className={detailTab === key ? "is-active" : ""} onClick={() => setDetailTab(key)}>{label}</button>)}</nav>
						{detailTab === "summary" ? <div className="maps-command-detail-content">
							<div className="maps-command-detail-stats"><span><strong>{selected.completedToday || 0}</strong><small>concluídas hoje</small></span><span><strong>{selected.openOrders || 0}</strong><small>O.S. abertas</small></span><span><strong>{selected.plannedStops || 0}</strong><small>paradas planejadas</small></span></div>
							<dl><div><dt><MapPin size={14} />Última localização</dt><dd>{timeAgo(selected.lastSeenAt, now)}</dd></div><div><dt><Gauge size={14} />Precisão do GPS</dt><dd>{selected.accuracyMeters == null ? "Sem dados" : `${Math.round(selected.accuracyMeters)} m`}</dd></div><div><dt><Activity size={14} />Situação operacional</dt><dd>{selected.operationalStatus}</dd></div><div><dt><Clock3 size={14} />Primeiro / último registro</dt><dd>{formatTime(selected.firstSeenAt)} / {formatTime(selected.lastTrackAt)}</dd></div><div><dt><BatteryMedium size={14} />Bateria</dt><dd>Sem dados</dd></div></dl>
							<div className="maps-command-detail-actions"><button type="button" onClick={() => { setDetailTab("orders"); setLayers((current) => ({ ...current, openOrders: true })); }}>Ver O.S. no mapa</button><button type="button" onClick={() => setDetailTab("route")}>Visualizar rota</button>{selected.contactPhone ? <a href={`https://wa.me/${String(selected.contactPhone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Phone size={14} />Contatar</a> : null}</div>
						</div> : null}
						{detailTab === "route" ? <div className="maps-command-detail-content"><label className="maps-command-date">Rota operacional<input type="date" value={trackDate} max={todayKey()} onChange={(event) => setTrackDate(event.target.value)} /></label><div className="maps-command-route-summary"><Route size={24} /><strong>{trackLoading ? "Carregando..." : formatDistance(track?.summary?.distanceMeters)}</strong><span>{track?.summary?.positions || 0} posições entre 08h e 18h</span></div><p className="maps-command-note">O percurso exibe somente registros reais de GPS. Ausência de sinal não é classificada como improdutividade.</p></div> : null}
						{detailTab === "orders" ? <div className="maps-command-detail-content"><div className="maps-command-mini-list">{orders.filter((item) => String(item.technician || "").toLocaleLowerCase("pt-BR") === String(selected.technicianName || "").toLocaleLowerCase("pt-BR")).slice(0, 12).map((item) => <button type="button" key={item.id} onClick={() => selectOrder(item.id)}><span>O.S. {item.orderNumber}</span><small>{item.city} · {item.status}</small></button>)}</div><p className="maps-command-note">A lista mostra apenas O.S. abertas vinculadas ao nome HubSoft deste técnico.</p></div> : null}
					</> : selectedOrder ? <>
						<header className="maps-command-selected-head"><div><span className={`maps-command-avatar${selectedOrder.priority === "high" ? " is-priority" : ""}`}><Target size={20} /></span><span><small>{selectedOrder.priority === "high" ? "Prioridade" : "Ordem aberta"}</small><strong>O.S. {selectedOrder.orderNumber}</strong><em>{selectedOrder.city} · {selectedOrder.regional || "Sem regional"}</em></span></div><button type="button" onClick={() => setSelectedOrderId("")} aria-label="Fechar"><X size={17} /></button></header>
						<div className="maps-command-detail-content"><dl><div><dt><ClipboardList size={14} />Status</dt><dd>{selectedOrder.status}</dd></div><div><dt><UsersRound size={14} />Técnico</dt><dd>{selectedOrder.technician || "Disponível"}</dd></div><div><dt><Building2 size={14} />Localização</dt><dd>{selectedOrder.neighborhood} · {selectedOrder.city}</dd></div><div><dt><Clock3 size={14} />Atualizada</dt><dd>{timeAgo(selectedOrder.lastUpdatedAt, now)}</dd></div></dl>{canAssignOrders ? <button type="button" className="maps-command-assign-button" onClick={openAssignment}><UserRoundCheck size={16} />Atribuir técnico</button> : null}<p className="maps-command-note">A transferência usa a fila segura do HubSoft e o mapa será atualizado assim que a atribuição for concluída.</p></div>
					</> : <>
						<header className="maps-command-panel-title"><div><Trophy size={18} /><span><strong>Ranking de produtividade</strong><small>Retiradas concluídas hoje</small></span></div><em>{formatTime(overview?.rankings?.updatedAt)}</em></header>
						<div className="maps-command-ranking">{(overview?.rankings?.daily || []).map((item, index) => <button type="button" key={item.userId} onClick={() => selectTechnician(item.userId)}><span>{index + 1}</span><div><strong>{item.displayName || item.technicianName}</strong><small>{item.regional || "Sem regional"}</small></div><em>{item.completedToday}</em></button>)}{!(overview?.rankings?.daily || []).length ? <div className="maps-command-empty"><Trophy size={22} /><strong>Produção ainda sem registros</strong></div> : null}</div>
						<section className="maps-command-health"><header><Signal size={17} /><strong>Saúde da localização</strong></header><div><span className="is-active"><b>{overview?.locationHealth?.active || 0}</b>Atualizados</span><span className="is-recent"><b>{overview?.locationHealth?.recent || 0}</b>Atenção</span><span className="is-stale"><b>{overview?.locationHealth?.stale || 0}</b>Sem sinal</span><span className="is-never"><b>{overview?.locationHealth?.never || 0}</b>Nunca localizados</span></div></section>
						<section className="maps-command-alerts"><header><AlertTriangle size={17} /><strong>Destaques operacionais</strong></header>{(overview?.alerts || []).slice(0, 3).map((item, index) => <article key={`${item.type}-${index}`}><span /><div><strong>{item.title}</strong><p>{item.description}</p></div></article>)}{!(overview?.alerts || []).length ? <p className="maps-command-all-clear"><CheckCircle2 size={16} />Nenhum alerta relevante agora.</p> : null}</section>
					</>}
					<button type="button" className="maps-command-overview-button" onClick={() => { setSelectedId(""); setSelectedOrderId(""); registerManualInteraction(); setCameraCommand({ type: "overview", revision: Date.now() }); }}><Crosshair size={15} />Retornar à visão geral</button>
				</aside>
			</section>

			{loading ? <div className="maps-command-loading"><RefreshCw size={22} /><strong>Preparando a central geográfica...</strong></div> : null}
			{error ? <div className="maps-command-error"><WifiOff size={17} /><span>{error}</span><button type="button" onClick={refreshAll}>Tentar novamente</button><button type="button" onClick={() => setError("")} aria-label="Fechar"><X size={15} /></button></div> : null}
			{assignmentNotice ? <div className="maps-command-assignment-notice" role="status"><CheckCircle2 size={17} /><span>{assignmentNotice}</span><button type="button" onClick={() => setAssignmentNotice("")} aria-label="Fechar"><X size={15} /></button></div> : null}
			{settingsOpen ? <SettingsDialog value={{ ...settings, layers }} onClose={() => setSettingsOpen(false)} onSave={saveSettings} saving={settingsSaving} /> : null}
			<AdminOrderAssignmentModal open={assignmentOpen} order={selectedOrder} technicians={assignmentTechnicians} loading={assignmentLoading} saving={assignmentSaving} error={assignmentError} onClose={() => setAssignmentOpen(false)} onConfirm={assignSelectedOrder} />
		</main>
	);
}
