import { LoaderCircle, Search, UserRoundCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

export default function AdminOrderAssignmentModal({
	open,
	order,
	technicians,
	loading,
	saving,
	error,
	onClose,
	onConfirm,
}) {
	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState("");
	const filtered = useMemo(() => {
		const term = search.trim().toLocaleLowerCase("pt-BR");
		return (technicians || []).filter((item) => {
			if (!term) return true;
			return [item.displayName, item.name, item.id].some((value) =>
				String(value || "").toLocaleLowerCase("pt-BR").includes(term),
			);
		});
	}, [search, technicians]);
	if (!open) return null;
	const selected = technicians.find((item) => String(item.id) === selectedId) || null;

	return (
		<div className="maps-command-modal-backdrop" role="presentation" onMouseDown={onClose}>
			<section className="maps-command-assignment" role="dialog" aria-modal="true" aria-labelledby="maps-assignment-title" onMouseDown={(event) => event.stopPropagation()}>
				<header>
					<div><span><UserRoundCheck size={20} /></span><div><strong id="maps-assignment-title">Atribuir técnico</strong><small>O.S. {order?.orderNumber} · cliente {order?.clientCode || "não informado"}</small></div></div>
					<button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
				</header>
				<label className="maps-command-assignment-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar técnico do HubSoft" autoFocus /></label>
				<div className="maps-command-assignment-list">
					{loading ? <div className="maps-command-assignment-empty"><LoaderCircle className="maps-v2-spin" size={20} />Carregando técnicos...</div> : null}
					{!loading ? filtered.map((item) => (
						<button type="button" key={item.id} className={String(item.id) === selectedId ? "is-selected" : ""} onClick={() => setSelectedId(String(item.id))}>
							<span>{String(item.displayName || item.name || "T").slice(0, 1)}</span>
							<div><strong>{item.displayName || item.name}</strong><small>{item.name}{item.isWithdrawal ? " · Retiradas" : ""}</small></div>
						</button>
					)) : null}
					{!loading && !filtered.length ? <div className="maps-command-assignment-empty">Nenhum técnico encontrado.</div> : null}
				</div>
				{error ? <p className="maps-command-assignment-error">{error}</p> : null}
				<footer><button type="button" className="is-secondary" onClick={onClose}>Cancelar</button><button type="button" disabled={!selected || saving} onClick={() => onConfirm(selected)}>{saving ? <><LoaderCircle className="maps-v2-spin" size={16} /> Enviando...</> : "Atribuir O.S."}</button></footer>
			</section>
		</div>
	);
}
