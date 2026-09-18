// Financeirinho v2 — bolinha flutuante (canto inferior direito, visível em
// qualquer página do Finan) que abre um chat com IA real restrita aos
// dados do Finan (ver apps/finan/backend/src/financeirinho/). Substitui o
// FinanceirinhoWidget fixo que ficava só na Dashboard (FinanModulePage.jsx).
import { ArrowRight, History, Loader2, Plus, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	enviarMensagemFinanceirinho,
	fetchFinanceirinhoConversa,
	fetchFinanceirinhoConversas,
	fetchFinanInsights,
} from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";

const AVATAR_SRC = "/financeirinho-avatar.png";
const WELCOME_MESSAGE = {
	id: "boas-vindas",
	papel: "assistente",
	conteudo: "Oi! Sou o Victorinho 👋 Posso te ajudar com pendências, contas a pagar/receber, notas fiscais, fornecedores e indicadores do Finan. Pergunta o que quiser!",
};

// "Cita a fonte" (pedido do usuário): cada ferramenta que o Financeirinho
// usa pra responder vira um link discreto de volta pra tela real —
// mesmo nome/rota que o menu já usa, nunca inventamos rota nova aqui.
const TOOL_META = {
	consultarPendencias: { label: "Central de Pendências", path: FINAN_ROUTES.PENDENCIAS },
	consultarContasAPagar: { label: "Contas a Pagar", path: FINAN_ROUTES.CONTAS_PAGAR },
	consultarContasAReceber: { label: "Contas a Receber", path: FINAN_ROUTES.CONTAS_RECEBER },
	buscarFornecedor: { label: "Fornecedores", path: FINAN_ROUTES.FORNECEDORES },
	consultarNotasFiscais: { label: "Notas", path: FINAN_ROUTES.NOTAS },
	consultarIndicadores: { label: "Central de Indicadores", path: FINAN_ROUTES.INDICADORES },
};

// "Sugere ação" (pedido do usuário): quando a resposta veio de uma tool
// que normalmente pede uma próxima ação do usuário, essa ação vira um
// botão de destaque (não só um link discreto de fonte).
const CTA_TOOLS = {
	consultarPendencias: { label: "Ver Pendências", path: FINAN_ROUTES.PENDENCIAS },
};

// Badge "tem novidade" (pedido do usuário: "só aparecer se realmente tiver
// mensagem"). fetchFinanInsights() sempre retorna a lista inteira de
// achados atuais — sem isso, o badge mostraria o total pra sempre, mesmo
// que o usuário já tivesse aberto o chat e visto tudo. Guardamos os `id`
// (estáveis por tipo de insight, ver insights/routes.js) já vistos no
// localStorage; o badge só conta os que ainda não estão nessa lista.
const INSIGHTS_VISTOS_KEY = "finan.financeirinho.insightsVistos";

function lerInsightsVistos() {
	try {
		const raw = window.localStorage.getItem(INSIGHTS_VISTOS_KEY);
		return new Set(raw ? JSON.parse(raw) : []);
	} catch {
		return new Set();
	}
}

function salvarInsightsVistos(ids) {
	try {
		window.localStorage.setItem(INSIGHTS_VISTOS_KEY, JSON.stringify(ids));
	} catch {
		// localStorage pode estar indisponível (modo privado) — badge some
		// nesta sessão mesmo assim, só não persiste entre visitas.
	}
}

function formatConversaData(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function FinanceirinhoLauncher() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [insights, setInsights] = useState([]);
	const [mensagens, setMensagens] = useState([WELCOME_MESSAGE]);
	const [conversaId, setConversaId] = useState(null);
	const [pergunta, setPergunta] = useState("");
	const [sending, setSending] = useState(false);
	const [historicoAberto, setHistoricoAberto] = useState(false);
	const [conversas, setConversas] = useState([]);
	const [carregandoHistorico, setCarregandoHistorico] = useState(false);
	const listRef = useRef(null);

	useEffect(() => {
		fetchFinanInsights()
			.then(setInsights)
			.catch(() => setInsights([]));
	}, []);

	const insightsVistos = lerInsightsVistos();
	const insightsNaoVistos = insights.filter((item) => !insightsVistos.has(item.id));

	const handleToggleOpen = () => {
		setOpen((current) => {
			const next = !current;
			if (next && insights.length) {
				// Abrir o chat marca os achados atuais como vistos — badge some
				// e só volta se surgir um insight novo (id diferente) depois.
				salvarInsightsVistos(insights.map((item) => item.id));
			}
			return next;
		});
	};

	useEffect(() => {
		if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [mensagens, open, historicoAberto]);

	const handleSend = async (event) => {
		event.preventDefault();
		const texto = pergunta.trim();
		if (!texto || sending) return;
		setPergunta("");
		setSending(true);
		setMensagens((current) => [...current, { id: `local-${Date.now()}`, papel: "usuario", conteudo: texto }]);
		try {
			const data = await enviarMensagemFinanceirinho(texto, conversaId);
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
		fetchFinanceirinhoConversas()
			.then(setConversas)
			.catch(() => setConversas([]))
			.finally(() => setCarregandoHistorico(false));
	};

	const handleAbrirConversa = async (id) => {
		setCarregandoHistorico(true);
		try {
			const historico = await fetchFinanceirinhoConversa(id);
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

	return (
		<div className="fixed bottom-5 right-5 z-layout-dropdown flex flex-col items-end gap-3">
			{open ? (
				<div className="flex h-[min(70vh,520px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
					<div className="flex items-center justify-between gap-2 bg-[linear-gradient(135deg,#061b38_0%,#0b3a6b_100%)] px-4 py-3">
						<div className="flex min-w-0 items-center gap-2.5">
							<img src={AVATAR_SRC} alt="Victorinho" className="h-9 w-9 shrink-0 rounded-full border-2 border-orange-400 object-cover" />
							<div className="min-w-0">
								<p className="truncate text-sm font-black text-white">Victorinho</p>
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
								aria-label="Fechar chat do Victorinho"
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
								const ctaTool = ferramentas.find((nome) => CTA_TOOLS[nome]);
								const cta = ctaTool ? CTA_TOOLS[ctaTool] : null;
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
											{cta ? (
												<button
													type="button"
													onClick={() => handleIrPara(cta.path)}
													className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-[11px] font-black text-white hover:bg-orange-600"
												>
													{cta.label} <ArrowRight size={12} />
												</button>
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
							placeholder="Pergunte ao Victorinho..."
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
				onClick={handleToggleOpen}
				className="relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-blue-500 bg-white shadow-2xl transition hover:scale-105"
				title="Victorinho — assistente do Finan"
				aria-label={open ? "Fechar o Victorinho" : "Abrir o Victorinho"}
				aria-expanded={open}
			>
				<img src={AVATAR_SRC} alt="" className="h-full w-full rounded-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
				{!open && insightsNaoVistos.length > 0 ? (
					<span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-orange-500 px-1 text-[11px] font-black text-white">
						{insightsNaoVistos.length > 9 ? "9+" : insightsNaoVistos.length}
					</span>
				) : null}
				{open ? (
					<span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/40">
						<X size={22} className="text-white" />
					</span>
				) : null}
			</button>
		</div>
	);
}
