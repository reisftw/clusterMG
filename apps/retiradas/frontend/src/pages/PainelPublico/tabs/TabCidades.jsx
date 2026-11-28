import { useMemo, useState } from "react";
import {
	Building2,
	CalendarDays,
	ChevronRight,
	Clock3,
	MapPin,
	Search,
	TrendingDown,
	X,
} from "lucide-react";

const MONTHS = [
	"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
	"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const number = new Intl.NumberFormat("pt-BR");

function companyValue(item, company) {
	if (company === "SEMPRE") return Number(item?.sempre || 0);
	if (company === "ONNET") return Number(item?.onnet || 0);
	return Number(item?.total || 0);
}

function normalize(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function formatDateTime(value) {
	if (!value) return "Aguardando sincronização";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Aguardando sincronização"
		: date.toLocaleString("pt-BR");
}

function Metric({ icon: Icon, label, value, helper, tone = "blue" }) {
	return (
		<article className={`cities-metric cities-metric--${tone}`}>
			<span className="cities-metric__icon"><Icon size={20} /></span>
			<div><span>{label}</span><strong>{number.format(value || 0)}</strong><small>{helper}</small></div>
		</article>
	);
}

function CityDetail({ city, company, onClose }) {
	const max = Math.max(1, ...city.mensal.map((item) => companyValue(item, company)));
	return (
		<div className="cities-modal-backdrop" role="presentation" onMouseDown={(event) => {
			if (event.target === event.currentTarget) onClose();
		}}>
			<section className="cities-modal" role="dialog" aria-modal="true" aria-labelledby="city-detail-title">
				<header>
					<div><span>Histórico anual</span><h2 id="city-detail-title">{city.cidade}</h2><p>{city.regional}</p></div>
					<button type="button" onClick={onClose} aria-label="Fechar detalhes"><X size={22} /></button>
				</header>
				<div className="cities-modal__summary">
					<div><span>Total no ano</span><strong>{number.format(companyValue(city, company))}</strong></div>
					<div><span>SEMPRE</span><strong>{number.format(city.sempre)}</strong></div>
					<div><span>ONNET</span><strong>{number.format(city.onnet)}</strong></div>
				</div>
				<div className="cities-month-chart">
					{city.mensal.map((month, index) => {
						const value = companyValue(month, company);
						return <div className="cities-month-row" key={month.competencia}>
							<span>{MONTHS[index]}</span>
							<div><i style={{ width: `${Math.max(value ? 3 : 0, (value / max) * 100)}%` }} /></div>
							<strong>{number.format(value)}</strong>
						</div>;
					})}
				</div>
			</section>
		</div>
	);
}

export default function TabCidades({ data, month = "Janeiro", error = "", onRefresh }) {
	const [company, setCompany] = useState("TODAS");
	const [regional, setRegional] = useState("TODAS");
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState(null);
	const monthIndex = Math.max(0, MONTHS.indexOf(month));
	const selectedMonth = data?.months?.[monthIndex] || {};
	const regionalOptions = data?.regionals || [];
	const cities = useMemo(() => {
		const query = normalize(search);
		return (data?.cities || [])
			.filter((city) => regional === "TODAS" || city.regional === regional)
			.filter((city) => !query || normalize(`${city.cidade} ${city.regional}`).includes(query))
			.filter((city) => companyValue(city, company) > 0)
			.sort((left, right) => companyValue(right, company) - companyValue(left, company));
	}, [company, data?.cities, regional, search]);

	if (error && !data) {
		return <section className="cities-empty"><TrendingDown size={34} /><h2>Não foi possível carregar as cidades</h2><p>{error}</p><button type="button" onClick={onRefresh}>Tentar novamente</button></section>;
	}

	return (
		<section className="cities-dashboard">
			<div className="cities-hero">
				<div><span>Cancelamentos por localidade</span><h2>Cidades, regionais e empresas</h2><p>Visão anual atualizada pela mesma sincronização dos cancelamentos.</p></div>
				<div className="cities-hero-actions">
					<div className="cities-sync-card">
						<Clock3 size={18} />
						<div><span>Última atualização</span><strong>Sincronizado em {formatDateTime(data?.updatedAt)}</strong></div>
					</div>
					<div className="cities-company-switch" aria-label="Filtrar empresa">
						{["TODAS", "SEMPRE", "ONNET"].map((item) => <button key={item} type="button" className={company === item ? "active" : ""} onClick={() => setCompany(item)}>{item === "TODAS" ? "Todas" : item}</button>)}
					</div>
				</div>
			</div>

			<div className="cities-metrics">
				<Metric icon={TrendingDown} label="Cancelamentos no ano" value={companyValue(data?.totals, company)} helper={`${data?.year || new Date().getFullYear()} · ${company === "TODAS" ? "SEMPRE + ONNET" : company}`} tone="orange" />
				<Metric icon={CalendarDays} label={MONTHS[monthIndex]} value={companyValue(selectedMonth, company)} helper="Mês selecionado" />
				<Metric icon={MapPin} label="Cidades" value={cities.length} helper="Com cancelamentos no filtro" tone="green" />
				<Metric icon={Building2} label="Regionais" value={data?.totals?.regionals} helper="Cobertura consolidada" tone="violet" />
			</div>

			<div className="cities-toolbar">
				<label><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cidade ou regional" /></label>
				<select value={regional} onChange={(event) => setRegional(event.target.value)} aria-label="Filtrar regional">
					<option value="TODAS">Todas as regionais</option>
					{regionalOptions.map((item) => <option key={item.regional} value={item.regional}>{item.regional}</option>)}
				</select>
			</div>

			<div className="cities-content-grid">
				<div className="cities-ranking-panel">
					<header><div><span>Ranking anual</span><h3>Cidades que mais cancelaram</h3></div><strong>{number.format(cities.length)} cidades</strong></header>
					<div className="cities-ranking-list">
						{cities.map((city, index) => {
							const value = companyValue(city, company);
							const monthValue = companyValue(city.mensal?.[monthIndex], company);
							return <button type="button" key={`${city.cidade}-${city.regional}`} onClick={() => setSelected(city)}>
								<span className="cities-rank">{index + 1}</span>
								<span className="cities-rank-name"><strong>{city.cidade}</strong><small>{city.regional} · {number.format(monthValue)} em {MONTHS[monthIndex]}</small></span>
								<span className="cities-rank-total"><strong>{number.format(value)}</strong><small>no ano</small></span>
								<ChevronRight size={18} />
							</button>;
						})}
						{!cities.length && <p className="cities-list-empty">Nenhuma cidade encontrada para os filtros.</p>}
					</div>
				</div>

				<aside className="cities-breakdown">
					<section><header><span>Empresas</span><h3>Distribuição no ano</h3></header>
						<div className="cities-company-total"><div><i className="sempre" /><span>SEMPRE</span><strong>{number.format(data?.totals?.sempre || 0)}</strong></div><div><i className="onnet" /><span>ONNET</span><strong>{number.format(data?.totals?.onnet || 0)}</strong></div></div>
					</section>
					<section><header><span>Regionais</span><h3>Maiores volumes</h3></header>
						<div className="cities-regional-list">{regionalOptions.slice(0, 8).map((item, index) => <button type="button" key={item.regional} onClick={() => setRegional(item.regional)}><span>{index + 1}</span><div><strong>{item.regional}</strong><small>SEMPRE {number.format(item.sempre)} · ONNET {number.format(item.onnet)}</small></div><b>{number.format(companyValue(item, company))}</b></button>)}</div>
					</section>
				</aside>
			</div>
			{selected && <CityDetail city={selected} company={company} onClose={() => setSelected(null)} />}
		</section>
	);
}
