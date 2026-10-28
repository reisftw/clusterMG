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
	Wifi,
	WifiOff,
	X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
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
import "../styles/maps.css";
import "../styles/maps-mobile.css";
import "../styles/maps-loading.css";

const MAPS_PERMISSIONS = {
	RADAR: "retiradas.maps.v2.radar",
	REQUEST: "retiradas.maps.v2.request_os",
	APPROVE: "retiradas.maps.v2.approve_request",
	REJECT: "retiradas.maps.v2.reject_request",
	ROUTES: "retiradas.maps.v2.manage_routes",
	AUDIT: "retiradas.maps.v2.audit",
};
const VIEW_RADII = [1, 3, 5, 10, 20];
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
	const { currentUser } = useAuthContext();
	const canRadar = usePermission(currentUser, MAPS_PERMISSIONS.RADAR);
	const canRequest = usePermission(currentUser, MAPS_PERMISSIONS.REQUEST);
	const canRoutes = usePermission(currentUser, MAPS_PERMISSIONS.ROUTES);
	const canAudit = usePermission(currentUser, MAPS_PERMISSIONS.AUDIT);
	const canApproveRequests = usePermission(currentUser, MAPS_PERMISSIONS.APPROVE);
	const canRejectRequests = usePermission(currentUser, MAPS_PERMISSIONS.REJECT);
	const canManageRequests = canApproveRequests || canRejectRequests;
	const [points, setPoints] = useState([]);
	const [summary, setSummary] = useState({ assigned: 0, opportunities: 0, scheduled: 0 });
	const [viewport, setViewport] = useState(null);
	const [radiusKm, setRadiusKm] = useState(5);
	const [gpsArea, setGpsArea] = useState(false);
	const [gpsRequested, setGpsRequested] = useState(false);
	const [searchDraft, setSearchDraft] = useState({ city: "", neighborhood: "" });
	const [search, setSearch] = useState({ city: "", neighborhood: "" });
	const [categories, setCategories] = useState(["assigned", "opportunity"]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [lastSyncAt, setLastSyncAt] = useState("");
	const [health, setHealth] = useState(null);
	const [selectedId, setSelectedId] = useState("");
	const [selectedItem, setSelectedItem] = useState(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [radarOpen, setRadarOpen] = useState(false);
	const [radarSettings, setRadarSettings] = useState(null);
	const [routeOpen, setRouteOpen] = useState(false);
	const [selectedRouteIds, setSelectedRouteIds] = useState([]);
	const [routes, setRoutes] = useState([]);
	const [requestsOpen, setRequestsOpen] = useState(false);
	const [requests, setRequests] = useState([]);
	const [requestsLoading, setRequestsLoading] = useState(false);
	const [simulatorOpen, setSimulatorOpen] = useState(false);
	const [focusPoint, setFocusPoint] = useState(null);
	const lastRadarPositionRef = useRef(null);
	const locationState = useRadarLocation(Boolean(gpsRequested || (canRadar && radarSettings?.enabled)));

	const requestParams = useMemo(() => {
		const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
		const params = { categories: categories.join(","), limit: mobile ? 250 : 500 };
		if (search.city || search.neighborhood) return { ...params, ...search };
		if (gpsArea && locationState.position) {
			return {
				...params,
				latitude: locationState.position.latitude,
				longitude: locationState.position.longitude,
				radiusMeters: radiusKm * 1000,
			};
		}
		return { ...params, ...(viewport || {}) };
	}, [categories, gpsArea, locationState.position, radiusKm, search, viewport]);

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
	}, [selectedId]);

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
		if (gpsRequested && locationState.error) setError(locationState.error);
	}, [gpsRequested, locationState.error]);

	async function saveRadarSettings(nextSettings) {
		const saved = await mapsService.saveRadarSettings(nextSettings);
		setRadarSettings(saved);
		setRadarOpen(false);
	}

	async function loadRequests() {
		setRequestsLoading(true);
		try {
			const data = await mapsService.requests();
			setRequests(data.items || []);
		} finally {
			setRequestsLoading(false);
		}
	}

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
		const data = await mapsService.routes();
		setRoutes(data.items || []);
		setSelectedRouteIds([]);
	}

	async function optimizeRoute(routeId, position) {
		await mapsService.optimizeRoute(routeId, position || {});
		const data = await mapsService.routes();
		setRoutes(data.items || []);
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
			return;
		}
		setGpsArea(true);
		setSearch({ city: "", neighborhood: "" });
		setFocusPoint({ ...locationState.position, key: Date.now() });
	}

	return (
		<div className="maps-v2-page">
			<header className="maps-v2-header">
				<div className="maps-v2-title"><span><MapPinned size={23} /></span><div><h1>Retiradas Maps</h1><p>{formatSync(lastSyncAt || health?.last_order_sync)}</p></div></div>
				<div className="maps-v2-header-status"><span className={health?.ok ? "is-online" : "is-offline"}>{health?.ok ? <Wifi size={16} /> : <WifiOff size={16} />}{health?.ok ? "Conectado" : "Indisponivel"}</span>{loading ? <RefreshCw className="maps-v2-spin" size={17} /> : null}</div>
			</header>

			<form className="maps-v2-search" onSubmit={applySearch}>
				<Search size={19} />
				<input aria-label="Buscar cidade" placeholder="Cidade" value={searchDraft.city} onChange={(event) => setSearchDraft((current) => ({ ...current, city: event.target.value }))} />
				<input aria-label="Buscar bairro" placeholder="Bairro" value={searchDraft.neighborhood} onChange={(event) => setSearchDraft((current) => ({ ...current, neighborhood: event.target.value }))} />
				{search.city || search.neighborhood ? <button type="button" className="maps-v2-icon-button" onClick={clearSearch} aria-label="Limpar busca"><X size={18} /></button> : null}
				<button type="submit" className="maps-v2-search-button">Buscar</button>
			</form>

			<div className="maps-v2-filterbar">
				<div className="maps-v2-segmented" aria-label="Categorias do mapa"><button type="button" className={categories.includes("assigned") ? "is-active is-assigned" : ""} onClick={() => toggleCategory("assigned")}><span /> Minhas OS</button><button type="button" className={categories.includes("opportunity") ? "is-active is-opportunity" : ""} onClick={() => toggleCategory("opportunity")}><span /> Oportunidades</button></div>
				<label className="maps-v2-radius"><Crosshair size={16} /><span>Raio</span><select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>{VIEW_RADII.map((radius) => <option key={radius} value={radius}>{radius} km</option>)}</select></label>
				<span className="maps-v2-total"><Layers3 size={16} /> {summary.assigned + summary.opportunities} OS nesta area</span>
			</div>

			<main className="maps-v2-workspace">
				<Suspense fallback={<div className="maps-v2-canvas-loading"><RefreshCw className="maps-v2-spin" size={22} /><span>Preparando mapa...</span></div>}>
					<MapsCanvas points={points} userPosition={locationState.position} focusPoint={focusPoint} onViewportChange={setViewport} onSelect={setSelectedId} onError={setError} />
				</Suspense>
				<div className="maps-v2-map-actions">
					<button type="button" onClick={centerOnUser} title="Minha localizacao"><LocateFixed size={21} /></button>
					{canRadar ? <button type="button" className={radarSettings?.enabled ? "is-active" : ""} onClick={() => setRadarOpen(true)} title="Radar de proximidade"><BellRing size={21} /></button> : null}
					{canRoutes ? <button type="button" className={selectedRouteIds.length ? "is-active" : ""} onClick={() => setRouteOpen(true)} title="Roteiro do dia"><Route size={21} /><small>{selectedRouteIds.length || ""}</small></button> : null}
					{canRequest || canManageRequests ? <button type="button" onClick={openRequests} title="Solicitacoes"><Inbox size={21} /></button> : null}
					{canAudit ? <button type="button" onClick={() => setSimulatorOpen(true)} title="Simulador"><FlaskConical size={21} /></button> : null}
					{canRadar ? <button type="button" onClick={() => setRadarOpen(true)} title="Configuracoes"><Settings2 size={21} /></button> : null}
				</div>
				{error ? <div className="maps-v2-error"><WifiOff size={18} /><span>{error}</span><button type="button" onClick={() => loadPoints()}><RefreshCw size={16} /> Tentar novamente</button></div> : null}
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
