import { ExternalLink, MapPin, Navigation, PackagePlus, Route, UserRound, X } from "lucide-react";
import { useState } from "react";

export default function OrderDetailPanel({ item, loading, onClose, onRequest, onAddRoute }) {
	const [submitting, setSubmitting] = useState(false);
	const [message, setMessage] = useState("");

	if (!item && !loading) return null;
	const navigateUrl = item?.locationAvailable
		? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`
		: "#";

	async function requestOrder() {
		setSubmitting(true);
		setMessage("");
		try {
			await onRequest(item.id);
			setMessage("Solicitacao enviada para analise do BackOffice.");
		} catch (error) {
			setMessage(error.message);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<aside className="maps-v2-detail-panel" aria-label="Detalhes da retirada">
			<header>
				<div>
					<span className={`maps-v2-detail-kicker is-${item?.category || "loading"}`}>
						{item?.category === "assigned" ? "Minha retirada" : "Oportunidade"}
					</span>
					<h2>{item?.orderNumber || "Carregando..."}</h2>
				</div>
				<button type="button" className="maps-v2-icon-button" onClick={onClose} aria-label="Fechar detalhes"><X size={19} /></button>
			</header>
			{loading ? <div className="maps-v2-panel-loading">Consultando autorizacoes...</div> : (
				<div className="maps-v2-detail-content">
					<h3>{item.clientName || item.orderNumber}</h3>
					<p><MapPin size={16} /> {item.address}</p>
					<div className="maps-v2-detail-grid">
						<div><span>Tipo</span><strong>{item.type}</strong></div>
						<div><span>Status</span><strong>{item.status}</strong></div>
						<div><span>Empresa</span><strong>{item.company || "-"}</strong></div>
						<div><span>Regional</span><strong>{item.regional || "-"}</strong></div>
					</div>
					{!item.assignedToCurrentUser && item.technician && !item.requestable ? (
						<div className="maps-v2-privacy-note"><UserRound size={18} /><span>OS em atendimento por {item.technician}.</span></div>
					) : null}
					{!item.locationAvailable ? (
						<div className="maps-v2-privacy-note"><MapPin size={18} /><span>Esta oportunidade esta disponivel, mas a localizacao ainda esta sendo processada.</span></div>
					) : null}
					<div className="maps-v2-detail-actions">
						{item.assignedToCurrentUser ? (<>
							{navigateUrl !== "#" ? <a className="maps-v2-secondary-button" href={navigateUrl} target="_blank" rel="noreferrer"><Navigation size={17} /> Abrir rota <ExternalLink size={14} /></a> : null}
							<button type="button" className="maps-v2-primary-button" disabled={!item.locationAvailable} onClick={() => onAddRoute(item.id)}><Route size={17} /> Adicionar ao roteiro</button>
						</>) : item.requestable ? (
							<button type="button" className="maps-v2-primary-button" disabled={submitting} onClick={requestOrder}><PackagePlus size={17} /> {submitting ? "Enviando..." : "Solicitar esta OS"}</button>
						) : navigateUrl !== "#" ? (
							<a className="maps-v2-secondary-button" href={navigateUrl} target="_blank" rel="noreferrer"><Navigation size={17} /> Ver no mapa <ExternalLink size={14} /></a>
						) : null}
					</div>
					{message ? <p className="maps-v2-feedback">{message}</p> : null}
				</div>
			)}
		</aside>
	);
}
