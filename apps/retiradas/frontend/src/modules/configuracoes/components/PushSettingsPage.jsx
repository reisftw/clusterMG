import {
	BellRing,
	Check,
	ChevronLeft,
	ChevronRight,
	CircleAlert,
	Loader2,
	Megaphone,
	RefreshCw,
	Search,
	Send,
	Smartphone,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRoleLabel, hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	fetchPushAdminCampaigns,
	fetchPushAdminOverview,
	fetchPushAdminRecipients,
	sendAdminPushNotification,
} from "../../../services/pushNotificationsService";

const ROLE_OPTIONS = [
	["tecnico", "Técnicos"],
	["backoffice_retirada", "BackOffice de Retiradas"],
	["supervisor", "Supervisores"],
	["backoffice", "BackOffice"],
	["lider_empresa", "Líderes de empresa"],
	["agente_autorizado", "Agentes autorizados"],
	["supervisor_administrativo", "Supervisão administrativa"],
	["analista_administrativo", "Analistas administrativos"],
];

const DESTINATIONS = [
	["/", "Dashboard"],
	["/tentativas", "Central de Tentativas"],
	["/maps", "Retiradas Maps"],
	["/ordens-servico/solicitacao", "Solicitação de O.S"],
	["/notificacoes", "Central de Notificações"],
];

const EMPTY_FORM = {
	title: "",
	message: "",
	severity: "info",
	targetPath: "/",
	targetMode: "ALL",
	targetValues: [],
};

function formatDate(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function targetLabel(item) {
	if (item.targetMode === "ALL") return "Todos";
	if (item.targetMode === "ROLES") {
		return item.targetValues.map((role) => getRoleLabel(role)).join(", ");
	}
	return `${item.targetValues.length} pessoa(s)`;
}

function MetricCard({ icon: Icon, label, value, detail, tone = "blue" }) {
	const tones = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		amber: "border-amber-100 bg-amber-50 text-amber-700",
		slate: "border-slate-200 bg-white text-slate-700",
	};
	return (
		<div className={`rounded-lg border p-4 ${tones[tone]}`}>
			<div className="flex items-start justify-between gap-3"><p className="text-xs font-black uppercase">{label}</p><Icon size={19} /></div>
			<p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
			<p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
		</div>
	);
}

export default function PushSettingsPage() {
	const { currentUser } = useAuthContext();
	const canSend = hasPermission(currentUser, "configuracao.push.manage");
	const [overview, setOverview] = useState(null);
	const [recipients, setRecipients] = useState([]);
	const [campaigns, setCampaigns] = useState({ items: [], page: 1, totalPages: 1, total: 0 });
	const [form, setForm] = useState(EMPTY_FORM);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [feedback, setFeedback] = useState(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [nextOverview, nextRecipients, nextCampaigns] = await Promise.all([
				fetchPushAdminOverview(),
				fetchPushAdminRecipients({ limit: 500 }),
				fetchPushAdminCampaigns({ page, limit: 15 }),
			]);
			setOverview(nextOverview);
			setRecipients(nextRecipients?.items || []);
			setCampaigns(nextCampaigns || { items: [], page, totalPages: 1, total: 0 });
		} catch (error) {
			setFeedback({ type: "error", text: error?.message || "Não foi possível carregar o painel Push." });
		} finally {
			setLoading(false);
		}
	}, [page]);

	useEffect(() => { load(); }, [load]);

	const filteredRecipients = useMemo(() => {
		const term = search.trim().toLocaleLowerCase("pt-BR");
		if (!term) return recipients;
		return recipients.filter((item) => `${item.name} ${item.email} ${item.role}`.toLocaleLowerCase("pt-BR").includes(term));
	}, [recipients, search]);

	const audience = useMemo(() => {
		if (form.targetMode === "ALL") return Number(overview?.allUsers || 0);
		if (form.targetMode === "USERS") return form.targetValues.length;
		return recipients.filter((item) => form.targetValues.includes(item.role)).length;
	}, [form.targetMode, form.targetValues, overview?.allUsers, recipients]);

	function setMode(targetMode) {
		setForm((current) => ({ ...current, targetMode, targetValues: [] }));
	}

	function toggleTarget(value) {
		setForm((current) => ({
			...current,
			targetValues: current.targetValues.includes(value)
				? current.targetValues.filter((item) => item !== value)
				: [...current.targetValues, value],
		}));
	}

	function requestConfirmation(event) {
		event.preventDefault();
		setFeedback(null);
		if (!form.title.trim() || !form.message.trim()) {
			setFeedback({ type: "error", text: "Preencha o título e a mensagem." });
			return;
		}
		if (form.targetMode !== "ALL" && !form.targetValues.length) {
			setFeedback({ type: "error", text: "Selecione ao menos um destinatário." });
			return;
		}
		setConfirmOpen(true);
	}

	async function sendCampaign() {
		setSending(true);
		setFeedback(null);
		try {
			const result = await sendAdminPushNotification(form);
			setConfirmOpen(false);
			setFeedback({
				type: "success",
				text: `Aviso enviado. ${result.campaign.sentDevices} aparelho(s) receberam o push e ${result.campaign.audienceCount} usuário(s) receberam a notificação interna.`,
			});
			setForm(EMPTY_FORM);
			setSearch("");
			setPage(1);
			await load();
		} catch (error) {
			setConfirmOpen(false);
			setFeedback({ type: "error", text: error?.message || "Não foi possível enviar o aviso." });
		} finally {
			setSending(false);
		}
	}

	return (
		<div className="space-y-5">
			<section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-lg bg-blue-600 text-white"><Megaphone size={24} /></span><div><h1 className="text-2xl font-black text-slate-950">Push</h1><p className="text-sm font-semibold text-slate-500">Envie avisos gerais, por setor ou diretamente para uma pessoa.</p></div></div>
					<button type="button" onClick={load} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={loading ? "animate-spin" : ""} size={17} /> Atualizar</button>
				</div>
			</section>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MetricCard icon={Smartphone} label="Aparelhos ativos" value={overview?.active || 0} detail="Com push autorizado" />
				<MetricCard icon={Users} label="Usuários alcançáveis" value={overview?.users || 0} detail="Com ao menos um aparelho" tone="emerald" />
				<MetricCard icon={Send} label="Campanhas" value={campaigns.total || 0} detail="Registradas no histórico" tone="slate" />
				<MetricCard icon={CircleAlert} label="Falhas recentes" value={(overview?.recent || []).filter((item) => item.event_type === "FAILED").reduce((sum, item) => sum + Number(item.total || 0), 0)} detail="Nos últimos sete dias" tone="amber" />
			</div>

			{feedback ? <div role="status" className={`rounded-lg border p-4 text-sm font-bold ${feedback.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</div> : null}

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-5"><h2 className="text-lg font-black text-slate-950">Criar aviso</h2><p className="text-sm font-semibold text-slate-500">O aviso aparece no aplicativo e também no sino de notificações.</p></div>
				<form onSubmit={requestConfirmation} className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
					<div className="space-y-4">
						<div><label htmlFor="push-title" className="mb-1.5 block text-sm font-black text-slate-700">Título</label><input id="push-title" maxLength={100} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Atenção à rota de hoje" className="min-h-12 w-full rounded-lg border border-slate-300 px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
						<div><div className="mb-1.5 flex items-center justify-between"><label htmlFor="push-message" className="text-sm font-black text-slate-700">Mensagem</label><span className="text-xs font-bold text-slate-400">{form.message.length}/500</span></div><textarea id="push-message" maxLength={500} rows={5} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Escreva um aviso curto e objetivo." className="w-full resize-y rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
						<div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="push-severity" className="mb-1.5 block text-sm font-black text-slate-700">Prioridade</label><select id="push-severity" value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold"><option value="info">Informação</option><option value="success">Comunicado positivo</option><option value="warning">Atenção</option><option value="critical">Urgente</option></select></div><div><label htmlFor="push-path" className="mb-1.5 block text-sm font-black text-slate-700">Abrir ao tocar</label><select id="push-path" value={form.targetPath} onChange={(event) => setForm((current) => ({ ...current, targetPath: event.target.value }))} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold">{DESTINATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
					</div>

					<div className="space-y-4">
						<div><p className="mb-2 text-sm font-black text-slate-700">Destinatários</p><div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-1">{[["ALL", "Todos"], ["USERS", "Pessoa"], ["ROLES", "Setor"]].map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`min-h-10 rounded-md px-2 text-xs font-black transition ${form.targetMode === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>)}</div></div>
						{form.targetMode === "USERS" ? <div className="rounded-lg border border-slate-200"><div className="flex items-center gap-2 border-b border-slate-200 px-3"><Search size={17} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou e-mail" className="min-h-11 min-w-0 flex-1 border-0 text-sm font-semibold outline-none" /></div><div className="max-h-64 overflow-y-auto p-2">{filteredRecipients.map((item) => { const selected = form.targetValues.includes(item.id); return <button key={item.id} type="button" onClick={() => toggleTarget(item.id)} className={`mb-1 flex w-full items-center gap-3 rounded-lg p-2 text-left ${selected ? "bg-blue-50" : "hover:bg-slate-50"}`}><span className={`grid size-5 shrink-0 place-items-center rounded border ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{selected ? <Check size={13} /> : null}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{item.name}</strong><small className="block truncate text-slate-500">{item.email} · {getRoleLabel(item.role)}</small></span><span title="Aparelhos ativos" className={`text-xs font-black ${item.activeDevices ? "text-emerald-600" : "text-slate-400"}`}>{item.activeDevices}</span></button>; })}{!filteredRecipients.length ? <p className="p-5 text-center text-sm font-semibold text-slate-500">Nenhuma pessoa encontrada.</p> : null}</div></div> : null}
						{form.targetMode === "ROLES" ? <div className="grid gap-2">{ROLE_OPTIONS.map(([value, label]) => { const selected = form.targetValues.includes(value); return <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-bold ${selected ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-700"}`}><input type="checkbox" checked={selected} onChange={() => toggleTarget(value)} className="size-4 accent-blue-600" />{label}</label>; })}</div> : null}
						{form.targetMode === "ALL" ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900"><BellRing className="mb-2 text-blue-600" size={22} />Todos os usuários ativos receberão o aviso no sino. Os aparelhos que autorizaram push também receberão a notificação do Android.</div> : null}
						<div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-3"><span className="text-sm font-bold text-slate-600">Público selecionado</span><strong className="text-lg text-slate-950">{audience}</strong></div>
						<button type="submit" disabled={!canSend || sending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Send size={18} /> Revisar e enviar</button>
					</div>
				</form>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4"><h2 className="text-lg font-black text-slate-950">Histórico de envios</h2><p className="text-sm font-semibold text-slate-500">Campanhas manuais enviadas pelo painel administrativo.</p></div>
				<div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-[920px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Data", "Aviso", "Público", "Audiência", "Push", "Falhas", "Enviado por"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{(campaigns.items || []).map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{formatDate(item.createdAt)}</td><td className="max-w-xs px-4 py-3"><strong className="block text-slate-950">{item.title}</strong><span className="line-clamp-2 text-xs text-slate-500">{item.message}</span></td><td className="px-4 py-3 font-bold text-slate-700">{targetLabel(item)}</td><td className="px-4 py-3 font-black">{item.audienceCount}</td><td className="px-4 py-3 font-black text-emerald-600">{item.sentDevices}/{item.selectedDevices}</td><td className="px-4 py-3 font-black text-red-600">{item.failedDevices}</td><td className="px-4 py-3 font-semibold text-slate-600">{item.createdByName}</td></tr>)}</tbody></table>{!loading && !(campaigns.items || []).length ? <p className="p-8 text-center text-sm font-semibold text-slate-500">Nenhuma campanha enviada ainda.</p> : null}</div>
				<div className="mt-4 flex items-center justify-between"><span className="text-sm font-bold text-slate-500">Página {campaigns.page || page} de {campaigns.totalPages || 1}</span><div className="flex gap-2"><button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1} className="grid size-10 place-items-center rounded-lg border border-slate-200 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft size={18} /></button><button type="button" onClick={() => setPage((current) => Math.min(current + 1, campaigns.totalPages || 1))} disabled={page >= (campaigns.totalPages || 1)} className="grid size-10 place-items-center rounded-lg border border-slate-200 disabled:opacity-40" aria-label="Próxima página"><ChevronRight size={18} /></button></div></div>
			</section>

			{confirmOpen ? <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="push-confirm-title"><section className="w-full max-w-md rounded-lg bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-black uppercase text-blue-600">Confirmar disparo</p><h2 id="push-confirm-title" className="mt-1 text-xl font-black text-slate-950">Enviar esta notificação?</h2></div><button type="button" onClick={() => setConfirmOpen(false)} disabled={sending} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={20} /></button></header><div className="space-y-4 p-5"><div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><strong className="block text-slate-950">{form.title}</strong><p className="mt-2 text-sm leading-6 text-slate-600">{form.message}</p></div><p className="text-sm font-semibold text-slate-700">Público estimado: <strong>{audience} usuário(s)</strong>.</p><div className="flex gap-3"><button type="button" onClick={() => setConfirmOpen(false)} disabled={sending} className="min-h-11 flex-1 rounded-lg border border-slate-300 font-black text-slate-700">Cancelar</button><button type="button" onClick={sendCampaign} disabled={sending} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white disabled:opacity-60">{sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}{sending ? "Enviando..." : "Enviar agora"}</button></div></div></section></div> : null}
		</div>
	);
}
