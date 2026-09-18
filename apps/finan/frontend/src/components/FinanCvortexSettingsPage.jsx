// Replica visual de src/modules/cvortex/components/CvortexSettingsPage.jsx
// do Retiradas, sem webhook/teste de envio de mensagem (mensageria nao e
// dominio do Finan) — mantem credenciais e teste de conexao real
// (POST /integracoes/cvortex/test, GET autenticado contra o endpoint de
// status configurado).
import { CheckCircle2, Loader2, MessageCircle, PlugZap, RefreshCw, Save, ShieldCheck, TestTube2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanIntegration, saveFinanIntegration, testFinanIntegration } from "../api/finanApi";

function formatDateTime(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Field({ label, children }) {
	return (
		<label className="block space-y-2">
			<span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
			{children}
		</label>
	);
}

const inputClass =
	"w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

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
					<p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
					<p className="mt-1 text-lg font-black">{value}</p>
				</div>
			</div>
		</div>
	);
}

export default function FinanCvortexSettingsPage() {
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
			setState(await fetchFinanIntegration("cvortex"));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a configuração da Cvortex.");
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
		setFeedback("");
		setError("");
		try {
			const saved = await saveFinanIntegration("cvortex", state);
			setState(saved);
			setFeedback("Configuração da Cvortex salva com sucesso.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a configuração da Cvortex.");
		} finally {
			setSaving(false);
		}
	};

	const handleTest = async () => {
		setTesting(true);
		setFeedback("");
		setError("");
		setTestResult(null);
		try {
			await saveFinanIntegration("cvortex", state);
			const result = await testFinanIntegration("cvortex");
			setTestResult(result);
			setFeedback("Validação da Cvortex concluída.");
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível validar a Cvortex.");
		} finally {
			setTesting(false);
		}
	};

	if (loading) {
		return <p className="text-sm font-semibold text-slate-500">Carregando Cvortex...</p>;
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
							<h2 className="text-2xl font-black text-slate-950">Cvortex</h2>
							<p className="text-sm font-semibold text-slate-500">Configure a API Cvortex usada pelo Finan.</p>
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

			{feedback ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{feedback}</div> : null}
			{error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="grid gap-4 md:grid-cols-3">
				<StatusCard icon={ShieldCheck} label="Integração" value={state.status === "ativo" ? "Ativa" : "Inativa"} tone={state.status === "ativo" ? "green" : "amber"} />
				<StatusCard icon={MessageCircle} label="Endpoint de status" value={config.statusEndpoint || "/health"} tone="blue" />
				<StatusCard icon={CheckCircle2} label="Último teste" value={formatDateTime(config.lastValidatedAt)} tone={config.lastError ? "amber" : "blue"} />
			</div>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="grid gap-4 lg:grid-cols-2">
					<Field label="Base URL">
						<input className={inputClass} value={config.baseUrl || ""} onChange={(e) => updateConfig("baseUrl", e.target.value)} placeholder="https://api.cvortex.com.br" />
					</Field>
					<Field label="Token / API Key">
						<input
							type="password"
							className={inputClass}
							value={config.apiToken || ""}
							onChange={(e) => updateConfig("apiToken", e.target.value)}
							placeholder={config.apiTokenConfigured ? "Token já configurado. Preencha apenas para trocar." : "Cole o token da Cvortex"}
						/>
					</Field>
					<Field label="ID da conta / workspace">
						<input className={inputClass} value={config.accountId || ""} onChange={(e) => updateConfig("accountId", e.target.value)} placeholder="Conta, workspace ou tenant" />
					</Field>
					<Field label="ID da caixa / canal">
						<input className={inputClass} value={config.inboxId || ""} onChange={(e) => updateConfig("inboxId", e.target.value)} placeholder="Canal, inbox ou fila" />
					</Field>
					<Field label="Endpoint de status">
						<input className={inputClass} value={config.statusEndpoint || ""} onChange={(e) => updateConfig("statusEndpoint", e.target.value)} placeholder="/health ou /status" />
					</Field>
				</div>

				<div className="mt-5">
					<label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<input
							type="checkbox"
							checked={state.status === "ativo"}
							onChange={(e) => setState((current) => ({ ...current, status: e.target.checked ? "ativo" : "planejado" }))}
							aria-label="Ativar integração Cvortex"
							className="h-5 w-5 rounded border-slate-300 text-blue-600"
						/>
						<span>
							<span className="block text-sm font-black text-slate-900">Ativar integração Cvortex</span>
							<span className="text-xs font-semibold text-slate-500">Permite validar status contra a API da Cvortex.</span>
						</span>
					</label>
				</div>

				<Field label="Observações">
					<textarea
						value={config.notes || ""}
						onChange={(e) => updateConfig("notes", e.target.value)}
						rows={4}
						className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
						placeholder="Contrato, ambiente, responsável e limites combinados com a Cvortex."
					/>
				</Field>

				<div className="mt-5 flex flex-wrap gap-2">
					<button
						type="button"
						onClick={handleTest}
						disabled={saving || testing}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
					>
						{testing ? <Loader2 className="animate-spin" size={17} /> : <TestTube2 size={17} />} Testar conexão
					</button>
				</div>

				{testResult ? <pre className="mt-5 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">{JSON.stringify(testResult, null, 2)}</pre> : null}
			</section>
		</div>
	);
}
