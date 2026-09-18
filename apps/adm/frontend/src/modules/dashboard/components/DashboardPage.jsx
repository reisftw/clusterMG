import {
	AlertTriangle,
	Building2,
	CheckCircle2,
	FileText,
	LayoutDashboard,
	Loader2,
	RefreshCw,
	Send,
	Trophy,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import InternalStaticDataStatus from "../../../components/ui/InternalStaticDataStatus";
import Spinner from "../../../components/ui/Spinner";
import { ROLES } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { useLayoutMode } from "../../../context/LayoutModeContext";
import { useMapaOS as usePublicMapaOS } from "../../../pages/PainelPublico/hooks/useMapaOS";
import ProximasAgendas from "../../agenda/components/ProximasAgendas";
import AgendamentosHojeCard from "../../agendamentos/components/AgendamentosHojeCard";
import { listarEnviosDocumentos } from "../../documentos/services/documentosService";
import MetasCidadesCriticasWidget from "../../metas/components/MetasCidadesCriticasWidget";
import MetasDashboardWidget from "../../metas/components/MetasDashboardWidget";
import MetasPrevisaoWidget from "../../metas/components/MetasPrevisaoWidget";
import TopCidadesCard from "../components/TopCidadesCard";
import { useDashboard } from "../hooks/useDashboard";
import AlertasAutomaticosWidget from "./AlertasAutomaticosWidget";
import AniversariantesWidget from "./AniversariantesWidget";
import FeaturedMetasPanel from "./FeaturedMetasPanel";
import MapaKPICards from "./MapaKPICards";
import ModernKpiGrid from "./ModernKpiGrid";
import ProximosFeriados from "./ProximosFeriados";
import SummaryCards from "./SummaryCards";
import TendenciaMensalWidget from "./TendenciaMensalWidget";

function normalizeRole(role) {
	return String(role || "").toLowerCase();
}

function currentMonthReference() {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthReference(value) {
	const [year, month] = String(value || currentMonthReference()).split("-");
	const date = new Date(Number(year), Number(month) - 1, 1);
	return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

const ADMINISTRATIVE_DASHBOARD_ROLES = [
	ROLES.SUPERVISOR_ADMINISTRATIVO,
	ROLES.ANALISTA_ADMINISTRATIVO,
];

async function loadAllDocumentSubmissions() {
	const items = [];
	let offset = 0;
	const limit = 100;
	for (let page = 0; page < 60; page += 1) {
		const batch = await listarEnviosDocumentos({ limit, offset });
		items.push(...batch);
		if (batch.length < limit) break;
		offset += limit;
	}
	return items;
}

function isRejectedFile(file) {
	return (
		String(file?.status || "").toLowerCase() === "reprovado" ||
		String(file?.adminStatus || "").toLowerCase() === "reprovado" ||
		Boolean(file?.motivoReprovacao || file?.adminMotivoReprovacao)
	);
}

function isApprovedFile(file) {
	return (
		String(file?.status || "").toLowerCase() === "aprovado" ||
		String(file?.adminStatus || "").toLowerCase() === "aprovado"
	);
}

function metricPercent(value, total) {
	if (!total) return "0,0%";
	return `${((Number(value || 0) / total) * 100).toLocaleString("pt-BR", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	})}%`;
}

function pushCount(map, key, amount = 1) {
	const label = key || "Sem responsável";
	map.set(label, (map.get(label) || 0) + amount);
}

function topEntries(map, limit = 5) {
	return [...map.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
		.slice(0, limit);
}

function buildAdministrativeDashboard(submissions) {
	const aprovadores = new Map();
	const recusadores = new Map();
	const empresasEnvios = new Map();
	const empresasReprovadas = new Map();
	let pendentes = 0;
	let arquivosPendentes = 0;
	let analisados = 0;
	let reprovados = 0;

	submissions.forEach((submission) => {
		const files = submission.files || [];
		if (
			["pendente", "aguardando_administrativo"].includes(
				String(submission.status || "").toLowerCase(),
			)
		) {
			pendentes += 1;
		}
		pushCount(empresasEnvios, submission.empresaNome || "Empresa sem nome", 1);

		files.forEach((file) => {
			const status = String(file.status || "").toLowerCase();
			const adminStatus = String(file.adminStatus || "").toLowerCase();
			const pendingFile = status === "pendente" || adminStatus === "pendente";
			if (pendingFile) arquivosPendentes += 1;
			if (isApprovedFile(file) || isRejectedFile(file)) analisados += 1;
			if (isApprovedFile(file)) {
				pushCount(
					aprovadores,
					file.adminReviewedByName ||
						file.approvedByName ||
						submission.adminReviewedByName ||
						submission.reviewedByName,
				);
			}
			if (isRejectedFile(file)) {
				reprovados += 1;
				pushCount(
					recusadores,
					file.adminReviewedByName ||
						file.approvedByName ||
						submission.adminReviewedByName ||
						submission.reviewedByName,
				);
				pushCount(
					empresasReprovadas,
					submission.empresaNome || file.empresaNome || "Empresa sem nome",
				);
			}
		});
	});

	return {
		pendentes,
		arquivosPendentes,
		analisados,
		reprovados,
		taxaRetrabalho: metricPercent(reprovados, analisados),
		empresasComEnvio: empresasEnvios.size,
		aprovadores: topEntries(aprovadores),
		recusadores: topEntries(recusadores),
		empresasEnvios: topEntries(empresasEnvios),
		empresasReprovadas: topEntries(empresasReprovadas),
	};
}

const ADMIN_METRIC_TONES = {
	amber: {
		text: "text-orange-500",
		icon: "bg-orange-50 text-orange-500",
		stripe: "bg-orange-500",
	},
	green: {
		text: "text-emerald-500",
		icon: "bg-emerald-50 text-emerald-500",
		stripe: "bg-emerald-500",
	},
	red: {
		text: "text-red-500",
		icon: "bg-red-50 text-red-500",
		stripe: "bg-red-500",
	},
	blue: {
		text: "text-blue-600",
		icon: "bg-blue-50 text-blue-600",
		stripe: "bg-blue-600",
	},
};

const ADMIN_RANKING_TONES = {
	green: {
		icon: "bg-emerald-50 text-emerald-500",
		bar: "bg-emerald-500",
	},
	red: {
		icon: "bg-red-50 text-red-500",
		bar: "bg-red-500",
	},
	blue: {
		icon: "bg-blue-50 text-blue-600",
		bar: "bg-blue-600",
	},
};

function AdminDashboardHero({ onRefresh }) {
	return (
		<header className="relative overflow-hidden rounded-[20px] border border-blue-900/20 bg-[linear-gradient(115deg,#061733_0%,#08285F_45%,#074ACB_100%)] p-6 text-white shadow-[0_1px_2px_rgba(16,24,40,0.03),0_14px_35px_rgba(7,26,61,0.18)] md:p-8">
			<div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-col gap-5 sm:flex-row sm:items-center">
					<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-inner backdrop-blur">
						<LayoutDashboard size={32} />
					</div>
					<div className="min-w-0">
						<span className="inline-flex rounded-full bg-blue-500 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-sm">
							Administrativo
						</span>
						<h1 className="mt-3 text-3xl font-black leading-tight text-white md:text-4xl">
							Dashboard Administrativo
						</h1>
						<p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/75 md:text-base">
							Acompanhe aprovações, recusas, retrabalho e documentos pendentes.
						</p>
					</div>
				</div>

				<button
					type="button"
					onClick={onRefresh}
					className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_22px_rgba(16,24,40,0.12)] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
				>
					<RefreshCw size={16} /> Atualizar
				</button>
			</div>

			<svg
				className="pointer-events-none absolute right-0 top-0 h-full w-[46%] min-w-[360px] opacity-55"
				viewBox="0 0 520 180"
				fill="none"
				aria-hidden="true"
			>
				<defs>
					<linearGradient
						id="adminHeroLine"
						x1="90"
						x2="480"
						y1="140"
						y2="26"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="#93C5FD" stopOpacity="0.25" />
						<stop offset="1" stopColor="#FFFFFF" stopOpacity="0.95" />
					</linearGradient>
				</defs>
				<path
					d="M0 38H520M0 78H520M0 118H520M80 0V180M160 0V180M240 0V180M320 0V180M400 0V180M480 0V180"
					stroke="white"
					strokeOpacity="0.06"
				/>
				<rect
					x="300"
					y="88"
					width="18"
					height="52"
					rx="6"
					fill="white"
					fillOpacity="0.18"
				/>
				<rect
					x="336"
					y="66"
					width="18"
					height="74"
					rx="6"
					fill="white"
					fillOpacity="0.24"
				/>
				<rect
					x="372"
					y="42"
					width="18"
					height="98"
					rx="6"
					fill="white"
					fillOpacity="0.32"
				/>
				<rect
					x="408"
					y="24"
					width="18"
					height="116"
					rx="6"
					fill="white"
					fillOpacity="0.22"
				/>
				<path
					d="M112 128C153 102 178 116 210 86C243 55 275 72 310 48C350 20 383 34 430 22"
					stroke="url(#adminHeroLine)"
					strokeWidth="4"
					strokeLinecap="round"
				/>
				{[112, 210, 310, 430].map((cx, index) => (
					<circle
						key={cx}
						cx={cx}
						cy={[128, 86, 48, 22][index]}
						r="6"
						fill="white"
						fillOpacity="0.9"
					/>
				))}
			</svg>
		</header>
	);
}

function AdminDashboardCard({
	icon: Icon,
	title,
	value,
	description,
	tone = "blue",
}) {
	const currentTone = ADMIN_METRIC_TONES[tone] || ADMIN_METRIC_TONES.blue;
	return (
		<article className="group relative min-h-[140px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03),0_4px_12px_rgba(16,24,40,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_26px_rgba(16,24,40,0.08)]">
			<span className={`absolute inset-y-0 left-0 w-1 ${currentTone.stripe}`} />
			<div className="flex items-start gap-4">
				<span
					className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${currentTone.icon}`}
				>
					<Icon size={23} />
				</span>
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-[0.03em] text-slate-700">
						{title}
					</p>
					<p
						className={`mt-4 text-4xl font-black leading-none ${currentTone.text}`}
					>
						{value}
					</p>
					<p className="mt-2 text-sm font-semibold leading-5 text-slate-500">
						{description}
					</p>
				</div>
			</div>
		</article>
	);
}

function AdminRankingCard({
	icon: Icon,
	title,
	description,
	items,
	tone = "blue",
}) {
	const max = Math.max(1, ...items.map((item) => item.value));
	const currentTone = ADMIN_RANKING_TONES[tone] || ADMIN_RANKING_TONES.blue;
	return (
		<section className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03),0_4px_12px_rgba(16,24,40,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_26px_rgba(16,24,40,0.08)]">
			<div className="flex items-start gap-3">
				<span
					className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${currentTone.icon}`}
				>
					<Icon size={22} />
				</span>
				<div className="min-w-0">
					<h2 className="text-lg font-black leading-tight text-slate-950">
						{title}
					</h2>
					<p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
						{description}
					</p>
				</div>
			</div>
			<div className="mt-6 space-y-3">
				{items.length ? (
					items.map((item) => (
						<div
							key={item.label}
							className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
						>
							<div className="flex items-center justify-between gap-3">
								<p className="truncate text-sm font-black text-slate-900">
									{item.label}
								</p>
								<span className="text-lg font-black text-slate-950">
									{item.value}
								</span>
							</div>
							<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
								<div
									className={`h-full rounded-full ${currentTone.bar}`}
									style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
								/>
							</div>
						</div>
					))
				) : (
					<p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
						Ainda não há dados suficientes.
					</p>
				)}
			</div>
		</section>
	);
}

function AdministrativeDashboard() {
	const [state, setState] = useState({ loading: true, items: [], error: "" });

	const load = useCallback(async () => {
		setState((current) => ({ ...current, loading: true, error: "" }));
		try {
			setState({
				loading: false,
				items: await loadAllDocumentSubmissions(),
				error: "",
			});
		} catch (error) {
			setState({
				loading: false,
				items: [],
				error:
					error?.message ||
					"Não foi possível carregar o dashboard administrativo.",
			});
		}
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	const metrics = useMemo(
		() => buildAdministrativeDashboard(state.items),
		[state.items],
	);

	if (state.loading) return <Spinner fullScreen />;

	return (
		<div className="w-full overflow-x-hidden rounded-[24px] bg-[#F5F7FB] p-4 sm:p-6 lg:p-8">
			<div className="mx-auto max-w-[1500px] space-y-5">
				<AdminDashboardHero onRefresh={load} />

				{state.error ? (
					<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
						{state.error}
					</div>
				) : null}

				<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<AdminDashboardCard
						icon={FileText}
						title="Documentos pendentes"
						value={metrics.pendentes}
						description={`${metrics.arquivosPendentes} arquivo(s) aguardando ação`}
						tone="amber"
					/>
					<AdminDashboardCard
						icon={CheckCircle2}
						title="Documentos analisados"
						value={metrics.analisados}
						description="Aprovados ou recusados no rito"
						tone="green"
					/>
					<AdminDashboardCard
						icon={XCircle}
						title="Documentos reprovados"
						value={metrics.reprovados}
						description={`${metrics.taxaRetrabalho} de retrabalho`}
						tone="red"
					/>
					<AdminDashboardCard
						icon={Building2}
						title="Empresas com envio"
						value={metrics.empresasComEnvio}
						description={`${state.items.length} envio(s) registrados`}
						tone="blue"
					/>
				</section>

				<section className="grid items-start gap-5 xl:grid-cols-2">
					<AdminRankingCard
						icon={Trophy}
						title="Quem mais aprovou"
						description="Responsáveis com mais aprovações registradas."
						items={metrics.aprovadores}
						tone="green"
					/>
					<AdminRankingCard
						icon={Trophy}
						title="Quem mais recusou"
						description="Responsáveis com mais reprovações registradas."
						items={metrics.recusadores}
						tone="red"
					/>
					<AdminRankingCard
						icon={Send}
						title="Empresas que mais enviaram documentos"
						description="Volume de envios mensais por empresa."
						items={metrics.empresasEnvios}
						tone="blue"
					/>
					<AdminRankingCard
						icon={Building2}
						title="Empresas com mais documentos reprovados"
						description="Empresas que mais geraram retrabalho."
						items={metrics.empresasReprovadas}
						tone="red"
					/>
				</section>
			</div>
		</div>
	);
}

function buildDocumentosPendentesParams({ isSupervisor, empresaId }) {
	if (isSupervisor) return { status: "pendente", limit: 100, offset: 0 };
	return {
		mine: true,
		empresaId,
		limit: 100,
		offset: 0,
	};
}

function resolveMonthSubmission({ isLeader, items, mesAtual }) {
	if (!isLeader) return null;
	return items.find((item) => item.mesReferencia === mesAtual) || null;
}

function resolveLeaderDocumentState({ isLeader, status, monthSubmission }) {
	if (!isLeader) return "missing";
	if (status === "aprovado") return "approved";
	if (status === "pendente") return "waitingReview";
	if (status === "reprovado") return "rejected";
	if (!monthSubmission) return "missing";
	return "missing";
}

function buildDocumentosPendentesModel({
	isSupervisor,
	isLeader,
	items,
	mesAtual,
	mesAtualLabel,
}) {
	const monthSubmission = resolveMonthSubmission({ isLeader, items, mesAtual });
	const status = String(monthSubmission?.status || "");
	const leaderState = resolveLeaderDocumentState({
		isLeader,
		status,
		monthSubmission,
	});
	const approved = leaderState === "approved";
	const rejected = leaderState === "rejected";
	const missing = leaderState === "missing";

	const leaderPendingCount = approved ? 0 : 1;
	const pendingCount = isSupervisor
		? items.filter((item) => item.status === "pendente").length
		: leaderPendingCount;

	const helperByStatus = {
		approved: `Os documentos de ${mesAtualLabel} estão corretos e aprovados.`,
		waitingReview: `Os documentos de ${mesAtualLabel} foram enviados e aguardam avaliação.`,
		rejected: `Os documentos de ${mesAtualLabel} foram reprovados e precisam de correção.`,
		missing: `Os documentos de ${mesAtualLabel} estão pendentes de envio.`,
	};

	return {
		approved,
		pendingCount,
		title: isSupervisor
			? "Documentos pendentes"
			: `Documentos de ${mesAtualLabel}`,
		helper: isSupervisor
			? "Envios aguardando avaliação"
			: helperByStatus[leaderState],
		Icon: approved
			? CheckCircle2
			: rejected || missing
				? AlertTriangle
				: FileText,
	};
}

function DocumentosPendentesCard({ currentUser }) {
	const role = normalizeRole(currentUser?.role);
	const isSupervisor = role === ROLES.SUPERVISOR;
	const isLeader = role === ROLES.LIDER_EMPRESA;
	const [state, setState] = useState({ loading: true, items: [], error: "" });
	const mesAtual = useMemo(() => currentMonthReference(), []);
	const mesAtualLabel = useMemo(
		() => formatMonthReference(mesAtual),
		[mesAtual],
	);
	const empresaId = currentUser?.empresaId || currentUser?.empresa_id;

	useEffect(() => {
		let active = true;
		async function load() {
			if (!isSupervisor && !isLeader) return;
			setState((current) => ({ ...current, loading: true, error: "" }));
			try {
				const params = buildDocumentosPendentesParams({
					isSupervisor,
					empresaId,
				});
				const items = await listarEnviosDocumentos(params);
				if (active) setState({ loading: false, items, error: "" });
			} catch (error) {
				if (active) {
					setState({
						loading: false,
						items: [],
						error: error?.message || "Não foi possível carregar documentos.",
					});
				}
			}
		}
		load();
		return () => {
			active = false;
		};
	}, [empresaId, isLeader, isSupervisor]);

	if (!isSupervisor && !isLeader) return null;

	const { approved, pendingCount, title, helper, Icon } =
		buildDocumentosPendentesModel({
			isSupervisor,
			isLeader,
			items: state.items,
			mesAtual,
			mesAtualLabel,
		});

	return (
		<article
			className={`rounded-lg border bg-white p-5 shadow-card ${
				approved ? "border-emerald-200" : "border-amber-200"
			}`}
		>
			<div className="flex items-start gap-3">
				<div
					className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
						approved
							? "bg-emerald-50 text-emerald-600"
							: "bg-amber-50 text-amber-600"
					}`}
				>
					{state.loading ? (
						<Loader2 size={22} className="animate-spin" />
					) : (
						<Icon size={22} />
					)}
				</div>
				<div className="min-w-0">
					<h3 className="text-sm font-bold leading-snug text-slate-800">
						{title}
					</h3>
					<p className="mt-2 text-4xl font-black leading-none text-slate-950">
						{state.loading ? "..." : pendingCount.toLocaleString("pt-BR")}
					</p>
					<p className="mt-2 text-xs font-semibold text-slate-500">
						{state.error || helper}
					</p>
				</div>
			</div>
		</article>
	);
}

const OperationalDashboardContent = ({ currentUser }) => {
	const { resumo, loading, error } = useDashboard();
	const publicMapa = usePublicMapaOS(true);
	const { isModernLayout } = useLayoutMode();
	const currentRole = normalizeRole(currentUser?.role);
	const isLimitedDashboardRole = [
		ROLES.LIDER_EMPRESA,
		ROLES.BACKOFFICE,
		ROLES.SUPERVISOR,
	].includes(currentRole);
	const showDocumentsInHero = [ROLES.LIDER_EMPRESA, ROLES.SUPERVISOR].includes(
		currentRole,
	);
	const kpiHiddenKeys = ["visitas"];
	if (isLimitedDashboardRole) kpiHiddenKeys.push("ferias");
	const summaryHiddenKeys = ["visitasNoMes"];
	if (isLimitedDashboardRole) summaryHiddenKeys.push("tecnicosEmFerias");
	const mapaSummaryOverride = publicMapa.allData?.Janeiro?.summary || null;
	const mapaKpisOverride = mapaSummaryOverride?.kpis || null;
	const topCidadesOverride = [
		...(mapaSummaryOverride?.rankingRegionais || []),
		...(mapaSummaryOverride?.rankingAgentes || []).map((item) => ({
			...item,
			tipo: "agente",
		})),
	]
		.sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
		.slice(0, 10);

	if (loading) return <Spinner fullScreen />;

	const viewProps = {
		currentUser,
		resumo,
		error,
		currentRole,
		isLimitedDashboardRole,
		showDocumentsInHero,
		kpiHiddenKeys,
		summaryHiddenKeys,
		mapaKpisOverride,
		topCidadesOverride,
	};

	return isModernLayout ? (
		<ModernDashboardView {...viewProps} />
	) : (
		<ClassicDashboardView {...viewProps} />
	);
};

// Extraidos de OperationalDashboardContent (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — os dois layouts sao arvores JSX totalmente
// independentes (so um dos dois renderiza por vez), sem logica
// compartilhada alem das props ja computadas no componente pai.
function ModernDashboardView({
	currentUser,
	resumo,
	error,
	currentRole,
	isLimitedDashboardRole,
	showDocumentsInHero,
	kpiHiddenKeys,
	mapaKpisOverride,
	topCidadesOverride,
}) {
	return (
		<div className="mx-auto max-w-[1500px] space-y-4">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
				<div>
					<h1 className="text-3xl font-black text-slate-950">Visão geral</h1>
					<p className="mt-1 text-sm font-medium text-slate-500">
						Acompanhe os principais indicadores da operação.
					</p>
				</div>
				<InternalStaticDataStatus className="max-w-xl" fallbackIsHealthy />
			</div>

			<div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
				{showDocumentsInHero ? (
					<DocumentosPendentesCard currentUser={currentUser} />
				) : currentRole === ROLES.BACKOFFICE ? null : (
					<AgendamentosHojeCard defaultOpen featured maxVisibleItems={4} />
				)}
				<FeaturedMetasPanel />
			</div>

			<ModernKpiGrid
				resumo={resumo}
				ordens={[]}
				mapaKpisOverride={mapaKpisOverride}
				hiddenKeys={kpiHiddenKeys}
			/>

			<div className="columns-1 gap-5 lg:columns-2 xl:columns-3">
				<div className="mb-5 break-inside-avoid">
					<TopCidadesCard
						ordens={[]}
						rankingOverride={topCidadesOverride}
					/>
				</div>
				{!isLimitedDashboardRole ? (
					<div className="mb-5 break-inside-avoid">
						<AniversariantesWidget />
					</div>
				) : null}
				<div className="mb-5 break-inside-avoid">
					<ProximosFeriados feriados={resumo?.feriadosProximos} />
				</div>
				<div className="mb-5 break-inside-avoid">
					<MetasCidadesCriticasWidget />
				</div>
				{!isLimitedDashboardRole ? (
					<div className="mb-5 break-inside-avoid">
						<ProximasAgendas />
					</div>
				) : null}
			</div>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					{error}
				</div>
			)}
		</div>
	);
}

function ClassicDashboardView({
	currentUser,
	resumo,
	error,
	currentRole,
	isLimitedDashboardRole,
	showDocumentsInHero,
	summaryHiddenKeys,
	mapaKpisOverride,
	topCidadesOverride,
}) {
	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
					<p className="text-sm text-gray-500">
						Visão consolidada da operação com leitura padrão pelo JSON interno.
					</p>
				</div>
				<InternalStaticDataStatus className="max-w-xl" fallbackIsHealthy />
			</div>

			{showDocumentsInHero ? (
				<DocumentosPendentesCard currentUser={currentUser} />
			) : currentRole === ROLES.BACKOFFICE ? null : (
				<AgendamentosHojeCard />
			)}

			<MapaKPICards ordens={[]} kpisOverride={mapaKpisOverride} />
			<SummaryCards resumo={resumo} hiddenKeys={summaryHiddenKeys} />

			<div className="columns-1 gap-6 lg:columns-2 xl:columns-3">
				<div className="mb-6 break-inside-avoid">
					<MetasDashboardWidget />
				</div>
				<div className="mb-6 break-inside-avoid">
					<MetasPrevisaoWidget />
				</div>
				<div className="mb-6 break-inside-avoid">
					<AlertasAutomaticosWidget resumo={resumo} />
				</div>
				{!isLimitedDashboardRole ? (
					<div className="mb-6 break-inside-avoid">
						<AniversariantesWidget />
					</div>
				) : null}
				{!isLimitedDashboardRole ? (
					<div className="mb-6 break-inside-avoid">
						<ProximasAgendas />
					</div>
				) : null}
				<div className="mb-6 break-inside-avoid">
					<ProximosFeriados feriados={resumo?.feriadosProximos} />
				</div>
				<div className="mb-6 break-inside-avoid">
					<TendenciaMensalWidget />
				</div>
				<div className="mb-6 break-inside-avoid">
					<TopCidadesCard
						ordens={[]}
						rankingOverride={topCidadesOverride}
					/>
				</div>
				<div className="mb-6 break-inside-avoid">
					<MetasCidadesCriticasWidget />
				</div>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					{error}
				</div>
			)}
		</div>
	);
}

const DashboardPage = () => {
	const { currentUser } = useAuthContext();
	const currentRole = normalizeRole(currentUser?.role);

	if (ADMINISTRATIVE_DASHBOARD_ROLES.includes(currentRole)) {
		return <AdministrativeDashboard />;
	}

	return <OperationalDashboardContent currentUser={currentUser} />;
};

export default DashboardPage;
