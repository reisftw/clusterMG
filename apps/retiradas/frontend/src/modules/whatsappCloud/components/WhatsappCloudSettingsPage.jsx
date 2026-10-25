import {
	Activity,
	AlertTriangle,
	CheckCircle2,
	Clipboard,
	Cloud,
	History,
	KeyRound,
	Loader2,
	MessageCircle,
	RefreshCw,
	Save,
	Send,
	ShieldCheck,
	Users,
	Webhook,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { whatsappCloudApi } from "../services/whatsappCloudService";

const TABS = [
	{ id: "overview", label: "Visão geral", icon: Activity },
	{ id: "config", label: "Configuração", icon: KeyRound },
	{ id: "tests", label: "Testes", icon: Send },
	{ id: "templates", label: "Templates", icon: MessageCircle },
	{ id: "webhooks", label: "Webhooks", icon: Webhook },
	{ id: "activation", label: "Ativação", icon: ShieldCheck },
];

const INPUT_CLASS =
	"mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-500";
const BUTTON_PRIMARY =
	"inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_SECONDARY =
	"inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		timeZone: "America/Sao_Paulo",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function StatusBadge({ status }) {
	const normalized = String(status || "PENDENTE").toUpperCase();
	const success = [
		"CONNECTED",
		"APPROVED",
		"AUTHORIZED",
		"ACCEPTED",
		"SENT",
		"DELIVERED",
		"READ",
		"PROCESSED",
	].includes(normalized);
	const danger = ["FAILED", "REJECTED", "REVOKED"].includes(normalized);
	const classes = success
		? "border-emerald-200 bg-emerald-50 text-emerald-800"
		: danger
			? "border-red-200 bg-red-50 text-red-800"
			: "border-amber-200 bg-amber-50 text-amber-800";
	return (
		<span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${classes}`}>
			{normalized}
		</span>
	);
}

function Section({ title, description, action, children }) {
	return (
		<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">{title}</h2>
					{description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}

function MetricCard({ icon: Icon, label, value, detail, tone = "cyan" }) {
	const toneClass = {
		cyan: "bg-cyan-50 text-cyan-700",
		blue: "bg-blue-50 text-blue-700",
		emerald: "bg-emerald-50 text-emerald-700",
		amber: "bg-amber-50 text-amber-700",
	}[tone];
	return (
		<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
			<div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
				<Icon size={20} />
			</div>
			<p className="text-xs font-black uppercase text-slate-500">{label}</p>
			<p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
			<p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
		</div>
	);
}

function Field({ label, children, help }) {
	return (
		<label className="block text-sm font-black text-slate-700">
			{label}
			{children}
			{help ? <span className="mt-1 block text-xs font-semibold text-slate-500">{help}</span> : null}
		</label>
	);
}

function Feedback({ message }) {
	if (!message?.text) return null;
	const danger = message.type === "error";
	return (
		<div
			className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-bold ${
				danger
					? "border-red-200 bg-red-50 text-red-800"
					: "border-emerald-200 bg-emerald-50 text-emerald-800"
			}`}
		>
			{danger ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
			<span>{message.text}</span>
		</div>
	);
}

export default function WhatsappCloudSettingsPage() {
	const [activeTab, setActiveTab] = useState("overview");
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState("");
	const [feedback, setFeedback] = useState(null);
	const [overview, setOverview] = useState(null);
	const [config, setConfig] = useState(null);
	const [recipients, setRecipients] = useState([]);
	const [templates, setTemplates] = useState([]);
	const [tests, setTests] = useState({ items: [], total: 0 });
	const [events, setEvents] = useState({ items: [], total: 0 });
	const [readiness, setReadiness] = useState({ ready: false, checks: [] });
	const [verifyToken, setVerifyToken] = useState("");
	const [providerAction, setProviderAction] = useState("");
	const [providerReason, setProviderReason] = useState("");
	const [recipientForm, setRecipientForm] = useState({
		name: "",
		phone: "",
		authorizationStatus: "AUTHORIZED",
		metaRegistered: false,
		notes: "",
	});
	const [testForm, setTestForm] = useState({
		recipientId: "",
		template: "hello_world",
		language: "en_US",
		variables: "",
		confirmed: false,
	});
	const [historyFilters, setHistoryFilters] = useState({
		status: "",
		recipientId: "",
		template: "",
		startDate: "",
		endDate: "",
	});

	const loadAll = useCallback(async () => {
		setLoading(true);
		setFeedback(null);
		try {
			const [overviewData, configData, recipientData, templateData, testData, eventData, readinessData] =
				await Promise.all([
					whatsappCloudApi.overview(),
					whatsappCloudApi.config(),
					whatsappCloudApi.recipients(),
					whatsappCloudApi.templates(),
					whatsappCloudApi.tests({ limit: 50 }),
					whatsappCloudApi.webhooks({ limit: 50 }),
					whatsappCloudApi.readiness(),
				]);
			setOverview(overviewData);
			setConfig(configData);
			setRecipients(recipientData.items || []);
			setTemplates(templateData.items || []);
			setTests(testData || { items: [], total: 0 });
			setEvents(eventData || { items: [], total: 0 });
			setReadiness(readinessData || { ready: false, checks: [] });
		} catch (error) {
			setFeedback({ type: "error", text: error.message || "Falha ao carregar a integração." });
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadAll();
	}, [loadAll]);

	const run = async (key, action, successMessage) => {
		setBusy(key);
		setFeedback(null);
		try {
			const result = await action();
			setFeedback({ type: "success", text: successMessage });
			await loadAll();
			return result;
		} catch (error) {
			setFeedback({ type: "error", text: error.message || "Não foi possível concluir a operação." });
			return null;
		} finally {
			setBusy("");
		}
	};

	const approvedTemplates = useMemo(
		() => templates.filter((item) => String(item.status).toUpperCase() === "APPROVED"),
		[templates],
	);
	const authorizedRecipients = useMemo(
		() => recipients.filter((item) => item.authorizationStatus === "AUTHORIZED" && item.metaRegistered),
		[recipients],
	);

	if (loading && !config) return <Spinner fullScreen label="Carregando WhatsApp Cloud API..." />;

	const saveConfig = () =>
		run("save", () => whatsappCloudApi.saveConfig(config), "Configuração salva com sucesso.");
	const testConnection = () =>
		run("diagnostics", whatsappCloudApi.diagnostics, "Conexão com a Meta validada.");
	const syncTemplates = () =>
		run("templates", whatsappCloudApi.syncTemplates, "Templates sincronizados.");
	const addRecipient = async (event) => {
		event.preventDefault();
		const result = await run(
			"recipient",
			() => whatsappCloudApi.addRecipient(recipientForm),
			"Destinatário de teste atualizado.",
		);
		if (result) {
			setRecipientForm({ name: "", phone: "", authorizationStatus: "AUTHORIZED", metaRegistered: false, notes: "" });
		}
	};
	const sendTest = async (event) => {
		event.preventDefault();
		if (!testForm.confirmed) {
			setFeedback({ type: "error", text: "Confirme o envio explícito antes de continuar." });
			return;
		}
		await run(
			"send",
			() =>
				whatsappCloudApi.sendTest({
					recipientId: testForm.recipientId,
					template: testForm.template,
					language: testForm.language,
					variables: testForm.variables
						.split("\n")
						.map((item) => item.trim())
						.filter(Boolean),
				}),
			"Teste aceito pela Meta.",
		);
		setTestForm((current) => ({ ...current, confirmed: false }));
	};
	const loadHistory = async () => {
		setBusy("history");
		setFeedback(null);
		try {
			setTests(await whatsappCloudApi.tests({ ...historyFilters, limit: 50 }));
		} catch (error) {
			setFeedback({ type: "error", text: error.message || "Falha ao filtrar o histórico." });
		} finally {
			setBusy("");
		}
	};
	const confirmProviderAction = async () => {
		const reason = providerReason.trim();
		if (!reason) {
			setFeedback({ type: "error", text: "Informe o motivo da alteração de gateway." });
			return;
		}
		const action = providerAction;
		const result = await run(
			action,
			() => (action === "activate" ? whatsappCloudApi.activate(reason) : whatsappCloudApi.rollback(reason)),
			action === "activate" ? "WhatsApp Cloud API ativada." : "Gateway anterior restaurado.",
		);
		if (result) {
			setProviderAction("");
			setProviderReason("");
		}
	};

	return (
		<div className="min-w-0 space-y-5 bg-slate-50 p-3 sm:p-5 lg:p-6">
			<header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
							<Cloud size={25} />
						</div>
						<div>
							<h1 className="text-xl font-black text-slate-950 sm:text-2xl">WhatsApp Cloud API</h1>
							<p className="text-sm font-semibold text-slate-500">Ambiente oficial Meta isolado para validação</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<StatusBadge status={config?.metaTestMode ? "MODO DE TESTE" : "PRODUÇÃO"} />
						<StatusBadge status={config?.lastConnectionStatus} />
						<button type="button" className={BUTTON_SECONDARY} onClick={loadAll} disabled={loading}>
							<RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Atualizar
						</button>
					</div>
				</div>
			</header>

			<Feedback message={feedback} />

			<nav className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm" aria-label="Seções do WhatsApp Cloud API">
				<div className="flex min-w-max gap-1">
					{TABS.map(({ id, label, icon: Icon }) => (
						<button
							type="button"
							key={id}
							onClick={() => setActiveTab(id)}
							className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${
								activeTab === id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
							}`}
						>
							<Icon size={17} /> {label}
						</button>
					))}
				</div>
			</nav>

			{activeTab === "overview" ? (
				<div className="space-y-5">
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<MetricCard icon={Users} label="Destinatários" value={overview?.recipients?.authorized || 0} detail={`${overview?.recipients?.total || 0} cadastrados`} />
						<MetricCard icon={MessageCircle} label="Templates aprovados" value={overview?.templates?.approved || 0} detail={`${overview?.templates?.total || 0} sincronizados`} tone="blue" />
						<MetricCard icon={Send} label="Testes aceitos" value={overview?.tests?.successful || 0} detail={`${overview?.tests?.total || 0} tentativas registradas`} tone="emerald" />
						<MetricCard icon={Webhook} label="Eventos webhook" value={overview?.webhooks?.total || 0} detail={`Último: ${formatDate(overview?.webhooks?.last_event_at)}`} tone="amber" />
					</div>
					<Section title="Gateway produtivo" description="O ambiente Meta permanece isolado até a ativação controlada.">
						<div className="grid gap-3 sm:grid-cols-3">
							<div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Provedor atual</p><p className="mt-1 font-black text-slate-950">{overview?.gateway?.currentProvider || "-"}</p></div>
							<div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Estado</p><p className="mt-1 font-black text-slate-950">{overview?.gateway?.currentEnabled ? "Ativo" : "Inativo"}</p></div>
							<div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Migração Meta</p><p className="mt-1 font-black text-cyan-700">Somente testes</p></div>
						</div>
					</Section>
				</div>
			) : null}

			{activeTab === "config" ? (
				<div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
					<Section title="Identificadores Meta" action={<button type="button" className={BUTTON_PRIMARY} onClick={saveConfig} disabled={busy === "save"}>{busy === "save" ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Salvar</button>}>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="App ID"><input className={INPUT_CLASS} value={config?.appId || ""} onChange={(event) => setConfig({ ...config, appId: event.target.value })} /></Field>
							<Field label="WABA ID"><input className={INPUT_CLASS} value={config?.wabaId || ""} onChange={(event) => setConfig({ ...config, wabaId: event.target.value })} /></Field>
							<Field label="Phone Number ID"><input className={INPUT_CLASS} value={config?.phoneNumberId || ""} onChange={(event) => setConfig({ ...config, phoneNumberId: event.target.value })} /></Field>
							<Field label="Número de teste"><input className={INPUT_CLASS} value={config?.testPhoneNumber || ""} onChange={(event) => setConfig({ ...config, testPhoneNumber: event.target.value })} /></Field>
							<Field label="Versão Graph API"><input className={INPUT_CLASS} value={config?.graphApiVersion || ""} onChange={(event) => setConfig({ ...config, graphApiVersion: event.target.value })} /></Field>
							<Field label="Webhook URL"><input className={INPUT_CLASS} value={config?.webhookUrl || ""} disabled /></Field>
						</div>
						<label className="mt-4 flex items-start gap-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-bold text-cyan-950">
							<input type="checkbox" className="mt-1 h-4 w-4" checked={config?.metaTestMode !== false} onChange={(event) => setConfig({ ...config, metaTestMode: event.target.checked })} />
							Manter integração em modo de teste isolado
						</label>
						<div className="mt-3 grid gap-3 sm:grid-cols-2">
							<label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-800">
								<input type="checkbox" className="mt-1 h-4 w-4" checked={config?.consentPolicyConfirmed === true} onChange={(event) => setConfig({ ...config, consentPolicyConfirmed: event.target.checked })} />
								Política de consentimento validada
							</label>
							<label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-800">
								<input type="checkbox" className="mt-1 h-4 w-4" checked={config?.productionEnabled === true} onChange={(event) => setConfig({ ...config, productionEnabled: event.target.checked })} />
								Solicitar habilitação produtiva
							</label>
						</div>
					</Section>
					<Section title="Segredos do servidor" description="Valores protegidos por variáveis de ambiente.">
						<div className="space-y-3">
							{[
								["META_ACCESS_TOKEN", config?.secretStatus?.accessTokenConfigured],
								["META_APP_SECRET", config?.secretStatus?.appSecretConfigured],
								["META_WEBHOOK_VERIFY_TOKEN", config?.secretStatus?.verifyTokenConfigured],
							].map(([name, configured]) => (
								<div key={name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
									<code className="break-all text-xs font-black text-slate-700">{name}</code>
									{configured ? <CheckCircle2 className="shrink-0 text-emerald-600" size={19} /> : <XCircle className="shrink-0 text-red-500" size={19} />}
								</div>
							))}
							<button type="button" className={BUTTON_SECONDARY} onClick={async () => {
								setBusy("token"); setFeedback(null);
								try { const result = await whatsappCloudApi.generateVerifyToken(); setVerifyToken(result.token || ""); setFeedback({ type: "success", text: "Verify token gerado. Ele será exibido somente agora." }); }
								catch (error) { setFeedback({ type: "error", text: error.message }); }
								finally { setBusy(""); }
							}} disabled={busy === "token"}><KeyRound size={17} /> Gerar verify token</button>
							{verifyToken ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3"><p className="text-xs font-black uppercase text-amber-800">Exibição única</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 break-all text-xs text-amber-950">{verifyToken}</code><button type="button" title="Copiar token" onClick={() => navigator.clipboard?.writeText(verifyToken)} className="shrink-0 text-amber-800"><Clipboard size={18} /></button></div></div> : null}
							<button type="button" className={BUTTON_PRIMARY} onClick={testConnection} disabled={busy === "diagnostics"}>{busy === "diagnostics" ? <Loader2 className="animate-spin" size={17} /> : <Activity size={17} />} Testar conexão</button>
						</div>
					</Section>
				</div>
			) : null}

			{activeTab === "tests" ? (
				<div className="grid gap-5 xl:grid-cols-2">
					<Section title="Destinatários autorizados">
						<form onSubmit={addRecipient} className="grid gap-3 sm:grid-cols-2">
							<Field label="Responsável"><input required className={INPUT_CLASS} value={recipientForm.name} onChange={(event) => setRecipientForm({ ...recipientForm, name: event.target.value })} /></Field>
							<Field label="Telefone E.164"><input required className={INPUT_CLASS} placeholder="+5531999999999" value={recipientForm.phone} onChange={(event) => setRecipientForm({ ...recipientForm, phone: event.target.value })} /></Field>
							<label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={recipientForm.metaRegistered} onChange={(event) => setRecipientForm({ ...recipientForm, metaRegistered: event.target.checked })} /> Cadastrado no teste da Meta</label>
							<button className={BUTTON_PRIMARY} disabled={busy === "recipient"}>{busy === "recipient" ? <Loader2 className="animate-spin" size={17} /> : <Users size={17} />} Autorizar número</button>
						</form>
						<div className="mt-4 space-y-2">
							{recipients.map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">{item.name}</p><p className="text-sm font-semibold text-slate-500">{item.maskedPhone}</p></div><div className="flex items-center gap-2"><StatusBadge status={item.authorizationStatus} /><button type="button" className="text-sm font-black text-red-600" onClick={() => run(`revoke-${item.id}`, () => whatsappCloudApi.revokeRecipient(item.id), "Autorização revogada.")}>Revogar</button></div></div>)}
						</div>
					</Section>
					<Section title="Envio de integração" description="Executado somente após confirmação explícita.">
						<form onSubmit={sendTest} className="space-y-4">
							<Field label="Destinatário"><select required className={INPUT_CLASS} value={testForm.recipientId} onChange={(event) => setTestForm({ ...testForm, recipientId: event.target.value })}><option value="">Selecione</option>{authorizedRecipients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.maskedPhone}</option>)}</select></Field>
							<div className="grid gap-3 sm:grid-cols-2"><Field label="Template"><select required className={INPUT_CLASS} value={testForm.template} onChange={(event) => { const selected = approvedTemplates.find((item) => item.name === event.target.value); setTestForm({ ...testForm, template: event.target.value, language: selected?.language || "en_US" }); }}><option value="hello_world">hello_world</option>{approvedTemplates.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field><Field label="Idioma"><input className={INPUT_CLASS} value={testForm.language} onChange={(event) => setTestForm({ ...testForm, language: event.target.value })} /></Field></div>
							<Field label="Variáveis" help="Uma variável por linha, na ordem do template."><textarea rows="4" className={INPUT_CLASS} value={testForm.variables} onChange={(event) => setTestForm({ ...testForm, variables: event.target.value })} /></Field>
							<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
								<p className="text-xs font-black uppercase text-slate-500">Prévia</p>
								<p className="mt-2 text-sm font-black text-slate-900">{testForm.template || "Selecione um template"}</p>
								<p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{testForm.variables || "Sem variáveis"}</p>
							</div>
							<label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950"><input type="checkbox" className="mt-1" checked={testForm.confirmed} onChange={(event) => setTestForm({ ...testForm, confirmed: event.target.checked })} /> Confirmo o envio real deste template ao número de teste autorizado.</label>
							<button className={BUTTON_PRIMARY} disabled={busy === "send" || !testForm.confirmed}>{busy === "send" ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />} Enviar teste real</button>
						</form>
					</Section>
					<Section title="Histórico de testes" action={<History size={20} className="text-slate-400" />}>
						<div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							<Field label="Status"><select className={INPUT_CLASS} value={historyFilters.status} onChange={(event) => setHistoryFilters({ ...historyFilters, status: event.target.value })}><option value="">Todos</option>{["ACCEPTED", "DELIVERED", "READ", "FAILED"].map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
							<Field label="Destinatário"><select className={INPUT_CLASS} value={historyFilters.recipientId} onChange={(event) => setHistoryFilters({ ...historyFilters, recipientId: event.target.value })}><option value="">Todos</option>{recipients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
							<Field label="Template"><input className={INPUT_CLASS} value={historyFilters.template} onChange={(event) => setHistoryFilters({ ...historyFilters, template: event.target.value })} /></Field>
							<Field label="Data inicial"><input type="date" className={INPUT_CLASS} value={historyFilters.startDate} onChange={(event) => setHistoryFilters({ ...historyFilters, startDate: event.target.value })} /></Field>
							<Field label="Data final"><input type="date" className={INPUT_CLASS} value={historyFilters.endDate} onChange={(event) => setHistoryFilters({ ...historyFilters, endDate: event.target.value })} /></Field>
							<button type="button" className={`${BUTTON_SECONDARY} self-end`} onClick={loadHistory} disabled={busy === "history"}>{busy === "history" ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />} Filtrar</button>
						</div>
						<div className="space-y-2">{(tests.items || []).map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-900">{item.template} · {item.recipient}</p><StatusBadge status={item.status} /></div><p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(item.createdAt)} · {item.operator || "-"} · HTTP {item.httpStatus || "-"}</p><p className="mt-1 break-all text-xs font-semibold text-slate-500">Message ID: {item.messageId || "-"}</p>{item.events?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.events.map((event, index) => <StatusBadge key={`${item.id}-${event.status}-${index}`} status={event.status || event.eventType} />)}</div> : null}{item.error ? <p className="mt-2 text-sm font-bold text-red-700">{item.error}</p> : null}</div>)}</div>
					</Section>
				</div>
			) : null}

			{activeTab === "templates" ? (
				<Section title="Templates oficiais" action={<button type="button" className={BUTTON_PRIMARY} onClick={syncTemplates} disabled={busy === "templates"}>{busy === "templates" ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />} Sincronizar</button>}>
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{templates.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-black text-slate-950">{item.name}</h3><p className="text-xs font-semibold text-slate-500">{item.language} · {item.category || "-"}</p></div><StatusBadge status={item.status} /></div><p className="mt-3 text-xs font-semibold text-slate-500">{item.parameterCount} variável(is) · {formatDate(item.lastSyncedAt)}</p></article>)}</div>
				</Section>
			) : null}

			{activeTab === "webhooks" ? (
				<Section title="Eventos recebidos" description="Eventos deduplicados e validados por assinatura HMAC.">
					<div className="space-y-2">{(events.items || []).map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-slate-950">{item.eventType} · {item.messageId || "sem message id"}</p><p className="text-xs font-semibold text-slate-500">{item.sender || "-"} · {formatDate(item.receivedAt)}</p></div><StatusBadge status={item.processingStatus} /></div></article>)}</div>
				</Section>
			) : null}

			{activeTab === "activation" ? (
				<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
					<Section title="Checklist produtivo" description="A ativação permanece bloqueada enquanto qualquer requisito estiver pendente.">
						<div className="space-y-2">{(readiness.checks || []).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">{item.ok ? <CheckCircle2 className="shrink-0 text-emerald-600" size={20} /> : <XCircle className="shrink-0 text-red-500" size={20} />}<span className="font-bold text-slate-800">{item.label}</span></div>)}</div>
					</Section>
					<Section title="Controle de gateway">
						<div className="space-y-3"><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950">Provedor atual: {readiness.currentProvider || "-"}</div><button type="button" className={BUTTON_PRIMARY} disabled={!readiness.ready} onClick={() => setProviderAction("activate")}><ShieldCheck size={17} /> Ativar Meta</button><button type="button" className={BUTTON_SECONDARY} onClick={() => setProviderAction("rollback")}><RefreshCw size={17} /> Reverter gateway</button></div>
					</Section>
				</div>
			) : null}

			{providerAction ? (
				<div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="provider-action-title">
					<div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl">
						<h2 id="provider-action-title" className="text-xl font-black text-slate-950">
							{providerAction === "activate" ? "Ativar WhatsApp Cloud API" : "Reverter gateway"}
						</h2>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							<div className="rounded-lg bg-slate-100 p-3"><p className="text-xs font-black uppercase text-slate-500">Atual</p><p className="mt-1 font-black text-slate-950">{readiness.currentProvider || "-"}</p></div>
							<div className="rounded-lg bg-cyan-50 p-3"><p className="text-xs font-black uppercase text-cyan-700">Destino</p><p className="mt-1 font-black text-cyan-950">{providerAction === "activate" ? "official_whatsapp" : overview?.config?.rollbackProvider || "gateway anterior"}</p></div>
						</div>
						<Field label="Motivo"><textarea autoFocus rows="3" className={INPUT_CLASS} value={providerReason} onChange={(event) => setProviderReason(event.target.value)} /></Field>
						<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className={BUTTON_SECONDARY} onClick={() => { setProviderAction(""); setProviderReason(""); }}>Cancelar</button><button type="button" className={BUTTON_PRIMARY} disabled={!providerReason.trim() || busy === providerAction} onClick={confirmProviderAction}>{busy === providerAction ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />} Confirmar alteração</button></div>
					</div>
				</div>
			) : null}
		</div>
	);
}
