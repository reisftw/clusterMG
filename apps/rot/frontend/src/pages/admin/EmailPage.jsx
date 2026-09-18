import { useEffect, useState } from "react";
import { Mail, RefreshCw, Save, Send } from "lucide-react";
import { fetchRotEmailSettings, saveRotEmailSettings, sendRotEmailTest } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";

const templateOrder = ["welcome_first_access", "mfa_login_code", "password_reset", "password_changed", "smtp_test"];

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";
const labelClass = "mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500";

export default function EmailPage() {
	const [config, setConfig] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testTo, setTestTo] = useState("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setConfig(await fetchRotEmailSettings());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as configurações de e-mail.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
	const updateTemplate = (key, field, value) => setConfig((current) => ({
		...current,
		templates: {
			...(current.templates || {}),
			[key]: { ...(current.templates?.[key] || {}), [field]: value },
		},
	}));

	const save = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");
		try {
			const payload = { ...config };
			if (!payload.smtpPassword) delete payload.smtpPassword;
			const saved = await saveRotEmailSettings(payload);
			setConfig(saved);
			setMessage("Configurações de e-mail salvas.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar.");
		} finally {
			setSaving(false);
		}
	};

	const test = async () => {
		setTesting(true);
		setError("");
		setMessage("");
		try {
			await sendRotEmailTest(testTo);
			setMessage("E-mail de teste enviado.");
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o teste.");
		} finally {
			setTesting(false);
		}
	};

	if (loading) return <Spinner fullScreen />;
	if (!config) return <p className="text-sm font-bold text-red-700">{error || "Configuração indisponível."}</p>;

	return (
		<form onSubmit={save} className="space-y-5">
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-3">
						<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white"><Mail size={23} /></span>
						<div>
							<h1 className="text-2xl font-black text-slate-950">E-mail</h1>
							<p className="text-sm font-semibold text-slate-500">SMTP, remetente, MFA e textos enviados pela Operação.</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={load} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
							<RefreshCw size={15} /> Atualizar
						</button>
						<button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60">
							<Save size={15} /> {saving ? "Salvando..." : "Salvar"}
						</button>
					</div>
				</div>
				{message ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
				{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			</section>

			<section className="grid gap-4 lg:grid-cols-2">
				<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">SMTP</h2>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<label><span className={labelClass}>Host</span><input className={inputClass} value={config.smtpHost || ""} onChange={(e) => update("smtpHost", e.target.value)} /></label>
						<label><span className={labelClass}>Porta</span><input className={inputClass} type="number" value={config.smtpPort || ""} onChange={(e) => update("smtpPort", Number(e.target.value))} /></label>
						<label><span className={labelClass}>Usuário SMTP</span><input className={inputClass} value={config.smtpUser || ""} onChange={(e) => update("smtpUser", e.target.value)} /></label>
						<label><span className={labelClass}>Senha SMTP</span><input className={inputClass} type="password" placeholder={config.hasPassword ? "Senha atual mantida" : ""} value={config.smtpPassword || ""} onChange={(e) => update("smtpPassword", e.target.value)} /></label>
					</div>
					<label className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-600">
						<input type="checkbox" checked={Boolean(config.smtpSecure)} onChange={(e) => update("smtpSecure", e.target.checked)} />
						Usar conexão segura SSL/TLS
					</label>
				</div>

				<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Remetente e Segurança</h2>
					<div className="mt-4 grid gap-3">
						<label><span className={labelClass}>Nome do remetente</span><input className={inputClass} value={config.fromName || ""} onChange={(e) => update("fromName", e.target.value)} /></label>
						<label><span className={labelClass}>E-mail remetente</span><input className={inputClass} type="email" value={config.fromEmail || ""} onChange={(e) => update("fromEmail", e.target.value)} /></label>
						<label><span className={labelClass}>Responder para</span><input className={inputClass} type="email" value={config.replyTo || ""} onChange={(e) => update("replyTo", e.target.value)} /></label>
						<label><span className={labelClass}>URL do sistema</span><input className={inputClass} value={config.appUrl || ""} onChange={(e) => update("appUrl", e.target.value)} /></label>
						<label className="flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={Boolean(config.mfaEmailEnabled)} onChange={(e) => update("mfaEmailEnabled", e.target.checked)} /> MFA por e-mail habilitado</label>
					</div>
					<div className="mt-4 flex gap-2">
						<input className={inputClass} type="email" placeholder="email@dominio.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
						<button type="button" onClick={test} disabled={testing} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:opacity-60">
							<Send size={15} /> {testing ? "Enviando..." : "Teste"}
						</button>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Textos dos e-mails</h2>
				<p className="mt-1 text-sm font-semibold text-slate-500">Variáveis aceitas: {"{nome}"}, {"{username}"}, {"{temporaryPassword}"}, {"{codigo}"}, {"{minutos}"}, {"{resetUrl}"}, {"{appUrl}"}.</p>
				<div className="mt-4 space-y-4">
					{templateOrder.map((key) => {
						const template = config.templates?.[key];
						if (!template) return null;
						return (
							<article key={key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
								<h3 className="text-sm font-black text-slate-900">{template.label}</h3>
								<div className="mt-3 grid gap-3 lg:grid-cols-2">
									<label><span className={labelClass}>Assunto</span><input className={inputClass} value={template.subject || ""} onChange={(e) => updateTemplate(key, "subject", e.target.value)} /></label>
									<label><span className={labelClass}>Título</span><input className={inputClass} value={template.title || ""} onChange={(e) => updateTemplate(key, "title", e.target.value)} /></label>
									<label><span className={labelClass}>Prévia</span><input className={inputClass} value={template.preview || ""} onChange={(e) => updateTemplate(key, "preview", e.target.value)} /></label>
									<label><span className={labelClass}>Botão</span><input className={inputClass} value={template.actionLabel || ""} onChange={(e) => updateTemplate(key, "actionLabel", e.target.value)} /></label>
								</div>
								<label className="mt-3 block"><span className={labelClass}>Mensagem</span><textarea className="min-h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" value={template.body || ""} onChange={(e) => updateTemplate(key, "body", e.target.value)} /></label>
							</article>
						);
					})}
				</div>
			</section>
		</form>
	);
}
