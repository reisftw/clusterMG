import {
	Bell,
	Box,
	ChevronRight,
	CircleDollarSign,
	Clock3,
	Grid2X2,
	HelpCircle,
	ListChecks,
	LogOut,
	MapPin,
	Menu,
	PackageCheck,
	PackagePlus,
	Search,
	UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MercadoMap from "./MercadoMap";
import { MercadoBrand } from "./MercadoBrand";
import "../mercado-design.css";
import { mercadoProviderApi } from "../services/mercadoProviderApi";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ProviderNav({ mobile = false, onNavigate }) {
	const links = [
		{ label: "Dashboard", icon: Grid2X2, to: "/mercado/dashboard", active: true },
		{ label: "Disponíveis", icon: PackageCheck, to: "/mercado/dashboard#oportunidades" },
		{ label: "Montar lote", icon: Box, to: "/mercado/montar-lote" },
		{ label: "Meus lotes", icon: ListChecks, to: "/mercado/meus-lotes" },
		{ label: "Meu perfil", icon: UserRound, to: "/mercado/meu-perfil" },
	];
	return (
		<nav className={`mercado-provider-nav ${mobile ? "mercado-provider-nav--mobile" : ""}`}>
			{links.map(({ label, icon: Icon, to, active }) => (
				<Link key={label} to={to} onClick={onNavigate} className={active ? "is-active" : ""}>
					<Icon size={19} />
					<span>{label}</span>
				</Link>
			))}
		</nav>
	);
}

function MetricCard({ icon: Icon, label, value, detail, progress }) {
	return (
		<article className="mercado-reference-metric">
			<div className="mercado-reference-metric__icon"><Icon size={23} /></div>
			<div className="min-w-0 flex-1">
				<p>{label}</p>
				<strong>{value}</strong>
				<span>{detail}</span>
				{typeof progress === "number" ? <div className="mercado-reference-progress"><i style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} /></div> : null}
			</div>
		</article>
	);
}

function OpportunityList({ cities, selectedCity, onSelect }) {
	return (
		<aside className="mercado-reference-opportunities">
			<div className="mercado-reference-section-heading">
				<div><h2>Principais oportunidades</h2><p>Priorize cidades com maior volume.</p></div>
				<span>{cities.length}</span>
			</div>
			<div className="mercado-reference-opportunities__list">
				{cities.slice(0, 8).map((city, index) => (
					<button key={city.cidade} type="button" onClick={() => onSelect(city.cidade)} className={selectedCity === city.cidade ? "is-selected" : ""}>
						<i className={`is-${index % 4}`} />
						<div><strong>{city.cidade}</strong><span>{city.total} OS disponíveis</span><small>{city.equipamentos.slice(0, 2).map((item) => `${item.tipo} ${item.total}`).join(" · ") || "Equipamentos diversos"}</small></div>
						<ChevronRight size={18} />
					</button>
				))}
				{!cities.length ? <p className="p-4 text-sm font-semibold text-slate-500">Não há oportunidades elegíveis agora.</p> : null}
			</div>
		</aside>
	);
}

function ActiveLots({ lots }) {
	return (
		<section className="mercado-reference-lots">
			<div className="mercado-reference-lots__heading"><div><h2>Meus lotes ativos</h2><p>Acompanhe seus lotes em execução.</p></div><Link to="/mercado/meus-lotes">Ver todos</Link></div>
			<div className="mercado-reference-lots__grid">
				{lots.slice(0, 3).map((lot) => {
					const total = Number(lot.total || 0);
					return <Link key={lot.status} to="/mercado/meus-lotes" className="mercado-reference-lot"><div className="mercado-reference-lot__icon"><PackagePlus size={18} /></div><div><strong>{lot.status === "IN_EXECUTION" ? "Lotes em execução" : lot.status === "ACCEPTED" ? "Lotes aceitos" : "Outros lotes"}</strong><p>{total} lote(s) nesta etapa</p><div className="mercado-reference-progress"><i style={{ width: `${Math.min(100, total ? 64 : 0)}%` }} /></div><span>Abrir tratativas <ChevronRight size={14} /></span></div></Link>;
				})}
				{!lots.length ? <div className="mercado-reference-lot mercado-reference-lot--empty"><PackageCheck size={22} /><p>Seus lotes aceitos aparecerão aqui.</p></div> : null}
			</div>
		</section>
	);
}

export default function MercadoProviderDashboardV7() {
	const [data, setData] = useState(null);
	const [selectedCity, setSelectedCity] = useState("");
	const [query, setQuery] = useState("");
	const [error, setError] = useState("");
	const [mobileOpen, setMobileOpen] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		let active = true;
		mercadoProviderApi.dashboard(query).then((value) => active && setData(value)).catch((err) => active && setError(err.message));
		return () => { active = false; };
	}, [query]);

	const cities = data?.cidades?.items || [];
	const lots = data?.lotes || [];
	const available = useMemo(() => cities.reduce((sum, city) => sum + Number(city.total || 0), 0), [cities]);
	const activeLots = useMemo(() => lots.filter((lot) => ["ACCEPTED", "IN_EXECUTION"].includes(lot.status)).reduce((sum, lot) => sum + Number(lot.total || 0), 0), [lots]);
	const potential = useMemo(() => lots.reduce((sum, lot) => sum + Number(lot.valor || 0), 0), [lots]);

	async function logout() {
		await mercadoProviderApi.logout();
		navigate("/mercado/login", { replace: true });
	}

	if (!data) return <main className="mercado-public"><p className="p-8 text-sm font-bold text-slate-500">Carregando Mercado...</p></main>;

	return (
		<div className="mercado-reference-shell">
			<aside className="mercado-reference-sidebar">
				<Link to="/mercado/dashboard"><MercadoBrand /></Link>
				<ProviderNav />
				<div className="mercado-reference-help"><HelpCircle size={20} /><strong>Precisa de ajuda?</strong><p>Acesse nosso suporte ou fale com o time.</p><a href="mailto:suporte@retiradas.tech">Central de ajuda</a></div>
			</aside>
			{mobileOpen ? <aside className="mercado-reference-mobile-menu"><div className="flex items-center justify-between"><MercadoBrand /><button type="button" onClick={() => setMobileOpen(false)}>Fechar</button></div><ProviderNav mobile onNavigate={() => setMobileOpen(false)} /></aside> : null}
			<div className="mercado-reference-content">
				<header className="mercado-reference-header"><button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div><p>Mercado de Retiradas</p><strong>Dashboard</strong></div><div className="ml-auto flex items-center gap-4"><button type="button" aria-label="Notificações" className="relative"><Bell size={21} /><i>3</i></button><Link to="/mercado/meu-perfil" className="mercado-reference-user"><span>{(data.user.displayName || "MR").split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{data.user.displayName}</strong><p>Prestador</p></div></Link><button type="button" onClick={logout} className="text-slate-500" aria-label="Sair"><LogOut size={19} /></button></div></header>
				<main className="mercado-reference-main">
					<section className="mercado-reference-hero"><div><h1>Olá, {data.user.displayName}</h1><p>Encontre e monte seus lotes de retiradas em Minas Gerais.</p></div><Link to="/mercado/montar-lote"><PackagePlus size={20} />Montar lote <ChevronRight size={20} /></Link></section>
					{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
					<section className="mercado-reference-metrics">
						<MetricCard icon={PackageCheck} label="OS disponíveis" value={available.toLocaleString("pt-BR")} detail={`Em ${cities.length} cidades`} />
						<MetricCard icon={MapPin} label="Cidades com oportunidades" value={cities.length} detail="dos 853 municípios" />
						<MetricCard icon={ListChecks} label="Meus lotes ativos" value={`${activeLots} / 3`} detail={`${Math.max(3 - activeLots, 0)} vaga(s) disponível(is)`} progress={(activeLots / 3) * 100} />
						<MetricCard icon={CircleDollarSign} label="Valor potencial" value={money(potential)} detail="Com base nos lotes ativos" />
					</section>
					<section id="oportunidades" className="mercado-reference-opportunities-grid"><section className="mercado-reference-map-card"><div className="mercado-reference-map-card__heading"><div><h2>Oportunidades em Minas Gerais</h2><p>Visualize as cidades com retiradas disponíveis e monte seu lote.</p></div><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cidade..." /></label></div><MercadoMap cities={cities} selectedCity={selectedCity} onSelectCity={setSelectedCity} /><div className="mercado-reference-map-summary"><Box size={20} /><div><span>Total em Minas Gerais</span><strong>{available.toLocaleString("pt-BR")} OS</strong></div></div>{selectedCity ? <Link to={`/mercado/montar-lote?cidade=${encodeURIComponent(selectedCity)}`} className="mercado-reference-city-action">Montar lote em {selectedCity}<ChevronRight size={18} /></Link> : null}</section><OpportunityList cities={cities} selectedCity={selectedCity} onSelect={setSelectedCity} /></section>
					<ActiveLots lots={lots} />
				</main>
			</div>
		</div>
	);
}
