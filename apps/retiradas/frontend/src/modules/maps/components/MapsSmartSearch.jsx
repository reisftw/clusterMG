import { Building2, LoaderCircle, MapPin, PackageSearch, Search, UserRound, X } from "lucide-react";

const ICONS = {
	city: Building2,
	neighborhood: MapPin,
	client: UserRound,
	order: PackageSearch,
};

const TYPE_LABELS = {
	city: "Cidade",
	neighborhood: "Bairro",
	client: "Cliente",
	order: "Ordem de serviço",
};

export default function MapsSmartSearch({
	value,
	onChange,
	onSubmit,
	onClear,
	suggestions = [],
	onSelect,
	loading = false,
	error = "",
	open = false,
}) {
	return (
		<form className="maps-v2-search" onSubmit={onSubmit} role="search">
			<Search size={19} aria-hidden="true" />
			<input
				aria-label="Buscar cidade, bairro, cliente ou ordem de serviço"
				placeholder="O.S., cliente, endereço, bairro ou cidade..."
				value={value}
				onChange={(event) => onChange(event.target.value)}
				autoComplete="off"
				inputMode="search"
			/>
			{loading ? <LoaderCircle className="maps-v2-spin maps-v2-search-loader" size={18} aria-label="Buscando" /> : null}
			{value ? <button type="button" className="maps-v2-search-clear" onClick={onClear} aria-label="Limpar busca"><X size={18} /></button> : null}
			<button type="submit" className="maps-v2-search-button"><Search size={17} /><span>Buscar</span></button>
			{open ? (
				<div className="maps-v2-search-popover" role="listbox">
					{error ? <div className="maps-v2-search-state is-error">{error}</div> : null}
					{!error && !loading && !suggestions.length ? <div className="maps-v2-search-state">Nenhum resultado encontrado.</div> : null}
					{suggestions.map((suggestion) => {
						const Icon = ICONS[suggestion.type] || MapPin;
						return (
							<button key={`${suggestion.type}-${suggestion.query}-${suggestion.point?.id || ""}`} type="button" role="option" onClick={() => onSelect(suggestion)}>
								<span><Icon size={17} /></span>
								<strong>{suggestion.label}</strong>
								<small>{TYPE_LABELS[suggestion.type] || "Local"}</small>
							</button>
						);
					})}
				</div>
			) : null}
		</form>
	);
}
