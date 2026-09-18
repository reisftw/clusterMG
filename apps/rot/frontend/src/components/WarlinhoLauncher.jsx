// Warlinho — bolinha flutuante (canto inferior direito, visível em
// qualquer página da Operação) que abre um chat com IA real restrita aos
// dados da Operação (ver apps/rot/backend/src/warlinho/). Mesmo padrão do
// FinanceirinhoLauncher.jsx do Finan (mesma IA/token, reaproveitados —
// pedido explícito do usuário), sem os "insights proativos" (o Operação
// ainda não tem essa infraestrutura de achados automáticos).
import { History, Loader2, Plus, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enviarMensagemWarlinho, fetchWarlinhoConversa, fetchWarlinhoConversas } from "../api/rotApi";

const AVATAR_SRC = "/warlinho-avatar.png";
const WELCOME_MESSAGE = {
	id: "boas-vindas",
	papel: "assistente",
	conteudo: "Oi! Sou o Warlinho 👋 Posso te ajudar com chamados, plantões, ausências/férias, feriados, agenda e ranking da Operação. Pergunta o que quiser!",
};
const POSITION_KEY = "rot-warlinho-position";
const DEFAULT_POSITION = { right: 20, bottom: 20 };
const BUTTON_SIZE = 64;

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), Math.max(min, max));
}

function readPosition() {
	try {
		const parsed = JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null");
		if (Number.isFinite(parsed?.right) && Number.isFinite(parsed?.bottom)) return parsed;
	} catch {
		// LocalStorage indisponivel ou dado corrompido: usa padrao.
	}
	return DEFAULT_POSITION;
}

function fitPosition(position = DEFAULT_POSITION) {
	if (typeof window === "undefined") return position;
	return {
		right: clamp(Number(position.right ?? DEFAULT_POSITION.right), 12, window.innerWidth - BUTTON_SIZE - 12),
		bottom: clamp(Number(position.bottom ?? DEFAULT_POSITION.bottom), 12, window.innerHeight - BUTTON_SIZE - 12),
	};
}

// "Cita a fonte": cada ferramenta que o Warlinho usa pra responder vira
// um link discreto de volta pra tela real — mesma rota que o menu já
// usa, nunca inventamos rota nova aqui.
const TOOL_META = {
	consultarChamados: { label: "Chamados", path: "/chamados" },
	consultarPlantoes: { label: "Escala", path: "/turnos" },
	consultarAusencias: { label: "Ausências", path: "/ausencias" },
	consultarFeriados: { label: "Feriados", path: "/feriados" },
	consultarAgenda: { label: "Agenda", path: "/atividades" },
	consultarRanking: { label: "Ranking", path: "/ranking" },
};

function formatConversaData(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function WarlinhoLauncher() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [mensagens, setMensagens] = useState([WELCOME_MESSAGE]);
	const [conversaId, setConversaId] = useState(null);
	const [pergunta, setPergunta] = useState("");
	const [sending, setSending] = useState(false);
	const [historicoAberto, setHistoricoAberto] = useState(false);
	const [conversas, setConversas] = useState([]);
	const [carregandoHistorico, setCarregandoHistorico] = useState(false);
	const [position, setPosition] = useState(() => fitPosition(readPosition()));
	const [dragging, setDragging] = useState(false);
	const listRef = useRef(null);
	const dragRef = useRef(null);
	const suppressClickRef = useRef(false);

	useEffect(() => {
		if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [mensagens, open, historicoAberto]);

	useEffect(() => {
		const onResize = () => {
			setPosition((current) => {
				const fitted = fitPosition(current);
				window.localStorage.setItem(POSITION_KEY, JSON.stringify(fitted));
				return fitted;
			});
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	useEffect(() => {
		const cancelDrag = () => {
			if (!dragRef.current) return;
			dragRef.current = null;
			setDragging(false);
		};
		window.addEventListener("pointerup", cancelDrag);
		window.addEventListener("pointercancel", cancelDrag);
		window.addEventListener("blur", cancelDrag);
		document.addEventListener("visibilitychange", cancelDrag);
		return () => {
			window.removeEventListener("pointerup", cancelDrag);
			window.removeEventListener("pointercancel", cancelDrag);
			window.removeEventListener("blur", cancelDrag);
			document.removeEventListener("visibilitychange", cancelDrag);
		};
	}, []);

	const beginDrag = (event) => {
		if (event.button !== undefined && event.button !== 0) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		dragRef.current = {
			x: event.clientX,
			y: event.clientY,
			position,
			moved: false,
		};
		setDragging(true);
	};

	const moveDrag = (event) => {
		const drag = dragRef.current;
		if (!drag) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
		const next = fitPosition({
			right: drag.position.right - dx,
			bottom: drag.position.bottom - dy,
		});
		drag.latest = next;
		setPosition(next);
	};

	const endDrag = (event) => {
		const drag = dragRef.current;
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		dragRef.current = null;
		setDragging(false);
		if (drag?.moved) suppressClickRef.current = true;
		window.localStorage.setItem(POSITION_KEY, JSON.stringify(fitPosition(drag?.latest || position)));
		if (drag?.moved) event.preventDefault();
	};

	const handleSend = async (event) => {
		event.preventDefault();
		const texto = pergunta.trim();
		if (!texto || sending) return;
		setPergunta("");
		setSending(true);
		setMensagens((current) => [...current, { id: `local-${Date.now()}`, papel: "usuario", conteudo: texto }]);
		try {
			const data = await enviarMensagemWarlinho(texto, conversaId);
			setConversaId(data.conversaId);
			setMensagens((current) => [
				...current,
				{ id: `resp-${Date.now()}`, papel: "assistente", conteudo: data.resposta, ferramentasUsadas: data.ferramentasUsadas || [] },
			]);
		} catch (err) {
			setMensagens((current) => [
				...current,
				{ id: `erro-${Date.now()}`, papel: "assistente", conteudo: err?.message || "Não consegui responder agora. Tenta de novo em instantes." },
			]);
		} finally {
			setSending(false);
		}
	};

	const handleIrPara = (path) => {
		navigate(path);
		setOpen(false);
	};

	const handleAbrirHistorico = () => {
		setHistoricoAberto(true);
		setCarregandoHistorico(true);
		fetchWarlinhoConversas()
			.then(setConversas)
			.catch(() => setConversas([]))
			.finally(() => setCarregandoHistorico(false));
	};

	const handleAbrirConversa = async (id) => {
		setCarregandoHistorico(true);
		try {
			const historico = await fetchWarlinhoConversa(id);
			setMensagens(historico.length ? historico : [WELCOME_MESSAGE]);
			setConversaId(id);
			setHistoricoAberto(false);
		} catch {
			// melhor esforco: se falhar, so nao troca de conversa
		} finally {
			setCarregandoHistorico(false);
		}
	};

	const handleNovaConversa = () => {
		setMensagens([WELCOME_MESSAGE]);
		setConversaId(null);
		setHistoricoAberto(false);
	};

	const panelRight = typeof window === "undefined" ? position.right : clamp(position.right, 12, window.innerWidth - 360 - 12);
	const panelBottom = typeof window === "undefined" ? position.bottom + BUTTON_SIZE + 12 : clamp(position.bottom + BUTTON_SIZE + 12, 12, window.innerHeight - Math.min(window.innerHeight * 0.7, 520) - 12);
	return (
		<>
			{open ? (
				<div
					className="fixed z-layout-dropdown flex h-[min(70vh,520px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
					style={{ right: panelRight, bottom: panelBottom }}
				>
					<div className="flex items-center justify-between gap-2 bg-[linear-gradient(135deg,#061b38_0%,#0b3a6b_100%)] px-4 py-3">
						<div className="flex min-w-0 items-center gap-2.5">
							<img src={AVATAR_SRC} alt="Warlinho" className="h-9 w-9 shrink-0 rounded-full border-2 border-orange-400 object-cover" />
							<div className="min-w-0">
								<p className="truncate text-sm font-black text-white">Warlinho</p>
								<p className="flex items-center gap-1 text-[11px] font-bold text-emerald-300">
									<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
									Online
								</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onClick={handleNovaConversa}
								className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
								title="Nova conversa"
								aria-label="Nova conversa"
							>
								<Plus size={17} />
							</button>
							<button
								type="button"
								onClick={handleAbrirHistorico}
								className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
								title="Conversas anteriores"
								aria-label="Conversas anteriores"
							>
								<History size={16} />
							</button>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
								aria-label="Fechar chat do Warlinho"
							>
								<X size={18} />
							</button>
						</div>
					</div>

					{historicoAberto ? (
						<div className="flex-1 overflow-y-auto bg-slate-50 p-3">
							<p className="mb-2 px-1 text-[11px] font-black uppercase tracking-wide text-slate-400">Conversas anteriores</p>
							{carregandoHistorico ? (
								<div className="flex items-center gap-2 px-1 py-4 text-xs font-bold text-slate-400">
									<Loader2 size={13} className="animate-spin" /> Carregando...
								</div>
							) : conversas.length ? (
								<div className="space-y-1.5">
									{conversas.map((conversa) => (
										<button
											key={conversa.id}
											type="button"
											onClick={() => handleAbrirConversa(conversa.id)}
											className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-blue-300 hover:bg-blue-50/50"
										>
											<p className="truncate text-xs font-black text-slate-900">{conversa.titulo}</p>
											<p className="text-[10px] font-semibold text-slate-400">{formatConversaData(conversa.updatedAt)}</p>
										</button>
									))}
								</div>
							) : (
								<p className="px-1 text-xs font-semibold text-slate-400">Nenhuma conversa anterior ainda.</p>
							)}
							<button
								type="button"
								onClick={() => setHistoricoAberto(false)}
								className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
							>
								Voltar pra conversa
							</button>
						</div>
					) : (
						<div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
							{mensagens.map((item) => {
								const ferramentas = item.ferramentasUsadas || [];
								const fontes = ferramentas.map((nome) => TOOL_META[nome]).filter(Boolean);
								return (
									<div key={item.id} className={`flex ${item.papel === "usuario" ? "justify-end" : "justify-start"}`}>
										<div className="max-w-[85%]">
											<div
												className={`rounded-2xl px-3.5 py-2.5 text-sm font-semibold leading-relaxed ${
													item.papel === "usuario"
														? "bg-blue-600 text-white"
														: "border border-slate-200 bg-white text-slate-800"
												}`}
											>
												{item.conteudo}
											</div>
											{fontes.length ? (
												<div className="mt-1.5 flex flex-wrap gap-1.5">
													{fontes.map((fonte) => (
														<button
															key={fonte.path}
															type="button"
															onClick={() => handleIrPara(fonte.path)}
															className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-bold text-slate-500 hover:border-blue-300 hover:text-blue-700"
														>
															{fonte.label}
														</button>
													))}
												</div>
											) : null}
										</div>
									</div>
								);
							})}
							{sending ? (
								<div className="flex justify-start">
									<div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-500">
										<Loader2 size={13} className="animate-spin" /> Pensando...
									</div>
								</div>
							) : null}
						</div>
					)}

					<form onSubmit={handleSend} className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
						<input
							value={pergunta}
							onChange={(event) => setPergunta(event.target.value)}
							placeholder="Pergunte ao Warlinho..."
							disabled={sending}
							className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:bg-white disabled:opacity-60"
						/>
						<button
							type="submit"
							disabled={sending || !pergunta.trim()}
							className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50"
							aria-label="Enviar pergunta"
						>
							{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
						</button>
					</form>
				</div>
			) : null}

			<button
				type="button"
				onPointerDown={beginDrag}
				onPointerMove={moveDrag}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onClick={(event) => {
					if (suppressClickRef.current) {
						suppressClickRef.current = false;
						event.preventDefault();
						return;
					}
					setOpen((current) => !current);
				}}
				className="fixed z-layout-dropdown flex h-16 w-16 touch-none select-none items-center justify-center rounded-full border-[3px] border-orange-400 bg-[#061a3a] shadow-2xl transition hover:scale-105"
				style={{ right: position.right, bottom: position.bottom, cursor: dragging ? "grabbing" : "grab" }}
				title="Warlinho — assistente da Operação"
				aria-label={open ? "Fechar o Warlinho" : "Abrir o Warlinho"}
				aria-expanded={open}
			>
				<img src={AVATAR_SRC} alt="" className="h-full w-full rounded-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
				{open ? (
					<span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/40">
						<X size={22} className="text-white" />
					</span>
				) : null}
			</button>
		</>
	);
}
