// Replica visual de src/modules/hubsoft/components/HubsoftSettingsPage.jsx
// do Retiradas, sem a parte de sincronizacao de O.S./Mapa/Match (sem
// equivalente no dominio do Finan) — mantem credenciais OAuth e teste de
// conexao real (POST /integracoes/hubsoft/test, OAuth password grant de
// verdade contra o Hubsoft).
import { CheckCircle2, Loader2, PlugZap, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanIntegration, saveFinanIntegration, testFinanIntegration } from "../api/finanApi";

function formatDateTime(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const fieldClass =
	"mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50";

export default function FinanHubsoftSettingsPage() {
	const [state, setState] = useState({ status: "planejado", config: {} });
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");
	const [testResult, setTestResult] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setState(await fetchFinanIntegration("hubsoft"));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a configuração do Hubsoft.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const config = state.config || {};
	const updateConfig = (field, value) => {
		setState((current) => ({ ...current, config: { ...(current.config || {}), [field]: value } }));
	};

	const handleSave = async () => {
		setSaving(true);
		setError("");
		setFeedback("");
		try {
			const saved = await saveFinanIntegration("hubsoft", state);
			setState(saved);
			setFeedback("Configuração do Hubsoft salva com sucesso.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a configuração.");
		} finally {
			setSaving(false);
		}
	};

	const handleTest = async () => {
		setTesting(true);
		setError("");
		setFeedback("");
		setTestResult(null);
		try {
			await saveFinanIntegration("hubsoft", state);
			const result = await testFinanIntegration("hubsoft");
			setTestResult(result);
			setFeedback("Conexão Hubsoft validada. Token gerado e armazenado para uso do backend.");
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível validar a conexão Hubsoft.");
		} finally {
			setTesting(false);
		}
	};

	if (loading) {
		return <p className="text-sm font-semibold text-slate-500">Carregando Hubsoft...</p>;
	}

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
							<PlugZap size={24} />
						</div>
						<div>
							<h2 className="text-2xl font-black text-slate-950">Hubsoft</h2>
							<p className="text-sm font-semibold text-slate-500">Configure o endpoint e valide o OAuth do Hubsoft para o Finan.</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={load}
							disabled={saving || testing}
							className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
						>
							<RefreshCw size={17} /> Atualizar
						</button>
						<button
							type="button"
							onClick={handleSave}
							disabled={saving || testing}
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
						>
							{saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Salvar
						</button>
					</div>
				</div>
			</section>

			{feedback ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-800">{feedback}</div> : null}
			{error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">{error}</div> : null}

			<section className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
					<p className="text-xs font-black uppercase text-emerald-700">Status</p>
					<p className="mt-2 text-lg font-black text-emerald-950">{state.status === "ativo" ? "Ativa" : "Pendente"}</p>
				</div>
				<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
					<p className="text-xs font-black uppercase text-blue-700">Token</p>
					<p className="mt-2 text-lg font-black text-blue-950">{config.accessTokenConfigured || config.accessToken ? "Armazenado" : "Ausente"}</p>
					<p className="mt-1 text-xs font-semibold text-blue-700">Expira em: {formatDateTime(config.tokenExpiresAt)}</p>
				</div>
				<div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
					<p className="text-xs font-black uppercase text-orange-700">Última validação</p>
					<p className="mt-2 text-lg font-black text-orange-950">{formatDateTime(config.lastValidatedAt)}</p>
					<p className="mt-1 text-xs font-semibold text-orange-700">{config.lastError ? `Erro: ${config.lastError}` : "Sem erro registrado"}</p>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-5 flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
						<ShieldCheck size={21} />
					</div>
					<div>
						<h3 className="text-lg font-black text-slate-950">Credenciais OAuth</h3>
						<p className="text-sm font-semibold text-slate-500">O backend usa essas credenciais para gerar o Bearer token. Segredos salvos não são exibidos novamente.</p>
					</div>
				</div>

				<div className="grid gap-4 lg:grid-cols-2">
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Base URL</span>
						<input value={config.baseUrl || ""} onChange={(e) => updateConfig("baseUrl", e.target.value)} placeholder="https://seu-hubsoft.com.br" className={fieldClass} />
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Grant type</span>
						<input value={config.grantType || "password"} onChange={(e) => updateConfig("grantType", e.target.value)} className={fieldClass} />
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Client ID</span>
						<input value={config.clientId || ""} onChange={(e) => updateConfig("clientId", e.target.value)} className={fieldClass} />
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Client Secret {config.clientSecretConfigured ? "(já configurado)" : ""}</span>
						<input
							type="password"
							value={config.clientSecret || ""}
							onChange={(e) => updateConfig("clientSecret", e.target.value)}
							placeholder={config.clientSecretConfigured ? "Deixe em branco para manter" : ""}
							className={fieldClass}
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Usuário API</span>
						<input value={config.username || ""} onChange={(e) => updateConfig("username", e.target.value)} className={fieldClass} />
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Senha API {config.passwordConfigured ? "(já configurada)" : ""}</span>
						<input
							type="password"
							value={config.password || ""}
							onChange={(e) => updateConfig("password", e.target.value)}
							placeholder={config.passwordConfigured ? "Deixe em branco para manter" : ""}
							className={fieldClass}
						/>
					</label>
				</div>

				<div className="mt-5 flex flex-wrap gap-3">
					<label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
						<input type="checkbox" checked={state.status === "ativo"} onChange={(e) => setState((current) => ({ ...current, status: e.target.checked ? "ativo" : "planejado" }))} className="h-4 w-4" />
						Integração habilitada
					</label>
					<button
						type="button"
						onClick={handleTest}
						disabled={saving || testing}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
					>
						{testing ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} Testar conexão
					</button>
				</div>

				{testResult ? (
					<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
						Token válido. Expira em {formatDateTime(testResult.tokenExpiresAt)}.
					</div>
				) : null}
			</section>
		</div>
	);
}
