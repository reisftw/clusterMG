import {
	BellRing,
	Crosshair,
	FlaskConical,
	Inbox,
	Layers3,
	LocateFixed,
	MapPinned,
	RefreshCw,
	Route,
	Search,
	Settings2,
	UsersRound,
	Wifi,
	WifiOff,
	X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { hasPermission, ROLES } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import MapsBottomSheet from "../components/MapsBottomSheet";
import OrderDetailPanel from "../components/OrderDetailPanel";
import RadarPanel from "../components/RadarPanel";
import RequestsPanel from "../components/RequestsPanel";
import RoutePlannerPanel from "../components/RoutePlannerPanel";
import SimulatorPanel from "../components/SimulatorPanel";
import { useRadarLocation } from "../features/geolocation/useRadarLocation";
import { dispatchRadarNotification } from "../features/notifications/notificationDispatcher";
import { shouldEvaluatePosition } from "../features/radar/proximityEngine";
import { mapsService } from "../services/mapsService";
import { updateTechnicianPresence } from "../services/technicianPresence";
import "../styles/maps.css";
import "../styles/maps-mobile.css";
import "../styles/maps-loading.css";
import "../styles/maps-live-link.css";

const MAPS_PERMISSIONS = {
	RADAR: "retiradas.maps.v2.radar",
	REQUEST: "retiradas.maps.v2.request_os",
	APPROVE: "retiradas.maps.v2.approve_request",
	REJECT: "retiradas.maps.v2.reject_request",
	ROUTES: "retiradas.maps.v2.manage_routes",
	AUDIT: "retiradas.maps.v2.audit",
	LIVE_TECHNICIANS: "retiradas.maps.v2.live_technicians",
};
const VIEW_RADII = Object.freeze([
	{ meters: 120, label: "120 m" },
	{ meters: 250, label: "250 m" },
	{ meters: 500, label: "500 m" },
	{ meters: 1000, label: "1 km" },
	{ meters: 3000, label: "3 km" },
	{ meters: 5000, label: "5 km" },
]);
const MapsCanvas = lazy(() => import("../components/MapsCanvas"));

function formatSync(value) {
	if (!value) return "Sem sincronizacao";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Sem sincronizacao" : `Atualizado ${date.toLocaleString("pt-BR")}`;
}

function usePermission(user, permission) {
	return useMemo(() => hasPermission(user, permission), [permission, user]);
}

export default function MapsPage() {
	const { currentUser, realUser } = useAuthContext();
	const location = useLocation();
	const canRadar = usePermission(currentUser, MAPS_PERMISSIONS.RADAR);
	const canRequest = usePermission(currentUser, MAPS_PERMISSIONS.REQUEST);
	const canRoutes = usePermission(currentUser, MAPS_PERMISSIONS.ROUTES);
	const canAudit = usePermission(currentUser, MAPS_PERMISSIONS.AUDIT);
	const canViewLiveTechnicians = usePermission(currentUser, MAPS_PERMISSIONS.LIVE_TECHNICIANS);
	const isTechnician = String((realUser || currentUser)?.role || "").trim().toLowerCase() === ROLES.TECNICO;
	const canApproveRequests = usePermission(currentUser, MAPS_PERMISSIONS.APPROVE);
	const canRejectRequests = usePermission(currentUser, MAPS_PERMISSIONS.REJECT);
	const canManageRequests = canApproveRequests || canRejectRequests;
	const [points, setPoints] = useState([]);
	const [summary, setSummary] = useState({ assigned: 0, opportunities: 0, scheduled: 0 });
	const [viewport, setViewport] = useState(null);
	const [radiusMeters, setRadiusMeters] = useState(120);
	const [gpsArea, setGpsArea] = useState(false);
	const [gpsRequested, setGpsRequested] = useState(false);
	const [mapQueryPosition, setMapQueryPosition] = useState(null);
	const [searchDraft, setSearchDraft] = useState({ city: "", neighborhood: "" });
	const [search, setSearch] = useState({ city: "", neighborhood: "" });
	const [categories, setCategories] = useState(["assigned", "opportunity"]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [lastSyncAt, setLastSyncAt] = useState("");
	const [health, setHealth] = useState(null);
	const [selectedId, setSelectedId] = useState("");
	const [selectedItem, setSelectedItem] = useState(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [radarOpen, setRadarOpen] = useState(false);
	const [radarSettings, setRadarSettings] = useState(null);
	const [routeOpen, setRouteOpen] = useState(false);
	const [routeSelectionMode, setRouteSelectionMode] = useState(false);
	const [selectedRouteIds, setSelectedRouteIds] = useState([]);
	const [routes, setRoutes] = useState([]);
	const [requestsOpen, setRequestsOpen] = useState(false);
	const [requests, setRequests] = useState([]);
	const [requestsLoading, setRequestsLoading] = useState(false);
	const [simulatorOpen, setSimulatorOpen] = useState(false);
	const [focusPoint, setFocusPoint] = useState(null);
	const [realtimeRevision, setRealtimeRevision] = useState(0);
	const lastRadarPositionRef = useRef(null);
	const lastMapQueryPositionRef = useRef(null);
	const locationAppliedRef = useRef(false);
	const noticeTimerRef = useRef(null);
	const locationState = useRadarLocation(Boolean(gpsRequested || (canRadar && radarSettings?.enabled)));

	const requestParams = useMemo(() => {
		const params = { categories: categories.join(","), limit: 25000 };
		if (search.city || search.neighborhood) return { ...params, ...search };
		if (gpsArea && mapQueryPosition) {
			return {
				...params,
				latitude: mapQueryPosition.latitude,
				longitude: mapQueryPosition.longitude,
				radiusMeters,
			};
		}
		return { ...params, ...(viewport || {}) };
	}, [categories, gpsArea, mapQueryPosition, radiusMeters, search, viewport]);

	const focusZoom = useMemo(() => {
		if (radiusMeters <= 150) return 18;
		if (radiusMeters <= 300) return 17;
		if (radiusMeters <= 600) return 16;
		if (radiusMeters <= 1500) return 15;
		return 14;
	}, [radiusMeters]);

	const loadPoints = useCallback(async (signal) => {
		setLoading(true);
		setError("");
		try {
			const response = await mapsService.points(requestParams, signal);
			setPoints(response.items || []);
			setLastSyncAt(response.lastSyncAt || "");
			setSummary(response.summary || {
				assigned: (response.items || []).filter((item) => item.category === "assigned").length,
				opportunities: (response.items || []).filter((item) => item.category === "opportunity").length,
				scheduled: (response.items || []).filter((item) => item.scheduled).length,
			});
		} catch (loadError) {
			if (loadError.name !== "AbortError") setError(loadError.message);
		} finally {
			if (!signal?.aborted) setLoading(false);
		}
	}, [requestParams]);

	useEffect(() => {
		const controller = new AbortController();
		const timer = window.setTimeout(() => loadPoints(controller.signal), 350);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [loadPoints]);

	useEffect(() => {
		mapsService.health().then(setHealth).catch(() => setHealth({ ok: false }));
		if (canRadar) mapsService.radarSettings().then(setRadarSettings).catch(() => {});
		if (canRoutes) mapsService.routes().then((data) => setRoutes(data.items || [])).catch(() => {});
	}, [canRadar, canRoutes]);

	useEffect(() => {
		if (!selectedId) {
			setSelectedItem(null);
			return;
		}
		let active = true;
		setDetailLoading(true);
		mapsService.order(selectedId).then((response) => {
			if (active) setSelectedItem(response.item);
		}).catch((detailError) => {
			if (active) setError(detailError.message);
		}).finally(() => {
			if (active) setDetailLoading(false);
		});
		return () => { active = false; };
	}, [realtimeRevision, selectedId]);

	useEffect(() => {
		const position = locationState.position;
		if (!canRadar || !radarSettings?.enabled || !position) return;
		if (!shouldEvaluatePosition(lastRadarPositionRef.current, position)) return;
		lastRadarPositionRef.current = position;
		mapsService.evaluateRadar(position).then((response) => {
			(response.alerts || []).forEach((alert) => dispatchRadarNotification(alert, () => setSheetOpen(true)));
		}).catch(() => {});
	}, [canRadar, locationState.position, radarSettings?.enabled]);

	useEffect(() => {
		if (!isTechnician || !locationState.position) return;
		updateTechnicianPresence(locationState.position).catch(() => {});
	}, [isTechnician, locationState.position]);

	useEffect(() => {
		if (gpsRequested && locationState.error) {
			setError(locationState.error);
			setNotice(locationState.error);
		}
	}, [gpsRequested, locationState.error]);

	useEffect(() => {
		if (!gpsRequested || !locationState.position || locationAppliedRef.current) return;
		locationAppliedRef.current = true;
		lastMapQueryPositionRef.current = locationState.position;
		setMapQueryPosition(locationState.position);
		setGpsArea(true);
		setSearch({ city: "", neighborhood: "" });
		setFocusPoint({ ...locationState.position, key: Date.now() });
		setNotice("Localizacao atualizada. Buscando oportunidades proximas.");
	}, [gpsRequested, locationState.position]);

	useEffect(() => {
		if (!gpsArea || !locationState.position) return;
		if (!shouldEvaluatePosition(lastMapQueryPositionRef.current, locationState.position, {
			minimumDistance: 30,
			maximumAgeMs: 15_000,
		})) return;
		lastMapQueryPositionRef.current = locationState.position;
		setMapQueryPosition(locationState.position);
	}, [gpsArea, locationState.position]);

	useEffect(() => {
		if (!notice) return undefined;
		window.clearTimeout(noticeTimerRef.current);
		noticeTimerRef.current = window.setTimeout(() => setNotice(""), 4500);
		return () => window.clearTimeout(noticeTimerRef.current);
	}, [notice]);

	async function saveRadarSettings(nextSettings) {
		const saved = await mapsService.saveRadarSettings(nextSettings);
		setRadarSettings(saved);
		setRadarOpen(false);
	}

	const loadRequests = useCallback(async () => {
		setRequestsLoading(true);
		try {
			const data = await mapsService.requests();
			setRequests(data.items || []);
		} finally {
			setRequestsLoading(false);
		}
	}, []);

	const loadRoutes = useCallback(async () => {
		if (!canRoutes) return;
		const data = await mapsService.routes();
		setRoutes(data.items || []);
	}, [canRoutes]);

	useEffect(() => subscribeRealtimeTopics("maps", (event) => {
		void loadPoints();
		setRealtimeRevision((current) => current + 1);
		if (requestsOpen) void loadRequests();
		if (String(event.action || "").startsWith("ROUTE_")) void loadRoutes();
	}, { debounceMs: 300 }), [loadPoints, loadRequests, loadRoutes, requestsOpen]);

	useEffect(() => {
		const openRequestsPanel = () => {
			setRequestsOpen(true);
			void loadRequests();
		};
		if (new URLSearchParams(location.search).get("panel") === "requests") {
			openRequestsPanel();
		}
		window.addEventListener("retiradas:maps-open-requests", openRequestsPanel);
		return () => window.removeEventListener("retiradas:maps-open-requests", openRequestsPanel);
	}, [loadRequests, location.search]);

	const hasPendingEffectuation = requests.some((item) =>
		["APPROVED", "PENDING_EFFECTUATION"].includes(item.status),
	);

	useEffect(() => {
		if (!requestsOpen || !hasPendingEffectuation) return undefined;
		const timer = window.setInterval(() => {
			void loadRequests();
			void loadPoints();
		}, 4000);
		return () => window.clearInterval(timer);
	}, [hasPendingEffectuation, loadPoints, loadRequests, requestsOpen]);

	async function openRequests() {
		setRequestsOpen(true);
		await loadRequests();
	}

	async function resolveRequest(id, action) {
		if (action === "approve") await mapsService.approveRequest(id);
		else await mapsService.rejectRequest(id);
		await loadRequests();
		await loadPoints();
	}

	function toggleCategory(category) {
		setCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
	}

	function toggleRouteItem(id) {
		setSelectedRouteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
	}

	function toggleRoutePoint(point) {
		if (!point?.assignedToCurrentUser || !point?.locationAvailable) {
			setNotice("A rota aceita apenas suas OS com localizacao disponivel.");
			return;
		}
		toggleRouteItem(point.id);
	}

	function startRouteSelection() {
		setRouteSelectionMode(true);
		setSelectedId("");
		setSheetOpen(false);
		setNotice("Modo rota ativo. Toque nas casas verdes para selecionar as paradas.");
	}

	function finishRouteSelection() {
		if (!selectedRouteIds.length) {
			setNotice("Selecione ao menos uma OS verde no mapa.");
			return;
		}
		setRouteSelectionMode(false);
		setRouteOpen(true);
	}

	function cancelRouteSelection() {
		setRouteSelectionMode(false);
		setSelectedRouteIds([]);
	}

	function moveRouteItem(id, direction) {
		setSelectedRouteIds((current) => {
			const from = current.indexOf(id);
			const to = from + direction;
			if (from < 0 || to < 0 || to >= current.length) return current;
			const next = [...current];
			[next[from], next[to]] = [next[to], next[from]];
			return next;
		});
	}

	async function createRoute(orderIds) {
		await mapsService.createRoute({ name: `Roteiro ${new Date().toLocaleDateString("pt-BR")}`, orderIds });
		await loadRoutes();
		setSelectedRouteIds([]);
		setRouteSelectionMode(false);
	}

	async function optimizeRoute(routeId, position) {
		await mapsService.optimizeRoute(routeId, position || {});
		await loadRoutes();
	}

	function applySearch(event) {
		event.preventDefault();
		setGpsArea(false);
		setSearch({ city: searchDraft.city.trim(), neighborhood: searchDraft.neighborhood.trim() });
	}

	function clearSearch() {
		setSearchDraft({ city: "", neighborhood: "" });
		setSearch({ city: "", neighborhood: "" });
	}

	function centerOnUser() {
		if (!locationState.position) {
			setGpsRequested(true);
			setError("");
			setNotice("Solicitando sua localizacao...");
			return;
		}
		setGpsArea(true);
		lastMapQueryPositionRef.current = locationState.position;
		setMapQueryPosition(locationState.position);
		setSearch({ city: "", neighborhood: "" });
		setFocusPoint({ ...locationState.position, key: Date.now() });
		setNotice("Localizacao atualizada. Buscando oportunidades proximas.");
	}

	return (
		<div className="maps-v2-page">
			<header className="maps-v2-header">
				<div className="maps-v2-title"><span><MapPinned size={23} /></span><div><h1>Retiradas Maps</h1><p>{formatSync(lastSyncAt || health?.last_order_sync)}</p></div></div>
				<div className="maps-v2-header-status">{canViewLiveTechnicians ? <Link className="maps-v2-live-link" to="/maps/adminmap"><UsersRound size={16} /> Equipe ao vivo</Link> : null}<span className={health?.ok ? "is-online" : "is-offline"}>{health?.ok ? <Wifi size={16} /> : <WifiOff size={16} />}{health?.ok ? "Conectado" : "Indisponivel"}</span>{loading ? <RefreshCw className="maps-v2-spin" size={17} /> : null}</div>
			</header>

			<form className="maps-v2-search" onSubmit={applySearch}>
				<Search size={19} />
				<input aria-label="Buscar cidade" placeholder="Cidade" value={searchDraft.city} onChange={(event) => setSearchDraft((current) => ({ ...current, city: event.target.value }))} />
				<input aria-label="Buscar bairro" placeholder="Bairro" value={searchDraft.neighborhood} onChange={(event) => setSearchDraft((current) => ({ ...current, neighborhood: event.target.value }))} />
				{search.city || search.neighborhood ? <button type="button" className="maps-v2-icon-button" onClick={clearSearch} aria-label="Limpar busca"><X size={18} /></button> : null}
				<button type="submit" className="maps-v2-search-button">Buscar</button>
			</form>

			<div className="maps-v2-filterbar">
				<div className="maps-v2-segmented" aria-label="Categorias do mapa"><button type="button" className={categories.includes("assigned") ? "is-active is-assigned" : ""} onClick={() => toggleCategory("assigned")}><span /> Minhas OS</button><button type="button" className={categories.includes("opportunity") ? "is-active is-opportunity" : ""} onClick={() => toggleCategory("opportunity")}><span /> Outras OS</button></div>
				<label className="maps-v2-radius"><Crosshair size={16} /><span>Raio</span><select value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))}>{VIEW_RADII.map((radius) => <option key={radius.meters} value={radius.meters}>{radius.label}</option>)}</select></label>
				<span className="maps-v2-total"><Layers3 size={16} /> {summary.assigned + summary.opportunities} OS nesta area</span>
			</div>

			<main className="maps-v2-workspace">
				<Suspense fallback={<div className="maps-v2-canvas-loading"><RefreshCw className="maps-v2-spin" size={22} /><span>Preparando mapa...</span></div>}>
					<MapsCanvas points={points} userPosition={locationState.position} focusPoint={focusPoint} focusZoom={focusZoom} followUser={gpsArea} routeSelectionMode={routeSelectionMode} selectedRouteIds={selectedRouteIds} onViewportChange={setViewport} onSelect={setSelectedId} onToggleRoute={toggleRoutePoint} onError={setError} />
				</Suspense>
				<div className="maps-v2-map-actions">
					<button type="button" onClick={centerOnUser} title="Minha localizacao"><LocateFixed size={21} /></button>
					{canRadar ? <button type="button" className={radarSettings?.enabled ? "is-active" : ""} onClick={() => setRadarOpen(true)} title="Radar de proximidade"><BellRing size={21} /></button> : null}
					{canRoutes ? <button type="button" className={routeSelectionMode || selectedRouteIds.length ? "is-active" : ""} onClick={routeSelectionMode ? finishRouteSelection : startRouteSelection} title={routeSelectionMode ? "Concluir selecao da rota" : "Selecionar OS no mapa para criar rota"}><Route size={21} /><small>{selectedRouteIds.length || ""}</small></button> : null}
					{canRequest || canManageRequests ? <button type="button" onClick={openRequests} title="Solicitacoes"><Inbox size={21} /></button> : null}
					{canAudit ? <button type="button" onClick={() => setSimulatorOpen(true)} title="Simulador"><FlaskConical size={21} /></button> : null}
					{canRadar ? <button type="button" onClick={() => setRadarOpen(true)} title="Configuracoes"><Settings2 size={21} /></button> : null}
				</div>
				{error ? <div className="maps-v2-error"><WifiOff size={18} /><span>{error}</span><button type="button" onClick={() => loadPoints()}><RefreshCw size={16} /> Tentar novamente</button></div> : null}
				{notice ? <div className="maps-v2-location-notice" role="status"><LocateFixed size={18} /><span>{notice}</span></div> : null}
				{routeSelectionMode ? (
					<div className="maps-v2-route-selection" role="status">
						<Route size={19} />
						<div><strong>Selecionando rota</strong><span>Toque nas casas verdes para adicionar ou remover.</span></div>
						<b>{selectedRouteIds.length}</b>
						<button type="button" onClick={finishRouteSelection} disabled={!selectedRouteIds.length}>Montar rota</button>
						<button type="button" className="is-cancel" onClick={cancelRouteSelection} aria-label="Cancelar selecao"><X size={17} /></button>
					</div>
				) : null}
				<MapsBottomSheet items={points} summary={summary} open={sheetOpen} onToggle={() => setSheetOpen((current) => !current)} onSelect={(item) => setSelectedId(item.id)} selectedRouteIds={selectedRouteIds} onToggleRoute={toggleRouteItem} />
			</main>

			<OrderDetailPanel item={selectedItem} loading={detailLoading} onClose={() => setSelectedId("")} onRequest={async (orderId) => { await mapsService.requestOrder(orderId); await loadPoints(); }} onAddRoute={(orderId) => { toggleRouteItem(orderId); setRouteOpen(true); }} />
			<RadarPanel open={radarOpen} settings={radarSettings} locationState={locationState} onClose={() => setRadarOpen(false)} onSave={saveRadarSettings} />
			<RoutePlannerPanel open={routeOpen} points={points} selectedIds={selectedRouteIds} routes={routes} position={locationState.position} onClose={() => setRouteOpen(false)} onMove={moveRouteItem} onRemove={toggleRouteItem} onCreate={createRoute} onOptimize={optimizeRoute} />
			<RequestsPanel open={requestsOpen} items={requests} canManage={canManageRequests} loading={requestsLoading} onClose={() => setRequestsOpen(false)} onResolve={resolveRequest} />
			<SimulatorPanel open={simulatorOpen} initialPosition={locationState.position} onClose={() => setSimulatorOpen(false)} onSimulate={mapsService.simulateRadar} />
		</div>
	);
}
