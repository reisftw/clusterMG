import { Crosshair, SlidersHorizontal, Target, X } from "lucide-react";
import { useState } from "react";

const VIEW_RADII = Object.freeze([
	{ meters: 120, label: "120 m" },
	{ meters: 250, label: "250 m" },
	{ meters: 500, label: "500 m" },
	{ meters: 1000, label: "1 km" },
	{ meters: 3000, label: "3 km" },
	{ meters: 5000, label: "5 km" },
]);

export default function MapsFiltersPanel({ open, radiusMeters, sortMode, categories, filters, onClose, onApply }) {
	const [draft, setDraft] = useState({ radiusMeters, sortMode, categories, ...filters });

	if (!open) return null;
	const toggleCategory = (category) => {
		setDraft((current) => {
			const next = current.categories.includes(category)
				? current.categories.filter((item) => item !== category)
				: [...current.categories, category];
			return { ...current, categories: next.length ? next : current.categories };
		});
	};

	return (
		<div className="maps-v2-modal-backdrop maps-v2-filters-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
			<section className="maps-v2-modal maps-v2-filters-panel" role="dialog" aria-modal="true" aria-label="Filtros do mapa">
				<header>
					<div><span className="maps-v2-modal-icon"><SlidersHorizontal size={20} /></span><div><h2>Filtros do mapa</h2><p>Refine as ordens exibidas sem alterar sua localização.</p></div></div>
					<button type="button" className="maps-v2-icon-button" onClick={onClose} aria-label="Fechar filtros"><X size={19} /></button>
				</header>
				<div className="maps-v2-filter-section">
					<strong><Target size={17} /> Ordens visíveis</strong>
					<div className="maps-v2-filter-options">
						<button type="button" className={draft.categories.includes("assigned") ? "is-active is-assigned" : ""} onClick={() => toggleCategory("assigned")}><span /> Minhas OS</button>
						<button type="button" className={draft.categories.includes("opportunity") ? "is-active is-opportunity" : ""} onClick={() => toggleCategory("opportunity")}><span /> Oportunidades</button>
					</div>
				</div>
				<label className="maps-v2-filter-field"><span><Crosshair size={16} /> Raio ao usar minha localização</span><select value={draft.radiusMeters} onChange={(event) => setDraft((current) => ({ ...current, radiusMeters: Number(event.target.value) }))}>{VIEW_RADII.map((radius) => <option key={radius.meters} value={radius.meters}>{radius.label}</option>)}</select></label>
				<label className="maps-v2-filter-field"><span><SlidersHorizontal size={16} /> Ordenar lista por</span><select value={draft.sortMode} onChange={(event) => setDraft((current) => ({ ...current, sortMode: event.target.value }))}><option value="nearest">Mais próximas</option><option value="farthest">Mais distantes</option><option value="priority">Prioridade operacional</option><option value="scheduled">Agendadas primeiro</option></select></label>
				<div className="maps-v2-filter-grid">
					<label className="maps-v2-filter-field"><span>Regional</span><input value={draft.regional || ""} onChange={(event) => setDraft((current) => ({ ...current, regional: event.target.value }))} placeholder="Todas" /></label>
					<label className="maps-v2-filter-field"><span>Cidade</span><input value={draft.city || ""} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} placeholder="Todas" /></label>
					<label className="maps-v2-filter-field"><span>Status</span><select value={draft.status || ""} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}><option value="">Todos</option><option value="AGENDADA">Agendada</option><option value="PENDENTE">Pendente</option></select></label>
					<label className="maps-v2-filter-field"><span>Atribuição</span><select value={draft.assignment || ""} onChange={(event) => setDraft((current) => ({ ...current, assignment: event.target.value }))}><option value="">Todas</option><option value="MINHAS">Minhas O.S.</option><option value="DISPONIVEIS">Disponíveis</option><option value="OUTROS">Outros técnicos</option></select></label>
				</div>
				<footer className="maps-v2-modal-actions"><button type="button" className="maps-v2-secondary-button" onClick={onClose}>Cancelar</button><button type="button" className="maps-v2-primary-button" onClick={() => onApply(draft)}>Aplicar filtros</button></footer>
			</section>
		</div>
	);
}
