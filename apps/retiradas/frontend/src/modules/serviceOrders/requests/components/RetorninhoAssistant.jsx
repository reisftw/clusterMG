import {
	CheckCircle2,
	ExternalLink,
	LoaderCircle,
	MessageCircle,
	RotateCcw,
	Send,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasAnyPermission } from "../../../../constants/roles";
import { useAuthContext } from "../../../../context/AuthContext";
import {
	buscarSolicitacaoOrdemServico,
	buscarTecnicosSolicitacao,
	criarSolicitacaoOrdemServico,
} from "../services/serviceOrderRequestsService";

const IMAGE_URL = "/retorninho-solicitacoes-20261022.png";
const POSITION_KEY = "retiradas-retorninho-assistant-position-v1";
const PRIVILEGED_ROLES = new Set(["admin", "backoffice", "backoffice_retirada"]);

function greeting() {
	const hour = Number(
		new Intl.DateTimeFormat("pt-BR", {
			timeZone: "America/Sao_Paulo",
			hour: "2-digit",
			hour12: false,
		}).format(new Date()),
	);
	if (hour >= 5 && hour < 12) return "bom dia";
	if (hour >= 12 && hour < 18) return "boa tarde";
	return "boa noite";
}

function initialMessages() {
	return [
		{
			id: `greeting-${Date.now()}`,
			from: "bot",
			text: `Opa, ${greeting()}! Qual ordem você deseja? Digite o código do cliente. Ex.: 50000.`,
		},
	];
}

function clampPosition(position) {
	const size = 76;
	const margin = 12;
	return {
		x: Math.min(
			Math.max(margin, Number(position?.x) || window.innerWidth - size - 20),
			Math.max(margin, window.innerWidth - size - margin),
		),
		y: Math.min(
			Math.max(margin, Number(position?.y) || window.innerHeight - size - 110),
			Math.max(margin, window.innerHeight - size - margin),
		),
	};
}

function savedPosition() {
	try {
		return clampPosition(JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null"));
	} catch {
		return clampPosition(null);
	}
}

function appendMessage(setMessages, from, text) {
	setMessages((current) => [
		...current,
		{ id: `${from}-${Date.now()}-${Math.random()}`, from, text },
	]);
}

function ProgressMessage({ item }) {
	const completed = item?.status === "COMPLETED";
	const failed = item?.status === "FAILED";
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
			<div className="flex items-center gap-2">
				{completed ? (
					<CheckCircle2 className="text-emerald-600" size={18} />
				) : failed ? null : (
					<LoaderCircle className="animate-spin text-blue-600" size={18} />
				)}
				<strong className={failed ? "text-red-700" : "text-slate-900"}>
					{failed ? "Não foi possível concluir" : item?.stage || "Solicitação recebida"}
				</strong>
			</div>
			<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
				<div
					className={`h-full rounded-full transition-all ${failed ? "bg-red-500" : completed ? "bg-emerald-500" : "bg-blue-600"}`}
					style={{ width: `${Math.max(4, Number(item?.progress || 0))}%` }}
				/>
			</div>
			{completed ? (
				<div className="mt-2 text-sm font-semibold text-emerald-800">
					<p>{item.resultMessage}</p>
					{item.hubsoftUrl ? (
						<a className="mt-2 inline-flex items-center gap-1 font-black text-blue-700" href={item.hubsoftUrl} target="_blank" rel="noreferrer">
							Abrir O.S <ExternalLink size={14} />
						</a>
					) : null}
				</div>
			) : null}
			{failed ? <p className="mt-2 text-sm font-semibold text-red-700">{item.errorMessage}</p> : null}
		</div>
	);
}

export default function RetorninhoAssistant() {
	const { currentUser } = useAuthContext();
	const canUse = hasAnyPermission(currentUser, ["service_orders.requests.create"]);
	const privileged = PRIVILEGED_ROLES.has(
		String(currentUser?.role || "").trim().toLowerCase(),
	);
	const [open, setOpen] = useState(false);
	const [position, setPosition] = useState(savedPosition);
	const [messages, setMessages] = useState(initialMessages);
	const [step, setStep] = useState("code");
	const [code, setCode] = useState("");
	const [pendingCode, setPendingCode] = useState("");
	const [technicians, setTechnicians] = useState([]);
	const [selectedTechnician, setSelectedTechnician] = useState("");
	const [activeRequest, setActiveRequest] = useState(null);
	const [busy, setBusy] = useState(false);
	const [loadError, setLoadError] = useState("");
	const dragRef = useRef(null);
	const messagesRef = useRef(null);
	const mountedRef = useRef(true);

	useEffect(() => () => {
		mountedRef.current = false;
	}, []);

	useEffect(() => {
		const handleResize = () => setPosition((current) => clampPosition(current));
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	useEffect(() => {
		try {
			window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
		} catch {
			// O assistente continua funcionando quando o armazenamento local estiver indisponível.
		}
	}, [position]);

	useEffect(() => {
		messagesRef.current?.scrollTo({
			top: messagesRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [activeRequest, messages]);

	useEffect(() => {
		if (!open || !privileged || technicians.length) return undefined;
		let active = true;
		buscarTecnicosSolicitacao()
			.then((response) => {
				if (active) setTechnicians(Array.isArray(response?.items) ? response.items : []);
			})
			.catch((error) => {
				if (active) setLoadError(error?.message || "Não foi possível carregar os técnicos.");
			});
		return () => {
			active = false;
		};
	}, [open, privileged, technicians.length]);

	const panelStyle = useMemo(() => {
		const width = Math.min(400, window.innerWidth - 24);
		const height = Math.min(590, window.innerHeight - 24);
		return {
			left: Math.min(Math.max(12, position.x - width + 76), window.innerWidth - width - 12),
			top: Math.min(Math.max(12, position.y - height + 76), window.innerHeight - height - 12),
			width,
			height,
		};
	}, [position]);

	const pollRequest = useCallback(async (id) => {
		for (let attempt = 0; attempt < 900 && mountedRef.current; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, 1000));
			if (!mountedRef.current) return;
			const response = await buscarSolicitacaoOrdemServico(id);
			if (!response?.item) continue;
			setActiveRequest(response.item);
			if (["COMPLETED", "FAILED"].includes(response.item.status)) {
				setStep("finished");
				setBusy(false);
				return;
			}
		}
		if (mountedRef.current) {
			setBusy(false);
			setStep("finished");
			appendMessage(setMessages, "bot", "A solicitação continua em processamento. Consulte o histórico para acompanhar.");
		}
	}, []);

	const startRequest = useCallback(async (clientCode, technicianName = "") => {
		setBusy(true);
		setLoadError("");
		setStep("processing");
		try {
			const response = await criarSolicitacaoOrdemServico(clientCode, technicianName);
			setActiveRequest(response.item);
			await pollRequest(response.item.id);
		} catch (error) {
			setBusy(false);
			setStep("finished");
			setLoadError(error?.message || "Não foi possível criar a solicitação.");
		}
	}, [pollRequest]);

	function submitCode(event) {
		event.preventDefault();
		const value = code.replace(/\D/g, "");
		if (!value) return;
		appendMessage(setMessages, "user", value);
		setCode("");
		setPendingCode(value);
		if (privileged) {
			setStep("technician");
			appendMessage(setMessages, "bot", "Para qual técnico de retirada devo encaminhar esta O.S?");
			return;
		}
		startRequest(value);
	}

	function submitTechnician() {
		if (!selectedTechnician || !pendingCode) return;
		const selected = technicians.find((item) => item.name === selectedTechnician);
		appendMessage(setMessages, "user", selected?.displayName || selectedTechnician);
		startRequest(pendingCode, selectedTechnician);
	}

	function resetConversation() {
		setMessages(initialMessages());
		setStep("code");
		setCode("");
		setPendingCode("");
		setSelectedTechnician("");
		setActiveRequest(null);
		setBusy(false);
		setLoadError("");
	}

	function pointerDown(event) {
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			origin: position,
			moved: false,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function pointerMove(event) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - drag.startX;
		const deltaY = event.clientY - drag.startY;
		if (Math.hypot(deltaX, deltaY) > 5) drag.moved = true;
		setPosition(clampPosition({ x: drag.origin.x + deltaX, y: drag.origin.y + deltaY }));
	}

	function pointerUp(event) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.currentTarget.releasePointerCapture(event.pointerId);
		dragRef.current = null;
		if (!drag.moved) setOpen(true);
	}

	if (!canUse) return null;

	return (
		<>
			{!open ? (
				<button
					type="button"
					onPointerDown={pointerDown}
					onPointerMove={pointerMove}
					onPointerUp={pointerUp}
					className="fixed z-[75] h-[76px] w-[76px] touch-none overflow-hidden rounded-full border-4 border-white bg-white shadow-[0_14px_38px_rgba(15,23,42,0.32)] ring-2 ring-blue-500 transition hover:scale-105"
					style={{ left: position.x, top: position.y }}
					aria-label="Abrir Retorninho"
					title="Retorninho - Solicitar O.S"
				>
					<img src={IMAGE_URL} alt="Retorninho" className="h-full w-full select-none object-cover object-[55%_42%]" draggable="false" />
					<span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white"><MessageCircle size={13} /></span>
				</button>
			) : (
				<section className="fixed z-[75] flex overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-[0_24px_70px_rgba(15,23,42,0.35)]" style={panelStyle} aria-label="Conversa com Retorninho">
					<div className="flex min-w-0 flex-1 flex-col">
						<header className="flex items-center gap-3 bg-gradient-to-r from-blue-700 to-cyan-500 p-4 text-white">
							<img src={IMAGE_URL} alt="" className="h-12 w-12 rounded-full border-2 border-white/80 object-cover object-[55%_42%]" />
							<div className="min-w-0 flex-1">
								<h2 className="font-black">Retorninho</h2>
								<p className="text-xs font-semibold text-blue-50">Solicitação de O.S</p>
							</div>
							<button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" aria-label="Fechar conversa" title="Fechar"><X size={20} /></button>
						</header>

						<div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
							{messages.map((message) => (
								<div key={message.id} className={`flex ${message.from === "user" ? "justify-end" : "justify-start"}`}>
									<div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm font-semibold leading-relaxed ${message.from === "user" ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm"}`}>
										{message.text}
									</div>
								</div>
							))}
							{activeRequest ? <ProgressMessage item={activeRequest} /> : null}
							{loadError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{loadError}</div> : null}
						</div>

						<footer className="border-t border-slate-200 bg-white p-3">
							{step === "code" ? (
								<form onSubmit={submitCode} className="flex gap-2">
									<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" autoFocus placeholder="Código do cliente" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
									<button type="submit" disabled={!code} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300" aria-label="Enviar código" title="Enviar"><Send size={18} /></button>
								</form>
							) : null}
							{step === "technician" ? (
								<div className="flex gap-2">
									<select value={selectedTechnician} onChange={(event) => setSelectedTechnician(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500">
										<option value="">Selecione o técnico</option>
										{technicians.map((technician) => <option key={technician.id || technician.name} value={technician.name}>{technician.displayName || technician.name}</option>)}
									</select>
									<button type="button" onClick={submitTechnician} disabled={!selectedTechnician || busy} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white disabled:bg-slate-300" aria-label="Confirmar técnico" title="Confirmar"><Send size={18} /></button>
								</div>
							) : null}
							{step === "processing" ? <p className="py-2 text-center text-xs font-black uppercase tracking-wide text-blue-600">Processando solicitação</p> : null}
							{step === "finished" ? (
								<button type="button" onClick={resetConversation} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black text-white hover:bg-slate-800"><RotateCcw size={17} /> Nova solicitação</button>
							) : null}
						</footer>
					</div>
				</section>
			)}
		</>
	);
}
