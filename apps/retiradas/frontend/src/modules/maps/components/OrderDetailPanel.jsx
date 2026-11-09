import { Clock3, ExternalLink, MapPin, MessageCircle, Navigation, PackagePlus, Route, ShieldCheck, TriangleAlert, UserRound, X } from "lucide-react";
import { useState } from "react";
import { formatMapClientLabel } from "../utils/pointLabels";

function formatDistance(value) {
	const meters = Number(value || 0);
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function formatDuration(value) {
	const minutes = Math.max(1, Math.round(Number(value || 0) / 60));
	return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function OrderDetailPanel({ item, loading, navigation, navigationLoading, onClose, onRequest, onAddRoute }) {
	const [submitting, setSubmitting] = useState(false);
	const [message, setMessage] = useState("");

	if (!item && !loading) return null;
	const navigateUrl = item?.locationAvailable
		? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`
		: "#";
	const visitConfirmed = ["RESPONSIBLE_VISITED", "RESCHEDULE_CONFIRMED_VISIT"].includes(item?.visitEvidence?.status);

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
						{item?.assignedToCurrentUser ? "Minha retirada" : item?.requestable ? "OS disponivel" : "OS de outro tecnico"}
					</span>
					<h2>{item?.orderNumber || "Carregando..."}</h2>
				</div>
				<button type="button" className="maps-v2-icon-button" onClick={onClose} aria-label="Fechar detalhes"><X size={19} /></button>
			</header>
			{loading ? <div className="maps-v2-panel-loading">Consultando autorizacoes...</div> : (
				<div className="maps-v2-detail-content">
					<h3>{formatMapClientLabel(item)}</h3>
					<p><MapPin size={16} /> {item.address}</p>
					<div className="maps-v2-detail-grid">
						<div><span>Tipo</span><strong>{item.type}</strong></div>
						<div><span>Status</span><strong>{item.status}</strong></div>
						<div><span>Codigo do cliente</span><strong>{item.clientCode || "-"}</strong></div>
						<div><span>Empresa</span><strong>{item.company || "-"}</strong></div>
						<div><span>Regional</span><strong>{item.regional || "-"}</strong></div>
					</div>
					{navigationLoading ? <div className="maps-v2-navigation-summary"><Navigation size={18} /><span>Calculando o melhor caminho...</span></div> : null}
					{navigation ? (
						<div className="maps-v2-navigation-summary">
							<Navigation size={19} />
							<div><strong>{formatDistance(navigation.distanceMeters)}</strong><span>distancia pela rota</span></div>
							<div><strong>{formatDuration(navigation.durationSeconds)}</strong><span>tempo estimado</span></div>
						</div>
					) : null}
					{item.visitEvidence ? (
						<div className={`maps-v2-visit-evidence${visitConfirmed ? " is-confirmed" : ""}`}>
							{visitConfirmed ? <ShieldCheck size={19} /> : <TriangleAlert size={19} />}
							<div><strong>Evidencia de visita</strong><span>{item.visitEvidence.label}</span>{item.visitEvidence.latest ? <small><Clock3 size={13} /> {new Date(item.visitEvidence.latest.lastSeenAt).toLocaleString("pt-BR")} · aproximacao de {Math.round(item.visitEvidence.latest.distanceMeters)} m</small> : null}</div>
						</div>
					) : null}
					{!item.assignedToCurrentUser && item.technician && !item.requestable ? (
						<div className="maps-v2-privacy-note"><UserRound size={18} /><span>OS em atendimento por {item.technician}.</span></div>
					) : null}
					{!item.locationAvailable ? (
						<div className="maps-v2-privacy-note"><MapPin size={18} /><span>Esta oportunidade esta disponivel, mas a localizacao ainda esta sendo processada.</span></div>
					) : null}
					<div className="maps-v2-detail-actions">
						{item.whatsappUrl ? <a className="maps-v2-secondary-button" href={item.whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Falar no WhatsApp <ExternalLink size={14} /></a> : null}
						{item.assignedToCurrentUser ? (<>
							{navigateUrl !== "#" ? <a className="maps-v2-secondary-button" href={navigateUrl} target="_blank" rel="noreferrer"><Navigation size={17} /> Abrir rota <ExternalLink size={14} /></a> : null}
							<button type="button" className="maps-v2-primary-button" disabled={!item.locationAvailable} onClick={() => onAddRoute(item.id)}><Route size={17} /> Adicionar ao roteiro</button>
						</>) : item.requestable ? (
							<button type="button" className="maps-v2-primary-button" disabled={submitting} onClick={requestOrder}><PackagePlus size={17} /> {submitting ? "Enviando..." : item.assignedToOtherTechnician ? "Solicitar transferência" : "Solicitar esta O.S."}</button>
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
