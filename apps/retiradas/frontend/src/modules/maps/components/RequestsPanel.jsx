import { Check, Clock3, Inbox, LoaderCircle, MapPin, X, XCircle } from "lucide-react";
import { useState } from "react";

const STATUS_LABELS = {
	PENDING: "Aguardando analise",
	PENDING_EFFECTUATION: "Pendente de efetivacao",
	REJECTED: "Recusada",
	CANCELLED: "Cancelada",
};

export default function RequestsPanel({ open, items, canManage, loading, onClose, onResolve }) {
	const [busyId, setBusyId] = useState("");
	const [message, setMessage] = useState("");
	if (!open) return null;

	async function resolve(id, action) {
		setBusyId(id);
		setMessage("");
		try {
			await onResolve(id, action);
			setMessage(action === "approve" ? "Solicitacao aprovada para efetivacao operacional." : "Solicitacao recusada.");
		} catch (error) {
			setMessage(error.message);
		} finally {
			setBusyId("");
		}
	}

	return (
		<aside className="maps-v2-side-panel" aria-label="Solicitacoes de oportunidades">
			<header><div><span className="maps-v2-panel-icon"><Inbox size={20} /></span><div><h2>Solicitacoes</h2><p>{canManage ? "Fila de analise do BackOffice." : "Acompanhe seus pedidos."}</p></div></div><button type="button" className="maps-v2-icon-button" onClick={onClose} aria-label="Fechar solicitacoes"><X size={19} /></button></header>
			<div className="maps-v2-request-list">
				{loading ? <div className="maps-v2-panel-loading"><LoaderCircle className="maps-v2-spin" size={19} /> Atualizando fila...</div> : null}
				{!loading && !items.length ? <div className="maps-v2-empty"><Inbox size={24} /><strong>Nenhuma solicitacao</strong><span>Os pedidos do Maps aparecerao aqui.</span></div> : null}
				{items.map((item) => (
					<article key={item.id}>
						<header><strong>{item.sourceSnapshot?.orderNumber || "OS"}</strong><span className={`maps-v2-request-status is-${String(item.status).toLowerCase()}`}>{STATUS_LABELS[item.status] || item.status}</span></header>
						{canManage ? <p>{item.requesterName}</p> : null}
						<div><span><MapPin size={14} /> {item.city || "Cidade nao informada"}</span><span><Clock3 size={14} /> {new Date(item.createdAt).toLocaleString("pt-BR")}</span></div>
						{item.resolutionNote ? <small>{item.resolutionNote}</small> : null}
						{canManage && item.status === "PENDING" ? <footer>
							<button type="button" className="maps-v2-reject-button" disabled={busyId === item.id} onClick={() => resolve(item.id, "reject")}><XCircle size={16} /> Recusar</button>
							<button type="button" className="maps-v2-approve-button" disabled={busyId === item.id} onClick={() => resolve(item.id, "approve")}>{busyId === item.id ? <LoaderCircle className="maps-v2-spin" size={16} /> : <Check size={16} />} Aprovar</button>
						</footer> : null}
					</article>
				))}
			</div>
			{message ? <p className="maps-v2-feedback">{message}</p> : null}
		</aside>
	);
}
