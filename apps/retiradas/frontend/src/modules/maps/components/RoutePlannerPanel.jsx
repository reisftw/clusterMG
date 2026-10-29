import { ChevronDown, ChevronUp, LoaderCircle, Navigation, Route, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMapClientLabel } from "../utils/pointLabels";

function formatDistance(value) {
	const meters = Number(value || 0);
	if (!meters) return "-";
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export default function RoutePlannerPanel({
	open,
	points,
	selectedIds,
	routes,
	position,
	onClose,
	onMove,
	onRemove,
	onCreate,
	onOptimize,
}) {
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const selected = useMemo(
		() => selectedIds.map((id) => points.find((point) => point.id === id)).filter(Boolean),
		[selectedIds, points],
	);
	if (!open) return null;

	async function createRoute() {
		setSaving(true);
		setMessage("");
		try {
			await onCreate(selectedIds);
			setMessage("Roteiro salvo. Agora voce pode otimizar a sequencia.");
		} catch (error) {
			setMessage(error.message);
		} finally {
			setSaving(false);
		}
	}

	async function optimize(routeId) {
		setSaving(true);
		setMessage("");
		try {
			await onOptimize(routeId, position);
			setMessage("Sequencia recalculada por proximidade.");
		} catch (error) {
			setMessage(error.message);
		} finally {
			setSaving(false);
		}
	}

	return (
		<aside className="maps-v2-side-panel" aria-label="Planejador de roteiro">
			<header>
				<div><span className="maps-v2-panel-icon"><Route size={20} /></span><div><h2>Roteiro do dia</h2><p>Organize apenas retiradas atribuidas a voce.</p></div></div>
				<button type="button" className="maps-v2-icon-button" onClick={onClose} aria-label="Fechar roteiro"><X size={19} /></button>
			</header>
			<div className="maps-v2-route-list">
				{selected.length ? selected.map((item, index) => (
					<div className="maps-v2-route-item" key={item.id}>
						<span className="maps-v2-route-sequence">{index + 1}</span>
						<div><strong>{formatMapClientLabel(item)}</strong><small>OS {item.orderNumber} · {item.neighborhood} · {item.city}</small></div>
						<div className="maps-v2-route-actions">
							<button type="button" disabled={index === 0} onClick={() => onMove(item.id, -1)} aria-label="Mover retirada para cima"><ChevronUp size={16} /></button>
							<button type="button" disabled={index === selected.length - 1} onClick={() => onMove(item.id, 1)} aria-label="Mover retirada para baixo"><ChevronDown size={16} /></button>
							<button type="button" className="is-remove" onClick={() => onRemove(item.id)} aria-label="Remover do roteiro"><Trash2 size={16} /></button>
						</div>
					</div>
				)) : <div className="maps-v2-empty"><Route size={24} /><strong>Roteiro vazio</strong><span>Adicione retiradas verdes pelo mapa.</span></div>}
			</div>
			<button type="button" className="maps-v2-primary-button maps-v2-full-button" disabled={!selected.length || saving} onClick={createRoute}>
				{saving ? <LoaderCircle className="maps-v2-spin" size={18} /> : <Navigation size={18} />} Salvar roteiro
			</button>
			{routes.length ? <div className="maps-v2-saved-routes"><h3>Roteiros salvos</h3>{routes.map((routeItem) => (
				<article key={routeItem.id}>
					<div><strong>{routeItem.name}</strong><span>{routeItem.items?.length || 0} paradas · {formatDistance(routeItem.items?.reduce((sum, item) => sum + Number(item.distanceMeters || 0), 0))}</span></div>
					<button type="button" disabled={saving} onClick={() => optimize(routeItem.id)}><Sparkles size={16} /> Otimizar</button>
				</article>
			))}</div> : null}
			{message ? <p className="maps-v2-feedback">{message}</p> : null}
		</aside>
	);
}
