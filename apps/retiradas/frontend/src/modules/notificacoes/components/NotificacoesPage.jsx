import {
	BellRing,
	CheckCheck,
	Filter,
	Loader2,
	RefreshCw,
	ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	listarNotificacoesInternas,
	marcarNotificacoesLidas,
	obterEstatisticasNotificacoes,
	verificarAlertasCriticos,
} from "../../../services/internalNotificationsService";

const TYPE_OPTIONS = [
	{ value: "", label: "Todos os tipos" },
	{ value: "documentos_pendentes", label: "Documentos" },
	{ value: "whatsapp_agendamento_auto", label: "WhatsApp" },
	{ value: "sistema_critico", label: "Sistema crítico" },
	{ value: "backup", label: "Backup" },
	{ value: "api", label: "API" },
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

function severityClass(severity) {
	const styles = {
		critical: "border-red-200 bg-red-50 text-red-800",
		warning: "border-amber-200 bg-amber-50 text-amber-800",
		success: "border-emerald-200 bg-emerald-50 text-emerald-800",
		info: "border-blue-200 bg-blue-50 text-blue-800",
	};
	return styles[severity] || styles.info;
}

export default function NotificacoesPage() {
	const { currentUser } = useAuthContext();
	const [loading, setLoading] = useState(true);
	const [checking, setChecking] = useState(false);
	const [items, setItems] = useState([]);
	const [stats, setStats] = useState(null);
	const [message, setMessage] = useState("");
	const [filters, setFilters] = useState({
		type: "",
		severity: "",
		unread: false,
	});

	const load = useCallback(async () => {
		setMessage("");
		const [list, nextStats] = await Promise.all([
			listarNotificacoesInternas({ limit: 100, ...filters }),
			obterEstatisticasNotificacoes(),
		]);
		setItems(list?.items || []);
		setStats(nextStats || null);
	}, [filters]);

	useEffect(() => {
		let active = true;
		setLoading(true);
		load()
			.catch((error) => {
				if (active)
					setMessage(
						error?.message || "Não foi possível carregar as notificações.",
					);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [load]);

	const unread = useMemo(
		() => items.filter((item) => !item.read).length,
		[items],
	);
	const canManage =
		hasPermission(currentUser, "configuracao.notificacoes.manage") ||
		hasPermission(currentUser, "manage_general_settings");

	const markAllRead = async () => {
		if (!canManage) return;
		await marcarNotificacoesLidas({ all: true });
		await load();
	};

	const checkCritical = async () => {
		if (!canManage) return;
		setChecking(true);
		setMessage("");
		try {
			const result = await verificarAlertasCriticos();
			setMessage(
				result.created
					? `${result.created} alerta(s) crítico(s) registrado(s).`
					: "Nenhum serviço crítico offline no momento.",
			);
			await load();
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível verificar os alertas críticos.",
			);
		} finally {
			setChecking(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
							<BellRing size={24} />
						</div>
						<div>
							<h1 className="text-2xl font-black text-slate-950">
								Central de Notificações
							</h1>
							<p className="text-sm font-semibold text-slate-500">
								Histórico de documentos, WhatsApp, APIs, backups e alertas do
								sistema.
							</p>
						</div>
					</div>

					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={markAllRead}
							disabled={!canManage}
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<CheckCheck size={16} /> Marcar todas como lidas
						</button>
						<button
							type="button"
							onClick={checkCritical}
							disabled={checking || !canManage}
							className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
						>
							{checking ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<ShieldAlert size={16} />
							)}
							Verificar críticos
						</button>
						<button
							type="button"
							onClick={load}
							className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"
						>
							<RefreshCw size={16} /> Atualizar
						</button>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-4">
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
					<p className="text-xs font-black uppercase text-blue-700">Total</p>
					<p className="mt-2 text-2xl font-black text-blue-950">
						{stats?.total || 0}
					</p>
				</div>
				<div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
					<p className="text-xs font-black uppercase text-orange-700">
						Não lidas
					</p>
					<p className="mt-2 text-2xl font-black text-orange-950">
						{stats?.unread || unread}
					</p>
				</div>
				<div className="rounded-2xl border border-red-100 bg-red-50 p-4">
					<p className="text-xs font-black uppercase text-red-700">Críticas</p>
					<p className="mt-2 text-2xl font-black text-red-950">
						{stats?.bySeverity?.critical || 0}
					</p>
				</div>
				<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
					<p className="text-xs font-black uppercase text-emerald-700">
						WhatsApp
					</p>
					<p className="mt-2 text-2xl font-black text-emerald-950">
						{stats?.byType?.whatsapp_agendamento_auto || 0}
					</p>
				</div>
			</section>

			{message ? (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-black text-blue-800">
					{message}
				</div>
			) : null}

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">Histórico</h2>
						<p className="text-sm font-semibold text-slate-500">
							{items.length} notificação(ões) encontrada(s)
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Filter size={16} className="text-slate-400" />
						<select
							value={filters.type}
							onChange={(event) =>
								setFilters((current) => ({
									...current,
									type: event.target.value,
								}))
							}
							className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none"
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
								setFilters((current) => ({
									...current,
									severity: event.target.value,
								}))
							}
							className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none"
						>
							{SEVERITY_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
						<label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700">
							<input
								type="checkbox"
								checked={filters.unread}
								onChange={(event) =>
									setFilters((current) => ({
										...current,
										unread: event.target.checked,
									}))
								}
								className="h-4 w-4 accent-blue-600"
							/>
							Somente não lidas
						</label>
					</div>
				</div>

				<div className="space-y-3">
					{items.length ? (
						items.map((item) => (
							<a
								key={item.id}
								href={item.targetPath || "#"}
								className={`block rounded-2xl border p-4 transition hover:shadow-sm ${severityClass(item.severity)} ${item.read ? "opacity-75" : ""}`}
							>
								<div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
									<div>
										<p className="text-sm font-black">{item.title}</p>
										<p className="mt-1 text-sm font-semibold leading-relaxed">
											{item.message}
										</p>
									</div>
									<div className="flex shrink-0 flex-wrap gap-2 text-xs font-black">
										<span className="rounded-full bg-white/75 px-2.5 py-1">
											{item.read ? "Lida" : "Nova"}
										</span>
										<span className="rounded-full bg-white/75 px-2.5 py-1">
											{formatDate(item.createdAt)}
										</span>
									</div>
								</div>
							</a>
						))
					) : (
						<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm font-bold text-slate-400">
							Nenhuma notificação encontrada para os filtros selecionados.
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
