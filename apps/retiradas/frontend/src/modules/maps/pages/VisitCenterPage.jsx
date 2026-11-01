import {
	ArrowLeft,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Clock3,
	Crosshair,
	MapPin,
	RefreshCw,
	Route,
	Search,
	UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import AdminTechniciansMapCanvas from "../components/AdminTechniciansMapCanvas";
import { mapsService } from "../services/mapsService";
import "../styles/maps-visits.css";

function dateKey(daysAgo = 0) {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
	if (!value) return "Sem registro";
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function formatDistance(value) {
	const meters = Number(value || 0);
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

const EMPTY_RESPONSE = {
	items: [],
	summary: { orders: 0, technicianPassages: 0, observations: 0, repeatedOrders: 0 },
	pagination: { page: 1, pages: 1, total: 0 },
};

export default function VisitCenterPage() {
	const [startDate, setStartDate] = useState(dateKey(6));
	const [endDate, setEndDate] = useState(dateKey());
	const [searchDraft, setSearchDraft] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [data, setData] = useState(EMPTY_RESPONSE);
	const [selectedOrderId, setSelectedOrderId] = useState("");
	const [selectedTechnician, setSelectedTechnician] = useState(null);
	const [track, setTrack] = useState(null);
	const [trackLoading, setTrackLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = useCallback(async ({ quiet = false } = {}) => {
		if (!quiet) setLoading(true);
		try {
			const response = await mapsService.visitCenter({ startDate, endDate, search, page, limit: 20 });
			setData(response);
			setError("");
			setSelectedOrderId((current) => {
				if (response.items?.some((item) => item.id === current)) return current;
				return response.items?.[0]?.id || "";
			});
		} catch (loadError) {
			setError(loadError.message || "Nao foi possivel carregar a central de visitas.");
		} finally {
			setLoading(false);
		}
	}, [endDate, page, search, startDate]);

	useEffect(() => {
		load();
		return subscribeRealtimeTopics("maps-admin", () => load({ quiet: true }), { debounceMs: 1500 });
	}, [load]);

	const selectedOrder = useMemo(
		() => data.items?.find((item) => item.id === selectedOrderId) || null,
		[data.items, selectedOrderId],
	);

	useEffect(() => {
		setSelectedTechnician(null);
		setTrack(null);
	}, [selectedOrderId]);

	async function showTrack(technician) {
		setSelectedTechnician(technician);
		setTrackLoading(true);
		try {
			setTrack(await mapsService.technicianTrack(technician.userId, { date: technician.latestDate }));
			setError("");
		} catch (trackError) {
			setError(trackError.message || "Nao foi possivel abrir a rota deste tecnico.");
		} finally {
			setTrackLoading(false);
		}
	}

	function submitSearch(event) {
		event.preventDefault();
		setPage(1);
		setSearch(searchDraft.trim());
	}

	const summary = data.summary || EMPTY_RESPONSE.summary;
	const pagination = data.pagination || EMPTY_RESPONSE.pagination;

	return (
		<div className="maps-visits-page">
			<header className="maps-visits-header">
				<div className="maps-visits-title">
					<Link to="/maps" title="Voltar ao Maps"><ArrowLeft size={20} /></Link>
					<span><Crosshair size={21} /></span>
					<div><strong>Central de visitas</strong><small>Passagens confirmadas pela localizacao dos tecnicos</small></div>
				</div>
				<nav>
					<Link to="/maps/adminmap"><UsersRound size={17} /> Equipe ao vivo</Link>
					<button type="button" onClick={() => load()} title="Atualizar" className={loading ? "is-loading" : ""}><RefreshCw size={18} /></button>
				</nav>
			</header>

			<section className="maps-visits-summary" aria-label="Resumo das visitas">
				<div><MapPin size={18} /><span><strong>{summary.orders || 0}</strong> O.S. visitadas</span></div>
				<div><UsersRound size={18} /><span><strong>{summary.technicianPassages || 0}</strong> tecnico x O.S.</span></div>
				<div><Crosshair size={18} /><span><strong>{summary.observations || 0}</strong> leituras proximas</span></div>
				<div><Route size={18} /><span><strong>{summary.repeatedOrders || 0}</strong> com mais de um tecnico</span></div>
			</section>

			<main className="maps-visits-workspace">
				<aside className="maps-visits-list-panel">
					<form className="maps-visits-filters" onSubmit={submitSearch}>
						<label><CalendarDays size={15} /><span>De</span><input type="date" value={startDate} max={endDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></label>
						<label><CalendarDays size={15} /><span>Ate</span><input type="date" value={endDate} min={startDate} max={dateKey()} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></label>
						<div className="maps-visits-search"><Search size={17} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="O.S., cliente, cidade ou tecnico" /><button type="submit">Buscar</button></div>
					</form>

					<div className="maps-visits-ranking">
						{data.items?.map((item, index) => (
							<button type="button" key={item.id} className={selectedOrderId === item.id ? "is-selected" : ""} onClick={() => setSelectedOrderId(item.id)}>
								<span className="maps-visits-position">{(page - 1) * 20 + index + 1}</span>
								<span className="maps-visits-order-copy"><strong>O.S. {item.orderNumber}</strong><small>({item.clientCode}) {item.clientName}</small><small>{item.neighborhood} · {item.city}</small></span>
								<span className="maps-visits-order-score"><strong>{item.uniqueTechnicians}</strong><small>tecnicos</small><em>{item.observations} passagens</em></span>
							</button>
						))}
						{!loading && !data.items?.length ? <div className="maps-visits-empty"><Crosshair size={28} /><strong>Nenhuma passagem neste periodo</strong><span>A central sera preenchida quando tecnicos passarem a ate 180 m das O.S.</span></div> : null}
					</div>

					<footer className="maps-visits-pagination">
						<span>{pagination.total || 0} registros</span>
						<div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /></button><strong>{page} / {pagination.pages || 1}</strong><button type="button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button></div>
					</footer>
				</aside>

				<section className="maps-visits-map-panel">
					<AdminTechniciansMapCanvas
						items={[]}
						selectedId={selectedTechnician?.userId || ""}
						focusId=""
						frameRevision={0}
						trackPoints={track?.points || []}
						orderPoint={selectedOrder}
						onSelect={() => {}}
						onError={setError}
					/>
					{selectedOrder ? (
						<div className="maps-visits-detail">
							<div className="maps-visits-detail-head">
								<div><small>O.S. {selectedOrder.orderNumber}</small><h2>{selectedOrder.clientName}</h2><p>{selectedOrder.address} · {selectedOrder.city}</p></div>
								<span><strong>{formatDistance(selectedOrder.minimumDistanceMeters)}</strong><small>menor distancia</small></span>
							</div>
							<div className="maps-visits-technicians">
								{selectedOrder.technicians.map((technician) => (
									<button type="button" key={technician.userId} className={selectedTechnician?.userId === technician.userId ? "is-selected" : ""} onClick={() => showTrack(technician)}>
										<span><strong>{technician.technicianName}</strong><small><Clock3 size={12} /> {formatDateTime(technician.lastSeenAt)} · a {formatDistance(technician.minimumDistanceMeters)}</small></span>
										<em><Route size={15} /> Ver rota</em>
									</button>
								))}
							</div>
							{selectedTechnician ? <div className="maps-visits-track-summary"><Route size={16} /><strong>{selectedTechnician.technicianName}</strong><span>{trackLoading ? "Carregando rota..." : `${formatDistance(track?.summary?.distanceMeters)} percorridos · ${track?.summary?.positions || 0} pontos em ${selectedTechnician.latestDate}`}</span></div> : <div className="maps-visits-track-hint">Selecione um tecnico para desenhar a rota do dia da passagem.</div>}
						</div>
					) : null}
				</section>
			</main>

			{error ? <div className="maps-visits-error"><span>{error}</span><button type="button" onClick={() => setError("")}>Fechar</button></div> : null}
		</div>
	);
}
