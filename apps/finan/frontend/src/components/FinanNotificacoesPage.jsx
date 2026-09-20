import { BellRing, CheckCheck, Filter, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	checkFinanCriticalAlerts,
	fetchFinanNotifications,
	fetchFinanNotificationStats,
	markFinanNotificationsRead,
} from "../api/finanApi";
import { useFinanAuth } from "../state/useFinanAuth";

const TYPE_OPTIONS = [
	{ value: "", label: "Todos os tipos" },
	{ value: "import_orcamento", label: "Importação de orçamento" },
	{ value: "backup", label: "Backup" },
	{ value: "integracao_erro", label: "Integrações" },
	{ value: "calendario_alerta", label: "Calendário" },
	{ value: "geral", label: "Geral" },
];

const SEVERITY_OPTIONS = [
	{ value: "", label: "Todas as prioridades" },
	{ value: "critical", label: "Crítica" },
	{ value: "warning", label: "Atenção" },
	{ value: "success", label: "Sucesso" },
	{ value: "info", label: "Informação" },
];

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
}

// Extraido pra achado javascript:S3358 (ternario aninhado, mesmo padrao
// da fase de qualidade do app principal).
function severityClass(severity) {
	if (severity === "critical") return "border-red-200 bg-red-50 text-red-800";
	if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
	if (severity === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
	return "border-blue-200 bg-blue-50 text-blue-800";
}

function hasFinanConfigManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.configuracoes.manage");
}

export default function FinanNotificacoesPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasFinanConfigManagePermission(currentUser);
	const [loading, setLoading] = useState(true);
	const [checking, setChecking] = useState(false);
	const [items, setItems] = useState([]);
	const [stats, setStats] = useState(null);
	const [message, setMessage] = useState("");
	const [filters, setFilters] = useState({ type: "", severity: "", unread: false });

	const load = useCallback(async () => {
		try {
			const [notificationsResponse, statsResponse] = await Promise.all([
				fetchFinanNotifications({ limit: 100, ...filters }),
				fetchFinanNotificationStats(),
			]);
			setItems(notificationsResponse?.items || []);
			setStats(statsResponse);
		} catch (error) {
			setMessage(error?.message || "Não foi possível carregar as notificações.");
		}
	}, [filters]);

	useEffect(() => {
		let active = true;
		setLoading(true);
		setMessage("");
		load().finally(() => {
			if (active) setLoading(false);
		});
		return () => {
			active = false;
		};
	}, [load]);

	const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);

	const markAllRead = async () => {
		if (!canManage) return;
		try {
			await markFinanNotificationsRead({ all: true });
			await load();
		} catch (error) {
			setMessage(error?.message || "Não foi possível marcar como lidas.");
		}
	};

	const checkCritical = async () => {
		if (!canManage) return;
		setChecking(true);
		setMessage("");
		try {
			const result = await checkFinanCriticalAlerts();
			setMessage(
				result?.created
					? `${result.created} alerta(s) crítico(s) registrado(s).`
					: "Nenhuma integração com erro no momento.",
			);
			await load();
		} catch (error) {
			setMessage(error?.message || "Não foi possível verificar alertas críticos.");
		} finally {
			setChecking(false);
		}
	};

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
							<BellRing size={24} />
						</span>
						<div>
							<h1 className="text-2xl font-black text-slate-950">
								Central de Notificações
							</h1>
							<p className="text-sm font-semibold text-slate-500">
								Histórico de importações, backups, integrações e alertas do
								calendário.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={markAllRead}
							disabled={!canManage}
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<CheckCheck size={16} /> Marcar todas como lidas
						</button>
						<button
							type="button"
							onClick={checkCritical}
							disabled={checking || !canManage}
							className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{checking ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
							Verificar críticos
						</button>
						<button
							type="button"
							onClick={load}
							className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700"
						>
							<RefreshCw size={16} /> Atualizar
						</button>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-4">
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
					<p className="text-xs font-black uppercase tracking-wide text-blue-700">
						Total
					</p>
					<p className="mt-1 text-2xl font-black text-blue-950">
						{stats?.total || 0}
					</p>
				</div>
				<div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
					<p className="text-xs font-black uppercase tracking-wide text-orange-700">
						Não lidas
					</p>
					<p className="mt-1 text-2xl font-black text-orange-950">
						{stats?.unread ?? unread}
					</p>
				</div>
				<div className="rounded-2xl border border-red-100 bg-red-50 p-4">
					<p className="text-xs font-black uppercase tracking-wide text-red-700">
						Críticas
					</p>
					<p className="mt-1 text-2xl font-black text-red-950">
						{stats?.bySeverity?.critical || 0}
					</p>
				</div>
				<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
					<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
						Importações
					</p>
					<p className="mt-1 text-2xl font-black text-emerald-950">
						{stats?.byType?.import_orcamento || 0}
					</p>
				</div>
			</section>

			{message ? (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-black text-blue-800">
					{message}
				</div>
			) : null}

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<h2 className="text-lg font-black text-slate-950">Histórico</h2>
					<p className="text-sm font-semibold text-slate-500">
						{items.length} notificação(ões) encontrada(s)
					</p>
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					<Filter size={16} className="text-slate-400" />
					<select
						value={filters.type}
						onChange={(event) =>
							setFilters((current) => ({ ...current, type: event.target.value }))
						}
						className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
					>
						{TYPE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<select
						value={filters.severity}
						onChange={(event) =>
							setFilters((current) => ({ ...current, severity: event.target.value }))
						}
						className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
					>
						{SEVERITY_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
						<input
							type="checkbox"
							checked={filters.unread}
							onChange={(event) =>
								setFilters((current) => ({ ...current, unread: event.target.checked }))
							}
							className="h-4 w-4 accent-blue-600"
						/>
						Somente não lidas
					</label>
				</div>

				<div className="mt-5 space-y-3">
					{loading ? (
						<p className="text-sm font-semibold text-slate-500">Carregando...</p>
					) : null}
					{!loading &&
						items.map((item) => (
							<a
								key={item.id}
								href={item.targetPath || "#"}
								className={`block rounded-2xl border p-4 transition hover:shadow-sm ${severityClass(item.severity)} ${item.read ? "opacity-75" : ""}`}
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-black">{item.title}</p>
										<p className="mt-1 text-sm font-semibold leading-relaxed">
											{item.message}
										</p>
									</div>
									<div className="flex shrink-0 flex-col items-end gap-1">
										<span className="rounded-full bg-white/75 px-2.5 py-1 text-xs font-black">
											{item.read ? "Lida" : "Nova"}
										</span>
										<span className="text-xs font-bold opacity-75">
											{formatDate(item.createdAt)}
										</span>
									</div>
								</div>
							</a>
						))}
					{!loading && !items.length ? (
						<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm font-bold text-slate-400">
							Nenhuma notificação encontrada para os filtros selecionados.
						</div>
					) : null}
				</div>
			</section>
		</div>
	);
}
