// Replica visual/funcional de
// src/modules/emailSettings/components/EmailSettingsPage.jsx do Retiradas,
// ligada as rotas de e-mail do Finan (/admin/email/* em compat/routes.js,
// logica real em apps/finan/backend/src/email/service.js).
import {
	AlertCircle,
	CheckCircle2,
	Mail,
	RefreshCw,
	Save,
	Search,
	Send,
	ShieldCheck,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanEmailConfig, fetchFinanEmailLogs, saveFinanEmailConfig, testFinanEmail } from "../api/finanApi";

// Mesmo catalogo de apps/finan/backend/src/email/service.js
// (DEFAULT_EMAIL_TEMPLATES) — duplicado no frontend por nao haver import
// cruzado entre backend/frontend do Finan (mesmo padrao ja usado em
// finanNotificationSound.js).
const DEFAULT_EMAIL_TEMPLATES = {
	password_reset: { label: "Redefinição de senha" },
	mfa_login_code: { label: "Código MFA por e-mail" },
	welcome_first_access: { label: "Boas-vindas / Primeiro acesso" },
	pin_locked: { label: "Conta bloqueada por PIN" },
	calendar_event_alert: { label: "Alerta do Calendário Financeiro" },
	smtp_test: { label: "Teste SMTP" },
};

const inputClass =
	"mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const EMAIL_LOG_PAGE_SIZE = 20;

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getTemplateLabel(type) {
	return DEFAULT_EMAIL_TEMPLATES[type]?.label || type || "E-mail";
}

export default function FinanEmailSettingsSection() {
	const [config, setConfig] = useState({});
	const [testTo, setTestTo] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [activeTemplate, setActiveTemplate] = useState("welcome_first_access");
	const [activeTab, setActiveTab] = useState("config");
	const [logs, setLogs] = useState([]);
	const [logsTotal, setLogsTotal] = useState(0);
	const [logsLoading, setLogsLoading] = useState(false);
	const [logsPage, setLogsPage] = useState(1);
	const [logsStatus, setLogsStatus] = useState("");
	const [logsType, setLogsType] = useState("");
	const [logsSearch, setLogsSearch] = useState("");

	const loadData = async () => {
		setLoading(true);
		setFeedback("");
		try {
			const next = await fetchFinanEmailConfig();
			setConfig(next);
			setTestTo(next.replyTo || next.smtpUser || "");
		} catch (error) {
			setFeedback(error?.message || "Não foi possível carregar a configuração de e-mail.");
		} finally {
			setLoading(false);
		}
	};

	const loadLogs = async (page = logsPage) => {
		setLogsLoading(true);
		try {
			const response = await fetchFinanEmailLogs({
				limit: EMAIL_LOG_PAGE_SIZE,
				offset: (page - 1) * EMAIL_LOG_PAGE_SIZE,
				status: logsStatus,
				type: logsType,
				q: logsSearch.trim(),
			});
			setLogs(response?.items || []);
			setLogsTotal(Number(response?.total || 0));
			setLogsPage(page);
		} catch (error) {
			setFeedback(error?.message || "Não foi possível carregar os logs de e-mail.");
		} finally {
			setLogsLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	useEffect(() => {
		if (activeTab === "logs") loadLogs(1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTab, logsStatus, logsType]);

	const update = (field, value) => {
		setConfig((current) => ({ ...current, [field]: value }));
	};

	const updateTemplate = (field, value) => {
		setConfig((current) => ({
			...current,
			templates: {
				...(current.templates || {}),
				[activeTemplate]: {
					...((current.templates || {})[activeTemplate] || {}),
					[field]: value,
				},
			},
		}));
	};

	const save = async () => {
		setSaving(true);
		setFeedback("");
		try {
			const saved = await saveFinanEmailConfig(config);
			setConfig(saved);
			setFeedback("Configuração de e-mail salva com sucesso.");
		} catch (error) {
			setFeedback(error?.message || "Não foi possível salvar a configuração.");
		} finally {
			setSaving(false);
		}
	};

	const test = async () => {
		setTesting(true);
		setFeedback("");
		try {
			await testFinanEmail(testTo);
			setFeedback(`E-mail de teste enviado para ${testTo}.`);
			if (activeTab === "logs") loadLogs(1);
		} catch (error) {
			setFeedback(error?.message || "Não foi possível enviar o teste.");
			if (activeTab === "logs") loadLogs(1);
		} finally {
			setTesting(false);
		}
	};

	if (loading) {
		return (
			<div className="flex min-h-[300px] items-center justify-center rounded-lg border border-slate-200 bg-white">
				<div className="flex items-center gap-3 text-sm font-bold text-slate-500">
					<RefreshCw size={18} className="animate-spin" />
					Carregando configuração de e-mail...
				</div>
			</div>
		);
	}

	const templateKeys = Object.keys(DEFAULT_EMAIL_TEMPLATES);
	const activeTemplateConfig = (config.templates || {})[activeTemplate] || {};

	return (
		<div className="space-y-6">
			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-3">
						<span className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
							<Mail size={24} />
						</span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Envio, MFA e templates</h2>
							<p className="mt-1 text-sm font-medium text-slate-500">
								Configure SMTP, remetente, modelos e acompanhe todos os envios.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={activeTab === "logs" ? () => loadLogs(logsPage) : loadData}
							className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
						>
							<RefreshCw size={17} />
							Atualizar
						</button>
						{activeTab === "config" ? (
							<button
								type="button"
								onClick={save}
								disabled={saving}
								className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
							>
								<Save size={17} />
								{saving ? "Salvando..." : "Salvar e-mail"}
							</button>
						) : null}
					</div>
				</div>
			</section>

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => setActiveTab("config")}
					className={`rounded-lg px-4 py-2 text-sm font-black transition ${
						activeTab === "config" ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
					}`}
				>
					Configuração
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("logs")}
					className={`rounded-lg px-4 py-2 text-sm font-black transition ${
						activeTab === "logs" ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
					}`}
				>
					Logs de envio
				</button>
			</div>

			{feedback ? (
				<div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{feedback}</div>
			) : null}

			{activeTab === "logs" ? (
				<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<h3 className="text-lg font-black text-slate-950">Logs de e-mails</h3>
							<p className="mt-1 text-sm font-medium text-slate-500">Veja todos os e-mails enviados e os erros retornados pelo SMTP.</p>
						</div>
						<div className="text-sm font-bold text-slate-500">{logsTotal} registro(s)</div>
					</div>

					<div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
						<label>
							<span className="text-sm font-bold text-slate-700">Buscar</span>
							<div className="relative">
								<Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
								<input
									className={`${inputClass} pl-9`}
									value={logsSearch}
									onChange={(event) => setLogsSearch(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") loadLogs(1);
									}}
									placeholder="Destinatário, assunto ou motivo do erro"
								/>
							</div>
						</label>
						<label>
							<span className="text-sm font-bold text-slate-700">Status</span>
							<select className={inputClass} value={logsStatus} onChange={(event) => setLogsStatus(event.target.value)}>
								<option value="">Todos</option>
								<option value="enviado">Enviado</option>
								<option value="erro">Erro</option>
							</select>
						</label>
						<label>
							<span className="text-sm font-bold text-slate-700">Tipo</span>
							<select className={inputClass} value={logsType} onChange={(event) => setLogsType(event.target.value)}>
								<option value="">Todos</option>
								{Object.entries(DEFAULT_EMAIL_TEMPLATES).map(([key, template]) => (
									<option key={key} value={key}>
										{template.label}
									</option>
								))}
							</select>
						</label>
						<button
							type="button"
							onClick={() => loadLogs(1)}
							disabled={logsLoading}
							className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
						>
							Filtrar
						</button>
					</div>

					<div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
						<div className="overflow-x-auto">
							<table className="w-full min-w-[920px] text-sm">
								<thead className="border-b border-slate-200 bg-slate-50">
									<tr>
										<th scope="col" className="px-4 py-3 text-left font-black text-slate-600">Data</th>
										<th scope="col" className="px-4 py-3 text-left font-black text-slate-600">Tipo</th>
										<th scope="col" className="px-4 py-3 text-left font-black text-slate-600">Destinatário</th>
										<th scope="col" className="px-4 py-3 text-left font-black text-slate-600">Assunto</th>
										<th scope="col" className="px-4 py-3 text-left font-black text-slate-600">Status</th>
										<th scope="col" className="px-4 py-3 text-left font-black text-slate-600">Motivo do erro</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{logsLoading ? (
										<tr>
											<td colSpan={6} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
												<RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
												Carregando logs...
											</td>
										</tr>
									) : logs.length ? (
										logs.map((item) => (
											<tr key={item.id} className="hover:bg-slate-50">
												<td className="px-4 py-3 font-semibold text-slate-700">{formatDateTime(item.created_at)}</td>
												<td className="px-4 py-3 font-semibold text-slate-700">{getTemplateLabel(item.type)}</td>
												<td className="px-4 py-3 font-semibold text-slate-900">{item.to || "-"}</td>
												<td className="px-4 py-3 text-slate-700">{item.subject || "-"}</td>
												<td className="px-4 py-3">
													{item.status === "enviado" ? (
														<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
															<CheckCircle2 size={14} />
															Enviado
														</span>
													) : (
														<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">
															<XCircle size={14} />
															Erro
														</span>
													)}
												</td>
												<td className="max-w-[360px] px-4 py-3 text-xs font-semibold leading-relaxed text-red-700">{item.error || "-"}</td>
											</tr>
										))
									) : (
										<tr>
											<td colSpan={6} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
												<AlertCircle size={18} className="mx-auto mb-2" />
												Nenhum log encontrado.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</div>

					<div className="mt-4 flex flex-col gap-3 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
						<span>
							Mostrando {logs.length ? (logsPage - 1) * EMAIL_LOG_PAGE_SIZE + 1 : 0} a{" "}
							{Math.min(logsPage * EMAIL_LOG_PAGE_SIZE, logsTotal)} de {logsTotal}
						</span>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => loadLogs(Math.max(1, logsPage - 1))}
								disabled={logsPage <= 1 || logsLoading}
								className="rounded-lg border border-slate-300 px-3 py-2 font-bold text-slate-700 disabled:opacity-40"
							>
								Anterior
							</button>
							<span className="rounded-lg bg-slate-100 px-3 py-2 font-black text-slate-800">Página {logsPage}</span>
							<button
								type="button"
								onClick={() => loadLogs(logsPage + 1)}
								disabled={logsPage * EMAIL_LOG_PAGE_SIZE >= logsTotal || logsLoading}
								className="rounded-lg border border-slate-300 px-3 py-2 font-bold text-slate-700 disabled:opacity-40"
							>
								Próxima
							</button>
						</div>
					</div>
				</section>
			) : (
				<>
					<section className="grid gap-4 md:grid-cols-3">
						<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
							<p className="text-xs font-black uppercase tracking-wide text-emerald-700">Status</p>
							<p className="mt-2 flex items-center gap-2 text-lg font-black text-emerald-950">
								<CheckCircle2 size={19} />
								{config.enabled ? "Ativo" : "Desativado"}
							</p>
						</div>
						<div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
							<p className="text-xs font-black uppercase tracking-wide text-blue-700">Remetente</p>
							<p className="mt-2 text-lg font-black text-blue-950">{config.fromEmail || "-"}</p>
						</div>
						<div className="rounded-lg border border-slate-200 bg-white p-4">
							<p className="text-xs font-black uppercase tracking-wide text-slate-500">Senha SMTP</p>
							<p className="mt-2 flex items-center gap-2 text-lg font-black text-slate-900">
								<ShieldCheck size={19} />
								{config.hasPassword ? "Configurada" : "Pendente"}
							</p>
						</div>
					</section>

					<section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
						<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
							<h3 className="text-lg font-black text-slate-950">SMTP</h3>
							<div className="mt-5 grid gap-4 md:grid-cols-2">
								<label>
									<span className="text-sm font-bold text-slate-700">Host SMTP</span>
									<input className={inputClass} value={config.smtpHost || ""} onChange={(e) => update("smtpHost", e.target.value)} />
								</label>
								<label>
									<span className="text-sm font-bold text-slate-700">Porta</span>
									<input
										type="number"
										className={inputClass}
										value={config.smtpPort || 465}
										onChange={(e) => update("smtpPort", e.target.value)}
									/>
								</label>
								<label>
									<span className="text-sm font-bold text-slate-700">Usuário SMTP</span>
									<input className={inputClass} value={config.smtpUser || ""} onChange={(e) => update("smtpUser", e.target.value)} />
								</label>
								<label>
									<span className="text-sm font-bold text-slate-700">Senha SMTP</span>
									<input
										type="password"
										className={inputClass}
										value={config.smtpPassword || ""}
										onChange={(e) => update("smtpPassword", e.target.value)}
										placeholder={config.hasPassword ? "Senha já configurada. Preencha apenas para trocar." : "Senha SMTP"}
									/>
								</label>
								<label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
									<input
										type="checkbox"
										checked={Boolean(config.smtpSecure)}
										onChange={(e) => update("smtpSecure", e.target.checked)}
										className="h-5 w-5 rounded border-slate-300 text-blue-600"
									/>
									<span className="text-sm font-bold text-slate-700">Usar SSL/TLS</span>
								</label>
								<label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
									<input
										type="checkbox"
										checked={Boolean(config.enabled)}
										onChange={(e) => update("enabled", e.target.checked)}
										className="h-5 w-5 rounded border-slate-300 text-blue-600"
									/>
									<span className="text-sm font-bold text-slate-700">E-mail transacional ativo</span>
								</label>
							</div>

							<h3 className="mt-8 text-lg font-black text-slate-950">MFA por e-mail</h3>
							<div className="mt-5 grid gap-4 md:grid-cols-2">
								<label className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
									<input
										type="checkbox"
										checked={Boolean(config.mfaEmailEnabled)}
										onChange={(e) => update("mfaEmailEnabled", e.target.checked)}
										aria-label="Exigir código por e-mail no login"
										className="h-5 w-5 rounded border-slate-300 text-blue-600"
									/>
									<span>
										<span className="block text-sm font-black text-blue-950">Exigir código por e-mail no login</span>
										<span className="block text-xs font-semibold text-blue-700">
											Após senha correta, o usuário precisa confirmar o código enviado por e-mail.
										</span>
									</span>
								</label>
								<label>
									<span className="text-sm font-bold text-slate-700">Validade do código em minutos</span>
									<input
										type="number"
										min="3"
										max="30"
										className={inputClass}
										value={config.mfaEmailTtlMinutes || 10}
										onChange={(e) => update("mfaEmailTtlMinutes", e.target.value)}
									/>
								</label>
							</div>

							<h3 className="mt-8 text-lg font-black text-slate-950">Identidade</h3>
							<div className="mt-5 grid gap-4 md:grid-cols-2">
								<label>
									<span className="text-sm font-bold text-slate-700">Nome do remetente</span>
									<input className={inputClass} value={config.fromName || ""} onChange={(e) => update("fromName", e.target.value)} />
								</label>
								<label>
									<span className="text-sm font-bold text-slate-700">E-mail remetente</span>
									<input className={inputClass} value={config.fromEmail || ""} onChange={(e) => update("fromEmail", e.target.value)} />
								</label>
								<label>
									<span className="text-sm font-bold text-slate-700">Responder para</span>
									<input className={inputClass} value={config.replyTo || ""} onChange={(e) => update("replyTo", e.target.value)} />
								</label>
								<label>
									<span className="text-sm font-bold text-slate-700">URL do sistema</span>
									<input className={inputClass} value={config.appUrl || ""} onChange={(e) => update("appUrl", e.target.value)} />
								</label>
							</div>
						</div>

						<div className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
							<div className="flex items-center gap-2 text-slate-950">
								<Send size={18} className="text-blue-600" />
								<h3 className="text-lg font-black">Envio de teste</h3>
							</div>
							<p className="mt-2 text-sm font-medium text-slate-500">
								Envie um teste SMTP real para validar autenticação, remetente e layout.
							</p>
							<label className="mt-5 block">
								<span className="text-sm font-bold text-slate-700">Enviar para</span>
								<input className={inputClass} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
							</label>
							<button
								type="button"
								onClick={test}
								disabled={testing}
								className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
							>
								<Send size={17} />
								{testing ? "Enviando..." : "Enviar e-mail de teste"}
							</button>
							<div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-600">
								Os e-mails de MFA, boas-vindas e bloqueio de PIN usam tokens/códigos temporários.
							</div>
						</div>
					</section>

					<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
							<div>
								<h3 className="text-lg font-black text-slate-950">Templates dos e-mails</h3>
								<p className="mt-1 text-sm font-medium text-slate-500">
									Edite o texto enviado em cada ação do sistema. As variáveis são preenchidas automaticamente.
								</p>
							</div>
							<div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold leading-relaxed text-blue-800">
								Variáveis: {"{nome}"}, {"{email}"}, {"{codigo}"}, {"{minutos}"}, {"{appUrl}"}
							</div>
						</div>

						<div className="mt-5 flex flex-wrap gap-2">
							{templateKeys.map((key) => (
								<button
									type="button"
									key={key}
									onClick={() => setActiveTemplate(key)}
									className={`rounded-lg px-4 py-2 text-sm font-black transition ${
										activeTemplate === key
											? "bg-blue-600 text-white shadow-sm"
											: "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
									}`}
								>
									{DEFAULT_EMAIL_TEMPLATES[key].label}
								</button>
							))}
						</div>

						<div className="mt-5 grid gap-4 md:grid-cols-2">
							<label>
								<span className="text-sm font-bold text-slate-700">Assunto</span>
								<input className={inputClass} value={activeTemplateConfig.subject || ""} onChange={(e) => updateTemplate("subject", e.target.value)} />
							</label>
							<label>
								<span className="text-sm font-bold text-slate-700">Título do e-mail</span>
								<input className={inputClass} value={activeTemplateConfig.title || ""} onChange={(e) => updateTemplate("title", e.target.value)} />
							</label>
							<label>
								<span className="text-sm font-bold text-slate-700">Prévia</span>
								<input className={inputClass} value={activeTemplateConfig.preview || ""} onChange={(e) => updateTemplate("preview", e.target.value)} />
							</label>
							<label>
								<span className="text-sm font-bold text-slate-700">Texto do botão</span>
								<input
									className={inputClass}
									value={activeTemplateConfig.actionLabel || ""}
									onChange={(e) => updateTemplate("actionLabel", e.target.value)}
									placeholder="Usado nos e-mails com link de ação"
								/>
							</label>
							<label className="md:col-span-2">
								<span className="text-sm font-bold text-slate-700">Corpo do e-mail</span>
								<textarea
									className={`${inputClass} min-h-[220px] resize-y leading-relaxed`}
									value={activeTemplateConfig.body || ""}
									onChange={(e) => updateTemplate("body", e.target.value)}
								/>
							</label>
						</div>
					</section>
				</>
			)}
		</div>
	);
}
