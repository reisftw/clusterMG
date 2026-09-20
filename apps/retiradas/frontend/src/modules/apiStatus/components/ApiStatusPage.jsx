import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	Clock3,
	PlugZap,
	RefreshCw,
	Server,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { buscarStatusApis } from "../services/apiStatusService";

function formatDateTime(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatBytes(value) {
	const bytes = Number(value || 0);
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	return `${(bytes / 1024 ** index).toLocaleString("pt-BR", {
		maximumFractionDigits: index === 0 ? 0 : 2,
	})} ${units[index]}`;
}

function formatDuration(secondsRaw) {
	const seconds = Math.max(0, Math.floor(Number(secondsRaw || 0)));
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m ${seconds % 60}s`;
}

function runtimeEventLabel(type) {
	const labels = {
		startup: "Inicialização",
		shutdown: "Encerramento",
		uncaughtException: "Erro crítico",
		unhandledRejection: "Erro assíncrono",
	};
	return labels[type] || type || "Evento";
}

function serviceEventLabel(event = {}) {
	if (event.type === "initial") return "Primeira leitura";
	if (event.previousStatus && event.status) {
		return `${event.previousStatus} → ${event.status}`;
	}
	return event.status || "Status registrado";
}

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveApiStatusDetailValue(key, value) {
	if (Array.isArray(value)) return value.length ? JSON.stringify(value) : "-";
	return key.toLowerCase().includes("bytes")
		? formatBytes(value)
		: String(value);
}

function renderDetails(details = {}) {
	const entries = Object.entries(details).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (!entries.length) return null;

	return (
		<dl className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs md:grid-cols-2">
			{entries.map(([key, value]) => (
				<div key={key}>
					<dt className="font-bold uppercase text-slate-400">{key}</dt>
					<dd className="mt-1 break-words font-semibold text-slate-700">
						{resolveApiStatusDetailValue(key, value)}
					</dd>
				</div>
			))}
		</dl>
	);
}

const ApiStatusPage = () => {
	const [status, setStatus] = useState(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");
	const [expanded, setExpanded] = useState({});

	const loadStatus = async ({ silent = false } = {}) => {
		if (silent) setRefreshing(true);
		setError("");
		try {
			const data = await buscarStatusApis();
			setStatus(data);
		} catch (err) {
			setError(err.message || "Não foi possível consultar as APIs.");
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	useEffect(() => {
		loadStatus();
		const timer = window.setInterval(() => loadStatus({ silent: true }), 30000);
		return () => window.clearInterval(timer);
	}, []);

	const services = useMemo(() => status?.services || [], [status?.services]);
	const serviceEvents = status?.serviceEvents || [];
	const offlineServices = useMemo(
		() => services.filter((service) => service.status !== "online"),
		[services],
	);

	if (loading) return <Spinner fullScreen={false} />;

	return (
		<div className="space-y-5">
			<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-700">
							<PlugZap size={18} />
							Monitoramento de APIs
						</div>
						<h1 className="mt-2 text-2xl font-bold text-slate-900">
							Status das APIs da VPS
						</h1>
						<p className="mt-1 max-w-3xl text-sm text-slate-500">
							Mostra se login, banco, documentos, dados públicos, importações,
							backups e tempo real estão respondendo corretamente.
						</p>
					</div>

					<button
						type="button"
						onClick={() => loadStatus({ silent: true })}
						disabled={refreshing}
						className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
					>
						<RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
						Atualizar
					</button>
				</div>

				{error && (
					<div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
						<AlertTriangle size={16} />
						{error}
					</div>
				)}
			</section>

			<section className="grid gap-3 md:grid-cols-4">
				<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
						<Server size={16} />
						APIs Online
					</div>
					<p className="mt-3 text-3xl font-bold text-emerald-600">
						{status?.summary?.online || 0}/{status?.summary?.total || 0}
					</p>
				</div>

				<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
						<XCircle size={16} />
						APIs Offline
					</div>
					<p
						className={`mt-3 text-3xl font-bold ${offlineServices.length ? "text-red-600" : "text-slate-900"}`}
					>
						{status?.summary?.offline || 0}
					</p>
				</div>

				<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
						<Clock3 size={16} />
						Última Verificação
					</div>
					<p className="mt-3 text-lg font-bold text-slate-900">
						{formatDateTime(status?.checkedAt)}
					</p>
				</div>

				<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
						<Clock3 size={16} />
						API Ativa Há
					</div>
					<p className="mt-3 text-lg font-bold text-emerald-600">
						{status?.runtime?.uptimeLabel ||
							formatDuration(status?.runtime?.uptimeSeconds)}
					</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">
						Desde {formatDateTime(status?.runtime?.startedAt)}
					</p>
				</div>
			</section>

			<section className="rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-100 p-4">
					<h2 className="text-base font-bold text-slate-900">
						Uptime e Reinícios da API
					</h2>
					<p className="text-xs text-slate-500">
						Ajuda a diferenciar queda da API de expiração de sessão/login.
					</p>
				</div>
				<div className="grid gap-3 p-4 md:grid-cols-3">
					<div className="rounded-lg bg-slate-50 p-3">
						<p className="text-xs font-bold uppercase text-slate-400">
							PID atual
						</p>
						<p className="mt-1 font-bold text-slate-900">
							{status?.runtime?.pid || "-"}
						</p>
					</div>
					<div className="rounded-lg bg-slate-50 p-3">
						<p className="text-xs font-bold uppercase text-slate-400">
							Último restart
						</p>
						<p className="mt-1 font-bold text-slate-900">
							{formatDateTime(status?.runtime?.lastRestartAt)}
						</p>
					</div>
					<div className="rounded-lg bg-slate-50 p-3">
						<p className="text-xs font-bold uppercase text-slate-400">
							Memória RSS
						</p>
						<p className="mt-1 font-bold text-slate-900">
							{formatBytes(status?.runtime?.memory?.rss)}
						</p>
					</div>
				</div>
				<div className="border-t border-slate-100 p-4">
					<h3 className="text-sm font-bold text-slate-900">Log recente</h3>
					<div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
						{(status?.runtime?.events || []).slice(0, 10).map((event) => (
							<div
								key={event.id || `${event.type}-${event.createdAt}`}
								className="flex flex-col gap-1 p-3 text-sm md:flex-row md:items-center md:justify-between"
							>
								<div>
									<p className="font-bold text-slate-900">
										{runtimeEventLabel(event.type)}
									</p>
									<p className="text-xs font-semibold text-slate-500">
										{event.details?.reason ||
											event.details?.signal ||
											"Sem motivo informado"}
									</p>
								</div>
								<span className="text-xs font-semibold text-slate-500">
									{formatDateTime(event.createdAt)}
								</span>
							</div>
						))}
						{!(status?.runtime?.events || []).length ? (
							<div className="p-4 text-center text-sm text-slate-500">
								Nenhum evento de reinício registrado ainda. O primeiro aparecerá
								após o próximo restart da API.
							</div>
						) : null}
					</div>
				</div>
			</section>

			<section className="rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-100 p-4">
					<h2 className="text-base font-bold text-slate-900">
						Histórico de Status dos Serviços
					</h2>
					<p className="text-xs text-slate-500">
						Registra quando cada API entra ou sai do ar, com motivo e tempo de
						resposta.
					</p>
				</div>
				<div className="divide-y divide-slate-100">
					{serviceEvents.slice(0, 12).map((event) => (
						<div
							key={event.id || `${event.serviceId}-${event.createdAt}`}
							className="flex flex-col gap-2 p-4 text-sm md:flex-row md:items-center md:justify-between"
						>
							<div>
								<p className="font-bold text-slate-900">
									{event.serviceName || event.serviceId}
								</p>
								<p className="text-xs font-semibold text-slate-500">
									{serviceEventLabel(event)}
									{event.reason ? ` · ${event.reason}` : ""}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-500">
								<span>{event.responseMs ?? "-"} ms</span>
								<span>{formatDateTime(event.createdAt)}</span>
							</div>
						</div>
					))}
					{!serviceEvents.length ? (
						<div className="p-4 text-center text-sm text-slate-500">
							Nenhuma mudança de status registrada ainda.
						</div>
					) : null}
				</div>
			</section>

			<section className="rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-100 p-4">
					<h2 className="text-base font-bold text-slate-900">
						APIs Monitoradas
					</h2>
					<p className="text-xs text-slate-500">
						Quando alguma API cair, o motivo aparece na própria linha.
					</p>
				</div>

				<div className="divide-y divide-slate-100">
					{services.map((service) => {
						const online = service.status === "online";
						const isExpanded = Boolean(expanded[service.id]);
						return (
							<article key={service.id} className="p-4">
								<button
									type="button"
									onClick={() =>
										setExpanded((current) => ({
											...current,
											[service.id]: !current[service.id],
										}))
									}
									className="flex w-full items-center justify-between gap-3 text-left"
								>
									<div className="flex min-w-0 items-start gap-3">
										<span
											className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
												online
													? "bg-emerald-50 text-emerald-600"
													: "bg-red-50 text-red-600"
											}`}
										>
											{online ? (
												<CheckCircle2 size={20} />
											) : (
												<XCircle size={20} />
											)}
										</span>
										<div className="min-w-0">
											<h3 className="font-bold text-slate-900">
												{service.name}
											</h3>
											<p
												className={`mt-1 text-sm ${online ? "text-emerald-600" : "text-red-600"}`}
											>
												{online ? "Online" : service.reason || "Offline"}
											</p>
										</div>
									</div>

									<div className="flex shrink-0 items-center gap-3">
										<span className="hidden text-xs font-semibold text-slate-500 md:inline">
											{service.details?.responseMs ?? "-"} ms
										</span>
										<ChevronDown
											size={18}
											className={`text-slate-400 transition ${isExpanded ? "rotate-180" : ""}`}
										/>
									</div>
								</button>

								{isExpanded && (
									<div className="pl-12">
										<p className="mt-2 text-xs font-semibold text-slate-500">
											Verificado em {formatDateTime(service.checkedAt)}
										</p>
										{renderDetails(service.details)}
									</div>
								)}
							</article>
						);
					})}

					{!services.length && (
						<div className="p-8 text-center text-sm text-slate-500">
							Nenhuma API monitorada.
						</div>
					)}
				</div>
			</section>
		</div>
	);
};

export default ApiStatusPage;
