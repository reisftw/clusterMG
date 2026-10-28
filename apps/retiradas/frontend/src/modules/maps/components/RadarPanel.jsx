import { Bell, BellRing, Crosshair, Pause, Radio, X } from "lucide-react";
import { useState } from "react";
import { requestMapsNotificationPermission } from "../features/notifications/notificationDispatcher";

const RADII = [100, 250, 300, 500, 1000];

export default function RadarPanel({ open, settings, locationState, onClose, onSave }) {
	const [draft, setDraft] = useState(settings);
	const [saving, setSaving] = useState(false);
	if (!open || !draft) return null;

	function update(key, value) {
		setDraft((current) => ({ ...current, [key]: value }));
	}

	async function enableNotifications() {
		const permission = await requestMapsNotificationPermission();
		update("notificationsEnabled", permission === "granted");
	}

	async function save() {
		setSaving(true);
		try { await onSave(draft); } finally { setSaving(false); }
	}

	return (
		<div className="maps-v2-modal-backdrop">
			<section className="maps-v2-modal" aria-modal="true" role="dialog" aria-label="Configuracoes do Radar">
				<header><div><span className="maps-v2-modal-icon"><Radio size={20} /></span><div><h2>Configuracoes do Radar</h2><p>Alertas de proximidade enquanto o Maps estiver ativo.</p></div></div><button type="button" className="maps-v2-icon-button" onClick={onClose}><X size={19} /></button></header>
				<div className="maps-v2-radar-status">
					<Crosshair size={20} />
					<div><strong>GPS {locationState.status === "active" ? "ativo" : locationState.status}</strong><span>{locationState.position ? `Precisao aproximada: ${Math.round(locationState.position.accuracy)} m` : locationState.error || "Aguardando localizacao"}</span></div>
				</div>
				<label className="maps-v2-switch"><span><strong>Ativar Radar</strong><small>Inicia o acompanhamento de proximidade.</small></span><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(event) => update("enabled", event.target.checked)} /></label>
				<div className="maps-v2-field"><label htmlFor="radar-radius">Raio de alerta</label><select id="radar-radius" value={draft.radiusMeters} onChange={(event) => update("radiusMeters", Number(event.target.value))}>{RADII.map((radius) => <option key={radius} value={radius}>{radius >= 1000 ? "1 km" : `${radius} m`}</option>)}</select></div>
				<label className="maps-v2-switch"><span><strong>Minhas retiradas</strong><small>Avisar sobre OS atribuidas a voce.</small></span><input type="checkbox" checked={Boolean(draft.alertAssigned)} onChange={(event) => update("alertAssigned", event.target.checked)} /></label>
				<label className="maps-v2-switch"><span><strong>Oportunidades</strong><small>Avisar sobre retiradas disponiveis.</small></span><input type="checkbox" checked={Boolean(draft.alertOpportunities)} onChange={(event) => update("alertOpportunities", event.target.checked)} /></label>
				<button type="button" className="maps-v2-notification-permission" onClick={enableNotifications}>{draft.notificationsEnabled ? <BellRing size={18} /> : <Bell size={18} />}{draft.notificationsEnabled ? "Notificacoes autorizadas" : "Autorizar notificacoes"}</button>
				<div className="maps-v2-time-grid"><label>Inicio<input type="time" value={String(draft.scheduleStart || "08:00").slice(0, 5)} onChange={(event) => update("scheduleStart", event.target.value)} /></label><label>Fim<input type="time" value={String(draft.scheduleEnd || "18:00").slice(0, 5)} onChange={(event) => update("scheduleEnd", event.target.value)} /></label></div>
				<div className="maps-v2-modal-actions"><button type="button" className="maps-v2-secondary-button" onClick={() => update("quietUntil", new Date(Date.now() + 60 * 60 * 1000).toISOString())}><Pause size={17} /> Pausar por 1 hora</button><button type="button" className="maps-v2-primary-button" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar configuracoes"}</button></div>
				<p className="maps-v2-browser-note">O Android pode suspender o GPS quando o PWA estiver minimizado, bloqueado ou fechado.</p>
			</section>
		</div>
	);
}
