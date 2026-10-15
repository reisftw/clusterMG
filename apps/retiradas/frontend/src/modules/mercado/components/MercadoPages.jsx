import {
	AlertTriangle,
	ArrowRight,
	BadgeDollarSign,
	BarChart3,
	Building2,
	CalendarDays,
	Check,
	CheckCircle2,
	ChevronDown,
	CircleDollarSign,
	Download,
	ExternalLink,
	FileText,
	Globe2,
	HelpCircle,
	Layers3,
	LockKeyhole,
	MapPin,
	PackageCheck,
	Play,
	Plus,
	RefreshCw,
	Save,
	Search,
	Settings2,
	ShieldAlert,
	ShoppingBag,
	TimerReset,
	Upload,
	Users,
	UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import { hasAnyPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { ROUTES } from "../../../router/routes";
import { mercadoApi } from "../services/mercadoService";
import MercadoMap from "./MercadoMap";
import { MercadoBrand } from "./MercadoBrand";
import "../mercado-design.css";

const statusLabels = {
	DRAFT: "Rascunho",
	AVAILABLE: "Disponível",
	ACCEPTED: "Aceito",
	IN_EXECUTION: "Em execução",
	SUBMITTED: "Submetido",
	APPROVED: "Aprovado",
	CANCELED: "Cancelado",
	WITHDRAWN: "Desistido",
};

const statusClasses = {
	DRAFT: "bg-slate-100 text-slate-700",
	AVAILABLE: "bg-cyan-50 text-cyan-800",
	ACCEPTED: "bg-blue-50 text-blue-800",
	IN_EXECUTION: "bg-indigo-50 text-indigo-800",
	SUBMITTED: "bg-amber-50 text-amber-800",
	APPROVED: "bg-emerald-50 text-emerald-800",
	CANCELED: "bg-red-50 text-red-800",
	WITHDRAWN: "bg-slate-100 text-slate-500",
};

function money(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function formatDateTime(value) {
	if (!value) return "Sem prazo";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Sem prazo";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatDate(value) {
	if (!value) return "Não informado";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Não informado";
	return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function pluralOs(value) {
	const total = Number(value || 0);
	return `${total} ${total === 1 ? "OS" : "OS"}`;
}

function optionValues(items = []) {
	return items.map((item) => item.value || item).filter(Boolean);
}

function Badge({ status }) {
	return (
		<span
			className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusClasses[status] || "bg-slate-100 text-slate-700"}`}
		>
			{statusLabels[status] || status || "-"}
		</span>
	);
}

function ErrorState({ message }) {
	if (!message) return null;
	return (
		<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
			{message}
		</div>
	);
}

function EmptyState({ title, description }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
			<p className="text-lg font-black text-slate-900">{title}</p>
			<p className="mt-2 text-sm font-semibold text-slate-500">{description}</p>
		</div>
	);
}

function Kpi({ icon: Icon, label, value, detail }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
						{label}
					</p>
					<p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
				</div>
				<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
					<Icon size={22} />
				</div>
			</div>
			{detail ? <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p> : null}
		</div>
	);
}

function NumberField({ label, value, onChange, disabled, suffix }) {
	return (
		<label className="block rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-600">
			<span className="flex items-center justify-between gap-2">
				{label}
				{suffix ? <span className="text-xs font-black text-slate-400">{suffix}</span> : null}
			</span>
			<input
				disabled={disabled}
				type="number"
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-lg font-black text-slate-950 outline-none focus:border-cyan-500 disabled:opacity-70"
			/>
		</label>
	);
}

function ProgressBar({ value, tone = "cyan" }) {
	const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
	const toneClass = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-cyan-500";
	return (
		<div className="h-2 overflow-hidden rounded-full bg-slate-100">
			<div className={`h-full rounded-full ${toneClass}`} style={{ width: `${safeValue}%` }} />
		</div>
	);
}

function MercadoPageHeader({ eyebrow, title, description, action }) {
	return (
		<div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
			<div>
				{eyebrow ? (
					<p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">{eyebrow}</p>
				) : null}
				<h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1>
				{description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
			</div>
			{action}
		</div>
	);
}

function useLoad(loader, deps = []) {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [version, setVersion] = useState(0);
	const loaderRef = useRef(loader);
	const depsKey = useMemo(() => JSON.stringify(deps), [deps]);

	useEffect(() => {
		loaderRef.current = loader;
	});

	useEffect(() => {
		let active = true;
		Promise.resolve().then(() => {
			if (!active) return;
			setLoading(true);
			setError("");
			loaderRef.current()
				.then((result) => {
					if (active) setData(result);
				})
				.catch((err) => {
					if (active) setError(err?.message || "Falha ao carregar dados.");
				})
				.finally(() => {
					if (active) setLoading(false);
				});
		});
		return () => {
			active = false;
		};
	}, [depsKey, version]);

	return { data, loading, error, reload: () => setVersion((cur) => cur + 1) };
}

const landingBenefits = [
	{ icon: Layers3, title: "Mais eficiência", text: "Oportunidades organizadas para facilitar a execução em campo." },
	{ icon: MapPin, title: "Lotes por região", text: "Ordens de serviço agrupadas por cidade e bairros próximos." },
	{ icon: CircleDollarSign, title: "Remuneração transparente", text: "Valores, prazos e condições exibidos antes do aceite." },
	{ icon: TimerReset, title: "Acompanhamento operacional", text: "Prazos, evidências e aprovações em uma rotina rastreável." },
	{ icon: Building2, title: "Gestão centralizada", text: "Histórico, financeiro e performance reunidos em uma única plataforma." },
];

const howItWorks = [
	["Encontre oportunidades", "Consulte lotes disponíveis conforme sua habilitação."],
	["Aceite e planeje", "Selecione um lote e organize a execução da equipe."],
	["Execute as retiradas", "Registre tentativas, agendamentos e evidências."],
	["Acompanhe o progresso", "Monitore prazos, pendências e aprovações."],
	["Receba pelos resultados", "Acompanhe a apuração dos lotes aprovados."],
];

const faqItems = [
	["O que é o Mercado de Retiradas?", "É uma plataforma para organizar oportunidades de recuperação de equipamentos com execução, evidências, aprovação e financeiro em um só fluxo."],
	["Como minha empresa participa?", "A participação passa por validação administrativa. O interesse pode ser registrado pelo canal institucional, sem concessão automática de acesso."],
	["Como funcionam os lotes?", "Os lotes agrupam ordens de retirada por cidade, equipamento e critérios operacionais configurados no sistema."],
	["Como funciona a remuneração?", "Os valores são definidos pelas regras vigentes e aparecem antes do aceite, com apuração após aprovação operacional."],
	["Como são registradas as retiradas?", "A execução permite registrar tentativas, agendamentos, evidências e desfechos de cada ordem."],
	["Como acompanho meus pagamentos?", "A tela financeira exibe contratado, aprovado, liberado, pago e pendências conforme permissão."],
	["Como funciona a aprovação das evidências?", "O BackOffice confere o material enviado e pode aprovar, rejeitar ou solicitar correção."],
];

export function MercadoLandingPage() {
	const [menuOpen, setMenuOpen] = useState(false);
	const loginUrl = ROUTES.MERCADO_LOGIN;
	return (
		<div className="min-h-dvh bg-[#F3F6FA] text-[#172B4D]">
			<header className="sticky top-0 z-40 border-b border-white/60 bg-white/90 backdrop-blur">
				<div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 lg:px-6">
					<a href="#topo" className="flex items-center">
						<MercadoBrand tone="light" className="max-w-[220px]" />
					</a>
					<nav className="hidden items-center gap-6 text-sm font-black text-[#64748B] lg:flex">
						<a href="#como-funciona" className="hover:text-[#146DAD]">Como funciona</a>
						<a href="#vantagens" className="hover:text-[#146DAD]">Vantagens</a>
						<a href="#empresas" className="hover:text-[#146DAD]">Para empresas</a>
						<a href="#faq" className="hover:text-[#146DAD]">Perguntas frequentes</a>
						<a href="#contato" className="hover:text-[#146DAD]">Contato</a>
					</nav>
					<div className="flex items-center gap-2">
						<Link to={loginUrl} className="hidden rounded-lg bg-[#155EEF] px-4 py-2.5 text-sm font-black text-white shadow-sm lg:inline-flex">
							Acessar sistema
						</Link>
						<button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white lg:hidden" aria-label="Abrir menu">
							<ChevronDown size={18} />
						</button>
					</div>
				</div>
				{menuOpen ? (
					<div className="border-t border-[#E2E8F0] bg-white px-4 py-3 lg:hidden">
						<div className="grid gap-2 text-sm font-black text-[#64748B]">
							<a href="#como-funciona" onClick={() => setMenuOpen(false)}>Como funciona</a>
							<a href="#vantagens" onClick={() => setMenuOpen(false)}>Vantagens</a>
							<a href="#empresas" onClick={() => setMenuOpen(false)}>Para empresas</a>
							<Link to={loginUrl} className="mt-2 rounded-lg bg-[#155EEF] px-4 py-2.5 text-center text-white">Acessar sistema</Link>
						</div>
					</div>
				) : null}
			</header>

			<main id="topo">
				<section className="relative overflow-hidden bg-[#0C203B]">
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(20,109,173,.45),transparent_32%),linear-gradient(135deg,rgba(23,184,154,.16),transparent_45%)]" />
					<div className="relative mx-auto grid min-h-[calc(100dvh-80px)] max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-[1.02fr_.98fr] lg:px-6">
						<div className="max-w-3xl">
							<p className="inline-flex rounded-full border border-cyan-200/30 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
								SaaS B2B para logística reversa
							</p>
							<h1 className="mt-5 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
								Conectando empresas a novas oportunidades de retirada.
							</h1>
							<p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-200 sm:text-lg">
								Uma plataforma inteligente para conectar empresas terceirizadas a oportunidades de recuperação de equipamentos, com organização por região, acompanhamento operacional e remuneração transparente.
							</p>
							<div className="mt-8 flex flex-col gap-3 sm:flex-row">
								<a href="#empresas" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[#17B89A] px-5 text-sm font-black text-[#0C203B]">
									Quero ser uma empresa parceira
								</a>
								<a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-5 text-sm font-black text-white">
									Conheça a plataforma
								</a>
							</div>
						</div>
						<div className="relative">
							<div className="rounded-xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur">
								<div className="aspect-[4/3] rounded-lg bg-[linear-gradient(135deg,#EAF6FF,#FFFFFF)] p-5">
									<div className="grid h-full content-between">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-black uppercase tracking-[0.14em] text-[#146DAD]">Demonstração</p>
												<p className="text-2xl font-black text-[#0C203B]">Lotes por cidade</p>
											</div>
											<Globe2 className="text-[#17B89A]" size={34} />
										</div>
										<div className="grid gap-3">
											{["Patrocínio", "Sete Lagoas", "Uberlândia"].map((cidade, index) => (
												<div key={cidade} className="rounded-lg border border-[#E2E8F0] bg-white p-3 shadow-sm">
													<div className="flex items-center justify-between gap-3">
														<div>
															<p className="font-black text-[#172B4D]">{cidade}</p>
															<p className="text-xs font-semibold text-[#64748B]">{15 + index * 10} OS · ONU</p>
														</div>
														<span className="rounded-full bg-[#EAF7F4] px-3 py-1 text-xs font-black text-[#07866F]">Exemplo</span>
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>
							<div className="absolute -bottom-6 -left-4 hidden rounded-lg border border-white/20 bg-white p-4 shadow-xl sm:block">
								<p className="text-xs font-black uppercase text-[#64748B]">Fluxo operacional</p>
								<p className="mt-1 text-xl font-black text-[#0C203B]">Aceite → Execução → Aprovação</p>
							</div>
						</div>
					</div>
				</section>

				<section id="vantagens" className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
					<MercadoPageHeader eyebrow="Vantagens" title="Uma operação mais clara para quem executa e para quem acompanha." description="Componentes do Mercado organizam o fluxo de ponta a ponta sem expor dados sensíveis no ambiente público." />
					<div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
						{landingBenefits.map(({ icon: Icon, title, text }) => (
							<div key={title} className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
								<div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#EAF3FC] text-[#146DAD]">
									<Icon size={22} />
								</div>
								<h3 className="mt-4 font-black text-[#172B4D]">{title}</h3>
								<p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">{text}</p>
							</div>
						))}
					</div>
				</section>

				<section id="como-funciona" className="bg-white py-16">
					<div className="mx-auto max-w-7xl px-4 lg:px-6">
						<MercadoPageHeader eyebrow="Como funciona" title="Cinco etapas, um fluxo rastreável." description="Da publicação do lote até a apuração financeira, cada etapa fica organizada para execução e auditoria." />
						<div className="mt-8 grid gap-4 lg:grid-cols-5">
							{howItWorks.map(([title, text], index) => (
								<div key={title} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0C203B] text-sm font-black text-white">
										{index + 1}
									</div>
									<h3 className="mt-4 font-black text-[#172B4D]">{title}</h3>
									<p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">{text}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section id="empresas" className="mx-auto grid max-w-7xl gap-8 px-4 py-16 lg:grid-cols-[.9fr_1.1fr] lg:px-6">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.16em] text-[#146DAD]">Para empresas parceiras</p>
						<h2 className="mt-3 text-3xl font-black text-[#0C203B]">Sua empresa pode transformar capacidade operacional em novas oportunidades.</h2>
						<p className="mt-4 text-base font-semibold leading-7 text-[#64748B]">
							A plataforma organiza acesso a lotes, cidades, acompanhamento dos resultados, transparência de regras e histórico operacional. O acesso depende de validação administrativa.
						</p>
						<a href="mailto:contato@sempre.net.br?subject=Interesse%20no%20Mercado%20de%20Retiradas" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#155EEF] px-5 text-sm font-black text-white">
							Tenho interesse em participar
							<ExternalLink size={16} />
						</a>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{["Acesso a lotes", "Organização por cidades", "Acompanhamento dos resultados", "Transparência de regras", "Histórico operacional", "Aprovação rastreável"].map((item) => (
							<div key={item} className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
								<CheckCircle2 className="text-[#17B89A]" size={20} />
								<p className="mt-3 font-black text-[#172B4D]">{item}</p>
							</div>
						))}
					</div>
				</section>

				<section className="bg-[#0C203B] py-16 text-white">
					<div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1fr_1fr] lg:px-6">
						<div>
							<p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Cobertura geográfica</p>
							<h2 className="mt-3 text-3xl font-black">Atuação regional com dados operacionais validados.</h2>
							<p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
								A cobertura pública é apresentada de forma institucional. Cidades e permissões operacionais são controladas internamente por configuração e habilitação.
							</p>
						</div>
						<div className="rounded-xl border border-white/10 bg-white/10 p-5">
							<div className="grid gap-3">
								{["Habilitação por cidade", "Limites por empresa", "SLA por lote", "Histórico auditável"].map((item) => (
									<div key={item} className="flex items-center gap-3 rounded-lg bg-white/10 p-3">
										<MapPin size={18} className="text-[#17B89A]" />
										<span className="font-black">{item}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</section>

				<section id="faq" className="mx-auto max-w-5xl px-4 py-16 lg:px-6">
					<MercadoPageHeader eyebrow="FAQ" title="Perguntas frequentes" description="Informações públicas sobre o funcionamento da plataforma." />
					<div className="mt-8 divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white">
						{faqItems.map(([question, answer]) => (
							<details key={question} className="group p-5">
								<summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black text-[#172B4D]">
									<span className="flex items-center gap-2"><HelpCircle size={18} className="text-[#146DAD]" />{question}</span>
									<ChevronDown size={18} className="transition group-open:rotate-180" />
								</summary>
								<p className="mt-3 text-sm font-semibold leading-6 text-[#64748B]">{answer}</p>
							</details>
						))}
					</div>
				</section>

				<section id="contato" className="mx-auto max-w-7xl px-4 pb-16 lg:px-6">
					<div className="rounded-xl bg-[#155EEF] p-8 text-white lg:p-10">
						<div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<h2 className="text-3xl font-black">Pronto para encontrar novas oportunidades?</h2>
								<p className="mt-2 text-sm font-semibold text-blue-100">Registre interesse ou acesse o sistema com seu login existente.</p>
							</div>
							<div className="flex flex-col gap-3 sm:flex-row">
								<a href="mailto:contato@sempre.net.br?subject=Interesse%20no%20Mercado%20de%20Retiradas" className="rounded-lg bg-white px-5 py-3 text-center text-sm font-black text-[#155EEF]">Quero ser parceiro</a>
								<Link to={loginUrl} className="rounded-lg border border-white/30 px-5 py-3 text-center text-sm font-black text-white">Acessar sistema</Link>
							</div>
						</div>
					</div>
				</section>
			</main>

			<footer className="border-t border-[#E2E8F0] bg-white">
				<div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm font-semibold text-[#64748B] lg:flex-row lg:items-center lg:justify-between lg:px-6">
					<div>
						<p className="font-black text-[#0C203B]">Mercado de Retiradas</p>
						<p>Oportunidades, execução e resultados em um só lugar.</p>
					</div>
					<p>© {new Date().getFullYear()} Retiradas. Termos e privacidade conforme políticas institucionais.</p>
				</div>
			</footer>
		</div>
	);
}

export function MercadoDashboardPage() {
	const { currentUser } = useAuthContext();
	const { data, loading, error, reload } = useLoad(() => mercadoApi.dashboard());
	const [selectedCity, setSelectedCity] = useState("");
	const navigate = useNavigate();
	const lotes = data?.lotes || [];
	const os = data?.os || [];
	const cidades = data?.cidades?.items || [];
	const totalByStatus = Object.fromEntries(lotes.map((item) => [item.status, item.total]));
	const valorByStatus = Object.fromEntries(lotes.map((item) => [item.status, Number(item.valor || 0)]));
	const osRecuperadas = os
		.filter((item) => item.desfecho === "RECUPERADA")
		.reduce((sum, item) => sum + Number(item.total || 0), 0);
	const osTotal = os.reduce((sum, item) => sum + Number(item.total || 0), 0);
	const osSubmetidas = os
		.filter((item) => item.status === "SUBMITTED" || item.status === "APPROVED")
		.reduce((sum, item) => sum + Number(item.total || 0), 0);
	const osPendentes = Math.max(osTotal - osRecuperadas - osSubmetidas, 0);
	const taxa = osTotal ? Math.round((osRecuperadas / osTotal) * 100) : 0;
	const capacidadeMax = Number(data?.config?.lotes?.maxLotesSimultaneosPorEmpresa || 3);
	const capacidadeOcupada = Number(totalByStatus.ACCEPTED || 0) + Number(totalByStatus.IN_EXECUTION || 0);
	const capacidadePct = capacidadeMax ? Math.round((capacidadeOcupada / capacidadeMax) * 100) : 0;
	const isAdmin = hasAnyPermission(currentUser, ["mercado.lotes.manage", "mercado.financeiro.manage", "mercado.backoffice.manage"]);
	const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<section className="mercado-banner rounded-2xl p-6 text-white lg:p-8">
				<div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
					<div>
						<p className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">{isAdmin ? "Painel administrativo" : "Painel operacional"}</p>
						<h1 className="mt-2 text-3xl font-black lg:text-4xl">Olá, {currentUser?.displayName || currentUser?.nome || "equipe"}</h1>
						<p className="mt-2 max-w-xl text-sm font-semibold text-slate-200">Acompanhe oportunidades, lotes e resultados do Mercado de Retiradas em Minas Gerais.</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<button type="button" onClick={() => navigate(ROUTES.MERCADO_LOTES)} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950">Montar lote</button>
						<button type="button" onClick={reload} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white"><RefreshCw size={16} />Atualizar</button>
					</div>
				</div>
			</section>
			<ErrorState message={error} />
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Kpi icon={ShoppingBag} label="OS disponíveis" value={cidades.reduce((sum, city) => sum + Number(city.total || 0), 0)} detail={`${cidades.length} cidades com oportunidades`} />
				<Kpi icon={MapPin} label="Cidades com oportunidades" value={cidades.length} detail="Malha oficial de 853 municípios" />
				<Kpi icon={Layers3} label="Meus lotes ativos" value={`${capacidadeOcupada} / ${capacidadeMax}`} detail={`${Math.max(capacidadeMax - capacidadeOcupada, 0)} vagas disponíveis`} />
				<Kpi icon={BadgeDollarSign} label="Valor potencial" value={money((valorByStatus.AVAILABLE || 0) + (valorByStatus.ACCEPTED || 0) + (valorByStatus.IN_EXECUTION || 0))} detail="Conforme regras financeiras vigentes" />
			</section>
			<section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
				<div className="mercado-card rounded-2xl border bg-white p-4 lg:p-5">
					<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Mapa de oportunidades</p><h2 className="text-xl font-black text-slate-950">Minas Gerais por município</h2><p className="text-sm font-semibold text-slate-500">Clique em uma cidade para explorar oportunidades sem expor dados pessoais.</p></div><span className="text-xs font-bold text-slate-400">Atualizado: {today}</span></div>
					<MercadoMap cities={cidades} selectedCity={selectedCity} onSelectCity={setSelectedCity} />
				</div>
				<aside className="mercado-card rounded-2xl border bg-white p-4 lg:p-5">
					<div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Principais oportunidades</p><h2 className="text-lg font-black text-slate-950">Cidades elegíveis</h2></div><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800">{cidades.length}</span></div>
					<div className="mt-4 max-h-[478px] space-y-2 overflow-y-auto pr-1">
						{cidades.slice(0, 20).map((city) => <button key={city.cidade} type="button" onClick={() => setSelectedCity(city.cidade)} className={`mercado-opportunity w-full p-3 text-left ${selectedCity === city.cidade ? "is-active" : ""}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{city.cidade}</p><p className="mt-1 text-xs font-semibold text-slate-500">{city.equipamentos.slice(0, 2).map((equipment) => equipment.tipo).join(" · ") || "Equipamentos diversos"}</p></div><span className="text-sm font-black text-cyan-700">{city.total}</span></div></button>)}
						{!cidades.length ? <EmptyState title="Sem oportunidades agora" description="Quando houver OS elegíveis, elas aparecerão aqui." /> : null}
					</div>
					{selectedCity ? <button type="button" onClick={() => navigate(`${ROUTES.MERCADO_LOTES}?cidade=${encodeURIComponent(selectedCity)}`)} className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950">Explorar {selectedCity}</button> : null}
				</aside>
			</section>
			<section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
				<div className="mercado-card rounded-2xl border bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Meus lotes ativos</p><h2 className="text-xl font-black">Visão operacional</h2></div><Play className="text-cyan-700" /></div><div className="mt-5 space-y-4">{lotes.map((item) => { const total = Number(item.total || 0); const max = Math.max(...lotes.map((row) => Number(row.total || 0)), 1); return <div key={item.status}><div className="mb-2 flex justify-between text-sm font-black text-slate-700"><span>{statusLabels[item.status] || item.status}</span><span>{total} lote(s)</span></div><ProgressBar value={(total / max) * 100} tone={item.status === "APPROVED" ? "emerald" : item.status === "SUBMITTED" ? "amber" : "cyan"} /></div>; })}{!lotes.length ? <EmptyState title="Nenhum lote ativo" description="Os lotes aceitos aparecerão nesta área." /> : null}</div></div>
				<div className="mercado-card rounded-2xl border bg-white p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Saúde da operação</p><h2 className="text-xl font-black">Indicadores de acompanhamento</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Kpi icon={CheckCircle2} label="OS recuperadas" value={osRecuperadas} detail={`${taxa}% de conclusão`} /><Kpi icon={FileText} label="OS pendentes" value={osPendentes} detail={`${osSubmetidas} submetidas`} /></div></div>
			</section>
		</div>
	);
}

function LotesCards({ data, onAction, actionLabel, actionIcon: ActionIcon, busyId, showDetailsAction = false }) {
	const items = data?.items || [];
	if (!items.length) {
		return <EmptyState title="Nenhum lote encontrado" description="Ajuste os filtros ou gere novos lotes." />;
	}
	return (
		<div className="grid gap-4 xl:grid-cols-2">
			{items.map((item) => {
				const value = item.valorContratado ?? item.valorPotencial;
				return (
					<article
						key={item.id}
						className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg hover:shadow-slate-200/80"
					>
						<div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50/60 p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<Link
										to={`/mercado/lotes/${item.id}`}
										className="inline-flex items-center gap-2 text-lg font-black text-slate-950 hover:text-cyan-700"
									>
										{item.codigo}
										<ArrowRight size={16} />
									</Link>
									<div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
										<span className="inline-flex items-center gap-1">
											<MapPin size={13} />
											{item.cidade || "Sem cidade"}
										</span>
										<span className="inline-flex items-center gap-1">
											<PackageCheck size={13} />
											{item.equipamentoTipo || "Equipamento"}
										</span>
									</div>
								</div>
								<Badge status={item.status} />
							</div>
						</div>
						<div className="space-y-4 p-4">
							<div className="grid grid-cols-3 gap-2">
								<div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
									<p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Volume</p>
									<p className="mt-1 text-lg font-black text-slate-950">{pluralOs(item.quantidadeOs)}</p>
								</div>
								<div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
									<p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Valor</p>
									<p className="mt-1 text-lg font-black text-slate-950">{money(value)}</p>
								</div>
								<div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
									<p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">SLA</p>
									<p className="mt-1 text-lg font-black text-slate-950">{Number(item.slaHours || 0)}h</p>
								</div>
							</div>
							<div className="grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2">
								<div className="flex items-center gap-2 rounded-lg bg-white">
									<TimerReset size={16} className="text-cyan-700" />
									<span>Desistência até {formatDateTime(item.withdrawDeadlineAt)}</span>
								</div>
								<div className="flex items-center gap-2 rounded-lg bg-white">
									<Users size={16} className="text-cyan-700" />
									<span>{item.acceptedByEmpresaNome || "Ainda sem empresa"}</span>
								</div>
							</div>
							{item.bairros?.length ? (
								<div className="flex flex-wrap gap-2">
									{item.bairros.slice(0, 5).map((bairro) => (
										<span key={bairro} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
											{bairro}
										</span>
									))}
									{item.bairros.length > 5 ? (
										<span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800">
											+{item.bairros.length - 5}
										</span>
									) : null}
								</div>
							) : null}
							<div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
								<p className="text-xs font-semibold text-slate-400">
									Criado em {formatDateTime(item.createdAt)}
								</p>
								<div className="flex flex-wrap items-center justify-end gap-2">
								{showDetailsAction ? (
									<Link
										to={`/mercado/lotes/${item.id}`}
										className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 text-sm font-black text-cyan-900 hover:bg-cyan-100"
									>
										<FileText size={16} />
										Abrir ordens e tratativas
									</Link>
								) : null}
								{onAction ? (
									<button
										type="button"
										disabled={busyId === item.id}
										onClick={() => onAction(item)}
										className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-70"
									>
										{ActionIcon ? <ActionIcon size={16} /> : null}
										{busyId === item.id ? "Processando..." : actionLabel}
									</button>
								) : null}
								</div>
							</div>
						</div>
					</article>
				);
			})}
		</div>
	);
}

function LotesPageBase({ status, title, description, action, showDetailsAction = false }) {
	const [filters, setFilters] = useState({ cidade: "", equipamentoTipo: "" });
	const [busy, setBusy] = useState("");
	const [actionError, setActionError] = useState("");
	const { data: suggestions } = useLoad(() => mercadoApi.sugestoes(), []);
	const loader = () => mercadoApi.lotes({ status, ...filters });
	const { data, loading, error, reload } = useLoad(loader, [status, filters.cidade, filters.equipamentoTipo]);
	const handleAction = async (item) => {
		if (!action) return;
		setActionError("");
		setBusy(item.id);
		try {
			await action.handler(item);
			reload();
		} catch (err) {
			setActionError(err?.message || "Falha ao processar ação do lote.");
		} finally {
			setBusy("");
		}
	};
	const cidadeOptions = optionValues(suggestions?.cidades || []);
	const equipamentoOptions = optionValues(suggestions?.equipamentos || []);

	return (
		<div className="space-y-5">
			<datalist id="mercado-cidades">
				{cidadeOptions.map((cidade) => <option key={cidade} value={cidade} />)}
			</datalist>
			<datalist id="mercado-equipamentos">
				{equipamentoOptions.map((equipamento) => <option key={equipamento} value={equipamento} />)}
			</datalist>
			<div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
				<div>
					<h1 className="text-2xl font-black text-slate-950">{title}</h1>
					<p className="text-sm font-semibold text-slate-500">{description}</p>
				</div>
				<div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
					<input
						value={filters.cidade}
						onChange={(event) => setFilters((cur) => ({ ...cur, cidade: event.target.value }))}
						list="mercado-cidades"
						placeholder="Filtrar cidade"
						className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-cyan-500"
					/>
					<input
						value={filters.equipamentoTipo}
						onChange={(event) => setFilters((cur) => ({ ...cur, equipamentoTipo: event.target.value }))}
						list="mercado-equipamentos"
						placeholder="Filtrar equipamento"
						className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-cyan-500"
					/>
					<button
						type="button"
						onClick={reload}
						className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
					>
						<Search size={16} />
						Buscar
					</button>
				</div>
			</div>
			<ErrorState message={error || actionError} />
			{loading ? <Spinner fullScreen /> : null}
			{busy ? (
				<div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-black text-cyan-800">
					Processando ação do lote...
				</div>
			) : null}
			{!loading ? (
				<LotesCards
					data={data}
					onAction={action ? handleAction : null}
					actionLabel={action?.label}
					actionIcon={action?.icon}
					busyId={busy}
					showDetailsAction={showDetailsAction}
				/>
			) : null}
		</div>
	);
}

export function MercadoDisponiveisPage() {
	return (
		<LotesPageBase
			status="AVAILABLE"
			title="Lotes disponíveis"
			description="Aceite lotes sem expor dados detalhados antes da contratação."
			action={{ label: "Aceitar", icon: Check, handler: (item) => mercadoApi.aceitarLote(item.id) }}
		/>
	);
}

export function MercadoLotesPage() {
	const { currentUser } = useAuthContext();
	const canManage = hasAnyPermission(currentUser, ["mercado.lotes.manage"]);
	const [form, setForm] = useState({ cidade: "", equipamentoTipo: "ONU", quantidade: 15 });
	const [message, setMessage] = useState("");
	const [refreshKey, setRefreshKey] = useState(0);
	const { data: suggestions } = useLoad(() => mercadoApi.sugestoes(), []);
	const cidadeOptions = optionValues(suggestions?.cidades || []);
	const equipamentoOptions = optionValues(suggestions?.equipamentos || []);
	const create = async () => {
		setMessage("Gerando lote a partir das OS elegíveis...");
		try {
			await mercadoApi.gerarLotes(form);
			setMessage("Lote gerado e publicado.");
			setRefreshKey((cur) => cur + 1);
		} catch (error) {
			setMessage(error?.message || "Não foi possível gerar o lote.");
		}
	};
	return (
		<div className="space-y-5">
			<datalist id="mercado-gerar-cidades">
				{cidadeOptions.map((cidade) => <option key={cidade} value={cidade} />)}
			</datalist>
			<datalist id="mercado-gerar-equipamentos">
				{equipamentoOptions.map((equipamento) => <option key={equipamento} value={equipamento} />)}
			</datalist>
			{canManage ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_auto]">
						<input list="mercado-gerar-cidades" className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" placeholder="Cidade" value={form.cidade} onChange={(e) => setForm((cur) => ({ ...cur, cidade: e.target.value }))} />
						<input list="mercado-gerar-equipamentos" className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" placeholder="Equipamento" value={form.equipamentoTipo} onChange={(e) => setForm((cur) => ({ ...cur, equipamentoTipo: e.target.value }))} />
						<select className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" value={form.quantidade} onChange={(e) => setForm((cur) => ({ ...cur, quantidade: Number(e.target.value) }))}>
							<option value={15}>15 OS</option>
							<option value={25}>25 OS</option>
							<option value={35}>35 OS</option>
						</select>
						<button type="button" onClick={create} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-black text-slate-950">
							<Plus size={16} />
							Gerar lote
						</button>
					</div>
					{message ? <p className="mt-3 text-sm font-bold text-slate-600">{message}</p> : null}
				</section>
			) : null}
			<LotesPageBase
				key={refreshKey}
				title="Gestão de lotes"
				description="Administre rascunhos, lotes publicados, aceitos e submetidos."
			/>
		</div>
	);
}

export function MercadoMeusLotesPage() {
	return (
		<LotesPageBase
			status="ACCEPTED"
			title="Meus lotes"
			description="Lotes aceitos pela empresa vinculada ao seu usuário."
			showDetailsAction
		/>
	);
}

export function MercadoLoteDetalhePage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { currentUser } = useAuthContext();
	const { data, loading, error, reload } = useLoad(() => mercadoApi.lote(id), [id]);
	const [message, setMessage] = useState("");
	const [valorUnitario, setValorUnitario] = useState("");
	const lote = data?.item;
	const os = data?.os || [];
	const canManage = hasAnyPermission(currentUser, ["mercado.lotes.manage"]);

	useEffect(() => {
		if (!lote) return;
		const total = Number(lote.valorContratado ?? lote.valorPotencial ?? 0);
		const quantidade = Math.max(Number(lote.quantidadeOs || 0), 1);
		const nextValue = String(Math.round((total / quantidade) * 100) / 100).replace(".", ",");
		Promise.resolve().then(() => setValorUnitario(nextValue));
	}, [lote]);

	const updateOs = async (item, desfecho, submeter = false) => {
		setMessage(`Atualizando OS ${item.numOs || item.id}...`);
		try {
			await mercadoApi.atualizarOs(item.id, { desfecho, submeter });
			setMessage("OS atualizada.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao atualizar OS.");
		}
	};

	const updatePricing = async () => {
		setMessage("Atualizando valores do lote...");
		try {
			await mercadoApi.ajustarValorLote(lote.id, { valorUnitario });
			setMessage("Valor unitário atualizado e aplicado nas OS do lote.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao atualizar valores do lote.");
		}
	};

	if (loading) return <Spinner fullScreen />;
	if (!lote) return <ErrorState message={error || "Lote não encontrado."} />;
	const valorTotal = Number(lote.valorContratado ?? lote.valorPotencial ?? 0);
	const quantidade = Math.max(Number(lote.quantidadeOs || 0), 1);
	const valorAtualUnitario = valorTotal / quantidade;

	return (
		<div className="space-y-5">
			<button type="button" onClick={() => navigate(-1)} className="text-sm font-black text-cyan-700">Voltar</button>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-black text-slate-950">{lote.codigo}</h1>
							<Badge status={lote.status} />
						</div>
						<p className="mt-2 text-sm font-semibold text-slate-500">
							{lote.cidade} · {lote.equipamentoTipo} · {lote.quantidadeOs} OS
						</p>
						<p className="mt-1 text-xs font-semibold text-slate-500">
							Aceito em {formatDate(lote.acceptedAt)} · Criado em {formatDate(lote.createdAt)}
							{lote.withdrawDeadlineAt ? ` · Desistência até ${formatDateTime(lote.withdrawDeadlineAt)}` : ""}
						</p>
					</div>
					<div className="text-left lg:text-right">
						<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Valor contratado</p>
						<p className="text-2xl font-black text-slate-950">{money(lote.valorContratado ?? lote.valorPotencial)}</p>
					</div>
				</div>
			</section>
			{message ? <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-sm font-black text-cyan-800">{message}</div> : null}
			{canManage ? (
				<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-700">
								<CircleDollarSign size={16} />
								Precificação administrativa
							</div>
							<h2 className="mt-2 text-lg font-black text-slate-950">Valor unitário da retirada</h2>
							<p className="text-sm font-semibold text-slate-500">
								Atualiza o valor por OS e recalcula o total contratado do lote.
							</p>
						</div>
						<div className="grid gap-3 sm:grid-cols-[160px_160px_auto]">
							<div className="rounded-lg bg-slate-50 p-3">
								<p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Atual</p>
								<p className="mt-1 text-lg font-black text-slate-950">{money(valorAtualUnitario)}</p>
							</div>
							<label className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
								Novo valor
								<input
									value={valorUnitario}
									onChange={(event) => setValorUnitario(event.target.value)}
									className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-900 outline-none focus:border-cyan-500"
								/>
							</label>
							<button
								type="button"
								onClick={updatePricing}
								className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-lg bg-slate-950 px-4 text-sm font-black text-white"
							>
								<Save size={16} />
								Aplicar
							</button>
						</div>
					</div>
				</section>
			) : null}
			<div className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-lg font-black text-slate-950">Ordens do lote</h2>
					<p className="text-sm font-semibold text-slate-500">{os.length} de {lote.quantidadeOs || os.length} ordens</p>
				</div>
				{os.map((item) => (
					<div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
							<div>
								<p className="text-sm font-black text-slate-950">OS {item.numOs || "-"}</p>
								<p className="text-sm font-semibold text-slate-600">{item.bairro} · {item.endereco}</p>
								<p className="text-xs font-semibold text-slate-500">{item.nomeCliente || "Cliente protegido"} · {item.equipamentoTipo}</p>
								<div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
									<span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
										<CalendarDays size={14} className="text-cyan-700" />
										Abertura: {formatDate(item.dataAbertura)}
									</span>
									<span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
										<UserRound size={14} className="text-cyan-700" />
										Técnico atual: {item.tecnicoAtual || "Não atribuído"}
									</span>
									{item.statusOrdem ? <span className="rounded-lg bg-slate-50 px-2.5 py-1.5">Status da OS: {item.statusOrdem}</span> : null}
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								<Badge status={item.status} />
								<button type="button" onClick={() => updateOs(item, "RECUPERADA", true)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Recuperada</button>
								<button type="button" onClick={() => updateOs(item, "TENTATIVAS_ESGOTADAS", true)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">Tentativas esgotadas</button>
								<button type="button" onClick={() => mercadoApi.tentativa(item.id, { canal: "telefone", resultado: "registrada" }).then(reload)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">+ Tentativa</button>
							</div>
						</div>
					</div>
				))}
				{!os.length ? <EmptyState title="Sem OS neste lote" description="A geração automática incluirá as ordens elegíveis aqui." /> : null}
			</div>
		</div>
	);
}

export function MercadoExecucaoPage() {
	return <MercadoLoteDetalhePage />;
}

export function MercadoAprovacoesPage() {
	const { data, loading, error, reload } = useLoad(() => mercadoApi.backoffice());
	const [message, setMessage] = useState("");
	const approve = async (item, status) => {
		setMessage("Registrando conferência...");
		try {
			await mercadoApi.aprovarOs(item.id, { status, justificativa: "Conferência pelo BackOffice" });
			setMessage("Conferência registrada.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao registrar conferência.");
		}
	};
	if (loading) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<h1 className="text-2xl font-black text-slate-950">Aprovações BackOffice</h1>
			<ErrorState message={error || message} />
			{(data?.items || []).map((item) => (
				<div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<p className="font-black text-slate-950">OS {item.numOs} · {item.loteCodigo}</p>
							<p className="text-sm font-semibold text-slate-500">{item.empresaNome} · {item.desfecho || "Sem desfecho"}</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<button type="button" onClick={() => approve(item, "APPROVED")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Aprovar</button>
							<button type="button" onClick={() => approve(item, "CORRECTION_REQUESTED")} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950">Correção</button>
							<button type="button" onClick={() => approve(item, "REJECTED")} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">Rejeitar</button>
						</div>
					</div>
				</div>
			))}
			{!data?.items?.length ? <EmptyState title="Nada em conferência" description="OS submetidas pelas empresas aparecerão aqui." /> : null}
		</div>
	);
}

export function MercadoFinanceiroPage() {
	const competenciaAtual = new Date().toISOString().slice(0, 7);
	const [competencia, setCompetencia] = useState(competenciaAtual);
	const { data, loading, error, reload } = useLoad(() => mercadoApi.financeiro({ competencia }), [competencia]);
	const [message, setMessage] = useState("");
	const gerar = async () => {
		setMessage("Gerando apuração...");
		try {
			await mercadoApi.gerarApuracao({ competencia });
			setMessage("Apuração gerada.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao gerar apuração.");
		}
	};
	const pagar = async (item) => {
		setMessage("Registrando pagamento integral...");
		try {
			await mercadoApi.registrarPagamento(item.id, {
				valorPago: Number(item.total_liberado || 0),
			});
			setMessage("Pagamento integral registrado.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao registrar pagamento.");
		}
	};
	const recalcularSuspensoes = async () => {
		setMessage("Recalculando suspensões por regularização...");
		try {
			const result = await mercadoApi.recalcularSuspensoes();
			setMessage(`${result.totalCreated || 0} suspensão(ões) criada(s).`);
		} catch (error) {
			setMessage(error?.message || "Falha ao recalcular suspensões.");
		}
	};
	const exportar = () => {
		window.open(mercadoApi.financeiroCsvUrl({ competencia }), "_blank", "noopener,noreferrer");
	};
	if (loading) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
				<div>
					<h1 className="text-2xl font-black text-slate-950">Financeiro</h1>
					<p className="text-sm font-semibold text-slate-500">Apuração por empresa, lote e OS.</p>
				</div>
				<div className="flex gap-2">
					<input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
					<button type="button" onClick={exportar} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
						<Download size={16} />
						CSV
					</button>
					<button type="button" onClick={recalcularSuspensoes} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800">
						<ShieldAlert size={16} />
						Suspensões
					</button>
					<button type="button" onClick={gerar} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">
						<RefreshCw size={16} />
						Gerar
					</button>
				</div>
			</div>
			<ErrorState message={error || message} />
			<div className="grid gap-4">
				{(data?.items || []).map((item) => (
					<div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<p className="font-black text-slate-950">{item.empresa_nome}</p>
								<p className="text-sm font-semibold text-slate-500">{item.competencia} · {item.status}</p>
							</div>
							<div className="grid grid-cols-2 gap-4 text-right md:grid-cols-4">
								<div><p className="text-xs font-bold text-slate-500">Contratado</p><p className="font-black">{money(item.total_contratado)}</p></div>
								<div><p className="text-xs font-bold text-slate-500">Aprovado</p><p className="font-black">{money(item.total_aprovado)}</p></div>
								<div><p className="text-xs font-bold text-slate-500">Liberado</p><p className="font-black">{money(item.total_liberado)}</p></div>
								<div><p className="text-xs font-bold text-slate-500">Pago</p><p className="font-black">{money(item.total_pago)}</p></div>
							</div>
							{item.status !== "PAID" ? (
								<button type="button" onClick={() => pagar(item)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
									Registrar pagamento integral
								</button>
							) : null}
						</div>
					</div>
				))}
				{!data?.items?.length ? <EmptyState title="Sem apurações" description="Gere a apuração depois da aprovação integral dos lotes." /> : null}
			</div>
		</div>
	);
}

export function MercadoHistoricoPage() {
	const { data, loading, error } = useLoad(() => mercadoApi.historico());
	if (loading) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<h1 className="text-2xl font-black text-slate-950">Histórico e auditoria</h1>
			<ErrorState message={error} />
			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="divide-y divide-slate-100">
					{(data?.items || []).map((item) => (
						<div key={item.id} className="py-3">
							<p className="font-black text-slate-950">{item.tipo}</p>
							<p className="text-sm font-semibold text-slate-600">{item.descricao}</p>
							<p className="text-xs font-semibold text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")} · {item.created_by_name || "Sistema"}</p>
						</div>
					))}
					{!data?.items?.length ? <EmptyState title="Sem eventos" description="Os eventos operacionais aparecerão aqui." /> : null}
				</div>
			</div>
		</div>
	);
}

export function MercadoRelatoriosPage() {
	return (
		<div className="space-y-5">
			<h1 className="text-2xl font-black text-slate-950">Relatórios</h1>
			<div className="grid gap-4 md:grid-cols-3">
				<Kpi icon={Download} label="Exportação" value="CSV/XLSX" detail="Preparado para apurações e lotes." />
				<Kpi icon={ShieldAlert} label="SLA" value="Individual" detail="Relatório por OS e empresa." />
				<Kpi icon={AlertTriangle} label="Pendências" value="BackOffice" detail="Correções, rejeições e exceções." />
			</div>
			<EmptyState title="Relatórios analíticos em evolução" description="A base normalizada já separa lotes, OS, financeiro e auditoria para os exports da próxima rodada." />
		</div>
	);
}

export function MercadoConfiguracoesPage() {
	const { currentUser } = useAuthContext();
	const canManage = hasAnyPermission(currentUser, ["mercado.config.manage"]);
	const { data, loading, error, reload } = useLoad(() => Promise.all([
		mercadoApi.config(),
		mercadoApi.empresas(),
		mercadoApi.habilitacoes(),
	]).then(([config, empresas, habilitacoes]) => ({ config, empresas, habilitacoes })));
	const [draft, setDraft] = useState(null);
	const [selectedEmpresa, setSelectedEmpresa] = useState("");
	const [message, setMessage] = useState("");
	const config = draft || data?.config?.config;

	useEffect(() => {
		if (!data?.config?.config || draft) return;
		Promise.resolve().then(() => setDraft(data.config.config));
	}, [data?.config?.config, draft]);

	const update = (section, key, value) => {
		setDraft((cur) => ({
			...(cur || {}),
			[section]: {
				...((cur || {})[section] || {}),
				[key]: value,
			},
		}));
	};
	const save = async () => {
		setMessage("Salvando configuração versionada...");
		try {
			await mercadoApi.saveConfig(config);
			setMessage("Configuração salva em nova versão.");
			reload();
		} catch (err) {
			setMessage(err?.message || "Falha ao salvar configuração.");
		}
	};
	const enableEmpresa = async () => {
		const empresa = data?.empresas?.items?.find((item) => item.id === selectedEmpresa);
		if (!empresa) return;
		setMessage("Atualizando habilitação da empresa...");
		try {
			await mercadoApi.saveHabilitacao({
				empresaId: empresa.id,
				empresaNome: empresa.nome,
				enabled: true,
				cidadesAutorizadas: empresa.cidades || [],
			});
			setMessage("Empresa habilitada no Mercado.");
			reload();
		} catch (err) {
			setMessage(err?.message || "Falha ao habilitar empresa.");
		}
	};

	if (loading || !config) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex items-center gap-3">
							<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
								<Settings2 size={24} />
							</div>
							<div>
								<p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
									Mercado de retiradas
								</p>
								<h1 className="text-2xl font-black">Configurações</h1>
							</div>
						</div>
						<div className="grid grid-cols-3 gap-2 text-center">
							<div className="rounded-lg bg-white/10 px-3 py-2">
								<p className="text-[11px] font-black uppercase text-cyan-100">Versão</p>
								<p className="text-lg font-black">v{data?.config?.version || 0}</p>
							</div>
							<div className="rounded-lg bg-white/10 px-3 py-2">
								<p className="text-[11px] font-black uppercase text-cyan-100">Lote</p>
								<p className="text-lg font-black">{config.lotes.maxLotesSimultaneosPorEmpresa}/emp.</p>
							</div>
							<div className="rounded-lg bg-white/10 px-3 py-2">
								<p className="text-[11px] font-black uppercase text-cyan-100">Teto OS</p>
								<p className="text-lg font-black">{money(config.financeiro.tetoPorOs)}</p>
							</div>
						</div>
					</div>
				</div>
				<p className="p-5 text-sm font-semibold text-slate-500">
					Defina os limites operacionais, teto financeiro e empresas autorizadas. Cada salvamento cria uma nova versão para auditoria.
				</p>
			</section>
			<ErrorState message={error || message} />
			{!canManage ? (
				<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">
					Você está em modo somente leitura.
				</div>
			) : null}
			<div className="grid gap-4 xl:grid-cols-2">
				<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
							<PackageCheck size={20} />
						</div>
						<div>
							<h2 className="font-black text-slate-950">Lotes e prazos</h2>
							<p className="text-xs font-semibold text-slate-500">Controle de volume, cidade e regularização.</p>
						</div>
					</div>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<NumberField disabled={!canManage} label="Lotes por empresa" value={config.lotes.maxLotesSimultaneosPorEmpresa} onChange={(value) => update("lotes", "maxLotesSimultaneosPorEmpresa", value)} />
						<NumberField disabled={!canManage} label="Lotes por cidade" value={config.lotes.maxLotesSimultaneosPorCidade} onChange={(value) => update("lotes", "maxLotesSimultaneosPorCidade", value)} />
						<NumberField disabled={!canManage} label="SLA operacional" suffix="horas" value={config.prazos.slaHoras} onChange={(value) => update("prazos", "slaHoras", value)} />
						<NumberField disabled={!canManage} label="Regularização" suffix="dias" value={config.prazos.regularizacaoDias} onChange={(value) => update("prazos", "regularizacaoDias", value)} />
					</div>
				</section>
				<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
							<CircleDollarSign size={20} />
						</div>
						<div>
							<h2 className="font-black text-slate-950">Financeiro</h2>
							<p className="text-xs font-semibold text-slate-500">O teto calibra o valor máximo pago por retirada.</p>
						</div>
					</div>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<NumberField disabled={!canManage} label="Valor unitário padrão" suffix="R$" value={config.financeiro.precoBasePorEquipamento} onChange={(value) => update("financeiro", "precoBasePorEquipamento", value)} />
						<NumberField disabled={!canManage} label="Valor máximo por retirada" suffix="R$" value={config.financeiro.tetoPorOs} onChange={(value) => update("financeiro", "tetoPorOs", value)} />
						<NumberField disabled={!canManage} label="Piso por retirada" suffix="R$" value={config.financeiro.pisoPorOs} onChange={(value) => update("financeiro", "pisoPorOs", value)} />
						<NumberField disabled={!canManage} label="Valor tentativa" suffix="R$" value={config.financeiro.valorTentativa} onChange={(value) => update("financeiro", "valorTentativa", value)} />
						<NumberField disabled={!canManage} label="Desconto agendamento" suffix="R$" value={config.financeiro.descontoAgendamento} onChange={(value) => update("financeiro", "descontoAgendamento", value)} />
						<NumberField disabled={!canManage} label="Penalização por hora" suffix="R$" value={config.financeiro.penalizacaoPorHora} onChange={(value) => update("financeiro", "penalizacaoPorHora", value)} />
					</div>
				</section>
			</div>
			<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="font-black text-slate-950">Empresas habilitadas</h2>
						<p className="text-sm font-semibold text-slate-500">Controle quem pode aceitar lotes e em quais cidades.</p>
					</div>
					<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
						{data?.habilitacoes?.items?.length || 0} habilitada(s)
					</span>
				</div>
				<div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
					<select disabled={!canManage} value={selectedEmpresa} onChange={(e) => setSelectedEmpresa(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
						<option value="">Selecione uma empresa existente</option>
						{(data?.empresas?.items || []).map((empresa) => (
							<option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
						))}
					</select>
					<button disabled={!canManage || !selectedEmpresa} type="button" onClick={enableEmpresa} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">
						<Upload size={16} />
						Habilitar
					</button>
				</div>
				<div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
					{(data?.habilitacoes?.items || []).map((item) => (
						<div key={item.empresa_id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
							<p className="truncate font-black text-slate-900">{item.empresa_nome}</p>
							<p className="mt-1 text-xs font-semibold text-slate-500">
								{item.enabled ? "Ativa" : "Inativa"} · limite {item.limite_lotes || config.lotes.maxLotesSimultaneosPorEmpresa} lote(s)
							</p>
						</div>
					))}
				</div>
			</section>
			{canManage ? (
				<button type="button" onClick={save} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 text-sm font-black text-slate-950">
					<Save size={18} />
					Salvar nova versão
				</button>
			) : null}
		</div>
	);
}
