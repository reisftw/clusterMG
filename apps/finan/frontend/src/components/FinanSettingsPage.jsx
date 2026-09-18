import {
	Activity,
	Bell,
	Cable,
	Database,
	Mail,
	RefreshCw,
	Save,
	Settings,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
	fetchFinanAuditLogs,
	fetchFinanDatabaseStatus,
	fetchFinanIntegration,
	fetchFinanIntegrations,
	fetchFinanSettingSection,
	fetchFinanSettingsSummary,
	saveFinanIntegration,
	saveFinanSettingSection,
} from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";

const sectionMeta = {
	geral: {
		title: "Geral",
		description: "Identidade, URL pública e parâmetros principais do Finan.",
		icon: Settings,
	},
	notificacoes: {
		title: "Notificações",
		description: "Alertas operacionais, importações, backups e falhas de API.",
		icon: Bell,
	},
	integracoes: {
		title: "Integrações APIs",
		description: "Hubsoft, Cvortex, Sênior e Playground dedicados ao financeiro.",
		icon: Cable,
	},
	hubsoft: {
		title: "Hubsoft",
		description: "Credenciais e endpoint financeiro para integração Hubsoft.",
		icon: Cable,
		provider: "hubsoft",
	},
	cvortex: {
		title: "Cvortex",
		description: "Credenciais e endpoint financeiro para integração Cvortex.",
		icon: Cable,
		provider: "cvortex",
	},
	senior: {
		title: "Sênior",
		description: "Credenciais e endpoint financeiro para integração Sênior.",
		icon: Cable,
		provider: "senior",
	},
	banco: {
		title: "Banco de dados",
		description: "Leitura do banco dedicado, tabelas financeiras e backup.",
		icon: Database,
	},
	email: {
		title: "E-mail",
		description: "Configuração de envio de e-mails e MFA do Finan.",
		icon: Mail,
	},
	auditoria: {
		title: "Logs de auditoria",
		description: "Eventos de configuração, integrações e administração.",
		icon: Activity,
	},
};

const configLinks = [
	["Geral", FINAN_ROUTES.CONFIGURACAO_GERAL],
	["Notificações", FINAN_ROUTES.CONFIG_NOTIFICACOES],
	["Usuários", FINAN_ROUTES.CONFIG_USUARIOS],
	["Cargos e Permissões", FINAN_ROUTES.CONFIG_CARGOS_PERMISSOES],
	["Integrações APIs", FINAN_ROUTES.CONFIG_INTEGRACOES_APIS],
	["Hubsoft", FINAN_ROUTES.CONFIG_HUBSOFT],
	["Cvortex", FINAN_ROUTES.CONFIG_CVORTEX],
	["Sênior", FINAN_ROUTES.CONFIG_SENIOR],
	["Banco de dados", FINAN_ROUTES.CONFIG_BANCO_DADOS],
	["E-mail", FINAN_ROUTES.CONFIG_EMAIL],
	["Logs de auditoria", FINAN_ROUTES.CONFIG_LOGS_AUDITORIA],
];

export default function FinanSettingsPage({ section = "geral" }) {
	const meta = sectionMeta[section] || sectionMeta.geral;
	const Icon = meta.icon;

	return (
		<section>
			<div className="finan-page-title">
				<div>
					<h1>Configurações gerais</h1>
					<p>{meta.description}</p>
				</div>
				<span>Dados dedicados</span>
			</div>

			<div className="finan-config-layout">
				<aside className="finan-config-sidebar">
					{configLinks.map(([label, path]) => (
						<Link
							key={path}
							to={path}
							className={
								isActiveConfigLink(section, path)
									? "finan-config-link is-active"
									: "finan-config-link"
							}
						>
							{label}
						</Link>
					))}
				</aside>
				<div className="finan-work-card finan-config-panel">
					<div className="finan-card-heading">
						<div>
							<Icon size={20} />
						</div>
						<div>
							<h2>{meta.title}</h2>
							<p>{meta.description}</p>
						</div>
					</div>
					{section === "geral" ? <GeneralSection /> : null}
					{section === "notificacoes" ? <SettingsForm section="notificacoes" /> : null}
					{section === "integracoes" ? <IntegrationsSection /> : null}
					{meta.provider ? <IntegrationProvider provider={meta.provider} /> : null}
					{section === "banco" ? <DatabaseSection /> : null}
					{section === "email" ? <SettingsForm section="email" /> : null}
					{section === "auditoria" ? <AuditSection /> : null}
				</div>
			</div>
		</section>
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
		<div className="finan-section-stack">
			<SettingsForm section="geral" />
			<div className="finan-subpanel">
				<div className="finan-section-toolbar">
					<h3>Resumo do ambiente</h3>
					<button type="button" className="finan-ghost-button" onClick={load}>
						<RefreshCw size={16} />
						Atualizar
					</button>
				</div>
				{loading ? (
					<p>Carregando...</p>
				) : error ? (
					<p className="finan-muted-warning">{error}</p>
				) : (
					<div className="finan-snapshot-grid">
						<Metric label="Usuários" value={summary?.users || 0} />
						<Metric label="Cargos" value={summary?.roles || 0} />
						<Metric label="Integrações" value={summary?.integrations?.total || 0} />
						<Metric label="Logs" value={summary?.auditLogs || 0} />
						<Metric label="Linhas importadas" value={(summary?.migration?.linhas || 0).toLocaleString("pt-BR")} />
						<Metric label="Movimentos" value={(summary?.budget?.movimentos || 0).toLocaleString("pt-BR")} />
					</div>
				)}
			</div>
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

	if (loading) return <p>Carregando configuração...</p>;

	return (
		<div className="finan-form-grid">
			{fields.map((field) => (
				<label key={field.key} className="finan-form-field">
					<span>{field.label}</span>
					{field.type === "checkbox" ? (
						<input
							type="checkbox"
							checked={Boolean(value[field.key])}
							onChange={(event) =>
								setValue((current) => ({ ...current, [field.key]: event.target.checked }))
							}
						/>
					) : (
						<input
							type={field.type || "text"}
							value={value[field.key] || ""}
							onChange={(event) =>
								setValue((current) => ({ ...current, [field.key]: event.target.value }))
							}
						/>
					)}
				</label>
			))}
			<div className="finan-form-actions">
				<button type="button" className="finan-primary-button" onClick={save} disabled={saving}>
					<Save size={16} />
					{saving ? "Salvando..." : "Salvar"}
				</button>
				{message ? <p>{message}</p> : null}
			</div>
		</div>
	);
}

function IntegrationsSection() {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

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

	useEffect(() => {
		load();
	}, []);

	if (loading) return <p>Carregando integrações...</p>;
	if (error) return <p className="finan-muted-warning">{error}</p>;

	return (
		<div className="finan-settings-grid">
			{items.map((item) => (
				<Link
					key={item.id}
					to={providerRoute(item.provider || item.id)}
					className="finan-setting-card finan-setting-link-card"
				>
					<div>
						<Cable size={20} />
					</div>
					<h2>{item.name}</h2>
					<p>Status: {item.status || "planejado"}</p>
				</Link>
			))}
		</div>
	);
}

function IntegrationProvider({ provider }) {
	const [state, setState] = useState({
		name: provider,
		status: "planejado",
		config: {},
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		let active = true;
		setLoading(true);
		setMessage("");
		fetchFinanIntegration(provider)
			.then((data) => {
				if (active) setState(data);
			})
			.catch((err) => {
				if (active) setMessage(err?.message || "Não foi possível carregar integração.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [provider]);

	const config = state.config || {};
	const save = async () => {
		setSaving(true);
		setMessage("");
		try {
			const saved = await saveFinanIntegration(provider, state);
			setState(saved);
			setMessage("Integração salva no banco dedicado do Finan.");
		} catch (err) {
			setMessage(err?.message || "Não foi possível salvar integração.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <p>Carregando integração...</p>;

	return (
		<div className="finan-form-grid">
			<label className="finan-form-field">
				<span>Nome</span>
				<input
					value={state.name || ""}
					onChange={(event) => setState((current) => ({ ...current, name: event.target.value }))}
				/>
			</label>
			<label className="finan-form-field">
				<span>Status</span>
				<select
					value={state.status || "planejado"}
					onChange={(event) => setState((current) => ({ ...current, status: event.target.value }))}
				>
					<option value="planejado">Planejado</option>
					<option value="ativo">Ativo</option>
					<option value="pausado">Pausado</option>
					<option value="erro">Erro</option>
				</select>
			</label>
			{["baseUrl", "clientId", "token", "secret"].map((key) => (
				<label key={key} className="finan-form-field">
					<span>{fieldLabel(key)}</span>
					<input
						type={["token", "secret"].includes(key) ? "password" : "text"}
						value={config[key] || ""}
						onChange={(event) =>
							setState((current) => ({
								...current,
								config: { ...(current.config || {}), [key]: event.target.value },
							}))
						}
					/>
				</label>
			))}
			<div className="finan-form-actions">
				<button type="button" className="finan-primary-button" onClick={save} disabled={saving}>
					<Save size={16} />
					{saving ? "Salvando..." : "Salvar integração"}
				</button>
				{message ? <p>{message}</p> : null}
			</div>
		</div>
	);
}

function DatabaseSection() {
	const [data, setData] = useState({ database: {}, tables: [] });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setData(await fetchFinanDatabaseStatus());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar banco de dados.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	if (loading) return <p>Carregando banco de dados...</p>;
	if (error) return <p className="finan-muted-warning">{error}</p>;

	return (
		<div className="finan-section-stack">
			<div className="finan-snapshot-grid">
				<Metric label="Banco" value={data.database?.database_name || "finan"} />
				<Metric label="Tamanho" value={formatBytes(data.database?.bytes || 0)} />
				<Metric label="Tabelas Finan" value={data.tables?.length || 0} />
			</div>
			<div className="finan-table-wrap">
				<table className="finan-data-table">
					<thead>
						<tr>
							<th>Tabela</th>
							<th>Linhas estimadas</th>
						</tr>
					</thead>
					<tbody>
						{(data.tables || []).map((table) => (
							<tr key={table.table_name}>
								<td>{table.table_name}</td>
								<td>{Number(table.estimated_rows || 0).toLocaleString("pt-BR")}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function AuditSection() {
	const [logs, setLogs] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		fetchFinanAuditLogs()
			.then(setLogs)
			.catch((err) => setError(err?.message || "Não foi possível carregar auditoria."))
			.finally(() => setLoading(false));
	}, []);

	if (loading) return <p>Carregando auditoria...</p>;
	if (error) return <p className="finan-muted-warning">{error}</p>;

	return (
		<div className="finan-table-wrap">
			<table className="finan-data-table">
				<thead>
					<tr>
						<th>Data</th>
						<th>Ação</th>
						<th>Entidade</th>
						<th>Referência</th>
					</tr>
				</thead>
				<tbody>
					{logs.map((log) => (
						<tr key={log.id}>
							<td>{new Date(log.created_at).toLocaleString("pt-BR")}</td>
							<td>{log.action}</td>
							<td>{log.entity}</td>
							<td>{log.entity_id || "-"}</td>
						</tr>
					))}
					{logs.length === 0 ? (
						<tr>
							<td colSpan="4">Nenhum log encontrado.</td>
						</tr>
					) : null}
				</tbody>
			</table>
		</div>
	);
}

function Metric({ label, value }) {
	return (
		<div className="finan-snapshot-metric">
			<span>{label}</span>
			<strong>{value}</strong>
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
	if (section === "email") {
		return [
			{ key: "mode", label: "Modo" },
			{ key: "from", label: "Remetente" },
			{ key: "replyTo", label: "Responder para" },
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

function isActiveConfigLink(section, path) {
	const map = {
		geral: FINAN_ROUTES.CONFIGURACAO_GERAL,
		notificacoes: FINAN_ROUTES.CONFIG_NOTIFICACOES,
		integracoes: FINAN_ROUTES.CONFIG_INTEGRACOES_APIS,
		hubsoft: FINAN_ROUTES.CONFIG_HUBSOFT,
		cvortex: FINAN_ROUTES.CONFIG_CVORTEX,
		senior: FINAN_ROUTES.CONFIG_SENIOR,
		banco: FINAN_ROUTES.CONFIG_BANCO_DADOS,
		email: FINAN_ROUTES.CONFIG_EMAIL,
		auditoria: FINAN_ROUTES.CONFIG_LOGS_AUDITORIA,
	};
	return map[section] === path;
}

function fieldLabel(key) {
	const labels = {
		baseUrl: "URL base",
		clientId: "Client ID",
		token: "Token",
		secret: "Secret",
	};
	return labels[key] || key;
}

function formatBytes(bytes) {
	const value = Number(bytes || 0);
	if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
	if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
	if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
	return `${value} B`;
}
