import {
	Activity,
	Bell,
	Cable,
	CheckCircle2,
	Database,
	Loader2,
	Mail,
	RefreshCw,
	Save,
	Settings,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
	fetchFinanIntegrations,
	fetchFinanSettingSection,
	fetchFinanSettingsSummary,
	saveFinanSettingSection,
	testFinanIntegration,
} from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";
import FinanAuditLogsSection from "./FinanAuditLogsSection";
import FinanCvortexSettingsPage from "./FinanCvortexSettingsPage";
import FinanDatabaseBackupsSection from "./FinanDatabaseBackupsSection";
import FinanEmailSettingsSection from "./FinanEmailSettingsSection";
import FinanHubsoftSettingsPage from "./FinanHubsoftSettingsPage";
import FinanNotificationPreferencesSection from "./FinanNotificationPreferencesSection";
import FinanSeniorSettingsPage from "./FinanSeniorSettingsPage";

const sectionMeta = {
	geral: {
		title: "Configurações Gerais",
		eyebrow: "Sistema",
		description: "Identidade, URL pública e parâmetros principais do Finan.",
		icon: Settings,
	},
	notificacoes: {
		title: "Notificações",
		eyebrow: "Sistema",
		description: "Alertas operacionais, importações, backups e falhas de API.",
		icon: Bell,
	},
	integracoes: {
		title: "Integrações APIs",
		eyebrow: "Integrações",
		description: "Hubsoft, Cvortex, Sênior e Playground dedicados ao financeiro.",
		icon: Cable,
	},
	hubsoft: {
		title: "Hubsoft",
		eyebrow: "Integrações",
		description: "Credenciais e endpoint financeiro para integração Hubsoft.",
		icon: Cable,
		provider: "hubsoft",
	},
	cvortex: {
		title: "Cvortex",
		eyebrow: "Integrações",
		description: "Credenciais e endpoint financeiro para integração Cvortex.",
		icon: Cable,
		provider: "cvortex",
	},
	senior: {
		title: "Sênior",
		eyebrow: "Integrações",
		description: "Credenciais e endpoint financeiro para integração Sênior.",
		icon: Cable,
		provider: "senior",
	},
	banco: {
		title: "Banco de dados",
		eyebrow: "Sistema",
		description: "Leitura do banco dedicado, tabelas financeiras e backup.",
		icon: Database,
	},
	email: {
		title: "E-mail",
		eyebrow: "Sistema",
		description: "Configuração de envio de e-mails e MFA do Finan.",
		icon: Mail,
	},
	auditoria: {
		title: "Logs de auditoria",
		eyebrow: "Segurança e acesso",
		description: "Eventos de configuração, integrações e administração.",
		icon: Activity,
	},
};

export default function FinanSettingsPage({ section = "geral" }) {
	const meta = sectionMeta[section] || sectionMeta.geral;
	const Icon = meta.icon;

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex items-start gap-4">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<Icon size={24} />
					</span>
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
							{meta.eyebrow}
						</p>
						<h1 className="mt-1 text-2xl font-black text-slate-950">
							{meta.title}
						</h1>
						<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
							{meta.description}
						</p>
					</div>
				</div>
			</header>

			{section === "geral" ? <GeneralSection /> : null}
			{section === "notificacoes" ? <FinanNotificationPreferencesSection /> : null}
			{section === "integracoes" ? <IntegrationsSection /> : null}
			{section === "hubsoft" ? <FinanHubsoftSettingsPage /> : null}
			{section === "cvortex" ? <FinanCvortexSettingsPage /> : null}
			{section === "senior" ? <FinanSeniorSettingsPage /> : null}
			{section === "banco" ? <FinanDatabaseBackupsSection /> : null}
			{section === "email" ? <FinanEmailSettingsSection /> : null}
			{section === "auditoria" ? <FinanAuditLogsSection /> : null}
		</div>
	);
}

function GeneralSection() {
	const [summary, setSummary] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setSummary(await fetchFinanSettingsSummary());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o resumo.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<SettingsForm section="geral" />
			</section>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
						Resumo do ambiente
					</h3>
					<button
						type="button"
						onClick={load}
						className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={14} />
						Atualizar
					</button>
				</div>
				{loading ? (
					<p className="mt-4 text-sm font-semibold text-slate-500">
						Carregando...
					</p>
				) : null}
				{error ? (
					<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
						{error}
					</div>
				) : null}
				{!loading && !error ? (
					<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						<Metric label="Usuários" value={summary?.users || 0} />
						<Metric label="Cargos" value={summary?.roles || 0} />
						<Metric
							label="Integrações"
							value={summary?.integrations?.total || 0}
						/>
						<Metric label="Logs" value={summary?.auditLogs || 0} />
						<Metric
							label="Linhas importadas"
							value={(summary?.migration?.linhas || 0).toLocaleString("pt-BR")}
						/>
						<Metric
							label="Movimentos"
							value={(summary?.budget?.movimentos || 0).toLocaleString("pt-BR")}
						/>
					</div>
				) : null}
			</section>
		</div>
	);
}

function SettingsForm({ section }) {
	const [value, setValue] = useState({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		let active = true;
		setLoading(true);
		setMessage("");
		fetchFinanSettingSection(section)
			.then((data) => {
				if (!active) return;
				setValue(data.value || {});
			})
			.catch((err) => {
				if (active) setMessage(err?.message || "Não foi possível carregar.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [section]);

	const fields = useMemo(() => settingFields(section), [section]);

	const save = async () => {
		setSaving(true);
		setMessage("");
		try {
			await saveFinanSettingSection(section, value);
			setMessage("Configuração salva no banco dedicado do Finan.");
		} catch (err) {
			setMessage(err?.message || "Não foi possível salvar.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<p className="text-sm font-semibold text-slate-500">
				Carregando configuração...
			</p>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{fields.map((field) => (
				<label
					key={field.key}
					className={field.type === "checkbox" ? "sm:col-span-2" : ""}
				>
					{field.type === "checkbox" ? (
						<span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
							<input
								type="checkbox"
								checked={Boolean(value[field.key])}
								onChange={(event) =>
									setValue((current) => ({
										...current,
										[field.key]: event.target.checked,
									}))
								}
								className="h-5 w-5 accent-blue-600"
							/>
							{field.label}
						</span>
					) : (
						<>
							<span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
								{field.label}
							</span>
							<input
								type={field.type || "text"}
								value={value[field.key] || ""}
								onChange={(event) =>
									setValue((current) => ({
										...current,
										[field.key]: event.target.value,
									}))
								}
								className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
							/>
						</>
					)}
				</label>
			))}
			<div className="flex items-center gap-3 sm:col-span-2">
				<button
					type="button"
					onClick={save}
					disabled={saving}
					className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
				>
					<Save size={16} />
					{saving ? "Salvando..." : "Salvar"}
				</button>
				{message ? (
					<p className="text-sm font-bold text-slate-600">{message}</p>
				) : null}
			</div>
		</div>
	);
}

const INTEGRATION_STATUS_META = {
	ativo: { label: "Ok", icon: CheckCircle2, className: "border-green-200 bg-green-50 text-green-700" },
	erro: { label: "Erro", icon: XCircle, className: "border-red-200 bg-red-50 text-red-600" },
};

// Rotas dedicadas so existem pra Hubsoft/Cvortex/Sênior — providers sem
// pagina propria (ex.: BrasilAPI, que nao tem credencial nenhuma pra
// configurar) ganham um botao "Testar conexao" direto no card, em vez de
// navegar pra algum lugar.
const DEDICATED_PROVIDERS = new Set(["hubsoft", "cvortex", "senior"]);

function IntegrationsSection() {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [testingProvider, setTestingProvider] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchFinanIntegrations());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar integrações.");
		} finally {
			setLoading(false);
		}
	};

	const handleTest = async (provider) => {
		setTestingProvider(provider);
		try {
			await testFinanIntegration(provider);
		} catch {
			// O status (ativo/erro) ja fica salvo no backend mesmo em falha —
			// so recarrega a lista abaixo pra refletir o resultado no card.
		} finally {
			setTestingProvider(null);
			await load();
		}
	};

	useEffect(() => {
		load();
	}, []);

	if (loading) {
		return (
			<p className="text-sm font-semibold text-slate-500">
				Carregando integrações...
			</p>
		);
	}
	if (error) {
		return (
			<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
				{error}
			</div>
		);
	}

	const activeCount = items.filter((item) => item.status === "ativo").length;

	return (
		<div className="space-y-5">
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="rounded-lg border border-slate-100 bg-white px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Integrações</p>
					<p className="mt-1 text-2xl font-black text-slate-900">{items.length}</p>
				</div>
				<div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-green-600">Ativas</p>
					<p className="mt-1 text-2xl font-black text-green-800">{activeCount}</p>
				</div>
				<div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Central de integrações</p>
					<p className="mt-1 text-sm font-black text-blue-900">Hubsoft, Cvortex e Sênior fixos</p>
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{items.map((item) => {
					const statusMeta = INTEGRATION_STATUS_META[item.status] || {
						label: "Não testada",
						icon: Cable,
						className: "border-gray-200 bg-gray-50 text-gray-500",
					};
					const StatusIcon = statusMeta.icon;
					const provider = item.provider || item.id;
					const dedicated = DEDICATED_PROVIDERS.has(provider);
					const cardHeader = (
						<div className="flex items-start justify-between gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
								<Cable size={20} />
							</div>
							<span
								className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusMeta.className}`}
							>
								<StatusIcon size={13} />
								{statusMeta.label}
							</span>
						</div>
					);
					if (dedicated) {
						return (
							<Link
								key={item.id}
								to={providerRoute(provider)}
								className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
							>
								{cardHeader}
								<h2 className="mt-3 text-base font-black text-slate-950">{item.name}</h2>
								<p className="mt-1 text-sm font-semibold text-slate-500">Provedor: {provider}</p>
							</Link>
						);
					}
					return (
						<div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							{cardHeader}
							<h2 className="mt-3 text-base font-black text-slate-950">{item.name}</h2>
							<p className="mt-1 text-sm font-semibold text-slate-500">Provedor: {provider}</p>
							<button
								type="button"
								onClick={() => handleTest(provider)}
								disabled={testingProvider === provider}
								className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
							>
								{testingProvider === provider ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
								Testar conexão
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function Metric({ label, value }) {
	return (
		<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
			<span className="block text-xs font-black uppercase tracking-wide text-slate-500">
				{label}
			</span>
			<strong className="mt-2 block text-2xl font-black text-slate-950">
				{value}
			</strong>
		</div>
	);
}

function settingFields(section) {
	if (section === "notificacoes") {
		return [
			{ key: "criticalAlerts", label: "Alertas críticos", type: "checkbox" },
			{ key: "importFinished", label: "Importação concluída", type: "checkbox" },
			{ key: "backupFailures", label: "Falhas de backup", type: "checkbox" },
			{ key: "apiFailures", label: "Falhas de API", type: "checkbox" },
		];
	}
	return [
		{ key: "appName", label: "Nome do sistema" },
		{ key: "publicUrl", label: "URL pública" },
		{ key: "timezone", label: "Fuso horário" },
	];
}

function providerRoute(provider) {
	const routes = {
		hubsoft: FINAN_ROUTES.CONFIG_HUBSOFT,
		cvortex: FINAN_ROUTES.CONFIG_CVORTEX,
		senior: FINAN_ROUTES.CONFIG_SENIOR,
		playground: FINAN_ROUTES.CONFIG_INTEGRACOES_APIS,
	};
	return routes[provider] || FINAN_ROUTES.CONFIG_INTEGRACOES_APIS;
}

