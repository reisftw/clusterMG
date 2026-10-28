import { FlaskConical, LoaderCircle, Play, X } from "lucide-react";
import { useState } from "react";

export default function SimulatorPanel({ open, initialPosition, onClose, onSimulate }) {
	const [latitude, setLatitude] = useState(initialPosition?.latitude || -19.9167);
	const [longitude, setLongitude] = useState(initialPosition?.longitude || -43.9345);
	const [radiusMeters, setRadiusMeters] = useState(300);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState(null);
	const [error, setError] = useState("");
	if (!open) return null;

	async function run() {
		setLoading(true);
		setError("");
		try {
			setResult(await onSimulate({ latitude: Number(latitude), longitude: Number(longitude), radiusMeters }));
		} catch (simulationError) {
			setError(simulationError.message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="maps-v2-modal-backdrop">
			<section className="maps-v2-modal" role="dialog" aria-modal="true" aria-label="Simulador de deslocamento">
				<header><div><span className="maps-v2-modal-icon"><FlaskConical size={20} /></span><div><h2>Simulador de deslocamento</h2><p>Modo de teste. Nao altera GPS, OS ou titularidade.</p></div></div><button type="button" className="maps-v2-icon-button" onClick={onClose} aria-label="Fechar simulador"><X size={19} /></button></header>
				<div className="maps-v2-simulator-grid"><label>Latitude<input type="number" step="0.00001" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitude<input type="number" step="0.00001" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label></div>
				<div className="maps-v2-field"><label htmlFor="simulator-radius">Raio simulado</label><select id="simulator-radius" value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))}><option value={100}>100 m</option><option value={250}>250 m</option><option value={300}>300 m</option><option value={500}>500 m</option><option value={1000}>1 km</option></select></div>
				<button type="button" className="maps-v2-primary-button maps-v2-full-button" disabled={loading} onClick={run}>{loading ? <LoaderCircle className="maps-v2-spin" size={18} /> : <Play size={18} />} Executar simulacao</button>
				{result ? <div className="maps-v2-simulation-result"><strong>{result.items?.length || 0} retirada(s) no raio</strong><span>{result.alertPreview ? "Um alerta seria gerado." : "Nenhum alerta seria gerado."}</span><small>Posicao identificada como simulada e sem efeito operacional.</small></div> : null}
				{error ? <p className="maps-v2-feedback is-error">{error}</p> : null}
			</section>
		</div>
	);
}
