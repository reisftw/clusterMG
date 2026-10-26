import {
	AlertTriangle,
	CheckCircle2,
	Clock3,
	Loader2,
	Square,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	buscarStatusTurboMensageria,
	iniciarTurboMensageria,
	pararTurboMensageria,
} from "../services/mensageriaService";

const EMPTY_STATUS = {
	status: "idle",
	running: false,
	target: 300,
	intervalSeconds: 2,
	attempted: 0,
	sent: 0,
	failed: 0,
	skipped: 0,
	normalQueueWasActive: false,
	normalQueueSuspended: false,
	items: [],
};

function statusLabel(status) {
	if (status === "preparing") return "Preparando";
	if (status === "running") return "Enviando";
	if (status === "stopping") return "Interrompendo";
	if (status === "completed") return "Concluído";
	if (status === "stopped") return "Interrompido";
	if (status === "failed") return "Falhou";
	return "Pronto para iniciar";
}

function outcomeLabel(outcome) {
	if (outcome === "sent") return "Enviado";
	if (outcome === "failed") return "Falhou";
	return "Ignorado";
}

function formatTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export default function MensageriaTurboModal({
	open,
	initialStatus,
	onClose,
}) {
	const [turbo, setTurbo] = useState({ ...EMPTY_STATUS, ...initialStatus });
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		if (!open) return undefined;
		let active = true;

		const refresh = async () => {
			try {
				const result = await buscarStatusTurboMensageria();
				if (active) setTurbo({ ...EMPTY_STATUS, ...(result?.turbo || {}) });
			} catch (error) {
				if (active) setMessage(error?.message || "Não foi possível acompanhar o modo Turbo.");
			}
		};

		refresh();
		const timer = window.setInterval(refresh, 2000);
		return () => {
			active = false;
			window.clearInterval(timer);
		};
	}, [open]);

	const progress = useMemo(() => {
		const target = Math.max(1, Number(turbo.target || 300));
		return Math.min(100, Math.round((Number(turbo.sent || 0) / target) * 100));
	}, [turbo.sent, turbo.target]);

	const recentItems = useMemo(
		() => [...(turbo.items || [])].reverse(),
		[turbo.items],
	);

	async function handleStart() {
		setBusy(true);
		setMessage("");
		try {
			const result = await iniciarTurboMensageria();
			setTurbo({ ...EMPTY_STATUS, ...(result?.turbo || {}) });
		} catch (error) {
			setMessage(error?.message || "Não foi possível iniciar o modo Turbo.");
		} finally {
			setBusy(false);
		}
	}

	async function handleStop() {
		setBusy(true);
		setMessage("");
		try {
			const result = await pararTurboMensageria();
			setTurbo({ ...EMPTY_STATUS, ...(result?.turbo || {}) });
		} catch (error) {
			setMessage(error?.message || "Não foi possível interromper o modo Turbo.");
		} finally {
			setBusy(false);
		}
	}

	async function handleClose() {
		if (turbo.running) await handleStop();
		onClose();
	}

	if (!open) return null;

	const isActive = turbo.running || ["preparing", "stopping"].includes(turbo.status);

	return (
		<div className="fixed inset-0 z-layout-notification flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
			<section
				className="flex max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-2xl sm:max-h-[92vh] sm:rounded-2xl"
				aria-labelledby="turbo-title"
				aria-modal="true"
				role="dialog"
			>
				<header className="shrink-0 bg-[linear-gradient(135deg,#9a3412_0%,#ea580c_55%,#f59e0b_100%)] px-5 py-5 text-white sm:px-6">
					<div className="flex items-start justify-between gap-4">
						<div className="flex min-w-0 items-start gap-3">
							<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
								<Zap size={25} aria-hidden="true" />
							</span>
							<div>
								<p className="text-xs font-black uppercase tracking-[0.18em] text-orange-100">Disparo controlado</p>
								<h2 id="turbo-title" className="mt-1 text-2xl font-black text-white">Modo Turbo</h2>
								<p className="mt-1 text-sm leading-5 text-orange-50">Até 300 envios confirmados, com intervalo de 2 segundos. Falhas pulam imediatamente para o próximo contato.</p>
							</div>
						</div>
						<button
							type="button"
							onClick={handleClose}
							disabled={busy}
							className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-60"
							aria-label={isActive ? "Interromper e fechar modo Turbo" : "Fechar modo Turbo"}
						>
							<X size={20} aria-hidden="true" />
						</button>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
					<div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold leading-5 text-orange-900">
						A fila normal fica suspensa durante esta execução. Assim que o Turbo terminar ou for interrompido, ela volta automaticamente com a configuração anterior.
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
						{[
							{ label: "Status", value: statusLabel(turbo.status), icon: isActive ? Loader2 : Clock3, spin: isActive },
							{ label: "Enviadas", value: `${Number(turbo.sent || 0)} / ${Number(turbo.target || 300)}`, icon: CheckCircle2 },
							{ label: "Falhas", value: Number(turbo.failed || 0), icon: AlertTriangle },
							{ label: "Ignorados", value: Number(turbo.skipped || 0), icon: AlertTriangle },
							{ label: "Intervalo", value: `${Number(turbo.intervalSeconds || 2)} segundos`, icon: Clock3 },
						].map((item) => {
							const Icon = item.icon;
							return (
								<div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
									<div className="flex items-center justify-between gap-2 text-slate-500">
										<p className="text-xs font-black uppercase tracking-wide">{item.label}</p>
										<Icon size={17} className={item.spin ? "animate-spin text-orange-600" : "text-orange-600"} />
									</div>
									<p className="mt-2 text-lg font-black text-slate-900">{item.value}</p>
								</div>
							);
						})}
					</div>

					<div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
							<span>Progresso dos envios confirmados</span>
							<span>{progress}%</span>
						</div>
						<div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
							<div className="h-full rounded-full bg-[linear-gradient(90deg,#f97316,#f59e0b)] transition-[width] duration-500" style={{ width: `${progress}%` }} />
						</div>
						{turbo.currentItem ? (
							<p className="mt-3 text-sm font-semibold text-slate-600">
								Enviando agora: <strong className="text-slate-900">{turbo.currentItem.codigoCliente ? `${turbo.currentItem.codigoCliente} - ` : ""}{turbo.currentItem.cliente || turbo.currentItem.telefone || turbo.currentItem.os}</strong>
							</p>
						) : null}
						{turbo.nextAttemptAt && isActive ? (
							<p className="mt-1 text-xs font-semibold text-slate-500">Próxima tentativa às {formatTime(turbo.nextAttemptAt)}</p>
						) : null}
					</div>

					{message || turbo.error ? (
						<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message || turbo.error}</div>
					) : null}

					<div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
						<div className="border-b border-slate-200 px-4 py-3">
							<h3 className="font-black text-slate-900">Processados nesta execução</h3>
							<p className="text-sm text-slate-500">Os envios mais recentes aparecem primeiro.</p>
						</div>
						<div className="max-h-64 overflow-y-auto">
							{recentItems.length ? recentItems.map((item, index) => (
								<div key={`${item.id || item.os}-${item.processedAt || index}`} className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
									<div className="min-w-0">
										<p className="truncate text-sm font-black text-slate-900">{item.codigoCliente ? `${item.codigoCliente} - ` : ""}{item.cliente || item.telefone || "Cliente"}</p>
										<p className="mt-0.5 text-xs font-semibold text-slate-500">O.S. {item.os || "-"} · {formatTime(item.processedAt)}</p>
										{item.error ? <p className="mt-1 text-xs text-red-600">{item.error}</p> : null}
									</div>
									<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${item.outcome === "sent" ? "bg-emerald-100 text-emerald-700" : item.outcome === "skipped" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>{outcomeLabel(item.outcome)}</span>
								</div>
							)) : (
								<p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Nenhum cliente processado nesta execução.</p>
							)}
						</div>
					</div>
				</div>

				<footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
					{isActive ? (
						<button type="button" onClick={handleStop} disabled={busy || turbo.status === "stopping"} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-2.5 text-sm font-black text-red-700 hover:bg-red-50 disabled:opacity-60 sm:w-auto">
							{busy ? <Loader2 className="animate-spin" size={18} /> : <Square size={17} />}
							Interromper Turbo
						</button>
					) : (
						<>
							<button type="button" onClick={onClose} className="mb-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:mb-0 sm:w-auto">Fechar</button>
							<button type="button" onClick={handleStart} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60 sm:w-auto">
								{busy ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
								Iniciar 300 envios
							</button>
						</>
					)}
				</footer>
			</section>
		</div>
	);
}
