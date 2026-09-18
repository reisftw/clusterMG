import {
	CheckCircle2,
	DatabaseZap,
	Loader2,
	PlugZap,
	RefreshCw,
	Save,
	Search,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import {
	associarHubsoft,
	buscarConfigHubsoft,
	buscarHistoricoSyncHubsoft,
	buscarJobSyncHubsoft,
	consultarOrdensHubsoft,
	DEFAULT_HUBSOFT_CONFIG,
	iniciarSyncHubsoft,
	salvarConfigHubsoft,
	testarConexaoHubsoft,
} from "../services/hubsoftService";

const SEARCH_TYPES = [
	{ value: "codigo_cliente", label: "Código do cliente" },
	{ value: "cpf_cnpj", label: "CPF/CNPJ" },
	{ value: "id_cliente_servico", label: "ID cliente serviço" },
	{ value: "numero_ordem_servico", label: "Número da O.S." },
];
const SYNC_STATUSES = [
	{ value: "pendente", label: "Pendente" },
	{ value: "aguardando_agendamento", label: "Aguardando agendamento" },
	{ value: "finalizado", label: "Finalizado" },
];
const SYNC_FONTES = [
	{ value: "sempre", label: "Sempre" },
	{ value: "onnet", label: "Onnet" },
];
const JOB_POLL_MS = 1500;

function formatDateTime(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function safePreview(payload) {
	if (!payload) return "";
	try {
		return JSON.stringify(payload, null, 2).slice(0, 6000);
	} catch {
		return String(payload).slice(0, 6000);
	}
}

function HubsoftHeader({ onRefresh, onSave, saving, testing, associating }) {
	const busy = saving || testing || associating;
	return (
		<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
						<PlugZap size={24} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Hubsoft</h1>
						<p className="text-sm font-semibold text-slate-500">
							Configure o endpoint, valide o OAuth e prepare a leitura das O.S.
							direto do Hubsoft.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={onRefresh}
						disabled={busy}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
					>
						<RefreshCw size={17} /> Atualizar
					</button>
					<button
						type="button"
						onClick={onSave}
						disabled={busy}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
					>
						{saving ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Save size={17} />
						)}{" "}
						Salvar
					</button>
				</div>
			</div>
		</section>
	);
}

function HubsoftFeedback({ feedback, error }) {
	return (
		<>
			{feedback ? (
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-800">
					{feedback}
				</div>
			) : null}
			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">
					{error}
				</div>
			) : null}
		</>
	);
}

function resolveHubsoftStatusLabel(config) {
	if (config.useHubsoftAsSource) return "Associado";
	return config.enabled ? "Configurado" : "Pendente";
}

function HubsoftStatusCards({ config }) {
	return (
		<section className="grid gap-4 lg:grid-cols-3">
			<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
				<p className="text-xs font-black uppercase text-emerald-700">Status</p>
				<p className="mt-2 text-lg font-black text-emerald-950">
					{resolveHubsoftStatusLabel(config)}
				</p>
				<p className="mt-1 text-xs font-semibold text-emerald-700">
					Origem Hubsoft: {config.useHubsoftAsSource ? "ativa" : "não ativa"}
				</p>
			</div>
			<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
				<p className="text-xs font-black uppercase text-blue-700">Token</p>
				<p className="mt-2 text-lg font-black text-blue-950">
					{config.accessTokenConfigured ? "Armazenado" : "Ausente"}
				</p>
				<p className="mt-1 text-xs font-semibold text-blue-700">
					Expira em: {formatDateTime(config.tokenExpiresAt)}
				</p>
			</div>
			<div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
				<p className="text-xs font-black uppercase text-orange-700">
					Última validação
				</p>
				<p className="mt-2 text-lg font-black text-orange-950">
					{formatDateTime(config.lastValidatedAt)}
				</p>
				<p className="mt-1 text-xs font-semibold text-orange-700">
					{config.lastError
						? `Erro: ${config.lastError}`
						: "Sem erro registrado"}
				</p>
			</div>
		</section>
	);
}

export default function HubsoftSettingsPage() {
	const [config, setConfig] = useState(DEFAULT_HUBSOFT_CONFIG);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [associating, setAssociating] = useState(false);
	const [searching, setSearching] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");
	const [testResult, setTestResult] = useState(null);
	const [syncJob, setSyncJob] = useState(null);
	const [syncRuns, setSyncRuns] = useState([]);
	const [query, setQuery] = useState({
		busca: "codigo_cliente",
		termo_busca: "",
		status: "",
		limit: 20,
	});
	const [queryResult, setQueryResult] = useState(null);

	const loadConfig = async () => {
		setLoading(true);
		setError("");
		try {
			setConfig({
				...DEFAULT_HUBSOFT_CONFIG,
				...(await buscarConfigHubsoft()),
			});
			const runs = await buscarHistoricoSyncHubsoft(8).catch(() => ({
				items: [],
			}));
			setSyncRuns(runs?.items || []);
		} catch (err) {
			setError(
				err?.message || "Não foi possível carregar a configuração do Hubsoft.",
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadConfig();
	}, []);

	const updateConfig = (field, value) => {
		setConfig((current) => ({ ...current, [field]: value }));
	};

	const handleSave = async () => {
		setSaving(true);
		setError("");
		setFeedback("");
		try {
			const saved = await salvarConfigHubsoft(config);
			setConfig({ ...DEFAULT_HUBSOFT_CONFIG, ...saved });
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
			await salvarConfigHubsoft(config);
			const result = await testarConexaoHubsoft();
			setTestResult(result);
			setFeedback(
				"Conexão Hubsoft validada. Token gerado e armazenado para uso do backend.",
			);
			await loadConfig();
		} catch (err) {
			setError(err?.message || "Não foi possível validar a conexão Hubsoft.");
		} finally {
			setTesting(false);
		}
	};

	const handleAssociate = async () => {
		const confirmed = window.confirm(
			"Associar Hubsoft como origem de dados? O sistema ficará marcado para consultar o Hubsoft no lugar das planilhas quando a rotina for ativada.",
		);
		if (!confirmed) return;
		setAssociating(true);
		setError("");
		setFeedback("");
		try {
			const saved = await associarHubsoft();
			setConfig({ ...DEFAULT_HUBSOFT_CONFIG, ...saved });
			setFeedback(
				"Hubsoft associado. A integração ficou marcada como origem preferencial.",
			);
		} catch (err) {
			setError(err?.message || "Não foi possível associar o Hubsoft.");
		} finally {
			setAssociating(false);
		}
	};

	const handleSearch = async () => {
		setSearching(true);
		setError("");
		setQueryResult(null);
		try {
			setQueryResult(await consultarOrdensHubsoft(query));
		} catch (err) {
			setError(err?.message || "Não foi possível consultar O.S. no Hubsoft.");
		} finally {
			setSearching(false);
		}
	};

	const toggleArrayValue = (field, value) => {
		setConfig((current) => {
			const values = Array.isArray(current[field]) ? current[field] : [];
			return {
				...current,
				[field]: values.includes(value)
					? values.filter((item) => item !== value)
					: [...values, value],
			};
		});
	};

	const pollSyncJob = async (jobId) => {
		const active = true;
		while (active) {
			const job = await buscarJobSyncHubsoft(jobId);
			setSyncJob(job);
			if (job.status === "completed") {
				setFeedback("Sincronização Hubsoft concluída.");
				setSyncing(false);
				await loadConfig();
				return job;
			}
			if (job.status === "failed") {
				setError(job.error || "Falha na sincronização Hubsoft.");
				setSyncing(false);
				await loadConfig();
				return job;
			}
			await new Promise((resolve) => window.setTimeout(resolve, JOB_POLL_MS));
		}
		return null;
	};

	const handleSync = async (mode) => {
		const isProduction = mode === "production";
		if (isProduction) {
			const confirmed = window.confirm(
				"Executar sincronização em produção? Isso substituirá os dados atuais de Mapa e Match pelas O.S. retornadas pelo Hubsoft.",
			);
			if (!confirmed) return;
		}
		setSyncing(true);
		setError("");
		setFeedback("");
		setSyncJob(null);
		try {
			await salvarConfigHubsoft(config);
			const started = await iniciarSyncHubsoft({ mode });
			setSyncJob(started);
			await pollSyncJob(started.jobId);
		} catch (err) {
			setError(
				err?.message || "Não foi possível iniciar a sincronização Hubsoft.",
			);
			setSyncing(false);
		}
	};

	if (loading) return <Spinner fullScreen={false} />;

	return (
		<div className="space-y-5">
			<HubsoftHeader
				onRefresh={loadConfig}
				onSave={handleSave}
				saving={saving}
				testing={testing}
				associating={associating}
			/>
			<HubsoftFeedback feedback={feedback} error={error} />
			<HubsoftStatusCards config={config} />

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-5 flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
						<ShieldCheck size={21} />
					</div>
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Credenciais OAuth
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							O backend usa essas credenciais para gerar o Bearer token.
							Segredos salvos não são exibidos novamente.
						</p>
					</div>
				</div>

				<div className="grid gap-4 lg:grid-cols-2">
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Base URL
						</span>
						<input
							value={config.baseUrl || ""}
							onChange={(event) => updateConfig("baseUrl", event.target.value)}
							placeholder="https://seu-hubsoft.com.br"
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Grant type
						</span>
						<input
							value={config.grantType || "password"}
							onChange={(event) =>
								updateConfig("grantType", event.target.value)
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Client ID
						</span>
						<input
							value={config.clientId || ""}
							onChange={(event) => updateConfig("clientId", event.target.value)}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Client Secret{" "}
							{config.clientSecretConfigured ? "(já configurado)" : ""}
						</span>
						<input
							type="password"
							value={config.clientSecret || ""}
							onChange={(event) =>
								updateConfig("clientSecret", event.target.value)
							}
							placeholder={
								config.clientSecretConfigured
									? "Deixe em branco para manter"
									: ""
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Usuário API
						</span>
						<input
							value={config.username || ""}
							onChange={(event) => updateConfig("username", event.target.value)}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Senha API {config.passwordConfigured ? "(já configurada)" : ""}
						</span>
						<input
							type="password"
							value={config.password || ""}
							onChange={(event) => updateConfig("password", event.target.value)}
							placeholder={
								config.passwordConfigured ? "Deixe em branco para manter" : ""
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
				</div>

				<div className="mt-5 flex flex-wrap gap-3">
					<label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
						<input
							type="checkbox"
							checked={config.enabled === true}
							onChange={(event) =>
								updateConfig("enabled", event.target.checked)
							}
							className="h-4 w-4"
						/>
						Integração habilitada
					</label>
					<button
						type="button"
						onClick={handleTest}
						disabled={saving || testing || associating}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
					>
						{testing ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<CheckCircle2 size={17} />
						)}{" "}
						Validar endpoint
					</button>
					<button
						type="button"
						onClick={handleAssociate}
						disabled={saving || testing || associating}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60"
					>
						{associating ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<DatabaseZap size={17} />
						)}{" "}
						Associar Hubsoft
					</button>
				</div>

				{testResult ? (
					<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
						Token válido. Atualizado em{" "}
						{formatDateTime(testResult.tokenUpdatedAt)} e expira em{" "}
						{formatDateTime(testResult.tokenExpiresAt)}.
					</div>
				) : null}
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-5 flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
						<Search size={21} />
					</div>
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Consulta teste de O.S.
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Use uma busca real para confirmar o retorno antes de substituir as
							planilhas.
						</p>
					</div>
				</div>
				<div className="grid gap-3 lg:grid-cols-[220px_1fr_160px_140px]">
					<select
						value={query.busca}
						onChange={(event) =>
							setQuery((current) => ({ ...current, busca: event.target.value }))
						}
						className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-300"
					>
						{SEARCH_TYPES.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
					<input
						value={query.termo_busca}
						onChange={(event) =>
							setQuery((current) => ({
								...current,
								termo_busca: event.target.value,
							}))
						}
						placeholder="Digite código, CPF/CNPJ, ID serviço ou número da O.S."
						className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-300"
					/>
					<select
						value={query.status}
						onChange={(event) =>
							setQuery((current) => ({
								...current,
								status: event.target.value,
							}))
						}
						className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-300"
					>
						<option value="">Todos</option>
						<option value="pendente">Pendente</option>
						<option value="aguardando_agendamento">
							Aguardando agendamento
						</option>
						<option value="finalizado">Finalizado</option>
					</select>
					<button
						type="button"
						disabled={searching}
						onClick={handleSearch}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
					>
						{searching ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Search size={17} />
						)}{" "}
						Consultar
					</button>
				</div>
				{queryResult ? (
					<pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">
						{safePreview(queryResult)}
					</pre>
				) : null}
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
							<DatabaseZap size={21} />
						</div>
						<div>
							<h2 className="text-lg font-black text-slate-950">
								Sincronização Mapa e Match
							</h2>
							<p className="text-sm font-semibold text-slate-500">
								Prepare a leitura automática do Hubsoft. Use prévia primeiro;
								produção substitui os dados atuais.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							disabled={syncing}
							onClick={() => handleSync("preview")}
							className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
						>
							{syncing ? (
								<Loader2 className="animate-spin" size={17} />
							) : (
								<Search size={17} />
							)}{" "}
							Gerar prévia
						</button>
						<button
							type="button"
							disabled={syncing}
							onClick={() => handleSync("production")}
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
						>
							{syncing ? (
								<Loader2 className="animate-spin" size={17} />
							) : (
								<DatabaseZap size={17} />
							)}{" "}
							Sincronizar produção
						</button>
					</div>
				</div>

				<div className="grid gap-4 lg:grid-cols-2">
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Tipo de busca padrão
						</span>
						<select
							value={config.syncBusca || "numero_ordem_servico"}
							onChange={(event) =>
								updateConfig("syncBusca", event.target.value)
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-300"
						>
							{SEARCH_TYPES.map((item) => (
								<option key={item.value} value={item.value}>
									{item.label}
								</option>
							))}
						</select>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Limite por chamada
						</span>
						<input
							type="number"
							min="1"
							max="50"
							value={config.syncLimit || 50}
							onChange={(event) =>
								updateConfig("syncLimit", Number(event.target.value))
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
						/>
					</label>
					<label className="block lg:col-span-2">
						<span className="text-xs font-black uppercase text-slate-500">
							Termos de busca opcionais
						</span>
						<textarea
							value={(Array.isArray(config.syncTermos)
								? config.syncTermos
								: []
							).join("\n")}
							onChange={(event) =>
								updateConfig(
									"syncTermos",
									event.target.value
										.split(/[\n,;]+/)
										.map((item) => item.trim())
										.filter(Boolean),
								)
							}
							rows={3}
							placeholder="Um termo por linha. Ex: códigos de clientes, números de O.S. ou deixe vazio para tentativa geral por status."
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
						/>
					</label>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-3">
					<div className="rounded-2xl border border-slate-200 p-4">
						<p className="text-xs font-black uppercase text-slate-500">
							Status de O.S.
						</p>
						<div className="mt-3 flex flex-wrap gap-2">
							{SYNC_STATUSES.map((item) => (
								<button
									key={item.value}
									type="button"
									onClick={() => toggleArrayValue("syncStatuses", item.value)}
									className={`rounded-full px-3 py-2 text-xs font-black transition ${
										(config.syncStatuses || []).includes(item.value)
											? "bg-blue-600 text-white"
											: "bg-slate-100 text-slate-600 hover:bg-slate-200"
									}`}
								>
									{item.label}
								</button>
							))}
						</div>
					</div>
					<div className="rounded-2xl border border-slate-200 p-4">
						<p className="text-xs font-black uppercase text-slate-500">
							Fontes atualizadas
						</p>
						<div className="mt-3 flex flex-wrap gap-2">
							{SYNC_FONTES.map((item) => (
								<button
									key={item.value}
									type="button"
									onClick={() => toggleArrayValue("syncFontes", item.value)}
									className={`rounded-full px-3 py-2 text-xs font-black transition ${
										(config.syncFontes || []).includes(item.value)
											? "bg-emerald-600 text-white"
											: "bg-slate-100 text-slate-600 hover:bg-slate-200"
									}`}
								>
									{item.label}
								</button>
							))}
						</div>
					</div>
					<div className="rounded-2xl border border-slate-200 p-4">
						<p className="text-xs font-black uppercase text-slate-500">Match</p>
						<label className="mt-3 inline-flex items-center gap-2 text-sm font-black text-slate-700">
							<input
								type="checkbox"
								checked={config.syncMatchEnabled !== false}
								onChange={(event) =>
									updateConfig("syncMatchEnabled", event.target.checked)
								}
								className="h-4 w-4"
							/>
							Atualizar Match junto com Mapa
						</label>
					</div>
				</div>

				{syncJob ? (
					<div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-sm font-black text-blue-950">
									{syncJob.stage || "Processando"}
								</p>
								<p className="text-xs font-semibold text-blue-700">
									Status: {syncJob.status || "-"}{" "}
									{syncJob.error ? `| ${syncJob.error}` : ""}
								</p>
							</div>
							<span className="text-lg font-black text-blue-950">
								{Number(syncJob.percent || 0)}%
							</span>
						</div>
						<div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
							<div
								className="h-full rounded-full bg-blue-600 transition-all"
								style={{
									width: `${Math.min(Math.max(Number(syncJob.percent || 0), 0), 100)}%`,
								}}
							/>
						</div>
						{syncJob.result?.sample?.length ? (
							<pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">
								{safePreview(syncJob.result.sample)}
							</pre>
						) : null}
					</div>
				) : null}

				{syncRuns.length ? (
					<div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
						<table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
							<thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
								<tr>
									<th className="px-4 py-3">Data</th>
									<th className="px-4 py-3">Modo</th>
									<th className="px-4 py-3">Status</th>
									<th className="px-4 py-3">O.S.</th>
									<th className="px-4 py-3">Mapa</th>
									<th className="px-4 py-3">Match</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 bg-white">
								{syncRuns.map((run) => (
									<tr key={run.id}>
										<td className="px-4 py-3 font-semibold text-slate-700">
											{formatDateTime(run.createdAt)}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-700">
											{run.mode || "-"}
										</td>
										<td className="px-4 py-3 font-black text-slate-900">
											{run.status || "-"}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-700">
											{run.totalRows || 0}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-700">
											{run.mapaTotal || 0}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-700">
											{run.matchTotal || 0}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</section>
		</div>
	);
}
