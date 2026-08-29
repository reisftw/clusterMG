import {
	CalendarClock,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	ClipboardCheck,
	Copy,
	FileText,
	Filter,
	Mail,
	MapPin,
	PackageCheck,
	Pencil,
	Phone,
	RefreshCw,
	Search,
	Trash2,
	Truck,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { useRetiradas } from "../hooks/useRetiradas";
import {
	RETIRADA_PERIODOS,
	RETIRADA_STATUS,
	RETIRADA_TRATATIVAS,
} from "../services/retiradasService";
import { openRetiradaReceiptWindow } from "../utils/retiradaReceipt";

const PAGE_SIZE = 10;
const DEVOLUCAO_QR_PATH = "/devolucao#solicitar";

const STATUS_LABELS = Object.fromEntries(
	RETIRADA_STATUS.map((item) => [item.value, item.label]),
);
const TRATATIVA_LABELS = Object.fromEntries(
	RETIRADA_TRATATIVAS.map((item) => [item.value, item.label]),
);
const PERIODO_LABELS = Object.fromEntries(
	RETIRADA_PERIODOS.map((item) => [item.value, item.label]),
);

const STATUS_STYLES = {
	novo: "bg-orange-100 text-orange-700",
	em_tratativa: "bg-blue-100 text-blue-700",
	agendado: "bg-violet-100 text-violet-700",
	concluido: "bg-emerald-100 text-emerald-700",
	cancelado: "bg-rose-100 text-rose-700",
};

const EMAIL_STATUS_META = {
	enviado: {
		label: "E-mail enviado",
		pill: "bg-emerald-100 text-emerald-700",
		card: "border-emerald-100 bg-emerald-50",
		text: "Protocolo enviado com sucesso ao cliente.",
	},
	erro: {
		label: "Erro no e-mail",
		pill: "bg-rose-100 text-rose-700",
		card: "border-rose-100 bg-rose-50",
		text: "Houve falha no envio da notificacao ao cliente.",
	},
	configuracao_pendente: {
		label: "SMTP pendente",
		pill: "bg-amber-100 text-amber-700",
		card: "border-amber-100 bg-amber-50",
		text: "As credenciais de e-mail ainda nao estavam prontas no momento do envio.",
	},
	sem_email: {
		label: "Sem e-mail",
		pill: "bg-slate-100 text-slate-700",
		card: "border-slate-200 bg-slate-50",
		text: "A solicitacao foi criada sem e-mail valido para notificacao.",
	},
};

const RECEIPT_EMAIL_STATUS_META = {
	enviado: {
		label: "Comprovante enviado",
		pill: "bg-emerald-100 text-emerald-700",
		card: "border-emerald-100 bg-emerald-50",
		text: "O comprovante digital foi enviado com sucesso ao cliente.",
	},
	erro: {
		label: "Falha no comprovante",
		pill: "bg-rose-100 text-rose-700",
		card: "border-rose-100 bg-rose-50",
		text: "Houve uma falha ao encaminhar o comprovante por e-mail.",
	},
	sem_email: {
		label: "Sem e-mail",
		pill: "bg-slate-100 text-slate-700",
		card: "border-slate-200 bg-slate-50",
		text: "Cadastre um e-mail valido para enviar o comprovante ao cliente.",
	},
	configuracao_pendente: {
		label: "SMTP pendente",
		pill: "bg-amber-100 text-amber-700",
		card: "border-amber-100 bg-amber-50",
		text: "O ambiente de envio ainda nao esta configurado para encaminhar o comprovante.",
	},
};

function formatDate(value) {
	const date =
		typeof value?.toDate === "function"
			? value.toDate()
			: value
				? new Date(value)
				: null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatCurrency(value, currency = "BRL") {
	const amount = Number(value || 0);
	return amount > 0
		? amount.toLocaleString("pt-BR", {
				style: "currency",
				currency,
			})
		: "-";
}

function isCorreiosConfigPending(message) {
	const text = String(message || "").toLowerCase();
	return (
		text.includes("cartao de postagem dos correios nao configurado") ||
		text.includes("credenciais dos correios nao configuradas")
	);
}

function getEmailStatusMeta(status) {
	return (
		EMAIL_STATUS_META[String(status || "").toLowerCase()] || {
			label: "Aguardando envio",
			pill: "bg-blue-100 text-blue-700",
			card: "border-blue-100 bg-blue-50",
			text: "A notificacao ainda nao retornou um status final.",
		}
	);
}

function getReceiptEmailStatusMeta(status) {
	return (
		RECEIPT_EMAIL_STATUS_META[String(status || "").toLowerCase()] || {
			label: "Pronto para envio",
			pill: "bg-blue-100 text-blue-700",
			card: "border-blue-100 bg-blue-50",
			text: "O comprovante ja pode ser gerado ou encaminhado por e-mail.",
		}
	);
}

function MetricCard({ icon: Icon, label, value, tone }) {
	return (
		<div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
			<div className="flex items-center gap-3">
				<div
					className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}
				>
					<Icon size={20} />
				</div>
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
						{label}
					</p>
					<p className="text-2xl font-black text-gray-900">{value}</p>
				</div>
			</div>
		</div>
	);
}

function buildPublicDevolucaoUrl() {
	const fallbackOrigin = "https://retiradas.tech";

	if (typeof window === "undefined") {
		return `${fallbackOrigin}${DEVOLUCAO_QR_PATH}`;
	}

	const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(
		window.location.hostname,
	);
	const origin = isLocalHost ? fallbackOrigin : window.location.origin;

	return `${origin}${DEVOLUCAO_QR_PATH}`;
}

function QrCodePanel() {
	const [qrCodeUrl, setQrCodeUrl] = useState("");
	const [copied, setCopied] = useState(false);
	const [downloadReady, setDownloadReady] = useState(false);
	const targetUrl = useMemo(() => buildPublicDevolucaoUrl(), []);

	useEffect(() => {
		let cancelled = false;

		QRCode.toDataURL(targetUrl, {
			margin: 1,
			width: 280,
			errorCorrectionLevel: "H",
			color: {
				dark: "#0f172a",
				light: "#ffffff",
			},
		})
			.then((dataUrl) => {
				if (!cancelled) {
					setQrCodeUrl(dataUrl);
					setDownloadReady(true);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setQrCodeUrl("");
					setDownloadReady(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [targetUrl]);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(targetUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			setCopied(false);
		}
	};

	const handleDownload = () => {
		if (!qrCodeUrl) return;

		const link = document.createElement("a");
		link.href = qrCodeUrl;
		link.download = "qrcode-devolucao-sempre.png";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	return (
		<div className="rounded-3xl border border-blue-100 bg-[linear-gradient(135deg,#eff6ff,#fff7ed)] p-5 shadow-sm">
			<div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
				<div className="flex items-center gap-4">
					<div className="overflow-hidden rounded-[28px] shadow-[0_16px_40px_rgba(37,99,235,0.16)]">
						<img
							src="/retorninho-estela.webp"
							alt="Arte para divulgacao da devolucao"
							className="h-32 w-auto object-contain sm:h-40"
						/>
					</div>
					<div className="max-w-sm">
						<p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-500">
							Acesso rapido para clientes
						</p>
						<h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
							QR Code da pagina de devolucao
						</h2>
						<p className="mt-2 text-sm leading-7 text-slate-600">
							Ao escanear, o cliente vai direto para <strong>/devolucao</strong>{" "}
							e ja abre na area do formulario para preenchimento.
						</p>
						<div className="mt-4 flex flex-wrap gap-2">
							<button
								type="button"
								onClick={handleCopy}
								className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
							>
								<Copy size={15} />
								{copied ? "Link copiado" : "Copiar link"}
							</button>
							<a
								href={targetUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
							>
								Abrir /devolucao
							</a>
							<button
								type="button"
								onClick={handleDownload}
								disabled={!downloadReady}
								className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Baixar PNG
							</button>
						</div>
						<p className="mt-3 text-xs leading-6 text-slate-500">
							Em alguns celulares, a camera mostra o link primeiro e depois
							oferece a opcao de abrir. Isso depende do aparelho, nao do QR.
						</p>
					</div>
				</div>

				<div className="justify-self-start rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] lg:justify-self-end">
					{qrCodeUrl ? (
						<a
							href={targetUrl}
							target="_blank"
							rel="noreferrer"
							title="Abrir pagina de devolucao"
							className="block transition hover:scale-[1.02]"
						>
							<img
								src={qrCodeUrl}
								alt="QR Code para acesso a pagina de devolucao"
								className="h-48 w-48 rounded-[20px] object-contain"
							/>
						</a>
					) : (
						<div className="flex h-48 w-48 items-center justify-center rounded-[20px] bg-slate-50 text-sm font-semibold text-slate-500">
							Gerando QR Code...
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function DetailItem({ label, value, icon: Icon }) {
	return (
		<div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
			<p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
				<Icon size={14} />
				{label}
			</p>
			<p className="mt-2 text-sm font-medium text-gray-700">{value || "-"}</p>
		</div>
	);
}

function Field({ label, children }) {
	return (
		<label className="block">
			<span className="mb-1 block text-xs font-semibold text-gray-500">
				{label}
			</span>
			{children}
		</label>
	);
}

function buildInitialForm(retirada) {
	return {
		protocolo: retirada.protocolo || "",
		nome: retirada.nome || "",
		cpfCnpj: retirada.cpfCnpj || "",
		telefone: retirada.telefone || "",
		email: retirada.email || "",
		contrato: retirada.contrato || "",
		equipamentoMac: retirada.equipamentoMac || "",
		cidade: retirada.cidade || "",
		cep: retirada.cep || "",
		bairro: retirada.bairro || "",
		endereco: retirada.endereco || "",
		numero: retirada.numero || "",
		complemento: retirada.complemento || "",
		referencia: retirada.referencia || "",
		equipamento: retirada.equipamento || "",
		motivo: retirada.motivo || "",
		metodo: retirada.metodo || "coleta",
		lojaSelecionadaId: retirada.lojaSelecionadaId || "",
		lojaSelecionadaNome: retirada.lojaSelecionadaNome || "",
		lojaSelecionadaEndereco: retirada.lojaSelecionadaEndereco || "",
		periodoPreferido: retirada.periodoPreferido || "",
		observacoes: retirada.observacoes || "",
		status: retirada.status || "novo",
		atendimentoNotas: retirada.atendimentoNotas || "",
		responsavelNome: retirada.responsavelNome || "",
		tratativaTipo: retirada.tratativaTipo || "",
	};
}

function buildDisplayRetirada(retirada, form, editing) {
	if (!editing) return retirada;

	return {
		...retirada,
		...form,
	};
}

function RetiradaCard({
	retirada,
	expanded,
	saving,
	quoting,
	deleting,
	receiptSending,
	onToggle,
	onSave,
	onQuote,
	onDelete,
	onSendReceipt,
}) {
	const [editing, setEditing] = useState(false);
	const [form, setForm] = useState(() => buildInitialForm(retirada));

	const updateField = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));

	const displayRetirada = buildDisplayRetirada(retirada, form, editing);

	const cancelEditing = () => {
		setForm(buildInitialForm(retirada));
		setEditing(false);
	};

	const handleSave = async () => {
		await onSave(retirada.id, form);
		setEditing(false);
	};

	const handleDelete = () => {
		const confirmed = window.confirm(
			`Deseja realmente excluir a solicitacao de ${retirada.nome}?`,
		);
		if (confirmed) onDelete(retirada.id);
	};

	const correiosPending = isCorreiosConfigPending(retirada.correiosFreteErro);
	const emailStatusMeta = getEmailStatusMeta(retirada.emailNotificacaoStatus);
	const receiptEmailStatusMeta = getReceiptEmailStatusMeta(
		retirada.reciboEmailStatus,
	);
	const isConcluded = displayRetirada.status === "concluido";

	const handleGenerateReceipt = () => {
		const opened = openRetiradaReceiptWindow(displayRetirada);
		if (!opened) {
			window.alert(
				"Nao foi possivel abrir o comprovante automaticamente. Verifique o bloqueio de pop-up do navegador e tente novamente.",
			);
		}
	};

	return (
		<div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center gap-4 px-5 py-4 text-left"
			>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
							{displayRetirada.metodo === "coleta"
								? "Coleta"
								: "Ponto de apoio"}
						</span>
						<span
							className={`rounded-full px-3 py-1 text-xs font-bold ${
								STATUS_STYLES[displayRetirada.status] ||
								"bg-gray-100 text-gray-700"
							}`}
						>
							{STATUS_LABELS[displayRetirada.status] || displayRetirada.status}
						</span>
						{displayRetirada.tratativaTipo ? (
							<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
								{TRATATIVA_LABELS[displayRetirada.tratativaTipo] ||
									displayRetirada.tratativaTipo}
							</span>
						) : null}
						{displayRetirada.protocolo ? (
							<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
								{displayRetirada.protocolo}
							</span>
						) : null}
						<span
							className={`rounded-full px-3 py-1 text-xs font-semibold ${emailStatusMeta.pill}`}
						>
							{emailStatusMeta.label}
						</span>
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
						<h2 className="text-base font-black text-gray-900">
							{displayRetirada.nome}
						</h2>
						<span className="text-sm text-gray-500">
							{displayRetirada.telefone || "-"}
						</span>
						<span className="text-sm text-gray-500">
							{displayRetirada.cidade || "-"}
						</span>
						<span className="text-sm text-gray-500">
							Criado em {formatDate(retirada.createdAt)}
						</span>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
						<span>{displayRetirada.contrato || "Sem contrato"}</span>
						<span>{displayRetirada.equipamento || "Sem equipamento"}</span>
						<span>{displayRetirada.equipamentoMac || "Sem MAC"}</span>
						<span>
							Frete:{" "}
							{correiosPending
								? "Integracao pendente"
								: formatCurrency(
										retirada.correiosFreteValor,
										retirada.correiosFreteMoeda,
									)}
						</span>
					</div>
				</div>
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
					{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
				</div>
			</button>

			{expanded ? (
				<div className="border-t border-gray-100 px-5 py-5">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-sm font-black text-gray-900">
								{editing ? "Editando solicitacao" : "Detalhes da solicitacao"}
							</p>
							<p className="text-sm text-gray-500">
								{editing
									? "Atualize os dados e salve quando terminar."
									: "Abra a edicao para ajustar dados do cliente e da tratativa."}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={editing ? cancelEditing : () => setEditing(true)}
								className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
							>
								<Pencil size={16} />
								{editing ? "Cancelar edicao" : "Editar"}
							</button>
							<button
								type="button"
								disabled={deleting}
								onClick={handleDelete}
								className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<Trash2 size={16} />
								{deleting ? "Excluindo..." : "Excluir"}
							</button>
						</div>
					</div>

					{editing ? (
						<div className="space-y-4">
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								<Field label="Nome">
									<input
										value={form.nome}
										onChange={(event) =>
											updateField("nome", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Telefone">
									<input
										value={form.telefone}
										onChange={(event) =>
											updateField("telefone", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="CPF/CNPJ">
									<input
										value={form.cpfCnpj}
										onChange={(event) =>
											updateField("cpfCnpj", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="E-mail">
									<input
										value={form.email}
										onChange={(event) =>
											updateField("email", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
							</div>

							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								<Field label="Contrato">
									<input
										value={form.contrato}
										onChange={(event) =>
											updateField("contrato", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="MAC do equipamento">
									<input
										value={form.equipamentoMac}
										onChange={(event) =>
											updateField("equipamentoMac", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono uppercase outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Cidade">
									<input
										value={form.cidade}
										onChange={(event) =>
											updateField("cidade", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="CEP">
									<input
										value={form.cep}
										onChange={(event) => updateField("cep", event.target.value)}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Bairro">
									<input
										value={form.bairro}
										onChange={(event) =>
											updateField("bairro", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
							</div>

							<div className="grid gap-4 md:grid-cols-[1.2fr_0.5fr_0.8fr_0.8fr]">
								<Field label="Endereco">
									<input
										value={form.endereco}
										onChange={(event) =>
											updateField("endereco", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Numero">
									<input
										value={form.numero}
										onChange={(event) =>
											updateField("numero", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Complemento">
									<input
										value={form.complemento}
										onChange={(event) =>
											updateField("complemento", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Referencia">
									<input
										value={form.referencia}
										onChange={(event) =>
											updateField("referencia", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
							</div>

							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								<Field label="Metodo">
									<select
										value={form.metodo}
										onChange={(event) =>
											updateField("metodo", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									>
										<option value="coleta">Coleta</option>
										<option value="ponto">Ponto de apoio</option>
									</select>
								</Field>
								<Field label="Equipamento">
									<input
										value={form.equipamento}
										onChange={(event) =>
											updateField("equipamento", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Periodo preferido">
									<select
										value={form.periodoPreferido}
										onChange={(event) =>
											updateField("periodoPreferido", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									>
										<option value="">Selecione o periodo</option>
										{RETIRADA_PERIODOS.map((item) => (
											<option key={item.value} value={item.value}>
												{item.label}
											</option>
										))}
									</select>
								</Field>
								<Field label="Status">
									<select
										value={form.status}
										onChange={(event) =>
											updateField("status", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									>
										{RETIRADA_STATUS.map((item) => (
											<option key={item.value} value={item.value}>
												{item.label}
											</option>
										))}
									</select>
								</Field>
							</div>

							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								<Field label="Tratativa">
									<select
										value={form.tratativaTipo}
										onChange={(event) =>
											updateField("tratativaTipo", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									>
										<option value="">Selecione a tratativa</option>
										{RETIRADA_TRATATIVAS.map((item) => (
											<option key={item.value} value={item.value}>
												{item.label}
											</option>
										))}
									</select>
								</Field>
								<Field label="Responsavel local">
									<input
										value={form.responsavelNome}
										onChange={(event) =>
											updateField("responsavelNome", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Motivo">
									<input
										value={form.motivo}
										onChange={(event) =>
											updateField("motivo", event.target.value)
										}
										className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
							</div>

							{form.metodo === "ponto" ? (
								<div className="grid gap-4 md:grid-cols-2">
									<Field label="Nome do ponto">
										<input
											value={form.lojaSelecionadaNome}
											onChange={(event) =>
												updateField("lojaSelecionadaNome", event.target.value)
											}
											className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
										/>
									</Field>
									<Field label="Endereco do ponto">
										<input
											value={form.lojaSelecionadaEndereco}
											onChange={(event) =>
												updateField(
													"lojaSelecionadaEndereco",
													event.target.value,
												)
											}
											className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
										/>
									</Field>
								</div>
							) : null}

							<div className="grid gap-4 md:grid-cols-2">
								<Field label="Observacoes do cliente">
									<textarea
										value={form.observacoes}
										onChange={(event) =>
											updateField("observacoes", event.target.value)
										}
										rows={4}
										className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
								<Field label="Notas da equipe">
									<textarea
										value={form.atendimentoNotas}
										onChange={(event) =>
											updateField("atendimentoNotas", event.target.value)
										}
										rows={4}
										className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-300"
									/>
								</Field>
							</div>
						</div>
					) : (
						<div className="space-y-3">
							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
								<DetailItem
									label="Telefone"
									value={displayRetirada.telefone}
									icon={Phone}
								/>
								<DetailItem
									label="Contrato"
									value={displayRetirada.contrato}
									icon={PackageCheck}
								/>
								<DetailItem
									label="Cidade"
									value={displayRetirada.cidade}
									icon={MapPin}
								/>
								<DetailItem
									label="Periodo preferido"
									value={
										PERIODO_LABELS[displayRetirada.periodoPreferido] ||
										displayRetirada.periodoPreferido
									}
									icon={CalendarClock}
								/>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<DetailItem
									label="Protocolo"
									value={displayRetirada.protocolo || "-"}
									icon={ClipboardCheck}
								/>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<DetailItem
									label="Endereco"
									value={[
										displayRetirada.endereco,
										displayRetirada.numero,
										displayRetirada.bairro,
									]
										.filter(Boolean)
										.join(", ")}
									icon={Truck}
								/>
								<DetailItem
									label="Equipamentos"
									value={displayRetirada.equipamento}
									icon={PackageCheck}
								/>
								<DetailItem
									label="MAC do equipamento"
									value={displayRetirada.equipamentoMac}
									icon={PackageCheck}
								/>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<DetailItem
									label="Tratativa atual"
									value={
										TRATATIVA_LABELS[displayRetirada.tratativaTipo] ||
										displayRetirada.tratativaTipo ||
										"-"
									}
									icon={ClipboardCheck}
								/>
								<DetailItem
									label="Responsavel"
									value={displayRetirada.responsavelNome || "-"}
									icon={Phone}
								/>
							</div>
							<div
								className={`rounded-2xl border px-4 py-4 ${emailStatusMeta.card}`}
							>
								<p className="text-xs font-black uppercase tracking-[0.18em] text-slate-700">
									Notificacao por e-mail
								</p>
								<p className="mt-2 text-lg font-black text-gray-900">
									{emailStatusMeta.label}
								</p>
								<p className="mt-1 text-sm text-gray-600">
									{emailStatusMeta.text}
								</p>
								<div className="mt-3 grid gap-3 md:grid-cols-2">
									<DetailItem
										label="E-mail do cliente"
										value={displayRetirada.email || "-"}
										icon={Phone}
									/>
									<DetailItem
										label="Enviado em"
										value={formatDate(retirada.emailNotificacaoEnviadaEm)}
										icon={CalendarClock}
									/>
								</div>
								{retirada.emailNotificacaoErro ? (
									<p className="mt-3 text-sm font-medium text-rose-700">
										{retirada.emailNotificacaoErro}
									</p>
								) : null}
							</div>
							{isConcluded ? (
								<div
									className={`rounded-2xl border px-4 py-4 ${receiptEmailStatusMeta.card}`}
								>
									<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
										<div>
											<p className="text-xs font-black uppercase tracking-[0.18em] text-slate-700">
												Comprovante de entrega
											</p>
											<p className="mt-2 text-lg font-black text-gray-900">
												{receiptEmailStatusMeta.label}
											</p>
											<p className="mt-1 text-sm text-gray-600">
												{receiptEmailStatusMeta.text}
											</p>
										</div>
										<span
											className={`rounded-full px-3 py-1 text-xs font-semibold ${receiptEmailStatusMeta.pill}`}
										>
											{receiptEmailStatusMeta.label}
										</span>
									</div>

									<div className="mt-3 grid gap-3 md:grid-cols-2">
										<DetailItem
											label="Conclusao"
											value={formatDate(
												displayRetirada.concluidoEm ||
													displayRetirada.tratativaAtualizadaEm,
											)}
											icon={CalendarClock}
										/>
										<DetailItem
											label="Enviado por e-mail"
											value={formatDate(displayRetirada.reciboEmailEnviadoEm)}
											icon={Mail}
										/>
									</div>

									{displayRetirada.reciboEmailErro ? (
										<p className="mt-3 text-sm font-medium text-rose-700">
											{displayRetirada.reciboEmailErro}
										</p>
									) : null}

									<div className="mt-4 flex flex-wrap gap-2">
										<button
											type="button"
											onClick={handleGenerateReceipt}
											className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
										>
											<FileText size={16} />
											Gerar comprovante
										</button>
										<button
											type="button"
											disabled={receiptSending || !displayRetirada.email}
											onClick={() => onSendReceipt(retirada.id)}
											className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
										>
											<Mail size={16} />
											{receiptSending
												? "Enviando comprovante..."
												: "Encaminhar por e-mail"}
										</button>
									</div>
								</div>
							) : null}
							<div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4">
								<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
									<div>
										<p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
											Custo estimado Correios
										</p>
										<p className="mt-2 text-lg font-black text-gray-900">
											{correiosPending
												? "Integracao pendente"
												: formatCurrency(
														retirada.correiosFreteValor,
														retirada.correiosFreteMoeda,
													)}
										</p>
										<p className="mt-1 text-sm text-gray-600">
											{correiosPending
												? "Configure as credenciais dos Correios na VPS para calcular."
												: retirada.correiosFreteServicoNome
													? `${retirada.correiosFreteServicoNome} (${retirada.correiosFreteServicoCodigo})`
													: "Ainda nao calculado."}
										</p>
										<p className="mt-1 text-xs text-gray-500">
											Pacote padrao: 23 x 10 x 10 cm, 780 g.
										</p>
										{retirada.correiosFreteErro ? (
											<p
												className={`mt-2 text-xs font-medium ${
													correiosPending ? "text-amber-700" : "text-rose-600"
												}`}
											>
												{correiosPending
													? "Preencha CORREIOS_CWS_USERNAME, CORREIOS_CWS_PASSWORD e CORREIOS_POSTING_CARD na VPS."
													: retirada.correiosFreteErro}
											</p>
										) : null}
									</div>
									<button
										type="button"
										disabled={quoting || correiosPending}
										onClick={() => onQuote(retirada.id)}
										className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{correiosPending
											? "Configuracao pendente"
											: quoting
												? "Calculando..."
												: "Calcular frete"}
									</button>
								</div>
							</div>
						</div>
					)}

					<div className="mt-5 flex flex-wrap justify-end gap-2">
						{editing ? (
							<>
								<button
									type="button"
									onClick={cancelEditing}
									className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
								>
									Cancelar
								</button>
								<button
									type="button"
									disabled={saving}
									onClick={handleSave}
									className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{saving ? "Salvando..." : "Salvar alteracoes"}
								</button>
							</>
						) : (
							<button
								type="button"
								onClick={() => setEditing(true)}
								className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
							>
								Editar solicitacao
							</button>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}

export default function RetiradasPage() {
	const {
		retiradas,
		loading,
		error,
		savingId,
		quotingId,
		deletingId,
		receiptSendingId,
		summary,
		updateRetirada,
		sendReceipt,
		quoteRetirada,
		removeRetirada,
	} = useRetiradas();
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("todos");
	const [methodFilter, setMethodFilter] = useState("todos");
	const [tratativaFilter, setTratativaFilter] = useState("todos");
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState(null);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();

		return retiradas.filter((item) => {
			const matchesTerm =
				!term ||
				[
					item.nome,
					item.telefone,
					item.cidade,
					item.protocolo,
					item.cep,
					item.contrato,
					item.equipamento,
					item.atendimentoNotas,
					item.responsavelNome,
					item.lojaSelecionadaNome,
					item.lojaSelecionadaEndereco,
				]
					.join(" ")
					.toLowerCase()
					.includes(term);

			const matchesStatus =
				statusFilter === "todos" || item.status === statusFilter;
			const matchesMethod =
				methodFilter === "todos" || item.metodo === methodFilter;
			const matchesTratativa =
				tratativaFilter === "todos" || item.tratativaTipo === tratativaFilter;

			return matchesTerm && matchesStatus && matchesMethod && matchesTratativa;
		});
	}, [methodFilter, retiradas, search, statusFilter, tratativaFilter]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const pageItems = filtered.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
				<div>
					<h1 className="text-2xl font-black tracking-tight text-gray-900">
						Retiradas e devolucoes
					</h1>
					<p className="mt-1 max-w-3xl text-sm text-gray-500">
						Acompanhe as solicitacoes enviadas pela pagina publica de devolucao
						e distribua a atuacao da equipe local.
					</p>
				</div>
				<div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
					Fluxo exemplo ligado em <strong>/devolucao</strong>
				</div>
			</div>

			<QrCodePanel />

			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</div>
			) : null}

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard
					icon={PackageCheck}
					label="Total"
					value={summary.total}
					tone="bg-blue-50 text-blue-700"
				/>
				<MetricCard
					icon={RefreshCw}
					label="Novos"
					value={summary.novo}
					tone="bg-orange-50 text-orange-600"
				/>
				<MetricCard
					icon={Truck}
					label="Coletas"
					value={summary.coleta}
					tone="bg-sky-50 text-sky-700"
				/>
				<MetricCard
					icon={CheckCircle2}
					label="Concluidos"
					value={summary.concluido}
					tone="bg-emerald-50 text-emerald-700"
				/>
			</div>

			<div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<Filter size={20} />
					</div>
					<div>
						<h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-900">
							Filtros
						</h2>
						<p className="text-xs text-gray-500">
							Refine a fila por status, metodo ou dados do cliente.
						</p>
					</div>
				</div>

				<div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.9fr]">
					<label className="relative block">
						<Search
							size={16}
							className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
						/>
						<input
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(1);
								setExpandedId(null);
							}}
							placeholder="Buscar por nome, telefone, cidade, contrato..."
							className="w-full rounded-2xl border border-gray-200 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-300"
						/>
					</label>
					<select
						value={statusFilter}
						onChange={(event) => {
							setStatusFilter(event.target.value);
							setPage(1);
							setExpandedId(null);
						}}
						className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-300"
					>
						<option value="todos">Todos os status</option>
						{RETIRADA_STATUS.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
					<select
						value={methodFilter}
						onChange={(event) => {
							setMethodFilter(event.target.value);
							setPage(1);
							setExpandedId(null);
						}}
						className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-300"
					>
						<option value="todos">Todos os metodos</option>
						<option value="coleta">Coleta</option>
						<option value="ponto">Ponto de apoio</option>
					</select>
					<select
						value={tratativaFilter}
						onChange={(event) => {
							setTratativaFilter(event.target.value);
							setPage(1);
							setExpandedId(null);
						}}
						className="rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-300"
					>
						<option value="todos">Todas as tratativas</option>
						{RETIRADA_TRATATIVAS.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
				<p>
					Mostrando {pageItems.length} de {filtered.length} solicitacoes
				</p>
				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={currentPage === 1}
						onClick={() => setPage((value) => Math.max(1, value - 1))}
						className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Anterior
					</button>
					<span className="rounded-xl bg-gray-100 px-3 py-2 font-semibold text-gray-700">
						Pagina {currentPage} de {totalPages}
					</span>
					<button
						type="button"
						disabled={currentPage === totalPages}
						onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
						className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Proxima
					</button>
				</div>
			</div>

			<div className="space-y-4">
				{filtered.length === 0 ? (
					<div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-14 text-center text-sm text-gray-400">
						Nenhuma solicitacao encontrada com os filtros atuais.
					</div>
				) : (
					pageItems.map((retirada) => (
						<RetiradaCard
							key={retirada.id}
							retirada={retirada}
							expanded={expandedId === retirada.id}
							saving={savingId === retirada.id}
							quoting={quotingId === retirada.id}
							deleting={deletingId === retirada.id}
							receiptSending={receiptSendingId === retirada.id}
							onToggle={() =>
								setExpandedId((current) =>
									current === retirada.id ? null : retirada.id,
								)
							}
							onSave={updateRetirada}
							onSendReceipt={sendReceipt}
							onQuote={quoteRetirada}
							onDelete={removeRetirada}
						/>
					))
				)}
			</div>
		</div>
	);
}
