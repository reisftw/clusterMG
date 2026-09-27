import {
	AlertTriangle,
	BarChart3,
	Box,
	CheckCircle2,
	Clock3,
	Download,
	Eye,
	Filter,
	RefreshCw,
	ShieldAlert,
	ShieldCheck,
	SlidersHorizontal,
	Wallet,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buscarImpactoRecuperacao,
	buscarJobRecuperacao,
	buscarOpcoesRecuperacao,
	buscarPendenciasRecuperacao,
	buscarRegistrosRecuperacao,
	buscarResumoRecuperacao,
	buscarTecnicosRecuperacao,
	buscarUltimoJobRecuperacao,
	reprocessarRecuperacao,
	urlExportPendencias,
} from "../services/equipmentRecoveryService";

const today = new Intl.DateTimeFormat("en-CA", {
	timeZone: "America/Sao_Paulo",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
}).format(new Date());

const STATUS_LABELS = {
	MATCHED: "Devolvido",
	PENDING: "Pendente",
	PROBABLE: "Devolução provável",
	UNCLASSIFIED: "Não classificado",
	NOT_FOUND: "Não localizado",
};

const EQUIPMENT_LABELS = {
	FAST: "FAST",
	AC: "AC",
	AX: "AX",
	UNKNOWN: "Não classificado",
};

const REASON_LABELS = {
	SERVICE_SPEED_MISSING: "Velocidade do serviço não encontrada",
	SPEED_LTE_100: "Velocidade até 100 Mbps",
	SPEED_101_500: "Velocidade entre 101 e 500 Mbps",
	SPEED_GT_500: "Velocidade acima de 500 Mbps",
	UNKNOWN: "Dados insuficientes",
};

function currency(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function number(value) {
	return Number(value || 0).toLocaleString("pt-BR");
}

function percent(value) {
	return `${(Number(value || 0) * 100).toFixed(1).replace(".", ",")}%`;
}

function dateDaysAgo(days) {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function monthStart() {
	return `${today.slice(0, 8)}01`;
}

function statusFor(item = {}) {
	if (item.equipmentType === "UNKNOWN") return "UNCLASSIFIED";
	if (item.matchConfidence === "PROBABLE") return "PROBABLE";
	if (item.returnStatus === "MATCHED") return "MATCHED";
	if (item.matchConfidence === "NOT_FOUND") return "NOT_FOUND";
	return item.returnStatus || "PENDING";
}

function splitTechnicianName(value = "") {
	const [name, ...role] = String(value || "Sem técnico identificado").split(/\s+-\s+/);
	return {
		name: name || "Sem técnico identificado",
		role: role.join(" - ") || "Técnico Retirada",
	};
}

function KpiCard({ title, value, subtitle, icon: Icon, tone = "blue", tooltip }) {
	const tones = {
		blue: "bg-blue-50 text-blue-600",
		green: "bg-emerald-50 text-emerald-600",
		orange: "bg-orange-50 text-orange-600",
		red: "bg-red-50 text-red-600",
		slate: "bg-slate-100 text-slate-600",
		purple: "bg-violet-50 text-violet-600",
	};
	return (
		<div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide text-slate-500" title={tooltip}>
						{title}
					</p>
					<p className="mt-2 break-words text-3xl font-black leading-tight text-slate-950">
						{value}
					</p>
					{subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p> : null}
				</div>
				<div className={`shrink-0 rounded-2xl p-3 ${tones[tone] || tones.blue}`}>
					<Icon size={22} />
				</div>
			</div>
		</div>
	);
}

function StatusBadge({ status }) {
	const styles = {
		MATCHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
		PENDING: "border-amber-200 bg-amber-50 text-amber-700",
		PROBABLE: "border-blue-200 bg-blue-50 text-blue-700",
		UNCLASSIFIED: "border-orange-200 bg-orange-50 text-orange-700",
		NOT_FOUND: "border-slate-200 bg-slate-50 text-slate-600",
	};
	const symbols = {
		MATCHED: "✓",
		PENDING: "●",
		PROBABLE: "?",
		UNCLASSIFIED: "!",
		NOT_FOUND: "○",
	};
	const key = status || "PENDING";
	return (
		<span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${styles[key] || styles.PENDING}`}>
			{symbols[key] || "●"} {STATUS_LABELS[key] || key}
		</span>
	);
}

function EquipmentBadge({ type }) {
	const styles = {
		FAST: "border-blue-200 bg-blue-50 text-blue-700",
		AC: "border-emerald-200 bg-emerald-50 text-emerald-700",
		AX: "border-violet-200 bg-violet-50 text-violet-700",
		UNKNOWN: "border-orange-200 bg-orange-50 text-orange-700",
	};
	return (
		<span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${styles[type] || styles.UNKNOWN}`}>
			{EQUIPMENT_LABELS[type] || type || "-"}
		</span>
	);
}

function ProgressBar({ value, tone = "bg-blue-600" }) {
	return (
		<div className="h-2 overflow-hidden rounded-full bg-slate-100">
			<div
				className={`h-full rounded-full ${tone}`}
				style={{ width: `${Math.max(0, Math.min(100, Number(value || 0)))}%` }}
			/>
		</div>
	);
}

function BarRow({ label, value, max, tone = "bg-blue-500", right }) {
	const width = max > 0 ? (Number(value || 0) / max) * 100 : 0;
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-3 text-sm font-black">
				<span className="truncate text-slate-700">{label}</span>
				<span className="shrink-0 text-slate-950">{right ?? number(value)}</span>
			</div>
			<ProgressBar value={width} tone={tone} />
		</div>
	);
}

function EquipmentCard({ item }) {
	const classified = item.category !== "UNKNOWN";
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center justify-between gap-3">
				<EquipmentBadge type={item.category} />
				<p className="text-2xl font-black text-slate-950">{number(item.total)}</p>
			</div>
			<div className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold text-slate-500">
				<div>
					<p>Retirados</p>
					<strong className="text-base text-slate-900">{number(item.total)}</strong>
				</div>
				<div>
					<p>Devolvidos</p>
					<strong className="text-base text-emerald-700">{number(item.returned)}</strong>
				</div>
				<div>
					<p>Pendentes</p>
					<strong className="text-base text-orange-700">{number(item.pending)}</strong>
				</div>
			</div>
			<p className="mt-3 text-sm font-black text-slate-800">
				{classified ? `${currency(item.returnedValue)} recuperados` : "Valor não calculável"}
			</p>
		</div>
	);
}

function TechnicianCard({ item, onSelect }) {
	const { name, role } = splitTechnicianName(item.technicianName);
	return (
		<button
			type="button"
			className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
			onClick={() => onSelect(item)}
		>
			<h3 className="truncate text-lg font-black text-slate-950">{name}</h3>
			<p className="text-sm font-bold text-slate-500">{role}</p>
			<div className="mt-4 grid grid-cols-3 gap-2">
				<div className="rounded-xl bg-blue-50 p-3">
					<p className="text-xs font-black uppercase text-blue-600">Produção</p>
					<p className="text-2xl font-black text-slate-950">{number(item.retirados)}</p>
				</div>
				<div className="rounded-xl bg-emerald-50 p-3">
					<p className="text-xs font-black uppercase text-emerald-600">Devolvidos</p>
					<p className="text-2xl font-black text-slate-950">{number(item.devolvidos)}</p>
				</div>
				<div className="rounded-xl bg-orange-50 p-3">
					<p className="text-xs font-black uppercase text-orange-600">Pendentes</p>
					<p className="text-2xl font-black text-slate-950">{number(item.pendentes)}</p>
				</div>
			</div>
			<div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-black">
				{["FAST", "AC", "AX", "UNKNOWN"].map((type) => (
					<div key={type} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
						<p className="truncate text-slate-500">{EQUIPMENT_LABELS[type]}</p>
						<p className="text-base text-slate-950">{number(item.equipamentos?.[type])}</p>
					</div>
				))}
			</div>
			<div className="mt-4 grid grid-cols-2 gap-2 text-sm">
				<div>
					<p className="font-bold text-slate-500">Recuperado</p>
					<p className="font-black text-emerald-700">{currency(item.valorDevolvido)}</p>
				</div>
				<div>
					<p className="font-bold text-slate-500">Pendente</p>
					<p className="font-black text-orange-700">{currency(item.valorPendente)}</p>
				</div>
			</div>
			<div className="mt-4">
				<div className="mb-1 flex justify-between text-xs font-black text-slate-500">
					<span>Taxa de devolução</span>
					<span>{percent(item.taxaDevolucao)}</span>
				</div>
				<ProgressBar value={item.taxaDevolucao * 100} tone="bg-emerald-500" />
			</div>
		</button>
	);
}

function DetailModal({ item, onClose }) {
	if (!item) return null;
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
			<div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Detalhe da O.S.</p>
						<h2 className="mt-1 text-2xl font-black text-slate-950">{item.osNumber}</h2>
					</div>
					<button type="button" className="rounded-xl border border-slate-200 p-2 text-slate-600" onClick={onClose} aria-label="Fechar">
						<X size={20} />
					</button>
				</div>
				<div className="mt-5 grid gap-3 text-sm font-bold text-slate-700 md:grid-cols-2">
					<p><strong>Técnico:</strong> {item.technicianName || "-"}</p>
					<p><strong>Cidade:</strong> {item.cityName || "-"}</p>
					<p><strong>Tipo O.S.:</strong> {item.osType || "-"}</p>
					<p><strong>Serviço:</strong> {item.serviceName || "-"}</p>
					<p><strong>Velocidade interpretada:</strong> {item.serviceSpeedMbps ? `${number(item.serviceSpeedMbps)} Mbps` : "-"}</p>
					<p><strong>Equipamento estimado:</strong> {EQUIPMENT_LABELS[item.equipmentType] || item.equipmentType}</p>
					<p><strong>Regra utilizada:</strong> {REASON_LABELS[item.classificationReason] || item.classificationReason || "-"}</p>
					<p><strong>Valor:</strong> {currency(item.equipmentUnitValue)}</p>
					<p><strong>Movimentação encontrada:</strong> {item.movementId || "-"}</p>
					<p><strong>Confiança:</strong> {item.matchConfidence || "-"}</p>
				</div>
				<div className="mt-4 rounded-xl bg-slate-50 p-4">
					<p className="text-xs font-black uppercase text-slate-500">Candidatos de serviço lidos</p>
					<p className="mt-2 text-sm font-bold text-slate-700">
						{item.serviceCandidates?.length ? item.serviceCandidates.join(" · ") : "Nenhum candidato salvo no snapshot."}
					</p>
				</div>
			</div>
		</div>
	);
}

export default function EquipmentRecoveryPage() {
	const [period, setPeriod] = useState("today");
	const [filters, setFilters] = useState({
		start_date: today,
		end_date: today,
		equipment: "",
		status: "",
		technician: "",
		osTypeId: "",
		channel: "",
	});
	const [data, setData] = useState({
		impact: null,
		summary: null,
		technicians: [],
		pending: { items: [], page: 1, totalPages: 1, total: 0 },
		records: { items: [], page: 1, totalPages: 1, total: 0 },
		options: { technicians: [], osTypes: [], channels: [] },
	});
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(10);
	const [sort, setSort] = useState("pending");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [job, setJob] = useState(null);
	const [confirmApply, setConfirmApply] = useState(false);
	const [selectedRow, setSelectedRow] = useState(null);
	const [selectedTechnician, setSelectedTechnician] = useState(null);

	const params = useMemo(() => ({ ...filters, page, limit }), [filters, page, limit]);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [impact, summary, technicians, pending, records, options] = await Promise.all([
				buscarImpactoRecuperacao(filters),
				buscarResumoRecuperacao(filters),
				buscarTecnicosRecuperacao({ ...filters, sort }),
				buscarPendenciasRecuperacao(params),
				buscarRegistrosRecuperacao(params),
				buscarOpcoesRecuperacao(filters),
			]);
			setData({
				impact,
				summary,
				technicians: technicians?.items || [],
				pending,
				records,
				options,
			});
		} catch (err) {
			setError(err.message || "Não foi possível carregar a recuperação.");
		} finally {
			setLoading(false);
		}
	}, [filters, params, sort]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		let cancelled = false;
		buscarUltimoJobRecuperacao()
			.then((latest) => {
				if (!cancelled && latest?.status === "RUNNING") setJob(latest);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!job?.id || job.status !== "RUNNING") return undefined;
		let cancelled = false;
		const timer = window.setInterval(async () => {
			try {
				const next = await buscarJobRecuperacao(job.id);
				if (cancelled) return;
				setJob(next);
				if (next.status === "COMPLETE") {
					setMessage(`Reprocessamento concluído: ${next.summary?.persisted || next.summary?.total || 0} O.S.`);
					load();
				}
				if (next.status === "FAILED") setError(next.errorMessage || "Falha no reprocessamento.");
			} catch (err) {
				if (!cancelled) setError(err.message || "Falha ao acompanhar job.");
			}
		}, 3000);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [job?.id, job?.status, load]);

	function setPeriodRange(next) {
		setPeriod(next);
		setPage(1);
		if (next === "today") setFilters((current) => ({ ...current, start_date: today, end_date: today }));
		if (next === "yesterday") setFilters((current) => ({ ...current, start_date: dateDaysAgo(1), end_date: dateDaysAgo(1) }));
		if (next === "7d") setFilters((current) => ({ ...current, start_date: dateDaysAgo(6), end_date: today }));
		if (next === "month") setFilters((current) => ({ ...current, start_date: monthStart(), end_date: today }));
	}

	async function handleReprocess(apply) {
		setLoading(true);
		setError("");
		setMessage("");
		try {
			const result = await reprocessarRecuperacao({ ...filters, apply });
			setJob(result);
			setMessage(
				apply
					? "Aplicação em homologação iniciada no backend. Pode atualizar a página que o job continua."
					: "Simulação iniciada no backend. Pode atualizar a página que o job continua.",
			);
		} catch (err) {
			setError(err.message || "Falha ao reprocessar.");
		} finally {
			setLoading(false);
			setConfirmApply(false);
		}
	}

	function clearFilters() {
		setPeriod("today");
		setPage(1);
		setSelectedTechnician(null);
		setFilters({
			start_date: today,
			end_date: today,
			equipment: "",
			status: "",
			technician: "",
			osTypeId: "",
			channel: "",
		});
	}

	function pickTechnician(item) {
		setSelectedTechnician(item);
		setPage(1);
		setFilters((current) => ({
			...current,
			technician: item.technicianKey || item.technicianName,
		}));
	}

	const summary = data.summary || {};
	const equipment = summary.equipamentos || [];
	const maxEquipment = Math.max(1, ...equipment.map((item) => item.total || 0));
	const maxStatus = Math.max(1, ...Object.values(summary.status || {}).map(Number));
	const topPending = [...data.technicians].sort((a, b) => b.pendentes - a.pendentes).slice(0, 5);
	const topValue = [...data.technicians].sort((a, b) => b.valorPendente - a.valorPendente).slice(0, 5);
	const unclassifiedPercent = summary.total ? summary.desconhecidos / summary.total : 0;

	return (
		<div className="space-y-6 p-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Técnicos & estoque</p>
							<span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black uppercase text-orange-700">
								Ambiente: Homologação
							</span>
						</div>
						<h1 className="mt-2 text-3xl font-black text-slate-950">Recuperação de ativos</h1>
						<p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
							Equipamentos estimados, valor recuperado e conciliação com estoque. Acompanhe o que foi retirado nas O.S. e quais equipamentos retornaram.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700" onClick={load} disabled={loading}>
							<RefreshCw size={16} /> Atualizar
						</button>
						<button type="button" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700" onClick={() => handleReprocess(false)} disabled={loading}>
							Simular conciliação
						</button>
						<button type="button" className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white shadow-sm" onClick={() => setConfirmApply(true)} disabled={loading}>
							Aplicar em homolog
						</button>
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-700">
						<Filter size={16} /> Filtros
					</div>
					<div className="flex flex-wrap gap-2">
						{[
							["today", "Hoje"],
							["yesterday", "Ontem"],
							["7d", "Últimos 7 dias"],
							["month", "Este mês"],
							["custom", "Personalizado"],
						].map(([key, label]) => (
							<button
								key={key}
								type="button"
								className={`rounded-xl px-3 py-2 text-sm font-black ${period === key ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
								onClick={() => setPeriodRange(key)}
							>
								{label}
							</button>
						))}
					</div>
					<div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
						<input type="date" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" value={filters.start_date} onChange={(event) => {
							setPeriod("custom");
							setPage(1);
							setFilters((current) => ({ ...current, start_date: event.target.value }));
						}} />
						<input type="date" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" value={filters.end_date} onChange={(event) => {
							setPeriod("custom");
							setPage(1);
							setFilters((current) => ({ ...current, end_date: event.target.value }));
						}} />
						<select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" value={filters.channel} onChange={(event) => {
							setPage(1);
							setFilters((current) => ({ ...current, channel: event.target.value }));
						}}>
							<option value="">Regional/canal: todos</option>
							{data.options.channels.map((item) => <option key={item} value={item}>{item}</option>)}
						</select>
						<select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" value={filters.technician} onChange={(event) => {
							setPage(1);
							setSelectedTechnician(null);
							setFilters((current) => ({ ...current, technician: event.target.value }));
						}}>
							<option value="">Técnico: todos</option>
							{data.options.technicians.map((item) => <option key={`${item.id}-${item.name}`} value={item.id || item.name}>{item.name}</option>)}
						</select>
						<select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" value={filters.equipment} onChange={(event) => {
							setPage(1);
							setFilters((current) => ({ ...current, equipment: event.target.value }));
						}}>
							<option value="">Equipamento: todos</option>
							<option value="FAST">FAST</option>
							<option value="AC">AC</option>
							<option value="AX">AX</option>
							<option value="UNKNOWN">Não classificado</option>
						</select>
						<select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" value={filters.status} onChange={(event) => {
							setPage(1);
							setFilters((current) => ({ ...current, status: event.target.value }));
						}}>
							<option value="">Status: todos</option>
							<option value="MATCHED">Devolvido</option>
							<option value="PENDING">Pendente</option>
							<option value="PROBABLE">Devolução provável</option>
							<option value="UNCLASSIFIED">Não classificado</option>
							<option value="NOT_FOUND">Não localizado</option>
						</select>
						<select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" value={filters.osTypeId} onChange={(event) => {
							setPage(1);
							setFilters((current) => ({ ...current, osTypeId: event.target.value }));
						}}>
							<option value="">Tipo de O.S.: todos</option>
							{data.options.osTypes.map((item) => <option key={`${item.id}-${item.name}`} value={item.id || item.name}>{item.name || item.id}</option>)}
						</select>
						<button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700" onClick={clearFilters}>
							<SlidersHorizontal size={16} /> Limpar filtros
						</button>
					</div>
				</div>

				{error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
				{message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}
				{job?.id ? (
					<div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-sm font-black text-blue-900">Job {job.status}</p>
								<p className="text-sm font-semibold text-blue-700">{job.summary?.stage || "Processando"} · {Number(job.summary?.percent || 0)}%</p>
							</div>
							<div className="min-w-[220px] flex-1"><ProgressBar value={job.summary?.percent || 0} tone="bg-blue-600" /></div>
						</div>
					</div>
				) : null}
			</section>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
				<KpiCard title="O.S. válidas" value={number(summary.total)} subtitle={`Nova regra adiciona ${number(data.impact?.delta)}`} icon={ShieldCheck} />
				<KpiCard title="Classificados" value={number(summary.classificados)} subtitle={`${percent(summary.taxaClassificacao)} da base`} icon={Box} tone="green" />
				<KpiCard title="Não classificados" value={number(summary.desconhecidos)} subtitle="Requer diagnóstico" icon={ShieldAlert} tone="orange" />
				<KpiCard title="Devolvidos" value={number(summary.devolvidos)} subtitle={`Taxa ${percent(summary.taxaDevolucao)}`} icon={CheckCircle2} tone="green" />
				<KpiCard title="Pendentes" value={number(summary.pendentes)} subtitle={`${number(summary.vencidas)} vencida(s)`} icon={Clock3} tone="orange" />
				<KpiCard title="Taxa de devolução" value={percent(summary.taxaDevolucao)} subtitle="Itens conciliados" icon={BarChart3} tone="purple" />
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<KpiCard title="Valor recuperado" value={currency(summary.valorClassificado)} subtitle="Equipamentos classificados" icon={Wallet} tooltip="Valor estimado dos equipamentos classificados pela regra de velocidade." />
				<KpiCard title="Valor devolvido" value={currency(summary.valorDevolvido)} subtitle="Conciliado com estoque" icon={CheckCircle2} tone="green" />
				<KpiCard title="Valor pendente" value={currency(summary.valorPendente)} subtitle="Valor em risco" icon={AlertTriangle} tone="orange" />
				<KpiCard title="Valor não classificado" value={summary.desconhecidos ? "Não calculável" : currency(summary.valorNaoClassificado)} subtitle={`${number(summary.desconhecidos)} O.S. sem equipamento`} icon={ShieldAlert} tone="slate" />
			</div>

			{summary.total > 0 && summary.desconhecidos === summary.total ? (
				<div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-lg font-black text-orange-800">100% das O.S. do período estão sem classificação de equipamento.</p>
							<p className="text-sm font-bold text-orange-700">Revise a origem da velocidade/tipo de serviço antes de avaliar valor recuperado e devolução.</p>
						</div>
						<button type="button" className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white" onClick={() => setFilters((current) => ({ ...current, equipment: "UNKNOWN" }))}>
							Ver O.S. sem classificação
						</button>
					</div>
				</div>
			) : null}

			<section className="grid gap-4 xl:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Qualidade da classificação</h2>
					<div className="mt-4 space-y-4">
						<BarRow label="Classificadas" value={summary.classificados} max={summary.total || 1} tone="bg-emerald-500" right={percent(summary.taxaClassificacao)} />
						<BarRow label="Não classificadas" value={summary.desconhecidos} max={summary.total || 1} tone="bg-orange-500" right={percent(unclassifiedPercent)} />
						<div className="flex flex-wrap gap-2">
							{(summary.motivosNaoClassificacao || []).map((item) => (
								<span key={item.reason} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
									{REASON_LABELS[item.reason] || item.reason}: {number(item.total)}
								</span>
							))}
							{!summary.motivosNaoClassificacao?.length ? <span className="text-sm font-bold text-slate-500">Nenhum motivo pendente nos filtros atuais.</span> : null}
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Status da recuperação</h2>
					<div className="mt-4 space-y-4">
						<BarRow label="Devolvidos" value={summary.status?.matched} max={maxStatus} tone="bg-emerald-500" />
						<BarRow label="Pendentes" value={summary.status?.pending} max={maxStatus} tone="bg-orange-500" />
						<BarRow label="Prováveis" value={summary.status?.probable} max={maxStatus} tone="bg-blue-500" />
						<BarRow label="Não classificados" value={summary.status?.unclassified} max={maxStatus} tone="bg-amber-500" />
						<BarRow label="Não localizados" value={summary.status?.notFound} max={maxStatus} tone="bg-slate-500" />
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-xl font-black text-slate-950">Equipamentos recuperados</h2>
					<p className="text-sm font-bold text-slate-500">Equipamento estimado com base na velocidade do serviço.</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{(summary.equipamentos || []).map((item) => <EquipmentCard key={item.category} item={item} />)}
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h3 className="text-lg font-black text-slate-950">Equipamentos estimados</h3>
					<div className="mt-4 space-y-4">
						{(summary.equipamentos || []).map((item) => (
							<BarRow key={item.category} label={EQUIPMENT_LABELS[item.category] || item.category} value={item.total} max={maxEquipment} tone={item.category === "UNKNOWN" ? "bg-orange-500" : "bg-blue-500"} />
						))}
					</div>
				</div>
			</section>

			<section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="text-xl font-black text-slate-950">Técnicos</h2>
						<select className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" value={sort} onChange={(event) => setSort(event.target.value)}>
							<option value="pending">Ordenar por pendências</option>
							<option value="os">Ordenar por O.S.</option>
							<option value="value">Ordenar por valor pendente</option>
							<option value="returnRate">Ordenar por taxa de devolução</option>
						</select>
					</div>
					{selectedTechnician ? (
						<div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">
							Filtrando técnico: {splitTechnicianName(selectedTechnician.technicianName).name}
						</div>
					) : null}
					<div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
						{data.technicians.map((item) => <TechnicianCard key={item.technicianKey} item={item} onSelect={pickTechnician} />)}
					</div>
					{!data.technicians.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum técnico calculado nesse período.</p> : null}
				</div>
				<div className="space-y-4">
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<h3 className="text-lg font-black text-slate-950">Técnicos com mais pendências</h3>
						<div className="mt-4 space-y-3">
							{topPending.map((item, index) => (
								<BarRow key={item.technicianKey} label={`${index + 1}. ${splitTechnicianName(item.technicianName).name}`} value={item.pendentes} max={Math.max(1, topPending[0]?.pendentes || 0)} tone="bg-orange-500" right={`${number(item.pendentes)} pend.`} />
							))}
						</div>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<h3 className="text-lg font-black text-slate-950">Maior valor pendente por técnico</h3>
						<div className="mt-4 space-y-3">
							{topValue.map((item, index) => (
								<BarRow key={item.technicianKey} label={`${index + 1}. ${splitTechnicianName(item.technicianName).name}`} value={item.valorPendente} max={Math.max(1, topValue[0]?.valorPendente || 0)} tone="bg-blue-500" right={currency(item.valorPendente)} />
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">Pendências e diagnóstico</h2>
						<p className="text-sm font-bold text-slate-500">Clique em uma linha para ver origem do serviço, velocidade interpretada e regra usada.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<a className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700" href={urlExportPendencias(filters)}>
							<Download size={16} /> Exportar CSV
						</a>
						<select className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" value={limit} onChange={(event) => {
							setPage(1);
							setLimit(Number(event.target.value));
						}}>
							<option value={10}>10 registros</option>
							<option value={25}>25 registros</option>
							<option value={50}>50 registros</option>
						</select>
					</div>
				</div>
				<div className="mt-4 overflow-x-auto">
					<table className="min-w-full text-left text-sm">
						<thead className="text-xs uppercase text-slate-500">
							<tr>
								<th className="px-3 py-2">O.S.</th>
								<th className="px-3 py-2">Fechamento</th>
								<th className="px-3 py-2">Cidade</th>
								<th className="px-3 py-2">Tipo O.S.</th>
								<th className="px-3 py-2">Técnico</th>
								<th className="px-3 py-2">Serviço</th>
								<th className="px-3 py-2">Equipamento</th>
								<th className="px-3 py-2">Valor</th>
								<th className="px-3 py-2">Status</th>
								<th className="px-3 py-2">Ações</th>
							</tr>
						</thead>
						<tbody>
							{(data.records?.items || []).map((item) => (
								<tr key={item.id} className="border-t border-slate-100">
									<td className="px-3 py-3 font-black text-blue-700">{item.osNumber}</td>
									<td className="px-3 py-3 font-bold text-slate-700">{item.closedAt ? new Date(item.closedAt).toLocaleDateString("pt-BR") : "-"}</td>
									<td className="px-3 py-3 font-bold text-slate-700">{item.cityName || "-"}</td>
									<td className="px-3 py-3 font-bold text-slate-700">{item.osType || "-"}</td>
									<td className="px-3 py-3 font-bold text-slate-700">{splitTechnicianName(item.technicianName).name}</td>
									<td className="max-w-xs px-3 py-3 font-bold text-slate-700">
										<p className="truncate" title={item.serviceName}>{item.serviceName || "-"}</p>
										{item.equipmentType === "UNKNOWN" ? <p className="mt-1 text-xs font-bold text-orange-700">{REASON_LABELS[item.classificationReason] || item.classificationReason || "Dados insuficientes"}</p> : null}
									</td>
									<td className="px-3 py-3"><EquipmentBadge type={item.equipmentType} /></td>
									<td className="px-3 py-3 font-black text-slate-800">{currency(item.equipmentUnitValue)}</td>
									<td className="px-3 py-3"><StatusBadge status={statusFor(item)} /></td>
									<td className="px-3 py-3">
										<button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-black text-slate-700" onClick={() => setSelectedRow(item)}>
											<Eye size={14} /> Ver detalhes
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!data.records?.items?.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum registro encontrado para os filtros selecionados.</p> : null}
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-600">
					<span>{number(data.records?.total)} registro(s) · página {data.records?.page || 1} de {data.records?.totalPages || 1}</span>
					<div className="flex gap-2">
						<button type="button" className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
						<button type="button" className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40" disabled={page >= (data.records?.totalPages || 1)} onClick={() => setPage((current) => current + 1)}>Próxima</button>
					</div>
				</div>
			</section>

			{confirmApply ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
					<div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
						<h2 className="text-2xl font-black text-slate-950">Aplicar resultados em homologação?</h2>
						<p className="mt-2 text-sm font-bold text-slate-600">Essa ação persistirá os resultados simulados apenas no ambiente de homologação.</p>
						<div className="mt-4 grid gap-3 rounded-2xl bg-orange-50 p-4 text-sm font-bold text-orange-800">
							<p>O.S. afetadas: {number(summary.total)}</p>
							<p>Classificações: {number(summary.classificados)}</p>
							<p>Matches/devoluções: {number(summary.devolvidos)}</p>
							<p>Valor total classificado: {currency(summary.valorClassificado)}</p>
						</div>
						<div className="mt-5 flex justify-end gap-2">
							<button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700" onClick={() => setConfirmApply(false)}>Cancelar</button>
							<button type="button" className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white" onClick={() => handleReprocess(true)}>Aplicar em homologação</button>
						</div>
					</div>
				</div>
			) : null}

			<DetailModal item={selectedRow} onClose={() => setSelectedRow(null)} />
		</div>
	);
}
