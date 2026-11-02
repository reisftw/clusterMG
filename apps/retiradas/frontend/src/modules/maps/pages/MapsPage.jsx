import {
	BellRing,
	FlaskConical,
	Inbox,
	Layers3,
	LocateFixed,
	MapPinned,
	Navigation,
	PackagePlus,
	RefreshCw,
	Route,
	Settings2,
	SlidersHorizontal,
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
import MapsFiltersPanel from "../components/MapsFiltersPanel";
import MapsSmartSearch from "../components/MapsSmartSearch";
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
import { buildMapSearchSuggestions, readStoredMapView, storeMapView } from "../utils/mobileMapPresentation";
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
const MapsCanvas = lazy(() => import("../components/MapsCanvas"));

function formatSync(value) {
	if (!value) return "Sem sincronização";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Sem sincronização" : `Atualizado ${date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
}

function formatSyncTime(value) {
	if (!value) return "sem sincronização";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "sem sincronização" : `atualizado às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;
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
	const storedView = useMemo(() => readStoredMapView(), []);
	const [points, setPoints] = useState([]);
	const [summary, setSummary] = useState({ assigned: 0, opportunities: 0, scheduled: 0 });
	const [viewport, setViewport] = useState(() => storedView && [storedView.minLat, storedView.maxLat, storedView.minLng, storedView.maxLng].every(Number.isFinite) ? storedView : null);
	const [pendingViewport, setPendingViewport] = useState(null);
	const [radiusMeters, setRadiusMeters] = useState(120);
	const [gpsArea, setGpsArea] = useState(false);
	const [gpsRequested, setGpsRequested] = useState(false);
	const [mapQueryPosition, setMapQueryPosition] = useState(null);
	const [searchDraft, setSearchDraft] = useState("");
	const [search, setSearch] = useState({ query: "" });
	const [searchSuggestions, setSearchSuggestions] = useState([]);
	const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
	const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false);
	const [searchSuggestionsError, setSearchSuggestionsError] = useState("");
	const [categories, setCategories] = useState(["assigned", "opportunity"]);
	const [sortMode, setSortMode] = useState("nearest");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [lastSyncAt, setLastSyncAt] = useState("");
	const [health, setHealth] = useState(null);
	const [selectedId, setSelectedId] = useState("");
	const [selectedItem, setSelectedItem] = useState(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [sheetPosition, setSheetPosition] = useState("peek");
	const [radarOpen, setRadarOpen] = useState(false);
	const [radarSettings, setRadarSettings] = useState(null);
	const [routeOpen, setRouteOpen] = useState(false);
	const [routeSelectionMode, setRouteSelectionMode] = useState(false);
	const [selectedRouteIds, setSelectedRouteIds] = useState([]);
	const [requestSelectionMode, setRequestSelectionMode] = useState(false);
	const [selectedRequestIds, setSelectedRequestIds] = useState([]);
	const [navigation, setNavigation] = useState(null);
	const [navigationLoading, setNavigationLoading] = useState(false);
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
	const pendingSearchFocusRef = useRef("");
	const locationState = useRadarLocation(Boolean(gpsRequested || (canRadar && radarSettings?.enabled)));

	const requestParams = useMemo(() => {
		const params = { categories: categories.join(",") };
		if (search.query) return { ...params, search: search.query };
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
			const nextItems = response.items || [];
			setPoints(nextItems);
			setLastSyncAt(response.lastSyncAt || "");
			setSummary(response.summary || {
				assigned: nextItems.filter((item) => item.category === "assigned").length,
				opportunities: nextItems.filter((item) => item.category === "opportunity").length,
				scheduled: nextItems.filter((item) => item.scheduled).length,
			});
			if (pendingSearchFocusRef.current) {
				const match = nextItems.find((item) => item.id === pendingSearchFocusRef.current);
				pendingSearchFocusRef.current = "";
				if (match?.locationAvailable) {
					setSelectedId(match.id);
					setFocusPoint({ latitude: match.latitude, longitude: match.longitude, key: Date.now() });
					setSheetPosition("peek");
				}
			}
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
		const query = searchDraft.trim();
		if (query.length < 2 || query === search.query) {
			setSearchSuggestions([]);
			setSearchSuggestionsOpen(false);
			setSearchSuggestionsLoading(false);
			return undefined;
		}
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			setSearchSuggestionsLoading(true);
			setSearchSuggestionsError("");
			setSearchSuggestionsOpen(true);
			try {
				const response = await mapsService.points({ search: query, categories: categories.join(","), preview: true, limit: 24 }, controller.signal);
				setSearchSuggestions(buildMapSearchSuggestions(response.items || [], query));
			} catch (suggestionError) {
				if (suggestionError.name !== "AbortError") setSearchSuggestionsError("Não foi possível consultar agora.");
			} finally {
				if (!controller.signal.aborted) setSearchSuggestionsLoading(false);
			}
		}, 280);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [categories, search.query, searchDraft]);

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
		if (!selectedId || !locationState.position) {
			setNavigation(null);
			if (selectedId && !gpsRequested) {
				setGpsRequested(true);
				setNotice("Ativando sua localizacao para calcular o caminho ate o cliente.");
			}
			return;
		}
		let active = true;
		setNavigationLoading(true);
		mapsService.navigation(selectedId, locationState.position).then((response) => {
			if (active) setNavigation(response);
		}).catch(() => {
			if (active) setNavigation(null);
		}).finally(() => {
			if (active) setNavigationLoading(false);
		});
		return () => { active = false; };
	}, [gpsRequested, locationState.position, selectedId]);

	useEffect(() => {
		const position = locationState.position;
		if (!canRadar || !radarSettings?.enabled || !position) return;
		if (!shouldEvaluatePosition(lastRadarPositionRef.current, position)) return;
		lastRadarPositionRef.current = position;
		mapsService.evaluateRadar(position).then((response) => {
			(response.alerts || []).forEach((alert) => dispatchRadarNotification(alert, () => setSheetPosition("expanded")));
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
		setSearch({ query: "" });
		setSearchDraft("");
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

	useEffect(() => {
		window.dispatchEvent(new CustomEvent("retiradas:maps-sheet-position", { detail: { position: sheetPosition } }));
	}, [sheetPosition]);

	useEffect(() => {
		window.dispatchEvent(new CustomEvent("retiradas:maps-search-state", { detail: { open: searchSuggestionsOpen } }));
		return () => window.dispatchEvent(new CustomEvent("retiradas:maps-search-state", { detail: { open: false } }));
	}, [searchSuggestionsOpen]);

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
		const orderId = new URLSearchParams(location.search).get("order");
		if (orderId) setSelectedId(orderId);
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
		setCategories((current) => {
			const next = current.includes(category) ? current.filter((item) => item !== category) : [...current, category];
			return next.length ? next : current;
		});
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

	function toggleRequestPoint(point) {
		if (!point?.requestable) {
			setNotice("Esta O.S. nao esta disponivel para solicitacao.");
			return;
		}
		setSelectedRequestIds((current) => current.includes(point.id) ? current.filter((id) => id !== point.id) : [...current, point.id]);
	}

	function startRouteSelection() {
		setRequestSelectionMode(false);
		setSelectedRequestIds([]);
		setRouteSelectionMode(true);
		setSelectedId("");
		setSheetPosition("collapsed");
		setNotice("Modo rota ativo. Toque nas casas verdes para selecionar as paradas.");
	}

	function startRequestSelection() {
		setRouteSelectionMode(false);
		setRequestSelectionMode(true);
		setSelectedId("");
		setSheetPosition("collapsed");
		setNotice("Selecione no mapa as O.S. que deseja solicitar de uma vez.");
	}

	async function finishRequestSelection() {
		if (!selectedRequestIds.length) {
			setNotice("Selecione ao menos uma O.S. disponivel.");
			return;
		}
		try {
			const response = await mapsService.requestOrders(selectedRequestIds);
			setNotice(`${response.created?.length || 0} solicitacao(oes) enviada(s) ao BackOffice${response.failed?.length ? `; ${response.failed.length} nao puderam ser enviadas` : ""}.`);
			setSelectedRequestIds([]);
			setRequestSelectionMode(false);
			await loadPoints();
		} catch (requestError) {
			setNotice(requestError.message || "Nao foi possivel enviar as solicitacoes.");
		}
	}

	function cancelRequestSelection() {
		setRequestSelectionMode(false);
		setSelectedRequestIds([]);
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
		setNotice("Roteiro salvo. O mapa continua disponivel para consulta.");
	}

	async function optimizeRoute(routeId, position) {
		await mapsService.optimizeRoute(routeId, position || {});
		await loadRoutes();
		setNotice("Roteiro otimizado. Abra o trajeto no Google Maps pelo painel.");
	}

	function applySearch(event) {
		event.preventDefault();
		const query = searchDraft.trim();
		if (!query) return;
		setGpsArea(false);
		setPendingViewport(null);
		setSearch({ query });
		setSearchSuggestionsOpen(false);
		setSheetPosition("peek");
	}

	function clearSearch() {
		setSearchDraft("");
		setSearch({ query: "" });
		setSearchSuggestions([]);
		setSearchSuggestionsOpen(false);
	}

	function selectSearchSuggestion(suggestion) {
		setSearchDraft(suggestion.label);
		setSearch({ query: suggestion.query });
		setSearchSuggestionsOpen(false);
		setGpsArea(false);
		setPendingViewport(null);
		pendingSearchFocusRef.current = suggestion.point?.id || "";
	}

	function handleMapViewport(nextViewport) {
		storeMapView(nextViewport);
		if (nextViewport.userInitiated) {
			setPendingViewport(nextViewport);
			setGpsArea(false);
			return;
		}
		if (!viewport) setViewport(nextViewport);
	}

	function searchVisibleArea() {
		if (!pendingViewport) return;
		setViewport(pendingViewport);
		setPendingViewport(null);
		setGpsArea(false);
		setSearch({ query: "" });
		setSearchDraft("");
		setNotice("Buscando ordens na área visível.");
	}

	function selectPoint(itemOrId) {
		const id = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
		const point = points.find((entry) => entry.id === id) || (typeof itemOrId === "object" ? itemOrId : null);
		if (!id) return;
		setSelectedId(id);
		setSheetPosition("peek");
		if (point?.locationAvailable) setFocusPoint({ latitude: point.latitude, longitude: point.longitude, key: Date.now() });
	}

	function applyFilters(next) {
		setRadiusMeters(next.radiusMeters);
		setSortMode(next.sortMode);
		setCategories(next.categories);
		setFiltersOpen(false);
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
		setSearch({ query: "" });
		setSearchDraft("");
		setPendingViewport(null);
		setFocusPoint({ ...locationState.position, key: Date.now() });
		setNotice("Localização atualizada. Buscando oportunidades próximas.");
	}

	return (
		<div className="maps-v2-page">
			<header className="maps-v2-header">
				<div className="maps-v2-title"><span><MapPinned size={23} /></span><div><h1>Retiradas Maps</h1><p>{formatSync(health?.last_order_sync || lastSyncAt)}</p></div></div>
				<div className="maps-v2-header-status">{canViewLiveTechnicians ? <Link className="maps-v2-live-link" to="/maps/adminmap"><UsersRound size={16} /> Equipe ao vivo</Link> : null}<span className={health?.ok ? "is-online" : "is-offline"}>{health?.ok ? <Wifi size={16} /> : <WifiOff size={16} />}{health?.ok ? "Conectado" : "Indisponível"}</span>{loading ? <RefreshCw className="maps-v2-spin" size={17} /> : null}</div>
			</header>

			<MapsSmartSearch value={searchDraft} onChange={setSearchDraft} onSubmit={applySearch} onClear={clearSearch} suggestions={searchSuggestions} onSelect={selectSearchSuggestion} loading={searchSuggestionsLoading} error={searchSuggestionsError} open={searchSuggestionsOpen} />

			<div className="maps-v2-quick-filters" aria-label="Filtros rápidos">
				<button type="button" className={categories.includes("assigned") ? "is-active is-assigned" : ""} onClick={() => toggleCategory("assigned")}><span /> Minhas OS</button>
				<button type="button" className={categories.includes("opportunity") ? "is-active is-opportunity" : ""} onClick={() => toggleCategory("opportunity")}><span /> Oportunidades</button>
				<button type="button" className={filtersOpen ? "is-active is-filters" : ""} onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={16} /> Filtros</button>
			</div>
			<div className="maps-v2-area-status" role="status">
				<span><Layers3 size={16} /><strong>{summary.assigned + summary.opportunities}</strong> ordens nesta área</span>
				<span className={health?.ok ? "is-fresh" : "is-stale"}>{loading ? "sincronizando..." : formatSyncTime(health?.last_order_sync || lastSyncAt)}</span>
			</div>

			<main className="maps-v2-workspace">
				<Suspense fallback={<div className="maps-v2-canvas-loading"><RefreshCw className="maps-v2-spin" size={22} /><span>Preparando mapa...</span></div>}>
					<MapsCanvas points={points} userPosition={locationState.position} focusPoint={focusPoint} focusZoom={focusZoom} followUser={gpsArea} initialView={storedView} selectedId={selectedId} selectionMode={routeSelectionMode ? "route" : requestSelectionMode ? "request" : ""} selectedRouteIds={selectedRouteIds} selectedRequestIds={selectedRequestIds} navigationPath={navigation?.geometry || []} onViewportChange={handleMapViewport} onSelect={selectPoint} onToggleRoute={toggleRoutePoint} onToggleRequest={toggleRequestPoint} onError={setError} />
				</Suspense>
				<div className="maps-v2-map-actions">
					<button type="button" className={gpsArea ? "is-active" : ""} onClick={centerOnUser} title="Minha localização"><LocateFixed size={21} /></button>
					<button type="button" className={toolsOpen ? "is-active" : ""} onClick={() => setToolsOpen((current) => !current)} title="Ferramentas do mapa"><Settings2 size={21} /></button>
				</div>
				{toolsOpen ? <div className="maps-v2-map-tools" aria-label="Ferramentas do mapa">
					{canRadar ? <button type="button" className={radarSettings?.enabled ? "is-active" : ""} onClick={() => { setRadarOpen(true); setToolsOpen(false); }}><BellRing size={18} /><span>Radar</span></button> : null}
					{canRoutes ? <button type="button" className={routeSelectionMode || selectedRouteIds.length ? "is-active" : ""} onClick={() => { routeSelectionMode ? finishRouteSelection() : startRouteSelection(); setToolsOpen(false); }}><Route size={18} /><span>Montar rota</span><small>{selectedRouteIds.length || ""}</small></button> : null}
					{canRequest ? <button type="button" className={requestSelectionMode || selectedRequestIds.length ? "is-active" : ""} onClick={() => { requestSelectionMode ? finishRequestSelection() : startRequestSelection(); setToolsOpen(false); }}><PackagePlus size={18} /><span>Solicitar OS</span><small>{selectedRequestIds.length || ""}</small></button> : null}
					{canRequest || canManageRequests ? <button type="button" onClick={() => { void openRequests(); setToolsOpen(false); }}><Inbox size={18} /><span>Solicitações</span></button> : null}
					{canAudit ? <button type="button" onClick={() => { setSimulatorOpen(true); setToolsOpen(false); }}><FlaskConical size={18} /><span>Simulador</span></button> : null}
				</div> : null}
				{pendingViewport ? <button type="button" className="maps-v2-search-area" onClick={searchVisibleArea}><Navigation size={17} /> Buscar nesta área</button> : null}
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
				{requestSelectionMode ? (
					<div className="maps-v2-route-selection is-request" role="status">
						<PackagePlus size={19} />
						<div><strong>Solicitacao em lote</strong><span>Toque nas casas azuis para selecionar.</span></div>
						<b>{selectedRequestIds.length}</b>
						<button type="button" onClick={finishRequestSelection} disabled={!selectedRequestIds.length}>Solicitar todas</button>
						<button type="button" className="is-cancel" onClick={cancelRequestSelection} aria-label="Cancelar selecao"><X size={17} /></button>
					</div>
				) : null}
				<MapsBottomSheet items={points} summary={summary} position={sheetPosition} onPositionChange={setSheetPosition} onSelect={selectPoint} selectedId={selectedId} selectedRouteIds={selectedRouteIds} onToggleRoute={toggleRouteItem} sortMode={sortMode} onSortChange={setSortMode} />
			</main>

			{filtersOpen ? <MapsFiltersPanel open={true} radiusMeters={radiusMeters} sortMode={sortMode} categories={categories} onClose={() => setFiltersOpen(false)} onApply={applyFilters} /> : null}
			<OrderDetailPanel item={selectedItem} loading={detailLoading} navigation={navigation} navigationLoading={navigationLoading} onClose={() => { setSelectedId(""); setNavigation(null); }} onRequest={async (orderId) => { await mapsService.requestOrder(orderId); await loadPoints(); }} onAddRoute={(orderId) => { toggleRouteItem(orderId); setRouteOpen(true); }} />
			<RadarPanel open={radarOpen} settings={radarSettings} locationState={locationState} onClose={() => setRadarOpen(false)} onSave={saveRadarSettings} />
			<RoutePlannerPanel open={routeOpen} points={points} selectedIds={selectedRouteIds} routes={routes} position={locationState.position} onClose={() => setRouteOpen(false)} onMove={moveRouteItem} onRemove={toggleRouteItem} onCreate={createRoute} onOptimize={optimizeRoute} />
			<RequestsPanel open={requestsOpen} items={requests} canManage={canManageRequests} loading={requestsLoading} onClose={() => setRequestsOpen(false)} onResolve={resolveRequest} />
			<SimulatorPanel open={simulatorOpen} initialPosition={locationState.position} onClose={() => setSimulatorOpen(false)} onSimulate={mapsService.simulateRadar} />
		</div>
	);
}
