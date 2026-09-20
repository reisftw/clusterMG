import {
	CheckCircle2,
	DatabaseZap,
	Loader2,
	RefreshCw,
	Save,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import {
	buscarConfigSenior,
	DEFAULT_SENIOR_CONFIG,
	salvarConfigSenior,
	testarConexaoSenior,
} from "../services/seniorService";

function formatDateTime(value) {
	if (!value) return "Sem validação";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Sem validação";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function Field({ label, children }) {
	return (
		<label className="block text-xs font-black uppercase tracking-wide text-slate-500">
			{label}
			<div className="mt-2">{children}</div>
		</label>
	);
}

const inputClass =
	"w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";

export default function SeniorSettingsPage() {
	const [config, setConfig] = useState(DEFAULT_SENIOR_CONFIG);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [testResult, setTestResult] = useState(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			setConfig({ ...DEFAULT_SENIOR_CONFIG, ...(await buscarConfigSenior()) });
		} catch (err) {
			setError(
				err?.message ||
					"Não foi possível carregar a configuração do Senior/Sapiens.",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const update = (field, value) => {
		setConfig((current) => ({ ...current, [field]: value }));
	};

	const save = async () => {
		setSaving(true);
		setMessage("");
		setError("");
		try {
			const saved = await salvarConfigSenior(config);
			setConfig({ ...DEFAULT_SENIOR_CONFIG, ...saved });
			setMessage("Configuração Senior/Sapiens salva com sucesso.");
		} catch (err) {
			setError(
				err?.message ||
					"Não foi possível salvar a configuração Senior/Sapiens.",
			);
		} finally {
			setSaving(false);
		}
	};

	const test = async () => {
		setTesting(true);
		setMessage("");
		setError("");
		setTestResult(null);
		try {
			await salvarConfigSenior(config);
			const result = await testarConexaoSenior();
			setTestResult(result);
			setConfig({ ...DEFAULT_SENIOR_CONFIG, ...(await buscarConfigSenior()) });
			setMessage("Teste Senior/Sapiens concluído.");
		} catch (err) {
			setError(
				err?.message || "Não foi possível testar a conexão Senior/Sapiens.",
			);
		} finally {
			setTesting(false);
		}
	};

	if (loading)
		return <Spinner fullScreen={false} label="Carregando Senior/Sapiens..." />;

	return (
		<main className="space-y-5">
			<header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<DatabaseZap size={24} />
						</span>
						<div>
							<h1 className="text-2xl font-black text-slate-950">
								Senior / Sapiens
							</h1>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Pré-integração para conectar endpoints do Senior Sapiens quando
								o acesso oficial for liberado.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={load}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
						>
							<RefreshCw size={16} /> Atualizar
						</button>
						<button
							type="button"
							onClick={save}
							disabled={saving || testing}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
						>
							{saving ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<Save size={16} />
							)}{" "}
							Salvar
						</button>
						<button
							type="button"
							onClick={test}
							disabled={saving || testing}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
						>
							{testing ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<CheckCircle2 size={16} />
							)}{" "}
							Testar conexão
						</button>
					</div>
				</div>
			</header>

			{message ? (
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
					{message}
				</div>
			) : null}
			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
					{error}
				</div>
			) : null}

			<section className="grid gap-4 md:grid-cols-3">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<p className="text-xs font-black uppercase text-slate-500">Status</p>
					<p className="mt-2 text-2xl font-black text-slate-950">
						{config.enabled ? "Ativa" : "Pendente"}
					</p>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<p className="text-xs font-black uppercase text-slate-500">
						Autenticação
					</p>
					<p className="mt-2 text-2xl font-black text-slate-950">
						{config.authType || "bearer"}
					</p>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<p className="text-xs font-black uppercase text-slate-500">
						Última validação
					</p>
					<p className="mt-2 text-lg font-black text-slate-950">
						{formatDateTime(config.lastValidatedAt)}
					</p>
				</div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="grid gap-4 lg:grid-cols-2">
					<Field label="Ambiente">
						<select
							value={config.environment || "homologacao"}
							onChange={(event) => update("environment", event.target.value)}
							className={inputClass}
						>
							<option value="homologacao">Homologação</option>
							<option value="producao">Produção</option>
						</select>
					</Field>
					<Field label="Tipo de autenticação">
						<select
							value={config.authType || "bearer"}
							onChange={(event) => update("authType", event.target.value)}
							className={inputClass}
						>
							<option value="bearer">Bearer token</option>
							<option value="api-key">API key</option>
							<option value="basic">Usuário e senha</option>
							<option value="none">Sem autenticação</option>
						</select>
					</Field>
					<Field label="Base URL">
						<input
							value={config.baseUrl || ""}
							onChange={(event) => update("baseUrl", event.target.value)}
							className={inputClass}
							placeholder="https://api.senior.com.br"
						/>
					</Field>
					<Field label="Endpoint de status/teste">
						<input
							value={config.statusEndpoint || ""}
							onChange={(event) => update("statusEndpoint", event.target.value)}
							className={inputClass}
							placeholder="/health"
						/>
					</Field>
					<Field label="Token / API key">
						<input
							type="password"
							value={config.apiToken || ""}
							onChange={(event) => update("apiToken", event.target.value)}
							className={inputClass}
							placeholder={
								config.apiTokenConfigured
									? "Token configurado. Preencha apenas para trocar."
									: "Cole o token"
							}
						/>
					</Field>
					<Field label="Usuário">
						<input
							value={config.username || ""}
							onChange={(event) => update("username", event.target.value)}
							className={inputClass}
							placeholder="Usuário Senior/Sapiens"
						/>
					</Field>
					<Field label="Senha">
						<input
							type="password"
							value={config.password || ""}
							onChange={(event) => update("password", event.target.value)}
							className={inputClass}
							placeholder={
								config.passwordConfigured
									? "Senha configurada. Preencha apenas para trocar."
									: "Senha"
							}
						/>
					</Field>
					<Field label="Código da empresa">
						<input
							value={config.companyCode || ""}
							onChange={(event) => update("companyCode", event.target.value)}
							className={inputClass}
							placeholder="Código da empresa"
						/>
					</Field>
					<Field label="Tenant">
						<input
							value={config.tenant || ""}
							onChange={(event) => update("tenant", event.target.value)}
							className={inputClass}
							placeholder="Tenant, workspace ou domínio"
						/>
					</Field>
					<label className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-900">
						<input
							type="checkbox"
							checked={Boolean(config.enabled)}
							onChange={(event) => update("enabled", event.target.checked)}
							className="h-5 w-5 rounded border-slate-300 text-blue-600"
						/>
						Ativar integração Senior/Sapiens
					</label>
				</div>
				<Field label="Observações">
					<textarea
						value={config.notes || ""}
						onChange={(event) => update("notes", event.target.value)}
						rows={4}
						className={inputClass}
						placeholder="Contrato, módulos liberados, responsável técnico e endpoints combinados."
					/>
				</Field>
			</section>

			<section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm font-semibold text-blue-900">
				<div className="flex items-start gap-3">
					<ShieldCheck className="mt-0.5 shrink-0" size={20} />
					<p>
						Esta tela prepara a conexão. A leitura de dados financeiros/ERP deve
						ser ligada depois que a Brasil TecPar liberar a documentação dos
						endpoints do Senior/Sapiens.
					</p>
				</div>
				{testResult ? (
					<pre className="mt-4 max-h-52 overflow-auto rounded-xl bg-white p-3 text-xs text-slate-700">
						{JSON.stringify(testResult, null, 2)}
					</pre>
				) : null}
			</section>
		</main>
	);
}
