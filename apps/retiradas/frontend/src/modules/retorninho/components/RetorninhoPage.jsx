import {
	Activity,
	AlertTriangle,
	Bot,
	BookOpen,
	BrainCircuit,
	ChevronLeft,
	ChevronRight,
	CheckCircle2,
	ClipboardList,
	History,
	Gauge,
	ListRestart,
	Loader2,
	MessageSquare,
	PhoneCall,
	Plus,
	RefreshCw,
	Save,
	Search,
	Settings,
	ShieldCheck,
	SlidersHorizontal,
	Unplug,
	UserCheck,
	Wifi,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hasAnyPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { retorninhoApi } from "../services/retorninhoService";

const TABS = [
	["overview", "Visão geral", Activity],
	["whatsapp", "WhatsApp", PhoneCall],
	["ai", "Inteligência artificial", BrainCircuit],
	["knowledge", "Base de conhecimento", BookOpen],
	["features", "Funcionalidades", SlidersHorizontal],
	["users", "Técnicos autorizados", UserCheck],
	["conversations", "Conversas", MessageSquare],
	["orders", "O.S. e atribuições", ClipboardList],
	["protocols", "Protocolos e histórico", History],
	["technical", "Logs técnicos", Activity],
	["operational", "Tentativas operacionais", ListRestart],
	["audit", "Auditoria", ShieldCheck],
	["settings", "Configurações", Settings],
];

const TOOLS = [
	["consultar_os", "Consultar O.S."],
	["buscar_oportunidades", "Buscar oportunidades"],
	["solicitar_os", "Solicitar O.S."],
	["consultar_protocolo", "Consultar protocolo"],
	["consultar_produtividade", "Consultar produtividade"],
	["consultar_equipamento", "Consultar equipamento"],
	["consultar_conhecimento", "Consultar conhecimento"],
];

const FEATURE_OPTIONS = [
	["serviceOrderLookup", "Consulta de ordens"],
	["mapsSearch", "Busca no Maps"],
	["selfAssignment", "Autoatribuição"],
	["transfer", "Transferência entre técnicos"],
	["protocols", "Protocolos"],
	["productivity", "Produtividade"],
	["equipment", "Consulta de equipamento"],
	["knowledge", "Base de conhecimento"],
];

const EMPTY_PAGE = { items: [], pagination: { page: 1, pages: 1, total: 0, limit: 25 } };
const BUTTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = `${BUTTON} bg-blue-600 text-white hover:bg-blue-700`;
const SECONDARY = `${BUTTON} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const INPUT = "min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function StatusBadge({ value }) {
	const status = String(value || "-").toUpperCase();
	const tone = ["ACTIVE", "SUCCESS", "COMPLETED", "CONNECTED", "PUBLISHED"].includes(status)
		? "bg-emerald-50 text-emerald-700"
		: ["FAILED", "DEAD_LETTER", "BLOCKED", "REVOKED"].includes(status)
			? "bg-red-50 text-red-700"
			: "bg-amber-50 text-amber-700";
	return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ${tone}`}>{status}</span>;
}

function Feedback({ value, onClose }) {
	if (!value) return null;
	return (
		<div className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm font-semibold ${value.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
			<span>{value.text}</span>
			<button type="button" onClick={onClose} aria-label="Fechar aviso"><X size={17} /></button>
		</div>
	);
}

function MetricCard({ label, value, detail, icon: Icon }) {
	return (
		<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center justify-between gap-3 text-slate-500"><span className="text-xs font-black uppercase">{label}</span><Icon size={19} /></div>
			<p className="mt-2 text-2xl font-black text-slate-950">{value ?? 0}</p>
			<p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
		</div>
	);
}

function Pager({ pagination, onPage }) {
	return (
		<div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
			<span>{pagination.total || 0} registro(s)</span>
			<div className="flex items-center gap-2">
				<button type="button" className={SECONDARY} disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} aria-label="Página anterior"><ChevronLeft size={17} /></button>
				<strong>{pagination.page || 1} / {pagination.pages || 1}</strong>
				<button type="button" className={SECONDARY} disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)} aria-label="Próxima página"><ChevronRight size={17} /></button>
			</div>
		</div>
	);
}

function Section({ title, actions, children }) {
	return (
		<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-lg font-black text-slate-950">{title}</h2>
				{actions}
			</div>
			{children}
		</section>
	);
}

function Modal({ title, children, onClose }) {
	return (
		<div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
			<div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">
				<div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-black text-slate-950">{title}</h2><button type="button" className={SECONDARY} onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
				{children}
			</div>
		</div>
	);
}

function Table({ headers, children, empty = false }) {
	return (
		<div className="overflow-x-auto">
			<table className="min-w-full text-left text-sm">
				<thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">{headers.map((item) => <th key={item} className="px-3 py-3 font-black">{item}</th>)}</tr></thead>
				<tbody className="divide-y divide-slate-100">{empty ? <tr><td colSpan={headers.length} className="px-3 py-10 text-center font-semibold text-slate-500">Nenhum registro encontrado.</td></tr> : children}</tbody>
			</table>
		</div>
	);
}

function ConfigFields({ form, setForm, group }) {
	const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
	if (group === "whatsapp") return (
		<div className="grid gap-4 sm:grid-cols-2">
			<label className="space-y-1 text-sm font-bold text-slate-700">Provedor<select className={INPUT} value={form.provider || "evolution"} onChange={(event) => set("provider", event.target.value)}><option value="evolution">Evolution API</option><option value="meta">Meta Cloud API</option></select></label>
			<label className="space-y-1 text-sm font-bold text-slate-700">Instância<input className={`${INPUT} bg-slate-50`} value={form.instanceName || "retorninho-ia"} readOnly /></label>
			{form.provider === "meta" ? <label className="space-y-1 text-sm font-bold text-slate-700 sm:col-span-2">Phone Number ID exclusivo do Retorninho<input className={INPUT} value={form.metaPhoneNumberId || ""} onChange={(event) => set("metaPhoneNumberId", event.target.value.replace(/\D/g, ""))} placeholder="ID do número configurado na Meta" /></label> : <div className={`sm:col-span-2 rounded-md border p-4 ${form.evolutionApiKeyConfigured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><p className="font-black">{form.evolutionApiKeyConfigured ? "Evolution configurada" : "Evolution ainda não configurada"}</p><p className="mt-1 text-sm font-semibold">{form.evolutionApiKeyConfigured ? "A chave protegida da Mensageria será usada nesta instância. Clique em Conectar instância e leia o QR Code." : "Cadastre a Evolution uma vez na Mensageria para liberar a leitura do QR Code."}</p></div>}
		</div>
	);
	if (group === "ai") return (
		<div className="grid gap-4 sm:grid-cols-2">
			<label className="space-y-1 text-sm font-bold text-slate-700">Modelo<input className={INPUT} value={form.aiModel || "gemini-flash-latest"} onChange={(event) => set("aiModel", event.target.value)} /></label>
			<label className="space-y-1 text-sm font-bold text-slate-700">Nova chave Gemini<input className={INPUT} type="password" value={form.aiApiKey || ""} onChange={(event) => set("aiApiKey", event.target.value)} placeholder={form.aiApiKeyConfigured ? "Chave protegida configurada" : "Informe a chave"} autoComplete="new-password" /></label>
			<label className="space-y-1 text-sm font-bold text-slate-700">Temperatura<input className={INPUT} type="number" min="0" max="1" step="0.1" value={form.temperature ?? 0.2} onChange={(event) => set("temperature", Number(event.target.value))} /></label>
			<label className="space-y-1 text-sm font-bold text-slate-700">Limite de tokens<input className={INPUT} type="number" min="128" max="8192" value={form.maxTokens ?? 1024} onChange={(event) => set("maxTokens", Number(event.target.value))} /></label>
			<label className="space-y-1 text-sm font-bold text-slate-700 sm:col-span-2">Prompt do sistema<textarea className={`${INPUT} min-h-40 py-3`} value={form.systemPrompt || ""} onChange={(event) => set("systemPrompt", event.target.value)} /></label>
		</div>
	);
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{[["timeoutMs", "Timeout (ms)", 1000], ["maxToolsPerMessage", "Ferramentas por mensagem", 1], ["historyMessages", "Mensagens no contexto", 0], ["sessionMinutes", "Sessão (minutos)", 5], ["rateLimitPerMinute", "Mensagens por minuto", 1], ["dailyMessageLimit", "Limite diário", 1], ["transferAcceptanceMinutes", "Aceite de transferência (min)", 5], ["retentionDays", "Retenção (dias)", 30]].map(([key, label, min]) => <label key={key} className="space-y-1 text-sm font-bold text-slate-700">{label}<input className={INPUT} type="number" min={min} value={form[key] ?? ""} onChange={(event) => set(key, Number(event.target.value))} /></label>)}
			<label className="space-y-1 text-sm font-bold text-slate-700">Política de transferência<select className={INPUT} value={form.transferPolicy || "DENY"} onChange={(event) => set("transferPolicy", event.target.value)}><option value="DENY">Bloquear</option><option value="TECHNICIAN_ACCEPTANCE">Aceite do técnico</option><option value="AUTO">Automática</option></select></label>
		</div>
	);
}

export default function RetorninhoPage() {
	const { currentUser } = useAuthContext();
	const canManage = hasAnyPermission(currentUser, ["retorninho.manage"]);
	const canAudit = hasAnyPermission(currentUser, ["retorninho.audit"]);
	const canReprocess = hasAnyPermission(currentUser, ["retorninho.reprocess"]);
	const [tab, setTab] = useState("overview");
	const [dashboard, setDashboard] = useState(null);
	const [config, setConfig] = useState(null);
	const [pageData, setPageData] = useState(EMPTY_PAGE);
	const [queueData, setQueueData] = useState(EMPTY_PAGE);
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");
	const [querySearch, setQuerySearch] = useState("");
	const [status, setStatus] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState(null);
	const [modal, setModal] = useState(null);
	const [selectedConversation, setSelectedConversation] = useState(null);
	const [messages, setMessages] = useState(EMPTY_PAGE);
	const [connection, setConnection] = useState(null);
	const [instance, setInstance] = useState(null);

	const visibleTabs = useMemo(() => TABS.filter(([key]) => canAudit || !["technical", "operational", "audit"].includes(key)), [canAudit]);
	const metrics = dashboard?.metrics || {};

	const loadBase = useCallback(async () => {
		setLoading(true);
		try {
			const [nextDashboard, nextConfig] = await Promise.all([retorninhoApi.dashboard({ hours: 24 }), retorninhoApi.config()]);
			setDashboard(nextDashboard);
			setInstance(nextDashboard?.instance || null);
			setConfig((current) => current && current.id === nextConfig.id ? current : nextConfig);
		} catch (error) {
			setFeedback({ type: "error", text: error.message || "Não foi possível carregar o Retorninho IA." });
		} finally { setLoading(false); }
	}, []);

	const loadInstance = useCallback(async () => {
		try {
			const nextInstance = await retorninhoApi.instance();
			setInstance(nextInstance);
			return nextInstance;
		} catch {
			return null;
		}
	}, []);

	const loadTab = useCallback(async () => {
		if (["overview", "whatsapp", "ai", "features", "settings"].includes(tab)) return;
		setLoading(true);
		try {
			const params = { page, limit: 25, search: querySearch, status };
			let result = EMPTY_PAGE;
			if (tab === "users") result = await retorninhoApi.users(params);
			if (tab === "knowledge") result = await retorninhoApi.knowledge(params);
			if (tab === "conversations") result = await retorninhoApi.conversations(params);
			if (tab === "orders") result = await retorninhoApi.protocols({ ...params, type: "SELF_ASSIGNMENT" });
			if (tab === "protocols") result = await retorninhoApi.protocols(params);
			if (tab === "technical") {
				const [events, queue] = await Promise.all([
					retorninhoApi.events("TECHNICAL", params),
					retorninhoApi.queue(params),
				]);
				result = events;
				setQueueData(queue);
			}
			if (tab === "operational") result = await retorninhoApi.events("OPERATIONAL", params);
			if (tab === "audit") result = await retorninhoApi.events("AUDIT", params);
			setPageData(result || EMPTY_PAGE);
		} catch (error) {
			setFeedback({ type: "error", text: error.message || "Não foi possível carregar os registros." });
		} finally { setLoading(false); }
	}, [page, querySearch, status, tab]);

	useEffect(() => { loadBase(); }, [loadBase]);
	useEffect(() => { setPage(1); setSearch(""); setQuerySearch(""); setStatus(""); setPageData(EMPTY_PAGE); setQueueData(EMPTY_PAGE); setSelectedConversation(null); }, [tab]);
	useEffect(() => {
		const timer = globalThis.setTimeout(() => { setPage(1); setQuerySearch(search); }, 350);
		return () => globalThis.clearTimeout(timer);
	}, [search]);
	useEffect(() => { loadTab(); }, [loadTab]);
	useEffect(() => {
		if (tab === "whatsapp") loadInstance();
	}, [loadInstance, tab]);
	useEffect(() => {
		if (tab !== "whatsapp" || !connection || instance?.connected) return undefined;
		let cancelled = false;
		let attempts = 0;
		let timer;
		const poll = async () => {
			attempts += 1;
			const nextInstance = await loadInstance();
			if (cancelled) return;
			if (nextInstance?.connected) {
				setConnection(null);
				setFeedback({ type: "success", text: "WhatsApp conectado com sucesso." });
				return;
			}
			if (attempts < 40) timer = globalThis.setTimeout(poll, 3000);
		};
		timer = globalThis.setTimeout(poll, 3000);
		return () => {
			cancelled = true;
			globalThis.clearTimeout(timer);
		};
	}, [connection, instance?.connected, loadInstance, tab]);

	async function run(action, success, { reloadTab = true, reloadBase = false } = {}) {
		setSaving(true);
		setFeedback(null);
		try {
			await action();
			setFeedback({ type: "success", text: success });
			setModal(null);
			if (reloadBase) await loadBase();
			if (reloadTab) await loadTab();
		} catch (error) {
			setFeedback({ type: "error", text: error.message || "A operação não foi concluída." });
		} finally { setSaving(false); }
	}

	async function saveConfig() {
		await run(async () => setConfig(await retorninhoApi.saveConfig(config)), "Configuração salva.", { reloadTab: false, reloadBase: true });
	}

	async function connectWhatsapp() {
		setSaving(true);
		setFeedback(null);
		try {
			const result = await retorninhoApi.connect();
			setConnection(result);
			setFeedback({ type: "success", text: "Solicitação de conexão enviada." });
			await loadInstance();
			await loadBase();
		} catch (error) {
			setFeedback({ type: "error", text: error.message || "Não foi possível conectar a instância." });
		} finally { setSaving(false); }
	}

	async function openConversation(item) {
		setSelectedConversation(item);
		try { setMessages(await retorninhoApi.messages(item.id, { page: 1, limit: 50 })); }
		catch (error) { setFeedback({ type: "error", text: error.message }); }
	}

	async function downloadEvents(category) {
		try {
			const result = await retorninhoApi.exportEvents(category, { limit: 1000 });
			const url = URL.createObjectURL(new Blob([JSON.stringify(result.items || [], null, 2)], { type: "application/json" }));
			const link = document.createElement("a");
			link.href = url;
			link.download = `retorninho-${category.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) { setFeedback({ type: "error", text: error.message || "Não foi possível exportar os eventos." }); }
	}

	if (loading && !dashboard) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

	return (
		<div className="space-y-5">
		<header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-lg bg-blue-600 text-white"><Bot size={27} /></div><div><h1 className="text-2xl font-black text-slate-950">Retorninho IA</h1><p className="text-sm font-semibold text-slate-500">Central de autoatendimento operacional</p></div></div>
				<div className="flex flex-wrap items-center gap-2"><StatusBadge value={config?.enabled ? "ACTIVE" : "PAUSED"} /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{config?.instanceName || "retorninho-ia"}</span><button type="button" className={SECONDARY} onClick={() => { loadBase(); loadTab(); }}><RefreshCw size={17} />Atualizar</button></div>
			</div>
		</header>
		<Feedback value={feedback} onClose={() => setFeedback(null)} />

		<div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
			<nav className="self-start rounded-lg border border-slate-200 bg-white p-2 shadow-sm xl:sticky xl:top-4" aria-label="Seções do Retorninho IA">
				<div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-1">{visibleTabs.map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-xs font-black sm:text-sm ${tab === key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={17} />{label}</button>)}</div>
			</nav>

			<main className="min-w-0 space-y-4">
				{tab === "overview" && <>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Conversas ativas" value={metrics.active_conversations} detail="Últimas 24 horas" icon={MessageSquare} /><MetricCard label="Mensagens recebidas" value={metrics.received} detail={`${metrics.sent || 0} respostas enviadas`} icon={PhoneCall} /><MetricCard label="Autoatribuições" value={metrics.self_assignments} detail={`${metrics.transfers || 0} transferências`} icon={UserCheck} /><MetricCard label="Fila" value={metrics.queue_depth} detail={`${metrics.dead_letter || 0} em fila morta`} icon={ListRestart} /></div>
					<Section title="Estado operacional"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-md bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Instância</p><p className="mt-2 font-black text-slate-950">{dashboard?.instance?.connected ? "Conectada" : "Desconectada"}</p></div><div className="rounded-md bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Técnicos autorizados</p><p className="mt-2 font-black text-slate-950">{metrics.authorized_users || 0}</p></div><div className="rounded-md bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Protocolos pendentes</p><p className="mt-2 font-black text-slate-950">{metrics.pending_protocols || 0}</p></div><div className="rounded-md bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Último processamento</p><p className="mt-2 text-sm font-black text-slate-950">{formatDate(metrics.last_processed_at)}</p></div></div></Section>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Chamadas de IA" value={metrics.ai_calls} detail={`${metrics.ai_failures || 0} falha(s)`} icon={Bot} /><MetricCard label="Latência média IA" value={`${metrics.ai_average_ms || 0} ms`} detail={`P95 ${metrics.ai_p95_ms || 0} ms`} icon={Gauge} /><MetricCard label="Operações concluídas" value={metrics.completed_operations} detail={`${metrics.blocked_operations || 0} bloqueada(s)`} icon={CheckCircle2} /><MetricCard label="Erros de mensagem" value={metrics.message_errors} detail="No período selecionado" icon={AlertTriangle} /></div>
					<Section title="Atividade por regional"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(dashboard?.regional || []).map((item) => <div key={item.regional} className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm"><strong className="text-slate-700">{item.regional}</strong><span className="font-black text-slate-950">{item.total}</span></div>)}{!dashboard?.regional?.length && <p className="text-sm font-semibold text-slate-500">Ainda não há atividade operacional neste período.</p>}</div></Section>
				</>}

				{tab === "whatsapp" && <Section title="Canal WhatsApp" actions={canManage && <button type="button" className={PRIMARY} disabled={saving} onClick={saveConfig}><Save size={17} />Salvar</button>}><ConfigFields form={config || {}} setForm={setConfig} group="whatsapp" /><div className={`mt-5 flex flex-col gap-2 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between ${instance?.connected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${instance?.connected ? "bg-emerald-500" : "bg-slate-400"}`} /><p className="font-black text-slate-950">{instance?.connected ? "WhatsApp conectado" : instance?.configured === false ? "Evolution não configurada" : "WhatsApp desconectado"}</p></div><p className="mt-1 text-sm font-semibold text-slate-600">{instance?.connected && instance?.number ? `Número conectado: ${instance.number}` : instance?.connected ? "Instância pronta para receber mensagens." : connection ? "Aguardando a leitura e confirmação do QR Code." : "Conecte a instância para iniciar o atendimento."}</p></div><button type="button" className={SECONDARY} disabled={saving} onClick={loadInstance}><RefreshCw size={16} />Atualizar status</button></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" className={PRIMARY} disabled={!canManage || saving || config?.provider !== "evolution"} onClick={connectWhatsapp}><Wifi size={17} />{instance?.connected ? "Reconectar instância" : "Conectar instância"}</button><button type="button" className={SECONDARY} disabled={!canManage || saving || config?.provider !== "evolution" || !instance?.connected} onClick={() => run(retorninhoApi.disconnect, "Instância desconectada e agente pausado.", { reloadBase: true })}><Unplug size={17} />Desconectar</button></div>{connection?.connect?.base64 && !instance?.connected && <div className="mt-5 max-w-xs rounded-lg border border-slate-200 bg-white p-3"><p className="mb-2 text-sm font-bold text-slate-700">Leia o QR Code no WhatsApp</p><img className="aspect-square w-full" src={connection.connect.base64.startsWith("data:") ? connection.connect.base64 : `data:image/png;base64,${connection.connect.base64}`} alt="QR Code para conectar o Retorninho" /></div>}</Section>}

				{tab === "ai" && <Section title="Modelo e instruções" actions={canManage && <button type="button" className={PRIMARY} disabled={saving} onClick={saveConfig}><Save size={17} />Salvar</button>}><ConfigFields form={config || {}} setForm={setConfig} group="ai" /></Section>}

				{tab === "features" && <Section title="Ferramentas liberadas" actions={canManage && <button type="button" className={PRIMARY} disabled={saving} onClick={saveConfig}><Save size={17} />Salvar</button>}><div className="grid gap-3 sm:grid-cols-2">{FEATURE_OPTIONS.map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 text-sm font-bold text-slate-700"><span>{label}</span><input type="checkbox" className="h-5 w-5 accent-blue-600" checked={config?.features?.[key] === true} onChange={(event) => setConfig((current) => ({ ...current, features: { ...(current?.features || {}), [key]: event.target.checked } }))} /></label>)}</div></Section>}

				{tab === "settings" && <><Section title="Ativação" actions={canManage && <button type="button" className={PRIMARY} disabled={saving} onClick={saveConfig}><Save size={17} />Salvar</button>}><div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-4 text-sm font-bold"><span>Agente habilitado</span><input type="checkbox" className="h-5 w-5 accent-blue-600" checked={config?.enabled === true} onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked, automaticReplies: event.target.checked ? current.automaticReplies : false }))} /></label><label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-4 text-sm font-bold"><span>Respostas automáticas</span><input type="checkbox" className="h-5 w-5 accent-blue-600" checked={config?.automaticReplies === true} disabled={!config?.enabled} onChange={(event) => setConfig((current) => ({ ...current, automaticReplies: event.target.checked }))} /></label></div></Section><Section title="Limites e retenção"><ConfigFields form={config || {}} setForm={setConfig} group="settings" /></Section></>}

				{tab === "users" && <UsersSection data={pageData} search={search} setSearch={setSearch} page={page} setPage={setPage} canManage={canManage} saving={saving} openModal={setModal} run={run} />}
				{tab === "knowledge" && <KnowledgeSection data={pageData} search={search} setSearch={setSearch} page={page} setPage={setPage} canManage={canManage} openModal={setModal} />}
				{tab === "conversations" && <ConversationsSection data={pageData} search={search} setSearch={setSearch} page={page} setPage={setPage} selected={selectedConversation} messages={messages} onSelect={openConversation} canManage={canManage} run={run} />}
				{["orders", "protocols"].includes(tab) && <ProtocolsSection data={pageData} search={search} setSearch={setSearch} status={status} setStatus={setStatus} page={page} setPage={setPage} title={tab === "orders" ? "Ordens e atribuições" : "Protocolos e histórico"} />}
				{tab === "technical" && <><EventsSection data={pageData} search={search} setSearch={setSearch} status={status} setStatus={setStatus} page={page} setPage={setPage} title="Logs técnicos" onExport={() => downloadEvents("TECHNICAL")} /><QueueSection data={queueData} status={status} setStatus={setStatus} page={page} setPage={setPage} canReprocess={canReprocess} run={run} /></>}
				{["operational", "audit"].includes(tab) && <EventsSection data={pageData} search={search} setSearch={setSearch} status={status} setStatus={setStatus} page={page} setPage={setPage} title={tab === "operational" ? "Tentativas operacionais" : "Auditoria"} onExport={() => downloadEvents(tab === "operational" ? "OPERATIONAL" : "AUDIT")} />}
				{loading && dashboard && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-blue-600" /></div>}
			</main>
		</div>

		{modal?.type === "authorize" && <AuthorizeModal item={modal.item} saving={saving} onClose={() => setModal(null)} onSubmit={(payload) => run(() => retorninhoApi.authorizeUser(payload), "Técnico autorizado.")} />}
		{modal?.type === "knowledge" && <KnowledgeModal item={modal.item} saving={saving} onClose={() => setModal(null)} onSubmit={(payload) => run(() => retorninhoApi.saveKnowledge(modal.item?.id, payload), "Artigo salvo.")} />}
	</div>
	);
}

function SearchBar({ search, setSearch, status, setStatus, statuses = [] }) {
	return <div className="flex flex-col gap-2 sm:flex-row"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input className={`${INPUT} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." /></label>{statuses.length > 0 && <select className={`${INPUT} sm:w-52`} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos os status</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>}</div>;
}

function UsersSection({ data, search, setSearch, setPage, canManage, openModal, run }) {
	return <Section title="Técnicos autorizados" actions={<SearchBar search={search} setSearch={setSearch} status="" setStatus={() => {}} />}><Table headers={["Usuário", "Técnico HubSoft", "Telefone", "Status", "Ações"]} empty={!data.items.length}>{data.items.map((item) => <tr key={item.uid}><td className="px-3 py-3"><strong className="block text-slate-900">{item.name}</strong><span className="text-xs text-slate-500">{item.email}</span></td><td className="px-3 py-3">{item.technicianName || "Não vinculado"}</td><td className="px-3 py-3">{item.phone || "-"}</td><td className="px-3 py-3"><StatusBadge value={item.status} /></td><td className="px-3 py-3"><div className="flex flex-wrap gap-2">{item.authorizationId ? <><button type="button" className={SECONDARY} disabled={!canManage} onClick={() => run(() => retorninhoApi.updateAuthorization(item.authorizationId, { status: item.status === "ACTIVE" ? "BLOCKED" : "ACTIVE", reason: item.status === "ACTIVE" ? "Bloqueio administrativo" : "" }), item.status === "ACTIVE" ? "Acesso bloqueado." : "Acesso reativado.")}>{item.status === "ACTIVE" ? "Bloquear" : "Reativar"}</button><button type="button" className={SECONDARY} disabled={!canManage} onClick={() => run(() => retorninhoApi.updateAuthorization(item.authorizationId, { status: "REVOKED", reason: "Acesso revogado administrativamente" }), "Acesso revogado.")}>Revogar</button></> : <button type="button" className={PRIMARY} disabled={!canManage || !item.technicianName} onClick={() => openModal({ type: "authorize", item })}><Plus size={16} />Autorizar</button>}</div></td></tr>)}</Table><Pager pagination={data.pagination} onPage={setPage} /></Section>;
}

function AuthorizeModal({ item, saving, onClose, onSubmit }) {
	const [phone, setPhone] = useState("");
	const [tools, setTools] = useState(TOOLS.map(([key]) => key));
	return <Modal title={`Autorizar ${item.name}`} onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ userUid: item.uid, phone, toolPermissions: tools, regionalScope: item.regional ? [item.regional] : [] }); }}><label className="space-y-1 text-sm font-bold">Telefone WhatsApp<input className={INPUT} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="55 31 99999-9999" required /></label><div className="grid gap-2 sm:grid-cols-2">{TOOLS.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold"><input type="checkbox" className="accent-blue-600" checked={tools.includes(key)} onChange={() => setTools((current) => current.includes(key) ? current.filter((itemKey) => itemKey !== key) : [...current, key])} />{label}</label>)}</div><div className="flex justify-end gap-2"><button type="button" className={SECONDARY} onClick={onClose}>Cancelar</button><button type="submit" className={PRIMARY} disabled={saving}>{saving && <Loader2 className="animate-spin" size={16} />}Autorizar</button></div></form></Modal>;
}

function KnowledgeSection({ data, search, setSearch, setPage, canManage, openModal }) {
	return <Section title="Base de conhecimento" actions={<div className="flex flex-col gap-2 sm:flex-row"><SearchBar search={search} setSearch={setSearch} status="" setStatus={() => {}} />{canManage && <button type="button" className={PRIMARY} onClick={() => openModal({ type: "knowledge", item: null })}><Plus size={17} />Novo artigo</button>}</div>}><Table headers={["Título", "Categoria", "Versão", "Status", "Atualizado", "Ações"]} empty={!data.items.length}>{data.items.map((item) => <tr key={item.id}><td className="px-3 py-3 font-bold text-slate-900">{item.title}</td><td className="px-3 py-3">{item.category}</td><td className="px-3 py-3">v{item.version}</td><td className="px-3 py-3"><StatusBadge value={item.status} /></td><td className="px-3 py-3">{formatDate(item.updated_at)}</td><td className="px-3 py-3"><button type="button" className={SECONDARY} disabled={!canManage} onClick={() => openModal({ type: "knowledge", item })}>Editar</button></td></tr>)}</Table><Pager pagination={data.pagination} onPage={setPage} /></Section>;
}

function KnowledgeModal({ item, saving, onClose, onSubmit }) {
	const [form, setForm] = useState({ title: item?.title || "", category: item?.category || "Geral", content: item?.content || "", status: item?.status || "DRAFT" });
	return <Modal title={item ? "Editar artigo" : "Novo artigo"} onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label className="space-y-1 text-sm font-bold">Título<input className={INPUT} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm font-bold">Categoria<input className={INPUT} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></label><label className="space-y-1 text-sm font-bold">Status<select className={INPUT} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="DRAFT">Rascunho</option><option value="PUBLISHED">Publicado</option><option value="ARCHIVED">Arquivado</option></select></label></div><label className="space-y-1 text-sm font-bold">Conteúdo<textarea className={`${INPUT} min-h-56 py-3`} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} required /></label><div className="flex justify-end gap-2"><button type="button" className={SECONDARY} onClick={onClose}>Cancelar</button><button type="submit" className={PRIMARY} disabled={saving}><Save size={16} />Salvar</button></div></form></Modal>;
}

function ConversationsSection({ data, search, setSearch, setPage, selected, messages, onSelect, canManage, run }) {
	const actions = selected && canManage ? <div className="flex flex-wrap gap-2"><button type="button" className={SECONDARY} onClick={() => run(() => retorninhoApi.setConversationStatus(selected.id, selected.status === "PAUSED" ? "ACTIVE" : "PAUSED"), selected.status === "PAUSED" ? "Conversa retomada." : "Conversa pausada.")}>{selected.status === "PAUSED" ? "Retomar" : "Pausar"}</button><button type="button" className={SECONDARY} onClick={() => run(() => retorninhoApi.setConversationStatus(selected.id, "CLOSED"), "Conversa encerrada.")}>Encerrar</button></div> : null;
	return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]"><Section title="Conversas" actions={<SearchBar search={search} setSearch={setSearch} status="" setStatus={() => {}} />}><div className="space-y-2">{data.items.map((item) => <button key={item.id} type="button" className={`w-full rounded-md border p-3 text-left ${selected?.id === item.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`} onClick={() => onSelect(item)}><div className="flex justify-between gap-2"><strong>{item.user_name || item.email}</strong><StatusBadge value={item.status} /></div><p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.last_message || "Sem mensagens"}</p><span className="mt-2 block text-xs text-slate-400">{formatDate(item.last_message_at)}</span></button>)}{!data.items.length && <p className="py-10 text-center text-sm font-semibold text-slate-500">Nenhuma conversa encontrada.</p>}</div><Pager pagination={data.pagination} onPage={setPage} /></Section><Section title={selected ? selected.user_name || selected.email : "Mensagens"} actions={actions}><div className="max-h-[620px] space-y-2 overflow-y-auto">{messages.items.map((item) => <div key={item.id} className={`rounded-md p-3 text-sm ${item.direction === "OUTBOUND" ? "ml-6 bg-blue-600 text-white" : "mr-6 bg-slate-100 text-slate-800"}`}><p>{item.body || `[${item.message_type}]`}</p><span className={`mt-2 block text-xs ${item.direction === "OUTBOUND" ? "text-blue-100" : "text-slate-400"}`}>{formatDate(item.created_at)} · {item.status}</span></div>)}{!selected && <p className="py-10 text-center text-sm font-semibold text-slate-500">Selecione uma conversa.</p>}</div></Section></div>;
}

function ProtocolsSection({ data, search, setSearch, status, setStatus, setPage, title }) {
	return <Section title={title} actions={<SearchBar search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={["CREATED", "VALIDATING", "WAITING_TECHNICIAN", "PROCESSING", "COMPLETED", "FAILED", "EXPIRED"]} />}><Table headers={["Protocolo", "Tipo", "O.S.", "Solicitante", "Destino", "Status", "Criado"]} empty={!data.items.length}>{data.items.map((item) => <tr key={item.id}><td className="px-3 py-3 font-black text-blue-700">{item.protocol_number}</td><td className="px-3 py-3">{item.type}</td><td className="px-3 py-3">{item.service_order_number || "-"}</td><td className="px-3 py-3">{item.requester_name || "-"}</td><td className="px-3 py-3">{item.target_name || item.current_name || "-"}</td><td className="px-3 py-3"><StatusBadge value={item.status} /></td><td className="px-3 py-3">{formatDate(item.created_at)}</td></tr>)}</Table><Pager pagination={data.pagination} onPage={setPage} /></Section>;
}

function QueueSection({ data, status, setStatus, setPage, canReprocess, run }) {
	return <Section title="Fila técnica" actions={<SearchBar search="" setSearch={() => {}} status={status} setStatus={setStatus} statuses={["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD_LETTER"]} />}><Table headers={["Evento", "Status", "Tentativas", "Próxima execução", "Erro", "Ações"]} empty={!data.items.length}>{data.items.map((item) => <tr key={item.id}><td className="px-3 py-3 font-bold">{item.event_type}</td><td className="px-3 py-3"><StatusBadge value={item.status} /></td><td className="px-3 py-3">{item.attempts}/{item.max_attempts}</td><td className="px-3 py-3">{formatDate(item.next_attempt_at)}</td><td className="max-w-xs px-3 py-3 text-xs text-red-600">{item.last_error || "-"}</td><td className="px-3 py-3"><button type="button" className={SECONDARY} disabled={!canReprocess || !["FAILED", "DEAD_LETTER"].includes(item.status)} onClick={() => run(() => retorninhoApi.reprocessQueue(item.id), "Evento devolvido à fila.")}><ListRestart size={16} />Reprocessar</button></td></tr>)}</Table><Pager pagination={data.pagination} onPage={setPage} /></Section>;
}

function EventsSection({ data, search, setSearch, status, setStatus, setPage, title, onExport }) {
	return <Section title={title} actions={<div className="flex flex-col gap-2 sm:flex-row"><SearchBar search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={["SUCCESS", "FAILED", "BLOCKED", "PENDING"]} /><button type="button" className={SECONDARY} onClick={onExport}>Exportar lote</button></div>}><Table headers={["Evento", "Serviço", "Usuário", "O.S.", "Regra", "Status", "Data"]} empty={!data.items.length}>{data.items.map((item) => <tr key={item.id}><td className="px-3 py-3 font-bold">{item.event_name}</td><td className="px-3 py-3">{item.service || "-"}</td><td className="px-3 py-3">{item.user_name || "-"}</td><td className="px-3 py-3">{item.service_order_number || "-"}</td><td className="px-3 py-3 text-xs">{item.rule_applied || "-"}</td><td className="px-3 py-3"><StatusBadge value={item.status} /></td><td className="px-3 py-3">{formatDate(item.created_at)}</td></tr>)}</Table><Pager pagination={data.pagination} onPage={setPage} /></Section>;
}
