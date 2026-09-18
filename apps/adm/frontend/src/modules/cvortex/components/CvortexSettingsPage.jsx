import {
	CheckCircle2,
	Copy,
	Loader2,
	MessageCircle,
	PlugZap,
	RefreshCw,
	Save,
	ShieldCheck,
	TestTube2,
	Webhook,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { secureRandomHex } from "../../../utils/secureRandom";
import {
	associarCvortex,
	buscarConfigCvortex,
	DEFAULT_CVORTEX_CONFIG,
	enviarTesteCvortex,
	getCvortexWebhookUrl,
	salvarConfigCvortex,
	testarConexaoCvortex,
} from "../services/cvortexService";

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

function Field({ label, children, hint }) {
	return (
		<label className="block space-y-2">
			<span className="text-xs font-black uppercase tracking-wide text-slate-500">
				{label}
			</span>
			{children}
			{hint ? (
				<span className="block text-xs font-semibold text-slate-500">
					{hint}
				</span>
			) : null}
		</label>
	);
}

function TextInput(props) {
	return (
		<input
			{...props}
			className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${props.className || ""}`}
		/>
	);
}

function generateWebhookSecret() {
	return secureRandomHex(32);
}

function StatusCard({ icon: Icon, label, value, tone = "blue" }) {
	const tones = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		green: "border-emerald-100 bg-emerald-50 text-emerald-700",
		amber: "border-amber-100 bg-amber-50 text-amber-700",
	};
	return (
		<div className={`rounded-2xl border p-4 ${tones[tone] || tones.blue}`}>
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm">
					<Icon size={20} />
				</div>
				<div>
					<p className="text-xs font-black uppercase tracking-wide opacity-80">
						{label}
					</p>
					<p className="mt-1 text-lg font-black">{value}</p>
				</div>
			</div>
		</div>
	);
}

function PageHeader({ saving, testing, associating, onLoad, onSave }) {
	return (
		<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
						<PlugZap size={24} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Cvortex</h1>
						<p className="text-sm font-semibold text-slate-500">
							Configure a API que fará o envio e recebimento das mensagens da
							mensageria.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={onLoad}
						disabled={saving || testing || associating}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
					>
						<RefreshCw size={17} /> Atualizar
					</button>
					<button
						type="button"
						onClick={onSave}
						disabled={saving || testing || associating}
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

function FeedbackMessages({ feedback, error }) {
	return (
		<>
			{feedback ? (
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
					{feedback}
				</div>
			) : null}
			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}
		</>
	);
}

function StatusSummary({ config }) {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			<StatusCard
				icon={ShieldCheck}
				label="Integração"
				value={config.enabled ? "Ativa" : "Inativa"}
				tone={config.enabled ? "green" : "amber"}
			/>
			<StatusCard
				icon={MessageCircle}
				label="Mensageria"
				value={
					config.useCvortexForMessaging
						? "Cvortex selecionada"
						: "Não selecionada"
				}
				tone={config.useCvortexForMessaging ? "green" : "blue"}
			/>
			<StatusCard
				icon={Webhook}
				label="Último teste"
				value={formatDateTime(config.lastValidatedAt)}
				tone={config.lastError ? "amber" : "blue"}
			/>
		</div>
	);
}

export default function CvortexSettingsPage() {
	const [config, setConfig] = useState(DEFAULT_CVORTEX_CONFIG);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [associating, setAssociating] = useState(false);
	const enabledToggleId = useId();
	const useForMessagingToggleId = useId();
	const [sendingTest, setSendingTest] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");
	const [testResult, setTestResult] = useState(null);
	const [sendTestResult, setSendTestResult] = useState(null);
	const [webhookSecretPreview, setWebhookSecretPreview] = useState("");
	const [sendTest, setSendTest] = useState({
		phone: "",
		message: "Teste de integração Cvortex realizado pelo sistema Retiradas.",
	});

	const webhookUrl = useMemo(
		() =>
			getCvortexWebhookUrl(config.webhookSecret || webhookSecretPreview || ""),
		[config.webhookSecret, webhookSecretPreview],
	);

	const loadConfig = async () => {
		setLoading(true);
		setError("");
		try {
			setConfig({
				...DEFAULT_CVORTEX_CONFIG,
				...(await buscarConfigCvortex()),
			});
		} catch (err) {
			setError(
				err?.message || "Não foi possível carregar a configuração da Cvortex.",
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
		setFeedback("");
		setError("");
		const secretPreview = config.webhookSecret || webhookSecretPreview;
		try {
			const saved = await salvarConfigCvortex(config);
			setWebhookSecretPreview(secretPreview);
			setConfig({
				...DEFAULT_CVORTEX_CONFIG,
				...saved,
				webhookSecret: secretPreview,
			});
			setFeedback("Configuração da Cvortex salva com sucesso.");
		} catch (err) {
			setError(
				err?.message || "Não foi possível salvar a configuração da Cvortex.",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleTest = async () => {
		setTesting(true);
		setFeedback("");
		setError("");
		setTestResult(null);
		const secretPreview = config.webhookSecret || webhookSecretPreview;
		try {
			await salvarConfigCvortex(config);
			const result = await testarConexaoCvortex();
			setTestResult(result);
			setFeedback("Validação da Cvortex concluída.");
			const saved = await buscarConfigCvortex();
			setWebhookSecretPreview(secretPreview);
			setConfig({
				...DEFAULT_CVORTEX_CONFIG,
				...saved,
				webhookSecret: secretPreview,
			});
		} catch (err) {
			setError(err?.message || "Não foi possível validar a Cvortex.");
		} finally {
			setTesting(false);
		}
	};

	const handleAssociate = async () => {
		const confirmed = window.confirm(
			"Usar Cvortex como provedora de envio e recebimento da mensageria? Essa alteração deixa a integração marcada como preferencial, sem apagar Evolution.",
		);
		if (!confirmed) return;
		setAssociating(true);
		setFeedback("");
		setError("");
		try {
			const saved = await associarCvortex();
			setConfig({ ...DEFAULT_CVORTEX_CONFIG, ...saved });
			setFeedback(
				"Cvortex associada como provedora preferencial de mensageria.",
			);
		} catch (err) {
			setError(err?.message || "Não foi possível associar a Cvortex.");
		} finally {
			setAssociating(false);
		}
	};

	const handleSendTest = async () => {
		setSendingTest(true);
		setFeedback("");
		setError("");
		setSendTestResult(null);
		const secretPreview = config.webhookSecret || webhookSecretPreview;
		try {
			await salvarConfigCvortex(config);
			const result = await enviarTesteCvortex(sendTest);
			setSendTestResult(result);
			setFeedback("Teste de envio solicitado pela Cvortex.");
			const saved = await buscarConfigCvortex();
			setWebhookSecretPreview(secretPreview);
			setConfig({
				...DEFAULT_CVORTEX_CONFIG,
				...saved,
				webhookSecret: secretPreview,
			});
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o teste pela Cvortex.");
		} finally {
			setSendingTest(false);
		}
	};

	const copyWebhook = async () => {
		await navigator.clipboard.writeText(webhookUrl);
		setFeedback("Webhook copiado.");
	};

	const handleGenerateSecret = () => {
		const secret = generateWebhookSecret();
		setWebhookSecretPreview(secret);
		updateConfig("webhookSecret", secret);
		setFeedback("Segredo gerado. Clique em Salvar para gravar a configuração.");
	};

	if (loading) return <Spinner fullScreen={false} />;

	return (
		<div className="space-y-5">
			<PageHeader
				saving={saving}
				testing={testing}
				associating={associating}
				onLoad={loadConfig}
				onSave={handleSave}
			/>
			<FeedbackMessages feedback={feedback} error={error} />
			<StatusSummary config={config} />

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="grid gap-4 lg:grid-cols-2">
					<Field label="Base URL">
						<TextInput
							value={config.baseUrl}
							onChange={(event) => updateConfig("baseUrl", event.target.value)}
							placeholder="https://api.cvortex.com.br"
						/>
					</Field>
					<Field label="Token / API Key">
						<TextInput
							type="password"
							value={config.apiToken}
							onChange={(event) => updateConfig("apiToken", event.target.value)}
							placeholder={
								config.apiTokenConfigured
									? "Token já configurado. Preencha apenas para trocar."
									: "Cole o token da Cvortex"
							}
						/>
					</Field>
					<Field label="ID da conta / workspace">
						<TextInput
							value={config.accountId}
							onChange={(event) =>
								updateConfig("accountId", event.target.value)
							}
							placeholder="Conta, workspace ou tenant"
						/>
					</Field>
					<Field label="ID da caixa / canal">
						<TextInput
							value={config.inboxId}
							onChange={(event) => updateConfig("inboxId", event.target.value)}
							placeholder="Canal WhatsApp, inbox ou fila"
						/>
					</Field>
					<Field label="Endpoint de envio">
						<TextInput
							value={config.sendEndpoint}
							onChange={(event) =>
								updateConfig("sendEndpoint", event.target.value)
							}
							placeholder="/messages/send"
						/>
					</Field>
					<Field label="Endpoint de status">
						<TextInput
							value={config.statusEndpoint}
							onChange={(event) =>
								updateConfig("statusEndpoint", event.target.value)
							}
							placeholder="/health ou /status"
						/>
					</Field>
					<Field label="Identificador remetente">
						<TextInput
							value={config.defaultFrom}
							onChange={(event) =>
								updateConfig("defaultFrom", event.target.value)
							}
							placeholder="Número, canal ou nome do remetente"
						/>
					</Field>
					<Field label="Segredo do webhook">
						<div className="flex flex-col gap-2 sm:flex-row">
							<TextInput
								value={config.webhookSecret}
								onChange={(event) =>
									updateConfig("webhookSecret", event.target.value)
								}
								placeholder={
									config.webhookSecretConfigured
										? "Segredo já configurado. Preencha apenas para trocar."
										: "Use um segredo longo"
								}
							/>
							<button
								type="button"
								onClick={handleGenerateSecret}
								className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100"
							>
								Gerar segredo
							</button>
						</div>
					</Field>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-2">
					<label
						htmlFor={enabledToggleId}
						className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
					>
						<input
							id={enabledToggleId}
							type="checkbox"
							checked={config.enabled}
							onChange={(event) =>
								updateConfig("enabled", event.target.checked)
							}
							className="h-5 w-5 rounded border-slate-300 text-blue-600"
						/>
						<span>
							<span className="block text-sm font-black text-slate-900">
								Ativar integração Cvortex
							</span>
							<span className="text-xs font-semibold text-slate-500">
								Permite validar status e receber webhooks.
							</span>
						</span>
					</label>
					<label
						htmlFor={useForMessagingToggleId}
						className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
					>
						<input
							id={useForMessagingToggleId}
							type="checkbox"
							checked={config.useCvortexForMessaging}
							readOnly
							disabled
							className="h-5 w-5 rounded border-slate-300 text-blue-600 disabled:opacity-80"
						/>
						<span>
							<span className="block text-sm font-black text-slate-900">
								Usar Cvortex na mensageria
							</span>
							<span className="text-xs font-semibold text-slate-500">
								Use o botão de confirmação abaixo para virar a chave com
								segurança.
							</span>
						</span>
					</label>
				</div>

				<Field label="Observações">
					<textarea
						value={config.notes}
						onChange={(event) => updateConfig("notes", event.target.value)}
						rows={4}
						className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
						placeholder="Contrato, ambiente, responsável, limites e regras combinadas com a Cvortex."
					/>
				</Field>

				<div className="mt-5 flex flex-wrap gap-2">
					<button
						type="button"
						onClick={handleTest}
						disabled={saving || testing || associating}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
					>
						{testing ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<TestTube2 size={17} />
						)}{" "}
						Testar conexão
					</button>
					<button
						type="button"
						onClick={handleAssociate}
						disabled={saving || testing || associating}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
					>
						{associating ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<CheckCircle2 size={17} />
						)}{" "}
						Usar Cvortex na mensageria
					</button>
				</div>

				{testResult ? (
					<pre className="mt-5 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">
						{JSON.stringify(testResult, null, 2)}
					</pre>
				) : null}
			</section>

			<section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Teste de envio
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Valide a Cvortex sem trocar a mensageria. O teste usa apenas o
							endpoint e o token configurados acima.
						</p>
					</div>
					<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
						Não altera a fila
					</span>
				</div>
				<div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr_auto] lg:items-end">
					<Field label="Número de teste">
						<TextInput
							value={sendTest.phone}
							onChange={(event) =>
								setSendTest((current) => ({
									...current,
									phone: event.target.value,
								}))
							}
							placeholder="31999999999"
						/>
					</Field>
					<Field label="Mensagem">
						<TextInput
							value={sendTest.message}
							onChange={(event) =>
								setSendTest((current) => ({
									...current,
									message: event.target.value,
								}))
							}
							placeholder="Mensagem para validar o envio"
						/>
					</Field>
					<button
						type="button"
						onClick={handleSendTest}
						disabled={saving || sendingTest}
						className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
					>
						{sendingTest ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<TestTube2 size={17} />
						)}{" "}
						Enviar teste
					</button>
				</div>
				{sendTestResult ? (
					<pre className="mt-5 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">
						{JSON.stringify(sendTestResult, null, 2)}
					</pre>
				) : null}
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Webhook de recebimento
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Cadastre esta URL na Cvortex para receber mensagens, status e
							callbacks no Retiradas.
						</p>
					</div>
					<button
						type="button"
						onClick={copyWebhook}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
					>
						<Copy size={17} /> Copiar webhook
					</button>
				</div>
				<div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 font-mono text-sm font-bold text-blue-900 break-all">
					{webhookUrl}
				</div>
				<div className="mt-4 grid gap-3 md:grid-cols-3">
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase text-slate-500">Envio</p>
						<p className="mt-1 text-sm font-bold text-slate-800">
							Retiradas → Cvortex
						</p>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase text-slate-500">
							Recebimento
						</p>
						<p className="mt-1 text-sm font-bold text-slate-800">
							Cvortex → Retiradas
						</p>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase text-slate-500">
							Segurança
						</p>
						<p className="mt-1 text-sm font-bold text-slate-800">
							Secret por query ou header
						</p>
					</div>
				</div>
			</section>
		</div>
	);
}
