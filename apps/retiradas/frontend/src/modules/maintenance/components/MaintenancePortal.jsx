import {
	Activity,
	AlertTriangle,
	ArrowLeft,
	BarChart3,
	CheckCircle2,
	Clock3,
	Copy,
	Database,
	Download,
	ExternalLink,
	Gauge,
	History,
	LogOut,
	PackageCheck,
	Power,
	RefreshCw,
	Server,
	ShieldCheck,
	Smartphone,
	UploadCloud,
	Users,
	Eye,
	Wrench,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import { useAuthContext } from "../../../context/AuthContext";
import LoginForm from "../../auth/components/LoginForm";
import {
	activateMaintenance,
	deactivateMaintenance,
	getMaintenanceDashboard,
	getMaintenanceHistory,
	getMobileAppDashboard,
	uploadMobileApp,
} from "../services/maintenanceService";
import "./maintenance.css";

function dateTime(value) {
	if (!value) return "-";
	return new Date(value).toLocaleString("pt-BR", {
		day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
	});
}

function duration(seconds) {
	const value = Math.max(0, Number(seconds || 0));
	if (value < 60) return `${value}s`;
	const minutes = Math.floor(value / 60);
	if (minutes < 60) return `${minutes} min`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function number(value) {
	return Number(value || 0).toLocaleString("pt-BR");
}

function fileSize(value) {
	const bytes = Number(value || 0);
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	return `${(bytes / 1024 ** index).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[index]}`;
}

function latencyRange(totals = {}) {
	const lower = Number(totals.p95_lower_bound_ms || 0);
	const upper = Number(totals.p95_upper_bound_ms || totals.p95_ms || 0);
	if (!upper) return "0 ms";
	if (!lower || lower >= upper) return `ate ${number(upper)} ms`;
	return `${number(lower)}-${number(upper)} ms`;
}

function MetricCard({ icon: Icon, label, value, note, tone = "blue" }) {
	return (
		<article className={`maintenance-metric maintenance-metric-${tone}`}>
			<span><Icon size={21} /></span>
			<div><small>{label}</small><strong>{value}</strong><p>{note}</p></div>
		</article>
	);
}
function RequestsChart({ items = [] }) {
	const max = Math.max(1, ...items.map((item) => Number(item.requests || 0)));
	return (
		<div className="maintenance-chart" aria-label="Requisicoes por hora">
			{items.slice(-24).map((item) => {
				const height = Math.max(6, (Number(item.requests || 0) / max) * 100);
				return (
					<div key={item.bucket} className="maintenance-chart-column" title={`${dateTime(item.bucket)}: ${item.requests} requisicoes`}>
						<div className="maintenance-chart-bar" style={{ height: `${height}%` }}>
							{Number(item.errors_5xx || 0) > 0 ? <i /> : null}
						</div>
						<small>{new Date(item.bucket).toLocaleTimeString("pt-BR", { hour: "2-digit" })}</small>
					</div>
				);
			})}
			{!items.length ? <p className="maintenance-empty">Ainda nao ha amostras nesta janela.</p> : null}
		</div>
	);
}
function OverviewTab({ dashboard }) {
	const totals = dashboard?.metrics?.totals || {};
	const queries = dashboard?.metrics?.queries || {};
	const presence = dashboard?.presence || {};
	const status = dashboard?.status || {};
	const sw = dashboard?.serviceWorker || {};
	const p95Upper = Number(totals.p95_upper_bound_ms || totals.p95_ms || 0);
	const p95Tone = p95Upper > 2500 ? "red" : p95Upper > 1000 ? "orange" : "green";
	return (
		<div className="maintenance-tab-content">
			<section className="maintenance-metrics-grid">
				<MetricCard icon={Server} label="APIs online" value={`${status.summary?.online || 0}/${status.summary?.total || 0}`} note={`${status.summary?.offline || 0} indisponivel(is) · ${status.summary?.disabled || 0} opcional(is) desativada(s)`} tone={status.summary?.offline ? "red" : "green"} />
				<MetricCard icon={Users} label="Usuarios online" value={number(presence.online_users)} note="Ativos nos ultimos 5 minutos" tone="green" />
				<MetricCard icon={Eye} label="Visitas hoje" value={number(sw.visits_today)} note={`${number(sw.unique_visitors_today)} dispositivo(s) unico(s)`} tone="blue" />
				<MetricCard icon={Activity} label="Requisicoes" value={number(totals.total_requests)} note={`Ultimas ${dashboard.hours || 24} horas`} />
				<MetricCard icon={AlertTriangle} label="Erros 5xx" value={number(totals.errors_5xx)} note={`${number(totals.errors_4xx)} respostas 4xx operacionais · ${number(totals.expected_errors_4xx)} esperadas`} tone={Number(totals.errors_5xx) ? "red" : "green"} />
				<MetricCard icon={Gauge} label="Latencia p95" value={latencyRange(totals)} note={`Faixa estimada · media de ${number(totals.avg_ms)} ms`} tone={p95Tone} />
				<MetricCard icon={Database} label="Consultas SQL" value={number(queries.total_queries)} note={`${number(queries.errors)} com erro`} tone={Number(queries.errors) ? "red" : "blue"} />
				<MetricCard icon={Smartphone} label="Service worker" value={number(sw.clients)} note={`${number(sw.failures)} falha(s) critica(s) · ${number(sw.network_failures)} oscilacao(oes) de rede`} tone={Number(sw.failures) ? "red" : Number(sw.network_failures) ? "orange" : "green"} />
			</section>

			<section className="maintenance-panel maintenance-graph-panel">
				<div className="maintenance-panel-heading"><div><BarChart3 size={20} /><span><strong>Volume e quedas</strong><small>Requisicoes agrupadas por hora; marcacao vermelha indica erro 5xx.</small></span></div></div>
				<RequestsChart items={dashboard?.metrics?.timeline || []} />
			</section>

			<div className="maintenance-two-columns">
				<section className="maintenance-panel">
					<div className="maintenance-panel-heading"><div><Server size={20} /><span><strong>Servicos monitorados</strong><small>Resposta atual das integracoes e componentes internos.</small></span></div></div>
				<div className="maintenance-service-list">
					{(status.services || []).map((service) => (
						<div key={service.id}><span className={service.status === "online" ? "online" : service.status === "disabled" ? "disabled" : "offline"}>{service.status === "online" ? <CheckCircle2 size={18} /> : service.status === "disabled" ? <Clock3 size={18} /> : <XCircle size={18} />}</span><p><strong>{service.name}</strong><small>{service.status === "online" ? `${service.details?.responseMs ?? "-"} ms` : service.reason}</small></p></div>
					))}
				</div>
				</section>

				<section className="maintenance-panel">
					<div className="maintenance-panel-heading"><div><Smartphone size={20} /><span><strong>PWA e service worker</strong><small>Versoes, ativacoes e falhas de navegacao.</small></span></div></div>
				<div className="maintenance-sw-summary"><div><small>Eventos</small><strong>{number(sw.total)}</strong></div><div><small>Clientes</small><strong>{number(sw.clients)}</strong></div><div><small>Falhas criticas</small><strong>{number(sw.failures)}</strong></div></div>
				<div className="maintenance-version-list">
					{(sw.versions || []).map((item) => <div key={item.version}><code>{item.version}</code><span>{item.events} eventos</span><small>{dateTime(item.last_seen_at)}</small></div>)}
					{!(sw.versions || []).length ? <p className="maintenance-empty">A telemetria aparecera quando os PWA atualizarem.</p> : null}
				</div>
				</section>
			</div>

			<section className="maintenance-panel">
				<div className="maintenance-panel-heading"><div><Activity size={20} /><span><strong>Rotas com maior impacto</strong><small>Rotas acessadas no periodo, consolidadas sem registrar acessos individuais.</small></span></div></div>
				<div className="maintenance-table-wrap"><table><thead><tr><th>Metodo</th><th>Rota</th><th>Acessos</th><th>Media</th><th>P95</th><th>Erros 5xx</th></tr></thead><tbody>{(dashboard?.metrics?.topRoutes || []).map((item) => <tr key={`${item.method}-${item.route}`}><td><b>{item.method}</b></td><td><code>{item.route}</code></td><td>{number(item.requests)}</td><td>{number(item.avg_ms)} ms</td><td>{number(item.p95_ms)} ms</td><td className={Number(item.errors_5xx) ? "danger" : ""}>{number(item.errors_5xx)}</td></tr>)}</tbody></table>{!(dashboard?.metrics?.topRoutes || []).length ? <p className="maintenance-empty">As rotas aparecerao apos os primeiros acessos ao sistema.</p> : null}</div>
			</section>
		</div>
	);
}
function ControlTab({ state, onChanged }) {
	const [form, setForm] = useState({ message: "Estamos realizando uma manutencao programada. Voltaremos em breve.", reason: "", duration: "60", unit: "minutes", redirectEnabled: false, redirectUrl: "", confirmation: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault(); setSaving(true); setError("");
		try {
			const multiplier = form.unit === "hours" ? 60 : 1;
			await activateMaintenance({ ...form, durationMinutes: form.duration ? Number(form.duration) * multiplier : null });
			setForm((current) => ({ ...current, confirmation: "" }));
			await onChanged();
		} catch (caught) { setError(caught.message || "Nao foi possivel ativar a manutencao."); }
		finally { setSaving(false); }
	};

	const deactivate = async () => {
		setSaving(true); setError("");
		try { await deactivateMaintenance(); await onChanged(); }
		catch (caught) { setError(caught.message || "Nao foi possivel liberar o sistema."); }
		finally { setSaving(false); }
	};

	return (
		<div className="maintenance-control-grid">
			<section className={`maintenance-current-state ${state?.active ? "is-active" : ""}`}>
				<span>{state?.active ? <Wrench size={28} /> : <CheckCircle2 size={28} />}</span>
				<div><small>Estado atual</small><h2>{state?.active ? "Site em manutencao" : "Operacao liberada"}</h2><p>{state?.active ? `Ativa desde ${dateTime(state.startedAt)}` : "Todas as paginas e APIs estao disponiveis."}</p>{state?.scheduledEndAt ? <b>Retorno automatico em {dateTime(state.scheduledEndAt)}</b> : null}</div>
				{state?.active ? <button type="button" onClick={deactivate} disabled={saving}><Power size={19} />Encerrar manutencao</button> : null}
			</section>

			{!state?.active ? (
				<form className="maintenance-control-form" onSubmit={submit}>
					<div className="maintenance-form-heading"><div><Power size={22} /><span><strong>Ativar manutencao global</strong><small>Todos os acessos, exceto este painel, receberao a pagina de manutencao.</small></span></div></div>
					<label><span>Mensagem para os usuarios</span><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={3} maxLength={600} required /></label>
					<label><span>Motivo interno</span><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ex.: Atualizacao do banco e reinicio das APIs" maxLength={600} /></label>
					<div className="maintenance-duration-row"><label><span>Tempo automatico</span><input type="number" min="1" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} /></label><label><span>Unidade</span><select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}><option value="minutes">Minutos</option><option value="hours">Horas</option></select></label></div>
					<label className="maintenance-toggle"><input type="checkbox" checked={form.redirectEnabled} onChange={(event) => setForm({ ...form, redirectEnabled: event.target.checked })} /><span><b>Redirecionar usuarios</b><small>Use durante a migracao para outro dominio.</small></span></label>
					{form.redirectEnabled ? <label><span>Endereco de destino</span><div className="maintenance-input-icon"><ExternalLink size={18} /><input type="url" value={form.redirectUrl} onChange={(event) => setForm({ ...form, redirectUrl: event.target.value })} placeholder="https://novo-dominio.exemplo.com.br" required /></div></label> : null}
					<div className="maintenance-danger-zone"><AlertTriangle size={21} /><div><strong>Confirmacao obrigatoria</strong><p>Digite <b>MANUTENCAO</b> para bloquear o sistema.</p><input value={form.confirmation} onChange={(event) => setForm({ ...form, confirmation: event.target.value })} placeholder="MANUTENCAO" autoComplete="off" /></div></div>
					{error ? <p className="maintenance-form-error">{error}</p> : null}
					<button className="maintenance-activate-button" type="submit" disabled={saving || form.confirmation.trim().toUpperCase() !== "MANUTENCAO"}><Power size={20} />{saving ? "Ativando..." : "Ativar manutencao"}</button>
				</form>
			) : null}
		</div>
	);
}

function HistoryTab({ history, page, onPage }) {
	const pages = Math.max(1, Math.ceil(Number(history?.total || 0) / Number(history?.limit || 10)));
	return (
		<section className="maintenance-panel">
			<div className="maintenance-panel-heading"><div><History size={21} /><span><strong>Historico de manutencoes</strong><small>Responsavel, periodo, duracao e forma de encerramento.</small></span></div></div>
			<div className="maintenance-history-list">{(history?.items || []).map((item) => <article key={item.id}><span className={item.ended_at ? "finished" : "running"}>{item.ended_at ? <CheckCircle2 size={19} /> : <Clock3 size={19} />}</span><div><div><strong>{item.reason || "Manutencao do sistema"}</strong><small>{item.ended_at ? "Finalizada" : "Em andamento"}</small></div><p>{item.message}</p><dl><div><dt>Inicio</dt><dd>{dateTime(item.started_at)}</dd></div><div><dt>Fim</dt><dd>{dateTime(item.ended_at)}</dd></div><div><dt>Duracao</dt><dd>{item.ended_at ? duration(item.duration_seconds) : "Em andamento"}</dd></div><div><dt>Responsavel</dt><dd>{item.started_by_name || "Sistema"}</dd></div><div><dt>Encerramento</dt><dd>{item.ended_reason === "AUTO" ? "Automatico" : item.ended_reason === "MANUAL" ? "Manual" : "-"}</dd></div></dl></div></article>)}{!(history?.items || []).length ? <p className="maintenance-empty">Nenhuma manutencao registrada.</p> : null}</div>
			<div className="maintenance-pagination"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><span>Pagina {page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Proxima</button></div>
		</section>
	);
}

function AppTab() {
	const [data, setData] = useState(null);
	const [loadingApp, setLoadingApp] = useState(true);
	const [uploading, setUploading] = useState(false);
	const [message, setMessage] = useState("");
	const [copied, setCopied] = useState(false);
	const [form, setForm] = useState({ apk: null, versionName: "", versionCode: "", notes: "" });

	const loadApp = useCallback(async () => {
		setLoadingApp(true); setMessage("");
		try { setData(await getMobileAppDashboard()); }
		catch (caught) { setMessage(caught.message || "Falha ao carregar os dados do aplicativo."); }
		finally { setLoadingApp(false); }
	}, []);

	useEffect(() => { loadApp(); }, [loadApp]);

	const submit = async (event) => {
		event.preventDefault();
		if (!form.apk) { setMessage("Selecione o arquivo APK assinado."); return; }
		setUploading(true); setMessage("");
		try {
			await uploadMobileApp(form);
			setForm({ apk: null, versionName: "", versionCode: "", notes: "" });
			event.currentTarget.reset();
			setMessage("Nova versao publicada. O link de download ja foi atualizado.");
			await loadApp();
		} catch (caught) { setMessage(caught.message || "Nao foi possivel publicar o APK."); }
		finally { setUploading(false); }
	};

	if (loadingApp && !data) return <Spinner fullScreen={false} />;
	const metrics = data?.metrics || {};
	const active = data?.active;
	const officialDownloadUrl = data?.downloadUrl
		? new URL(data.downloadUrl, window.location.origin).href
		: "";
	const maxDownloads = Math.max(1, ...(data?.timeline || []).map((item) => Number(item.downloads || 0)));
	return (
		<div className="maintenance-tab-content maintenance-app-tab">
			<section className="maintenance-metrics-grid">
				<MetricCard icon={Download} label="Downloads" value={number(metrics.totalDownloads)} note={`${number(metrics.todayDownloads)} hoje`} tone="blue" />
				<MetricCard icon={Smartphone} label="Online pelo app" value={number(metrics.online_android_users)} note="Ativos nos ultimos 5 minutos" tone="green" />
				<MetricCard icon={Activity} label="GPS em tempo real" value={number(metrics.live_tracking_users)} note={`${number(metrics.enrolled_devices)} aparelho(s) ativado(s)`} tone="green" />
				<MetricCard icon={Users} label="Usuarios no app hoje" value={number(metrics.android_users_today)} note={`${number(metrics.android_sessions_today)} sessao(oes)`} tone="blue" />
				<MetricCard icon={PackageCheck} label="Versao publicada" value={active?.versionName || "Nenhuma"} note={active ? `${fileSize(active.fileSize)} · ${dateTime(active.uploadedAt)}` : "Envie o primeiro APK"} tone={active ? "green" : "orange"} />
			</section>

			<div className="maintenance-app-columns">
				<section className="maintenance-panel maintenance-app-current">
					<div className="maintenance-panel-heading"><div><Smartphone size={21} /><span><strong>Aplicativo publicado</strong><small>Este e o arquivo entregue pelo link oficial.</small></span></div></div>
					{active ? <>
						<div className="maintenance-app-version"><span><PackageCheck size={30} /></span><div><small>VERSAO ATUAL</small><h2>{active.versionName}</h2><p>Codigo {active.versionCode || "-"} · {fileSize(active.fileSize)}</p></div></div>
						<dl className="maintenance-app-details"><div><dt>SHA-256</dt><dd><code>{active.sha256}</code></dd></div><div><dt>Publicado por</dt><dd>{active.uploadedByName}</dd></div><div><dt>Ultimo download</dt><dd>{dateTime(active.lastDownloadAt)}</dd></div></dl>
						<div className="maintenance-app-share"><label htmlFor="maintenance-app-link">Link oficial para compartilhar</label><div><input id="maintenance-app-link" value={officialDownloadUrl} readOnly /><button type="button" onClick={async () => { await navigator.clipboard.writeText(officialDownloadUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }} title="Copiar link"><Copy size={17} />{copied ? "Copiado" : "Copiar"}</button></div></div>
						<a className="maintenance-app-download" href={officialDownloadUrl}><Download size={19} />Baixar APK atual</a>
					</> : <p className="maintenance-empty">Nenhum APK publicado. Use o formulario ao lado para liberar a primeira versao.</p>}
				</section>

				<form className="maintenance-panel maintenance-app-upload" onSubmit={submit}>
					<div className="maintenance-panel-heading"><div><UploadCloud size={21} /><span><strong>Publicar nova versao</strong><small>O link muda de forma atomica e a versao anterior permanece no historico.</small></span></div></div>
					<label className="maintenance-app-file"><UploadCloud size={25} /><span><b>{form.apk?.name || "Selecionar APK assinado"}</b><small>Arquivo .apk de ate 120 MB</small></span><input type="file" accept=".apk,application/vnd.android.package-archive" onChange={(event) => setForm({ ...form, apk: event.target.files?.[0] || null })} required /></label>
					<div className="maintenance-duration-row"><label><span>Versao</span><input value={form.versionName} onChange={(event) => setForm({ ...form, versionName: event.target.value })} placeholder="Ex.: 1.0.2" required /></label><label><span>Codigo</span><input type="number" min="1" value={form.versionCode} onChange={(event) => setForm({ ...form, versionCode: event.target.value })} placeholder="Ex.: 102" required /></label></div>
					<label><span>Notas da versao</span><textarea rows={3} maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Principais alteracoes desta versao" /></label>
					<button className="maintenance-app-publish" type="submit" disabled={uploading}><UploadCloud size={19} />{uploading ? "Publicando..." : "Publicar e atualizar link"}</button>
				</form>
			</div>

			{message ? <div className="maintenance-app-message">{message}</div> : null}

			<section className="maintenance-panel">
				<div className="maintenance-panel-heading"><div><BarChart3 size={21} /><span><strong>Downloads nos ultimos 14 dias</strong><small>Contagem agregada, sem armazenar IP ou historico individual.</small></span></div></div>
				<div className="maintenance-app-chart">{(data?.timeline || []).map((item) => <div key={item.day} title={`${number(item.downloads)} download(s)`}><span style={{ height: `${Math.max(4, Number(item.downloads || 0) / maxDownloads * 100)}%` }} /><small>{new Date(`${item.day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</small></div>)}</div>
			</section>

			<section className="maintenance-panel">
				<div className="maintenance-panel-heading"><div><History size={21} /><span><strong>Historico de versoes</strong><small>Auditoria das publicacoes e respectivos downloads.</small></span></div></div>
				<div className="maintenance-table-wrap"><table><thead><tr><th>Versao</th><th>Publicada em</th><th>Tamanho</th><th>Downloads</th><th>Responsavel</th><th>Estado</th></tr></thead><tbody>{(data?.releases || []).map((item) => <tr key={item.id}><td><b>{item.versionName}</b><small className="maintenance-table-note">Codigo {item.versionCode || "-"}</small></td><td>{dateTime(item.uploadedAt)}</td><td>{fileSize(item.fileSize)}</td><td>{number(item.downloadCount)}</td><td>{item.uploadedByName}</td><td><span className={item.active ? "maintenance-release-active" : "maintenance-release-old"}>{item.active ? "Atual" : "Anterior"}</span></td></tr>)}</tbody></table>{!(data?.releases || []).length ? <p className="maintenance-empty">Nenhuma versao publicada.</p> : null}</div>
			</section>
		</div>
	);
}

export default function MaintenancePortal() {
	const { currentUser, realUser, loading, signOut } = useAuthContext();
	const [dashboard, setDashboard] = useState(null);
	const [historyData, setHistoryData] = useState(null);
	const [historyPage, setHistoryPage] = useState(1);
	const [activeTab, setActiveTab] = useState("overview");
	const [hours, setHours] = useState(24);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");
	const authenticatedUser = realUser || currentUser;
	const isAdmin = String(authenticatedUser?.role || "").toLowerCase() === "admin";

	const load = useCallback(async () => {
		if (!isAdmin) return;
		setRefreshing(true); setError("");
		try { setDashboard(await getMaintenanceDashboard(hours)); }
		catch (caught) { setError(caught.message || "Falha ao carregar o painel."); }
		finally { setRefreshing(false); }
	}, [hours, isAdmin]);

	useEffect(() => { load(); }, [load]);
	useEffect(() => {
		if (!isAdmin || activeTab !== "history") return;
		getMaintenanceHistory({ page: historyPage, limit: 10 }).then(setHistoryData).catch((caught) => setError(caught.message));
	}, [activeTab, historyPage, isAdmin]);
	useEffect(() => {
		if (!isAdmin) return undefined;
		const timer = window.setInterval(load, 30_000);
		return () => window.clearInterval(timer);
	}, [isAdmin, load]);

	const tabItems = useMemo(() => [
		{ id: "overview", label: "Visao geral", icon: Activity },
		{ id: "app", label: "Aplicativo", icon: Smartphone },
		{ id: "control", label: "Controle", icon: Power },
		{ id: "history", label: "Historico", icon: History },
	], []);

	if (loading) return <Spinner fullScreen />;
	if (!currentUser) return <LoginForm redirectTo="/maintenance" />;
	if (!isAdmin) return <main className="maintenance-denied"><ShieldCheck size={42} /><h1>Acesso exclusivo para administradores</h1><p>Sua conta esta autenticada, mas nao possui o cargo Admin.</p><button type="button" onClick={signOut}><LogOut size={18} />Sair desta conta</button></main>;

	return (
		<main className="maintenance-admin-shell">
			<header className="maintenance-admin-header"><div className="maintenance-admin-brand"><span><Wrench size={24} /></span><div><strong>Central de Manutencao</strong><small>Retiradas · ambiente de producao</small></div></div><div className="maintenance-admin-actions"><span className={dashboard?.state?.active ? "maintenance-status-live" : "maintenance-status-ok"}><i />{dashboard?.state?.active ? "Em manutencao" : "Sistema online"}</span><Link to="/"><ArrowLeft size={18} />Voltar ao sistema</Link><button type="button" onClick={signOut} title="Sair"><LogOut size={19} /></button></div></header>
			<div className="maintenance-admin-body">
				<section className="maintenance-admin-title"><div><small>OPERACAO E CONFIABILIDADE</small><h1>Saude do sistema</h1><p>Acompanhe APIs, banco, PWA, quedas e janelas de manutencao em um unico lugar.</p></div><div className="maintenance-filter"><select value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={6}>Ultimas 6 horas</option><option value={24}>Ultimas 24 horas</option><option value={168}>Ultimos 7 dias</option><option value={720}>Ultimos 30 dias</option></select><button type="button" onClick={load} disabled={refreshing}><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button></div></section>
				<nav className="maintenance-tabs">{tabItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon size={18} />{label}</button>)}</nav>
				{error ? <div className="maintenance-admin-error"><AlertTriangle size={18} />{error}</div> : null}
				{!dashboard && refreshing ? <Spinner fullScreen={false} /> : null}
				{dashboard && activeTab === "overview" ? <OverviewTab dashboard={dashboard} /> : null}
				{dashboard && activeTab === "control" ? <ControlTab state={dashboard.state} onChanged={load} /> : null}
				{activeTab === "app" ? <AppTab /> : null}
				{activeTab === "history" ? <HistoryTab history={historyData || dashboard?.history} page={historyPage} onPage={setHistoryPage} /> : null}
			</div>
	</main>
	);
}

