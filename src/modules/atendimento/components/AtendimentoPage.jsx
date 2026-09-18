import {
	AlertTriangle,
	Bot,
	CheckCircle2,
	ChevronDown,
	RefreshCw,
	Save,
	Send,
	Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../../../context/AuthContext";
import { buscarEmpresasTecnicos } from "../../empresasTecnicos/services/empresasTecnicosService";
import {
	atualizarCasoAtendimento,
	atualizarTecnicoAtendimento,
	buscarCasoAtendimento,
	buscarConfigAtendimento,
	buscarStatusAtendimento,
	buscarTemplatesAtendimento,
	conectarAtendimento,
	configurarWebhookAtendimento,
	desconectarAtendimento,
	enviarTesteAtendimento,
	excluirTecnicoAtendimento,
	listarAvaliacoesAtendimento,
	listarCasosAtendimento,
	listarLogsAtendimento,
	listarMensagensAtendimento,
	listarTecnicosAtendimento,
	reiniciarInstanciaAtendimento,
	responderCasoAtendimento,
	salvarConfigAtendimento,
	salvarTemplatesAtendimento,
	zerarDadosOperacionaisAtendimento,
} from "../services/atendimentoService";

const PAGE_TITLES = {
	cases: "Casos de atendimento",
	technicians: "Técnicos WhatsApp",
	config: "Configurações do atendimento",
	templates: "Templates do atendimento",
	ratings: "Avaliação do atendimento",
	logs: "Logs do atendimento",
	messages: "Mensagens do atendimento",
};

const DAY_LABELS = [
	["monday", "Segunda"],
	["tuesday", "Terça"],
	["wednesday", "Quarta"],
	["thursday", "Quinta"],
	["friday", "Sexta"],
	["saturday", "Sábado"],
	["sunday", "Domingo"],
];

const TEMPLATE_GROUPS = [
	{
		id: "boas_vindas",
		label: "Boas-vindas e cadastro",
		keys: [
			"saudacao",
			"boasVindasValidado",
			"pedirCidade",
			"regionalEncontrada",
			"pedirEmpresa",
			"empresaConfirmacao",
			"empresaNaoEncontradaPrimeira",
			"empresaSemCadastroRegional",
			"empresaListaCabecalho",
			"empresaTentarNovamente",
			"pedirEmail",
			"atualizarCadastroInicio",
		],
	},
	{
		id: "consulta",
		label: "Consultas",
		keys: [
			"menu",
			"consultaOsMenu",
			"consultaOsPergunta",
			"consultaOsCidadePergunta",
			"consultaOsSemResultado",
			"consultaOsResultadoCabecalho",
			"consultaOsResultadoItem",
			"consultaOsResultadoOpcoes",
			"consultaOsMenuInvalido",
			"consultaMacPergunta",
			"consultaMacSemResultado",
			"consultaMacResultadoCabecalho",
			"consultaMacResultado",
			"consultaMacMenu",
			"consultaMacClienteRetiradaResultado",
			"consultaMacClienteRetiradaSemResultado",
			"consultaMacClienteRetiradaOpcoes",
		],
	},
	{
		id: "casos",
		label: "Casos e BackOffice",
		keys: [
			"casoCriado",
			"assumirCaso",
			"encerrarCasoPainel",
			"respostaManualPrefixo",
			"encerrado",
		],
	},
	{
		id: "avaliacao",
		label: "Avaliação",
		keys: ["solicitarAvaliacao", "avaliacaoInvalida", "avaliacaoRegistrada"],
	},
	{
		id: "sistema",
		label: "Sistema e erros",
		keys: [
			"naoEntendi",
			"nomeInvalido",
			"cidadeNaoEncontrada",
			"empresaConfirmacaoInvalida",
			"empresaListaInvalida",
			"consultaMacErro",
			"limiteTentativas",
			"tentativaInvalida",
			"foraHorario",
		],
	},
];

function buildTemplateGroups(templates = {}) {
	const used = new Set();
	const groups = TEMPLATE_GROUPS.map((group) => {
		const entries = group.keys
			.filter((key) => Object.hasOwn(templates, key))
			.map((key) => {
				used.add(key);
				return [key, templates[key]];
			});
		return { ...group, entries };
	}).filter((group) => group.entries.length > 0);

	const extraEntries = Object.entries(templates).filter(
		([key]) => !used.has(key),
	);
	if (extraEntries.length > 0) {
		groups.push({
			id: "outros",
			label: "Outros templates",
			entries: extraEntries,
		});
	}
	return groups;
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function buildSecret() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

function findQrCode(value) {
	if (!value || typeof value !== "object") return "";
	const direct = value.qrcode || value.qrCode || value.base64 || value.code;
	if (typeof direct === "string" && direct.length > 80) {
		return direct.startsWith("data:image")
			? direct
			: `data:image/png;base64,${direct.replace(/^data:image\/png;base64,/, "")}`;
	}
	for (const child of Object.values(value)) {
		const found = findQrCode(child);
		if (found) return found;
	}
	return "";
}

function findValueByKeys(value, keys) {
	if (!value || typeof value !== "object") return "";
	for (const [key, child] of Object.entries(value)) {
		const normalizedKey = String(key)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "");
		if (
			keys.includes(normalizedKey) &&
			child !== null &&
			child !== undefined &&
			typeof child !== "object"
		) {
			return String(child);
		}
	}
	for (const child of Object.values(value)) {
		const found = findValueByKeys(child, keys);
		if (found) return found;
	}
	return "";
}

function formatWhatsappNumber(value) {
	const digits = String(value || "").replace(/\D/g, "");
	if (!digits) return "";
	if (digits.length === 13 && digits.startsWith("55")) {
		return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
	}
	if (digits.length === 12 && digits.startsWith("55")) {
		return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
	}
	return value;
}

function getOrderUniqueKey(order = {}) {
	return String(
		order.codigo ||
			order.os ||
			order.num_os ||
			order.numero_os ||
			order.contrato ||
			order.id ||
			JSON.stringify(order || {}),
	)
		.trim()
		.toLowerCase();
}

function uniqueOrders(items = []) {
	const seen = new Set();
	return (Array.isArray(items) ? items : []).filter((order) => {
		const key = getOrderUniqueKey(order);
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function readConnectionDetails(status, config) {
	const connection = status?.connection || {};
	const rawState =
		connection.state ||
		connection.status ||
		findValueByKeys(connection, [
			"state",
			"status",
			"connectionstate",
			"connectionstatus",
		]) ||
		"";
	const state = String(rawState || "").toLowerCase();
	const connected =
		Boolean(connection.connected) ||
		["open", "connected", "conectado", "online"].includes(state);
	const number =
		connection.number ||
		findValueByKeys(connection, [
			"number",
			"phone",
			"owner",
			"ownerjid",
			"jid",
			"remotejid",
			"wuid",
		]);
	return {
		configured: Boolean(
			connection.configured ||
				config.evolutionBaseUrl ||
				config.evolutionApiKey ||
				config.evolutionInstance,
		),
		connected,
		state: rawState || (connection.error ? "erro" : "desconhecido"),
		number: formatWhatsappNumber(number),
		instance:
			config.evolutionInstance ||
			findValueByKeys(connection, ["instancename", "instance"]) ||
			"-",
		error: connection.error || "",
	};
}

function StatusPill({ children }) {
	return (
		<span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
			{children}
		</span>
	);
}

function Input({ label, value, onChange, type = "text" }) {
	return (
		<label className="grid gap-1 text-xs font-black uppercase text-slate-500">
			{label}
			<input
				type={type}
				value={value || ""}
				onChange={(event) => onChange(event.target.value)}
				className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-blue-400"
			/>
		</label>
	);
}

function PaginationControls({
	page,
	totalPages,
	totalItems,
	pageSize,
	onPageChange,
	onPageSizeChange,
}) {
	const safeTotalPages = Math.max(1, totalPages);
	const start = totalItems ? (page - 1) * pageSize + 1 : 0;
	const end = Math.min(totalItems, page * pageSize);
	return (
		<div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
			<p>
				Mostrando {start} a {end} de {totalItems} registros
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => onPageChange(1)}
					className="min-h-11 rounded-lg border border-slate-200 px-3 text-slate-700 disabled:opacity-40"
				>
					«
				</button>
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
					className="min-h-11 rounded-lg border border-slate-200 px-3 text-slate-700 disabled:opacity-40"
				>
					‹
				</button>
				<span className="px-2 text-slate-700">
					Página {page} de {safeTotalPages}
				</span>
				<button
					type="button"
					disabled={page >= safeTotalPages}
					onClick={() => onPageChange(page + 1)}
					className="min-h-11 rounded-lg border border-slate-200 px-3 text-slate-700 disabled:opacity-40"
				>
					›
				</button>
				<button
					type="button"
					disabled={page >= safeTotalPages}
					onClick={() => onPageChange(safeTotalPages)}
					className="min-h-11 rounded-lg border border-slate-200 px-3 text-slate-700 disabled:opacity-40"
				>
					»
				</button>
				<select
					value={pageSize}
					onChange={(event) => onPageSizeChange(Number(event.target.value))}
					className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none"
				>
					{[20, 30, 50].map((option) => (
						<option key={option} value={option}>
							{option} por página
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

function ConfirmCloseModal({ item, loading, onCancel, onConfirm }) {
	if (!item) return null;
	return (
		<div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
			<div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
				<h2 className="text-xl font-black text-slate-950">Encerrar caso?</h2>
				<p className="mt-2 text-sm font-semibold text-slate-600">
					O caso {item.protocol || item.id} será fechado e ficará registrado no
					histórico.
				</p>
				<div className="mt-5 flex flex-wrap justify-end gap-2">
					<button
						type="button"
						disabled={loading}
						onClick={onCancel}
						className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-60"
					>
						Cancelar
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onConfirm}
						className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-black text-white disabled:opacity-60"
					>
						Sim, encerrar
					</button>
				</div>
			</div>
		</div>
	);
}

function ConfirmResetOperationalDataModal({
	open,
	loading,
	onCancel,
	onConfirm,
}) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
			<div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-5 shadow-2xl">
				<div className="flex items-start gap-3">
					<div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
						<AlertTriangle size={22} />
					</div>
					<div>
						<h2 className="text-xl font-black text-slate-950">
							Zerar atendimento?
						</h2>
						<p className="mt-2 text-sm font-semibold text-slate-600">
							Essa ação limpa casos, técnicos WhatsApp e logs operacionais do
							atendimento. As configurações, templates e conexão da Evolution
							serão mantidos.
						</p>
					</div>
				</div>
				<div className="mt-5 flex flex-wrap justify-end gap-2">
					<button
						type="button"
						disabled={loading}
						onClick={onCancel}
						className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-60"
					>
						Cancelar
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onConfirm}
						className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-black text-white disabled:opacity-60"
					>
						{loading ? "Zerando..." : "Sim, zerar dados"}
					</button>
				</div>
			</div>
		</div>
	);
}

function getTechnicianName(item = {}) {
	return (
		item.name ||
		item.hubsoftName ||
		item.whatsappName ||
		item.nome ||
		"Nome não informado"
	);
}

function TechnicianEditModal({
	item,
	loading,
	empresaOptions = [],
	onCancel,
	onSave,
	onDelete,
}) {
	const [form, setForm] = useState(item || {});

	if (!item) return null;
	const update = (key, value) =>
		setForm((current) => ({ ...current, [key]: value }));
	const regionais = [
		...new Set(
			empresaOptions.map((empresa) => empresa.regional).filter(Boolean),
		),
	].sort((a, b) => a.localeCompare(b, "pt-BR"));
	const empresasDaRegional = empresaOptions.filter(
		(empresa) => !form.regional || empresa.regional === form.regional,
	);
	return (
		<div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
			<div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">
							Editar técnico WhatsApp
						</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							{formatWhatsappNumber(item.phone)} · {getTechnicianName(item)}
						</p>
					</div>
					<StatusPill>{form.status || "-"}</StatusPill>
				</div>
				<div className="mt-4 grid gap-3 md:grid-cols-2">
					<Input
						label="Nome"
						value={form.name || form.hubsoftName || ""}
						onChange={(value) => update("name", value)}
					/>
					<Input
						label="E-mail Hubsoft"
						value={form.hubsoftEmail || ""}
						onChange={(value) => update("hubsoftEmail", value)}
					/>
					<Input
						label="Cidade"
						value={form.city || form.cidade || ""}
						onChange={(value) => update("city", value)}
					/>
					<label className="grid gap-1 text-xs font-black uppercase text-slate-500">
						<span>Regional</span>
						<select
							value={form.regional || ""}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									regional: event.target.value,
									empresa: "",
									empresaId: "",
								}))
							}
							className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-blue-400"
						>
							<option value="">Selecione</option>
							{regionais.map((regional) => (
								<option key={regional} value={regional}>
									{regional}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 text-xs font-black uppercase text-slate-500">
						<span>Empresa</span>
						<select
							value={form.empresaId || ""}
							onChange={(event) => {
								const empresa = empresaOptions.find(
									(option) => option.id === event.target.value,
								);
								setForm((current) => ({
									...current,
									empresaId: empresa?.id || "",
									empresa: empresa?.nome || "",
									regional: empresa?.regional || current.regional || "",
								}));
							}}
							className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-blue-400"
						>
							<option value="">Selecione a empresa</option>
							{empresasDaRegional.map((empresa) => (
								<option key={empresa.id} value={empresa.id}>
									{empresa.nome}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 text-xs font-black uppercase text-slate-500">
						<span>Status</span>
						<select
							value={form.status || "validado"}
							onChange={(event) => update("status", event.target.value)}
							className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-blue-400"
						>
							<option value="validado">Validado</option>
							<option value="pendente_cidade">Pendente cidade</option>
							<option value="pendente_empresa">Pendente empresa</option>
							<option value="pendente_email">Pendente e-mail</option>
							<option value="bloqueado">Bloqueado</option>
						</select>
					</label>
				</div>
				<div className="mt-5 flex flex-wrap justify-between gap-2">
					<button
						type="button"
						disabled={loading}
						onClick={() => onDelete(item)}
						className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-black text-red-700 disabled:opacity-60"
					>
						Excluir técnico
					</button>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							disabled={loading}
							onClick={onCancel}
							className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-60"
						>
							Cancelar
						</button>
						<button
							type="button"
							disabled={loading}
							onClick={() => onSave(item, form)}
							className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-60"
						>
							Salvar alterações
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function AtendimentoCaseModal({
	item,
	loading,
	initialTab = "conversation",
	onCancel,
	onSend,
}) {
	const [message, setMessage] = useState("");
	const [activeTab, setActiveTab] = useState(initialTab || "conversation");

	const handleSend = async () => {
		const text = message.trim();
		if (!text) return;
		await onSend(item, text);
		setMessage("");
		setActiveTab("conversation");
	};

	if (!item) return null;
	const messages = Array.isArray(item.messages) ? item.messages : [];
	const contextOrders = uniqueOrders([
		...(Array.isArray(item.context?.ordensSelecionadas)
			? item.context.ordensSelecionadas
			: []),
		...(Array.isArray(item.context?.ordensRetirada)
			? item.context.ordensRetirada
			: []),
	]);
	const technicianName =
		item.technician?.name ||
		item.technician?.hubsoftName ||
		item.hubsoftName ||
		item.whatsappName ||
		"Técnico";
	const tabs = [
		{ id: "conversation", label: "Conversa", count: messages.length },
		{ id: "orders", label: "Ordens", count: contextOrders.length },
	];

	return (
		<div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
			<div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
				<div className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-5 text-white">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">
								Atendimento WhatsApp
							</p>
							<h2 className="mt-1 text-2xl font-black">
								Caso {item.protocol || item.id}
							</h2>
							<p className="mt-2 break-all text-sm font-semibold text-slate-200">
								{formatWhatsappNumber(item.phone)} · {technicianName}
							</p>
						</div>
						<button
							type="button"
							onClick={onCancel}
							className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/10 text-xl font-black text-white transition hover:bg-white/20"
							aria-label="Fechar atendimento"
						>
							×
						</button>
					</div>
					<div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
						<span className="rounded-full bg-white/10 px-3 py-1.5 text-blue-100">
							Status: {item.status || "-"}
						</span>
						<span className="rounded-full bg-white/10 px-3 py-1.5 text-blue-100">
							Atualizado: {formatDate(item.updatedAt || item.createdAt)}
						</span>
						{item.assignedToName && (
							<span className="rounded-full bg-white/10 px-3 py-1.5 text-blue-100">
								Responsável: {item.assignedToName}
							</span>
						)}
					</div>
				</div>

				<div className="border-b border-slate-200 bg-white px-4 pt-4">
					<div className="flex flex-wrap gap-2">
						{tabs.map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								className={`min-h-11 rounded-t-xl border px-4 text-sm font-black transition ${activeTab === tab.id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
							>
								{tab.label}{" "}
								<span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">
									{tab.count}
								</span>
							</button>
						))}
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-100 to-slate-50 p-4">
					{activeTab === "orders" ? (
						<div className="grid gap-3">
							{contextOrders.length ? (
								contextOrders.map((order, index) => (
									<article
										key={`${order.os || order.codigo || index}-${index}`}
										className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<p className="text-xs font-black uppercase tracking-[0.12em] text-blue-600">
													Ordem apresentada ao técnico
												</p>
												<h3 className="mt-1 text-lg font-black text-slate-950">
													{order.codigo || order.os || order.contrato || "-"}
												</h3>
											</div>
											<StatusPill>
												{order.status_os || order.status || "Aberta"}
											</StatusPill>
										</div>
										<div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700 md:grid-cols-3">
											<p>
												Cliente:{" "}
												<b>{order.cliente || "Cliente não informado"}</b>
											</p>
											<p>
												Tipo:{" "}
												<b>
													{order.tipo || order.tipo_os || "Tipo não informado"}
												</b>
											</p>
											<p>
												Cidade: <b>{order.cidade || "-"}</b>
											</p>
										</div>
									</article>
								))
							) : (
								<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
									Nenhuma O.S vinculada a este atendimento.
								</div>
							)}
						</div>
					) : (
						<div className="space-y-3">
							{messages.length ? (
								messages.map((entry, index) => (
									<div
										key={`${entry.at || index}-${index}`}
										className={`flex ${entry.direction === "out" ? "justify-end" : "justify-start"}`}
									>
										<div
											className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm ${entry.direction === "out" ? "bg-emerald-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200"}`}
										>
											<p className="whitespace-pre-wrap break-words">
												{entry.text || "-"}
											</p>
											<p
												className={`mt-1 text-[11px] font-bold ${entry.direction === "out" ? "text-emerald-100" : "text-slate-400"}`}
											>
												{formatDate(entry.at)}
											</p>
										</div>
									</div>
								))
							) : (
								<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
									Nenhuma mensagem registrada nesse caso.
								</div>
							)}
						</div>
					)}
				</div>

				<div className="border-t border-slate-200 bg-white p-4">
					{activeTab === "conversation" ? (
						<>
							<textarea
								value={message}
								onChange={(event) => setMessage(event.target.value)}
								placeholder="Digite sua resposta..."
								className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
							/>
							<p className="mt-2 text-xs font-bold text-slate-500">
								A mensagem será enviada com seu nome antes do texto.
							</p>
						</>
					) : (
						<div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-700">
							Essas são as ordens que o bot retornou para o técnico. Para
							conversar com ele, volte para a aba Conversa.
						</div>
					)}
					<div className="mt-4 flex flex-wrap justify-between gap-2">
						<button
							type="button"
							disabled={loading}
							onClick={onCancel}
							className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-60"
						>
							Fechar
						</button>
						<div className="flex flex-wrap gap-2">
							{activeTab !== "conversation" && (
								<button
									type="button"
									disabled={loading}
									onClick={() => setActiveTab("conversation")}
									className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-60"
								>
									Responder mensagem
								</button>
							)}
							{activeTab === "conversation" && (
								<button
									type="button"
									disabled={loading || !message.trim()}
									onClick={handleSend}
									className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-60"
								>
									Enviar mensagem
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
function ConfirmDeleteTechnicianModal({ item, loading, onCancel, onConfirm }) {
	if (!item) return null;
	return (
		<div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
			<div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
				<h2 className="text-xl font-black text-slate-950">Excluir técnico?</h2>
				<p className="mt-2 text-sm font-semibold text-slate-600">
					{getTechnicianName(item)} será removido da base de Técnicos WhatsApp.
					Essa ação não apaga empresas nem casos já registrados.
				</p>
				<div className="mt-5 flex flex-wrap justify-end gap-2">
					<button
						type="button"
						disabled={loading}
						onClick={onCancel}
						className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-60"
					>
						Cancelar
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onConfirm}
						className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-black text-white disabled:opacity-60"
					>
						Sim, excluir
					</button>
				</div>
			</div>
		</div>
	);
}

function isClosedCase(item = {}) {
	return [
		"encerrado",
		"resolvido",
		"cancelado",
		"aguardando_avaliacao",
	].includes(String(item.status || ""));
}

function isTreatmentCase(item = {}) {
	return (
		!isClosedCase(item) &&
		(String(item.status || "") === "em_tratativa" ||
			Boolean(item.assignedTo || item.assignedToName || item.assumedBy))
	);
}

function CaseCard({
	item,
	variant,
	canManageCases,
	onView,
	onReply,
	onAssume,
	onClose,
}) {
	const assignedName =
		item.assignedToName || item.assignedTo || item.assumedBy || "-";
	const technicianName =
		item.technician?.name ||
		item.technician?.hubsoftName ||
		item.name ||
		item.hubsoftName ||
		item.whatsappName ||
		"Técnico não identificado";
	return (
		<article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-lg font-black text-slate-950">
						{item.protocol || item.phone || item.id}
					</h2>
					<p className="break-all text-sm font-semibold text-slate-500">
						{item.phone || "-"} · {technicianName}
					</p>
				</div>
				<StatusPill>{item.status || "-"}</StatusPill>
			</div>
			<div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700 md:grid-cols-3">
				<p>
					Empresa: <b>{item.empresa || item.technician?.empresa || "-"}</b>
				</p>
				<p>
					Regional: <b>{item.regional || item.technician?.regional || "-"}</b>
				</p>
				<p>
					Atualizado: <b>{formatDate(item.updatedAt || item.createdAt)}</b>
				</p>
				{variant === "treatment" && (
					<p>
						Assumido por: <b>{assignedName}</b>
					</p>
				)}
				{variant === "closed" && (
					<p>
						Fechado em: <b>{formatDate(item.closedAt || item.updatedAt)}</b>
					</p>
				)}
				{variant === "closed" && (
					<p>
						Avaliado:{" "}
						<b>
							{item.ratingTargetName ||
								item.avaliadoNome ||
								item.assignedToName ||
								"Retorninho"}
						</b>
					</p>
				)}
				{variant === "closed" && (
					<p>
						Avaliação:{" "}
						<b>
							{item.rating ? (
								<RatingStars value={item.rating} />
							) : (
								"Aguardando avaliação"
							)}
						</b>
					</p>
				)}
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				{variant === "open" && (
					<button
						type="button"
						onClick={() => onAssume(item)}
						className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white"
					>
						Assumir caso
					</button>
				)}
				<button
					type="button"
					onClick={() => onView(item)}
					className="min-h-11 rounded-lg border border-blue-200 px-4 text-sm font-black text-blue-700"
				>
					Ver atendimento
				</button>
				{variant !== "closed" && canManageCases && (
					<button
						type="button"
						onClick={() => onReply(item)}
						className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white"
					>
						Responder
					</button>
				)}
				{variant !== "closed" && canManageCases && (
					<button
						type="button"
						onClick={() => onClose(item)}
						className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-black text-red-700"
					>
						Encerrar
					</button>
				)}
			</div>
		</article>
	);
}

function RatingStars({ value }) {
	const rating = Number(value || 0);
	return (
		<span
			className="inline-flex items-center gap-0.5 text-amber-400"
			aria-label={`Avaliação ${rating} de 5`}
		>
			{[1, 2, 3, 4, 5].map((star) => (
				<Star
					key={star}
					size={16}
					fill={rating >= star ? "currentColor" : "none"}
				/>
			))}
		</span>
	);
}

function CasesBoard({
	items,
	canManageCases,
	currentUser,
	onView,
	onReply,
	onAssume,
	onClose,
}) {
	const groups = useMemo(() => {
		const open = [];
		const mine = [];
		const treatment = [];
		const closed = [];
		const userKeys = [currentUser?.uid, currentUser?.email]
			.filter(Boolean)
			.map(String);
		items.forEach((item) => {
			if (isClosedCase(item)) closed.push(item);
			else if (isTreatmentCase(item)) {
				if (userKeys.includes(String(item.assignedTo || ""))) mine.push(item);
				else treatment.push(item);
			} else open.push(item);
		});
		return { open, mine, treatment, closed };
	}, [currentUser?.email, currentUser?.uid, items]);

	const sections = [
		{
			key: "open",
			title: "Casos abertos",
			description: "Aguardando alguém assumir",
			items: groups.open,
			variant: "open",
		},
		{
			key: "mine",
			title: "Meus casos",
			description: "Casos assumidos por você",
			items: groups.mine,
			variant: "treatment",
		},
		...(canManageCases
			? [
					{
						key: "treatment",
						title: "Casos em tratativa",
						description: "Já assumidos pelo BackOffice",
						items: groups.treatment,
						variant: "treatment",
					},
				]
			: []),
		{
			key: "closed",
			title: "Casos fechados",
			description: "Encerrados, resolvidos ou cancelados",
			items: groups.closed,
			variant: "closed",
		},
	];

	return (
		<div className="grid gap-4">
			<div className="grid gap-3 md:grid-cols-3">
				{sections.map((section) => (
					<div
						key={section.key}
						className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
					>
						<p className="text-xs font-black uppercase text-slate-500">
							{section.title}
						</p>
						<p className="mt-1 text-3xl font-black text-slate-950">
							{section.items.length}
						</p>
						<p className="text-sm font-semibold text-slate-500">
							{section.description}
						</p>
					</div>
				))}
			</div>
			{sections.map((section) => (
				<section
					key={section.key}
					className="rounded-lg border border-slate-200 bg-slate-50 p-4"
				>
					<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 className="text-lg font-black text-slate-950">
								{section.title}
							</h2>
							<p className="text-sm font-semibold text-slate-500">
								{section.items.length} registro(s)
							</p>
						</div>
					</div>
					<div className="grid gap-3">
						{section.items.length ? (
							section.items.map((item) => (
								<CaseCard
									key={item.id || item.phone}
									item={item}
									variant={section.variant}
									canManageCases={canManageCases}
									onView={onView}
									onReply={onReply}
									onAssume={onAssume}
									onClose={onClose}
								/>
							))
						) : (
							<div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-bold text-slate-500">
								Nenhum caso nesta etapa.
							</div>
						)}
					</div>
				</section>
			))}
		</div>
	);
}

function ListPage({
	items,
	type,
	canManageCases,
	currentUser,
	onView,
	onReply,
	onAssume,
	onClose,
	onEditTechnician,
	onDeleteTechnician,
	onToggleBlock,
}) {
	if (type === "cases") {
		return (
			<CasesBoard
				items={items}
				canManageCases={canManageCases}
				currentUser={currentUser}
				onView={onView}
				onReply={onReply}
				onAssume={onAssume}
				onClose={onClose}
			/>
		);
	}

	if (!items.length) {
		return (
			<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
				Nenhum registro encontrado.
			</div>
		);
	}

	return (
		<div className="grid gap-3">
			{items.map((item) => (
				<article
					key={item.id || item.phone}
					className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
				>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h2 className="text-lg font-black text-slate-950">
								{type === "technicians"
									? getTechnicianName(item)
									: item.protocol ||
										item.hubsoftName ||
										item.type ||
										item.phone ||
										item.id}
							</h2>
							<p className="break-all text-sm font-semibold text-slate-500">
								{type === "cases"
									? `${item.phone || "-"} · ${item.technician?.hubsoftEmail || "sem e-mail"}`
									: ""}
								{type === "technicians"
									? `${formatWhatsappNumber(item.phone) || "-"} · ${getTechnicianName(item)} · ${item.hubsoftEmail || "sem e-mail"}`
									: ""}
								{type === "logs" ? item.message : ""}
							</p>
						</div>
						<StatusPill>{item.status || item.type || "-"}</StatusPill>
					</div>
					<div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700 md:grid-cols-3">
						<p>
							Empresa: <b>{item.empresa || item.technician?.empresa || "-"}</b>
						</p>
						<p>
							Atualizado: <b>{formatDate(item.updatedAt || item.createdAt)}</b>
						</p>
						<p>
							ID Sênior:{" "}
							<b>{item.seniorId || item.technician?.seniorId || "-"}</b>
						</p>
					</div>
					{type === "technicians" && (
						<div className="mt-4 flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => onEditTechnician(item)}
								className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white"
							>
								Editar
							</button>
							<button
								type="button"
								onClick={() => onToggleBlock(item)}
								className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700"
							>
								{item.status === "bloqueado" ? "Desbloquear" : "Bloquear"}
							</button>
							<button
								type="button"
								onClick={() => onDeleteTechnician(item)}
								className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-black text-red-700"
							>
								Excluir
							</button>
						</div>
					)}
				</article>
			))}
		</div>
	);
}

function RatingsPage({ items, summary, onView }) {
	const cards = [
		{
			label: "Média geral",
			value: summary?.average ? `${summary.average}/5` : "0/5",
		},
		{ label: "Avaliações recebidas", value: summary?.totalRatings || 0 },
		{ label: "Aguardando avaliação", value: summary?.pending || 0 },
	];

	return (
		<div className="grid gap-4">
			<div className="grid gap-3 md:grid-cols-3">
				{cards.map((card) => (
					<div
						key={card.label}
						className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
					>
						<p className="text-xs font-black uppercase text-slate-500">
							{card.label}
						</p>
						<p className="mt-1 text-3xl font-black text-slate-950">
							{card.value}
						</p>
					</div>
				))}
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">
						Usuários mais bem avaliados
					</h2>
					<div className="mt-3 grid gap-2">
						{(summary?.byUser || []).map((item) => (
							<div
								key={item.name}
								className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm font-bold"
							>
								<span className="break-words text-slate-700">{item.name}</span>
								<span className="flex items-center gap-2 text-slate-950">
									<RatingStars value={Math.round(item.average)} />{" "}
									{item.average}/5 · {item.total}
								</span>
							</div>
						))}
						{!summary?.byUser?.length && (
							<p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-500">
								Sem avaliações ainda.
							</p>
						)}
					</div>
				</section>

				<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">
						Meses com melhores avaliações
					</h2>
					<div className="mt-3 grid gap-2">
						{(summary?.byMonth || []).map((item) => (
							<div
								key={item.month}
								className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm font-bold"
							>
								<span className="text-slate-700">{item.month}</span>
								<span className="flex items-center gap-2 text-slate-950">
									<RatingStars value={Math.round(item.average)} />{" "}
									{item.average}/5 · {item.total}
								</span>
							</div>
						))}
						{!summary?.byMonth?.length && (
							<p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-500">
								Sem meses avaliados ainda.
							</p>
						)}
					</div>
				</section>
			</div>

			<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Casos avaliados</h2>
				<div className="mt-3 grid gap-2">
					{items.map((item) => (
						<div
							key={item.id}
							className="rounded-lg border border-slate-100 bg-slate-50 p-3"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="font-black text-slate-950">
									{item.protocol || item.id}
								</p>
								{item.rating ? (
									<RatingStars value={item.rating} />
								) : (
									<StatusPill>Aguardando avaliação</StatusPill>
								)}
							</div>
							<p className="mt-1 text-sm font-semibold text-slate-600">
								Técnico:{" "}
								{item.technician?.name ||
									item.technician?.hubsoftName ||
									item.whatsappName ||
									"-"}{" "}
								· Avaliado:{" "}
								{item.ratingTargetName ||
									item.avaliadoNome ||
									item.assignedToName ||
									"Retorninho"}
							</p>
							<p className="text-xs font-bold text-slate-500">
								Encerrado em: {formatDate(item.closedAt)} · Avaliado em:{" "}
								{formatDate(item.ratingAt)}
							</p>
							<button
								type="button"
								onClick={() => onView(item)}
								className="mt-3 min-h-11 rounded-lg border border-blue-200 px-4 text-sm font-black text-blue-700"
							>
								Ver caso
							</button>
						</div>
					))}
					{!items.length && (
						<p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-500">
							Nenhum caso para avaliação.
						</p>
					)}
				</div>
			</section>
		</div>
	);
}

function messageStatusClass(status) {
	if (status === "falha") return "border-red-200 bg-red-50 text-red-700";
	if (status === "ignorado")
		return "border-amber-200 bg-amber-50 text-amber-700";
	if (status === "enviado")
		return "border-emerald-200 bg-emerald-50 text-emerald-700";
	if (status === "recebido") return "border-blue-200 bg-blue-50 text-blue-700";
	return "border-slate-200 bg-slate-50 text-slate-700";
}

function MessagesPage({ items, summary, filters, setFilters }) {
	const cards = [
		{ label: "Total registrado", value: summary?.total || 0 },
		{ label: "Recebidas", value: summary?.in_recebido || 0 },
		{ label: "Enviadas", value: summary?.out_enviado || 0 },
		{ label: "Ignoradas", value: summary?.in_ignorado || 0 },
		{ label: "Falhas", value: summary?.out_falha || 0 },
	];
	return (
		<div className="grid gap-4">
			<section className="grid gap-3 md:grid-cols-5">
				{cards.map((card) => (
					<div
						key={card.label}
						className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
					>
						<p className="text-xs font-black uppercase text-slate-500">
							{card.label}
						</p>
						<p className="mt-1 text-2xl font-black text-slate-950">
							{Number(card.value || 0).toLocaleString("pt-BR")}
						</p>
					</div>
				))}
			</section>

			<section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
				<label className="grid gap-1 text-xs font-black uppercase text-slate-500">
					<span>Direção</span>
					<select
						value={filters.direction || ""}
						onChange={(event) =>
							setFilters((current) => ({
								...current,
								direction: event.target.value,
							}))
						}
						className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-blue-400"
					>
						<option value="">Todas</option>
						<option value="in">Recebidas</option>
						<option value="out">Enviadas</option>
					</select>
				</label>
				<label className="grid gap-1 text-xs font-black uppercase text-slate-500">
					<span>Status</span>
					<select
						value={filters.status || ""}
						onChange={(event) =>
							setFilters((current) => ({
								...current,
								status: event.target.value,
							}))
						}
						className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-blue-400"
					>
						<option value="">Todos</option>
						<option value="recebido">Recebido</option>
						<option value="enviado">Enviado</option>
						<option value="ignorado">Ignorado</option>
						<option value="falha">Falha</option>
					</select>
				</label>
				<div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-700">
					Use esta tela para confirmar se o webhook recebeu a mensagem, se o bot
					ignorou por configuração e se a resposta saiu pela Evolution.
				</div>
			</section>

			<section className="grid gap-3">
				{items.map((item) => (
					<article
						key={item.id}
						className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
					>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="text-lg font-black text-slate-950">
									{item.direction === "out" ? "Enviada" : "Recebida"} ·{" "}
									{formatWhatsappNumber(item.phone) ||
										item.phone ||
										"telefone não identificado"}
								</h2>
								<p className="text-xs font-bold text-slate-500">
									{formatDate(item.createdAt)} · Caso: {item.caseId || "-"} ·
									Protocolo: {item.protocol || "-"}
								</p>
							</div>
							<span
								className={`rounded-full border px-3 py-1 text-xs font-black ${messageStatusClass(item.status)}`}
							>
								{item.status || "-"}
							</span>
						</div>
						<p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-800">
							{item.text || "Sem texto legível registrado."}
						</p>
						<div className="mt-3 grid gap-2 text-sm font-semibold text-slate-600 md:grid-cols-3">
							<p>
								Motivo: <b>{item.reason || "-"}</b>
							</p>
							<p>
								Provedor: <b>{item.provider || "-"}</b>
							</p>
							<p>
								Tipo payload:{" "}
								<b>{item.payload?.messageType || item.payload?.mode || "-"}</b>
							</p>
							<p>
								Status provedor:{" "}
								<b>{item.providerStatus || item.payload?.status || "-"}</b>
							</p>
							<p>
								Message ID: <b>{item.payload?.messageId || "-"}</b>
							</p>
							<p>
								Número usado: <b>{item.payload?.usedNumber || "-"}</b>
							</p>
							<p className="break-all">
								Remote JID: <b>{item.payload?.remoteJid || "-"}</b>
							</p>
						</div>
						{Array.isArray(item.payload?.attempts) &&
						item.payload.attempts.length ? (
							<div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs font-bold text-slate-600">
								<p className="mb-2 text-slate-950">Tentativas Evolution</p>
								<div className="grid gap-1">
									{item.payload.attempts.map((attempt, index) => (
										<p
											key={`${attempt.number || index}-${index}`}
											className="break-all"
										>
											{index + 1}. {attempt.number || "-"} ·{" "}
											{attempt.payloadMode || "-"} ·{" "}
											{attempt.status || attempt.error || "-"} ·{" "}
											{attempt.messageId || "-"} · {attempt.remoteJid || "-"}
										</p>
									))}
								</div>
							</div>
						) : null}
						{item.error ? (
							<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
								Erro: {item.error}
							</div>
						) : null}
					</article>
				))}
				{!items.length && (
					<p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
						Nenhuma mensagem registrada.
					</p>
				)}
			</section>
		</div>
	);
}

function TemplatesPage({ config, setConfig, loading, onSave }) {
	const [openGroups, setOpenGroups] = useState({});
	const [feedback, setFeedback] = useState(null);
	const groups = useMemo(
		() => buildTemplateGroups(config.templates || {}),
		[config.templates],
	);
	const setTemplate = (key, value) =>
		setConfig((current) => ({
			...current,
			templates: { ...(current.templates || {}), [key]: value },
		}));
	const toggleGroup = (groupId) =>
		setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
	const handleSave = async () => {
		setFeedback(null);
		try {
			await onSave();
			setFeedback({
				type: "success",
				title: "Templates salvos",
				message: "As mensagens do atendimento foram atualizadas com sucesso.",
			});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro ao salvar",
				message: error?.message || "Não foi possível salvar os templates.",
			});
		}
	};

	return (
		<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-xl font-black text-slate-950">
						Templates do atendimento
					</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">
						Edite as mensagens automáticas enviadas pelo bot. Variáveis como{" "}
						{"{nome}"}, {"{protocolo}"} e {"{regional}"} são preenchidas pelo
						sistema.
					</p>
				</div>
				<button
					type="button"
					disabled={loading}
					onClick={handleSave}
					className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
				>
					<Save size={16} /> {loading ? "Salvando..." : "Salvar templates"}
				</button>
			</div>

			{feedback && (
				<div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
					<div
						className={`w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl ${feedback.type === "success" ? "border-emerald-200" : "border-red-200"}`}
					>
						<div
							className={`grid h-12 w-12 place-items-center rounded-xl ${feedback.type === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}
						>
							{feedback.type === "success" ? (
								<CheckCircle2 size={24} />
							) : (
								<AlertTriangle size={24} />
							)}
						</div>
						<h3 className="mt-4 text-xl font-black text-slate-950">
							{feedback.title}
						</h3>
						<p className="mt-2 text-sm font-semibold text-slate-600">
							{feedback.message}
						</p>
						<div className="mt-5 flex justify-end">
							<button
								type="button"
								onClick={() => setFeedback(null)}
								className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-black text-white"
							>
								OK
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="mt-4 grid gap-3">
				{groups.map((group) => {
					const isOpen = Boolean(openGroups[group.id]);
					return (
						<div
							key={group.id}
							className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
						>
							<button
								type="button"
								onClick={() => toggleGroup(group.id)}
								className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-black text-slate-900"
							>
								<span>{group.label}</span>
								<span className="flex items-center gap-2 text-xs font-black uppercase text-slate-500">
									{group.entries.length} template(s)
									<ChevronDown
										size={18}
										className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
									/>
								</span>
							</button>
							{isOpen && (
								<div className="grid gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-2">
									{group.entries.map(([key, value]) => (
										<label
											key={key}
											className="grid gap-1 text-xs font-black uppercase text-slate-500"
										>
											{key}
											<textarea
												value={value || ""}
												onChange={(event) =>
													setTemplate(key, event.target.value)
												}
												className="min-h-28 rounded-lg border border-slate-200 p-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-blue-400"
											/>
										</label>
									))}
								</div>
							)}
						</div>
					);
				})}
				{!groups.length && (
					<p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-500">
						Nenhum template encontrado.
					</p>
				)}
			</div>
		</section>
	);
}
function ConfigPage({
	config,
	setConfig,
	status,
	loading,
	onSave,
	onConnect,
	onDisconnect,
	onResetInstance,
	onWebhook,
	onTest,
	onResetData,
	canResetData = false,
}) {
	const setField = (key, value) =>
		setConfig((current) => ({ ...current, [key]: value }));
	const setBusinessHour = (day, key, value) =>
		setConfig((current) => ({
			...current,
			businessHours: {
				...(current.businessHours || {}),
				[day]: { ...(current.businessHours?.[day] || {}), [key]: value },
			},
		}));
	const teamMembers = Array.isArray(config.teamMembers)
		? config.teamMembers
		: [];
	const setTeamMember = (index, key, value) =>
		setConfig((current) => {
			const members = Array.isArray(current.teamMembers)
				? [...current.teamMembers]
				: [];
			members[index] = { ...(members[index] || {}), [key]: value };
			return { ...current, teamMembers: members };
		});
	const addTeamMember = () =>
		setConfig((current) => ({
			...current,
			teamMembers: [
				...(Array.isArray(current.teamMembers) ? current.teamMembers : []),
				{ name: "", phone: "" },
			],
		}));
	const removeTeamMember = (index) =>
		setConfig((current) => ({
			...current,
			teamMembers: (Array.isArray(current.teamMembers)
				? current.teamMembers
				: []
			).filter((_, itemIndex) => itemIndex !== index),
		}));
	const [testNumber, setTestNumber] = useState("");
	const [testMessage, setTestMessage] = useState(
		"Teste do atendimento automático.",
	);
	const webhook = `${String(config.evolutionWebhookUrl || "https://retiradas.tech/api/webhooks/evolution-atendimento").split("?")[0]}?secret=${encodeURIComponent(config.webhookSecret || "")}`;
	const qrCode = findQrCode(status);
	const connection = readConnectionDetails(status, config);
	const webhookOk = Boolean(status?.webhook?.ok || status?.webhookResult?.ok);
	const statusClasses = connection.connected
		? "border-emerald-200 bg-emerald-50 text-emerald-700"
		: connection.error
			? "border-red-200 bg-red-50 text-red-700"
			: "border-amber-200 bg-amber-50 text-amber-700";

	return (
		<div className="grid gap-4">
			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">
							Evolution Atendimento
						</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Status persistente da instância separada do atendimento.
						</p>
					</div>
					<span
						className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClasses}`}
					>
						{connection.connected
							? "Conectado"
							: connection.error
								? "Erro na conexão"
								: "Aguardando conexão"}
					</span>
				</div>

				<div className="mt-4 grid gap-3 md:grid-cols-4">
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
						<p className="text-[11px] font-black uppercase text-slate-500">
							Instância
						</p>
						<p className="mt-1 break-all text-sm font-black text-slate-900">
							{connection.instance}
						</p>
					</div>
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
						<p className="text-[11px] font-black uppercase text-slate-500">
							Número conectado
						</p>
						<p className="mt-1 break-all text-sm font-black text-slate-900">
							{connection.number || "Não informado pela Evolution"}
						</p>
					</div>
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
						<p className="text-[11px] font-black uppercase text-slate-500">
							Estado
						</p>
						<p className="mt-1 break-all text-sm font-black text-slate-900">
							{connection.state}
						</p>
					</div>
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
						<p className="text-[11px] font-black uppercase text-slate-500">
							Webhook
						</p>
						<p
							className={`mt-1 text-sm font-black ${webhookOk ? "text-emerald-700" : "text-amber-700"}`}
						>
							{webhookOk ? "Configurado" : "Pendente"}
						</p>
					</div>
				</div>
				{connection.error && (
					<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
						{connection.error}
					</div>
				)}

				<div className="mt-4 grid gap-3 md:grid-cols-2">
					<Input
						label="Base URL"
						value={config.evolutionBaseUrl}
						onChange={(value) => setField("evolutionBaseUrl", value)}
					/>
					<Input
						label="Token/API Key"
						value={config.evolutionApiKey}
						onChange={(value) => setField("evolutionApiKey", value)}
					/>
					<Input
						label="Instância"
						value={config.evolutionInstance}
						onChange={(value) => setField("evolutionInstance", value)}
					/>
					<Input
						label="Webhook URL"
						value={config.evolutionWebhookUrl}
						onChange={(value) => setField("evolutionWebhookUrl", value)}
					/>
					<Input
						label="Segredo"
						value={config.webhookSecret}
						onChange={(value) => setField("webhookSecret", value)}
					/>
					<label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700">
						<input
							type="checkbox"
							checked={Boolean(config.enabled)}
							onChange={(event) => setField("enabled", event.target.checked)}
						/>
						<span>Ativar bot</span>
					</label>
				</div>
				<div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-bold text-blue-700 break-all">
					{webhook}
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<button
						type="button"
						disabled={loading}
						onClick={() => setField("webhookSecret", buildSecret())}
						className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
					>
						Gerar segredo
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onConnect}
						className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
					>
						Conectar / QR
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onDisconnect}
						className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-black text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						Desconectar
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onResetInstance}
						className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
					>
						Reiniciar / novo QR
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onWebhook}
						className="min-h-11 rounded-lg border border-emerald-200 px-4 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{loading ? "Configurando..." : "Configurar webhook"}
					</button>
					<button
						type="button"
						disabled={loading}
						onClick={onSave}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Save size={16} /> Salvar
					</button>
				</div>
				{qrCode && (
					<img
						src={qrCode}
						alt="QR Code"
						className="mt-4 h-56 w-56 rounded-lg border border-slate-200 object-contain p-2"
					/>
				)}
				{status?.connectResult && !qrCode && (
					<pre className="mt-4 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs font-semibold text-slate-100">
						{JSON.stringify(status.connectResult, null, 2)}
					</pre>
				)}
				{status?.webhookResult && (
					<div
						className={`mt-4 rounded-lg border p-3 text-sm font-bold ${status.webhookResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
					>
						<p>
							{status.webhookResult.ok
								? "Webhook configurado com sucesso."
								: "Não foi possível configurar o webhook."}
						</p>
						<p className="mt-1 break-all text-xs font-semibold opacity-80">
							{status.webhookResult.ok
								? webhook
								: status.webhookResult.error ||
									"Verifique a configuração da Evolution."}
						</p>
					</div>
				)}
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">
							Equipe interna
						</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Números cadastrados aqui recebem um menu somente de consulta e não
							abrem casos.
						</p>
					</div>
					<button
						type="button"
						disabled={loading}
						onClick={addTeamMember}
						className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
					>
						Adicionar equipe
					</button>
				</div>
				<div className="mt-4 grid gap-3">
					{teamMembers.map((member, index) => (
						<div
							key={`equipe-interna-${index}`}
							className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_240px_auto]"
						>
							<Input
								label="Nome"
								value={member.name || member.nome || ""}
								onChange={(value) => setTeamMember(index, "name", value)}
							/>
							<Input
								label="Número WhatsApp"
								value={member.phone || member.telefone || ""}
								onChange={(value) => setTeamMember(index, "phone", value)}
							/>
							<button
								type="button"
								disabled={loading}
								onClick={() => removeTeamMember(index)}
								className="min-h-11 self-end rounded-lg border border-red-200 px-4 text-sm font-black text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Remover
							</button>
						</div>
					))}
					{!teamMembers.length && (
						<p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-500">
							Nenhuma pessoa da equipe cadastrada.
						</p>
					)}
				</div>
				<div className="mt-4 flex flex-wrap justify-end gap-2">
					<button
						type="button"
						disabled={loading}
						onClick={onSave}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Save size={16} /> Salvar equipe
					</button>
				</div>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-xl font-black text-slate-950">
					Horário de atendimento
				</h2>
				<label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700">
					<input
						type="checkbox"
						checked={Boolean(config.businessHoursEnabled)}
						onChange={(event) =>
							setField("businessHoursEnabled", event.target.checked)
						}
					/>
					<span>Respeitar horário configurado</span>
				</label>
				<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{DAY_LABELS.map(([day, label]) => (
						<div key={day} className="rounded-lg border border-slate-200 p-3">
							<label className="flex items-center gap-2 text-sm font-black text-slate-800">
								<input
									type="checkbox"
									checked={Boolean(config.businessHours?.[day]?.enabled)}
									onChange={(event) =>
										setBusinessHour(day, "enabled", event.target.checked)
									}
								/>
								<span>{label}</span>
							</label>
							<div className="mt-3 grid grid-cols-2 gap-2">
								<input
									type="time"
									value={config.businessHours?.[day]?.start || "08:00"}
									onChange={(event) =>
										setBusinessHour(day, "start", event.target.value)
									}
									className="min-h-10 rounded-lg border border-slate-200 px-2 text-sm font-bold"
								/>
								<input
									type="time"
									value={config.businessHours?.[day]?.end || "18:00"}
									onChange={(event) =>
										setBusinessHour(day, "end", event.target.value)
									}
									className="min-h-10 rounded-lg border border-slate-200 px-2 text-sm font-bold"
								/>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-xl font-black text-slate-950">Teste</h2>
				<div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr_auto]">
					<input
						value={testNumber}
						onChange={(event) => setTestNumber(event.target.value)}
						placeholder="Número WhatsApp"
						className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold"
					/>
					<input
						value={testMessage}
						onChange={(event) => setTestMessage(event.target.value)}
						placeholder="Mensagem"
						className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold"
					/>
					<button
						type="button"
						onClick={() => onTest({ number: testNumber, message: testMessage })}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white"
					>
						<Send size={16} /> TESTE
					</button>
				</div>
			</section>

			{canResetData ? (
				<section className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-xl font-black text-red-950">
								Preparar operação
							</h2>
							<p className="mt-1 text-sm font-semibold text-red-700">
								Use apenas antes de iniciar oficialmente. Limpa casos, técnicos
								WhatsApp e logs, mantendo configurações e templates.
							</p>
						</div>
						<button
							type="button"
							disabled={loading}
							onClick={onResetData}
							className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
						>
							<AlertTriangle size={16} /> Zerar dados
						</button>
					</div>
				</section>
			) : null}
		</div>
	);
}

export default function AtendimentoPage({ page = "cases" }) {
	const { currentUser } = useAuthContext();
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState("");
	const [items, setItems] = useState([]);
	const [summary, setSummary] = useState(null);
	const [config, setConfig] = useState({});
	const [status, setStatus] = useState(null);
	const [search, setSearch] = useState("");
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 20,
		total: 0,
	});
	const [messageFilters, setMessageFilters] = useState({
		direction: "",
		status: "",
	});
	const [caseToClose, setCaseToClose] = useState(null);
	const [caseToReply, setCaseToReply] = useState(null);
	const [caseModalInitialTab, setCaseModalInitialTab] =
		useState("conversation");
	const [technicianToEdit, setTechnicianToEdit] = useState(null);
	const [technicianToDelete, setTechnicianToDelete] = useState(null);
	const [resetDataOpen, setResetDataOpen] = useState(false);
	const [empresaOptions, setEmpresaOptions] = useState([]);

	const load = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const offset = (pagination.page - 1) * pagination.pageSize;
			if (page === "cases") {
				const response = await listarCasosAtendimento({
					search,
					limit: pagination.pageSize,
					offset,
				});
				setItems(response?.items || []);
				setPagination((current) => ({
					...current,
					total: Number(response?.total || 0),
				}));
			}
			if (page === "technicians") {
				const [response, empresas] = await Promise.all([
					listarTecnicosAtendimento({
						search,
						limit: pagination.pageSize,
						offset,
					}),
					buscarEmpresasTecnicos().catch(() => []),
				]);
				setItems(response?.items || []);
				setEmpresaOptions(empresas || []);
				setPagination((current) => ({
					...current,
					total: Number(response?.total || 0),
				}));
			}
			if (page === "logs") {
				const response = await listarLogsAtendimento({
					search,
					limit: pagination.pageSize,
					offset,
				});
				setItems(response?.items || []);
				setPagination((current) => ({
					...current,
					total: Number(response?.total || 0),
				}));
			}
			if (page === "messages") {
				const response = await listarMensagensAtendimento({
					search,
					direction: messageFilters.direction,
					status: messageFilters.status,
					limit: pagination.pageSize,
					offset,
				});
				setItems(response?.items || []);
				setSummary(response?.summary || null);
				setPagination((current) => ({
					...current,
					total: Number(response?.total || 0),
				}));
			}
			if (page === "ratings") {
				const response = await listarAvaliacoesAtendimento({
					search,
					limit: pagination.pageSize,
					offset,
				});
				setItems(response?.items || []);
				setSummary(response?.summary || null);
				setPagination((current) => ({
					...current,
					total: Number(response?.total || 0),
				}));
			}
			if (page === "config") {
				const [configResponse, statusResponse] = await Promise.all([
					buscarConfigAtendimento(),
					buscarStatusAtendimento(),
				]);
				setConfig(configResponse || {});
				setStatus(statusResponse || null);
			}
			if (page === "templates") {
				const templatesResponse = await buscarTemplatesAtendimento();
				setConfig(templatesResponse || { templates: {} });
				setStatus(null);
			}
		} catch (error) {
			setMessage(error?.message || "Erro interno.");
		} finally {
			setLoading(false);
		}
	}, [
		messageFilters.direction,
		messageFilters.status,
		page,
		pagination.page,
		pagination.pageSize,
		search,
	]);

	const explicitPermissions = Array.isArray(currentUser?.permissions)
		? currentUser.permissions
		: [];
	const currentRole = String(currentUser?.role || "").toLowerCase();
	const canManageCases =
		["admin", "supervisor"].includes(currentRole) ||
		explicitPermissions.includes("atendimento.casos.manage");

	useEffect(() => {
		load();
	}, [load]);

	const run = async (action, success) => {
		setLoading(true);
		setMessage("");
		try {
			await action();
			setMessage(success);
			await load();
		} catch (error) {
			setMessage(error?.message || "Erro interno.");
		} finally {
			setLoading(false);
		}
	};

	const connectAndShowQr = async () => {
		setLoading(true);
		setMessage("");
		try {
			await salvarConfigAtendimento(config);
			const result = await conectarAtendimento();
			setStatus((current) => ({
				...(current || {}),
				connectResult: result,
				connection: result?.connect || result?.connection || result,
			}));
			setMessage(
				findQrCode(result)
					? "QR Code gerado. Escaneie com o novo número."
					: "Conexão chamada. Veja o retorno abaixo.",
			);
		} catch (error) {
			setMessage(error?.message || "Erro ao conectar Evolution Atendimento.");
		} finally {
			setLoading(false);
		}
	};

	const resetInstanceAndShowQr = async () => {
		setLoading(true);
		setMessage("");
		try {
			await salvarConfigAtendimento(config);
			const result = await reiniciarInstanciaAtendimento();
			const connectResult = result?.connect || result;
			setStatus((current) => ({
				...(current || {}),
				connectResult,
				resetResult: result,
				connection:
					connectResult?.connect || connectResult?.connection || connectResult,
			}));
			setMessage(
				findQrCode(result)
					? "Instância reiniciada. Escaneie o novo QR Code."
					: "Instância reiniciada. Veja o retorno abaixo.",
			);
		} catch (error) {
			setMessage(
				error?.message ||
					"Erro ao reiniciar a instância Evolution Atendimento.",
			);
		} finally {
			setLoading(false);
		}
	};

	const configureWebhookNow = async (event) => {
		event?.preventDefault?.();
		setLoading(true);
		setMessage("");
		try {
			await salvarConfigAtendimento(config);
			const result = await configurarWebhookAtendimento();
			setStatus((current) => ({
				...(current || {}),
				webhookResult: result,
				webhook: result,
			}));
			setMessage("Webhook configurado na Evolution Atendimento.");
			await load();
		} catch (error) {
			setMessage(error?.message || "Erro ao configurar webhook.");
		} finally {
			setLoading(false);
		}
	};

	const saveTechnicianEdit = (item, form) => {
		setTechnicianToEdit(null);
		return run(
			() =>
				atualizarTecnicoAtendimento(item.phone, {
					name: form.name || form.hubsoftName || "",
					hubsoftEmail: form.hubsoftEmail || "",
					empresa: form.empresa || "",
					empresaId: form.empresaId || "",
					city: form.city || form.cidade || "",
					regional: form.regional || "",
					status: form.status || "validado",
				}),
			"Técnico atualizado.",
		);
	};

	const confirmDeleteTechnician = (item) => {
		setTechnicianToEdit(null);
		setTechnicianToDelete(item);
	};

	const openCaseModal = async (
		item,
		initialTab = "conversation",
		{ autoAssume = false } = {},
	) => {
		setLoading(true);
		setMessage("");
		try {
			let target = item;
			if (autoAssume && !isClosedCase(item) && !isTreatmentCase(item)) {
				target = await atualizarCasoAtendimento(item.id, { action: "assumir" });
			}
			const fullCase = await buscarCasoAtendimento(target.id || item.id);
			setCaseModalInitialTab(initialTab);
			setCaseToReply(fullCase || target);
			await load();
		} catch (error) {
			setMessage(error?.message || "Erro ao abrir atendimento.");
		} finally {
			setLoading(false);
		}
	};

	const openReplyModal = (item) =>
		openCaseModal(item, "conversation", { autoAssume: true });

	const sendReply = (item, text) => {
		setLoading(true);
		setMessage("");
		return responderCasoAtendimento(item.id, text)
			.then(() => buscarCasoAtendimento(item.id))
			.then((updatedCase) => {
				setCaseToReply(updatedCase || item);
				setMessage("Resposta enviada.");
				return load();
			})
			.catch((error) => setMessage(error?.message || "Erro ao responder caso."))
			.finally(() => setLoading(false));
	};

	const totalPages = Math.max(
		1,
		Math.ceil(pagination.total / pagination.pageSize),
	);
	const showPagination = !["config", "templates"].includes(page);

	return (
		<div className="space-y-4">
			<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-blue-600">
							<Bot size={24} />
						</div>
						<div>
							<h1 className="text-2xl font-black text-slate-950">
								{PAGE_TITLES[page] || PAGE_TITLES.cases}
							</h1>
							<p className="text-sm font-semibold text-slate-500">
								Módulo separado da Mensageria, com instância própria.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700"
					>
						<RefreshCw size={16} className={loading ? "animate-spin" : ""} />{" "}
						Atualizar
					</button>
				</div>
			</div>

			{message && (
				<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-700">
					{message}
				</div>
			)}

			{!["config", "templates"].includes(page) && (
				<input
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
						setPagination((current) => ({ ...current, page: 1 }));
					}}
					placeholder="Buscar..."
					className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400"
				/>
			)}

			{showPagination && (
				<PaginationControls
					page={Math.min(pagination.page, totalPages)}
					totalPages={totalPages}
					totalItems={pagination.total}
					pageSize={pagination.pageSize}
					onPageChange={(nextPage) =>
						setPagination((current) => ({
							...current,
							page: Math.min(Math.max(nextPage, 1), totalPages),
						}))
					}
					onPageSizeChange={(nextSize) =>
						setPagination({
							page: 1,
							pageSize: nextSize,
							total: pagination.total,
						})
					}
				/>
			)}

			{page === "config" ? (
				<ConfigPage
					config={config}
					setConfig={setConfig}
					status={status}
					loading={loading}
					onSave={() =>
						run(() => salvarConfigAtendimento(config), "Configurações salvas.")
					}
					onConnect={connectAndShowQr}
					onDisconnect={() =>
						run(desconectarAtendimento, "Instância desconectada.")
					}
					onResetInstance={resetInstanceAndShowQr}
					onWebhook={configureWebhookNow}
					onTest={(payload) =>
						run(() => enviarTesteAtendimento(payload), "Teste enviado.")
					}
					onResetData={() => setResetDataOpen(true)}
					canResetData={currentRole === "admin"}
				/>
			) : page === "templates" ? (
				<TemplatesPage
					config={config}
					setConfig={setConfig}
					loading={loading}
					onSave={async () => {
						setLoading(true);
						setMessage("");
						try {
							await salvarTemplatesAtendimento(config.templates || {});
							setMessage("Templates salvos.");
							await load();
						} catch (error) {
							setMessage(error?.message || "Erro interno.");
							throw error;
						} finally {
							setLoading(false);
						}
					}}
				/>
			) : page === "messages" ? (
				<MessagesPage
					items={items}
					summary={summary}
					filters={messageFilters}
					setFilters={(updater) => {
						setMessageFilters(updater);
						setPagination((current) => ({ ...current, page: 1 }));
					}}
				/>
			) : page === "ratings" ? (
				<RatingsPage
					items={items}
					summary={summary}
					onView={(item) => openCaseModal(item, "conversation")}
				/>
			) : (
				<ListPage
					items={items}
					type={page}
					canManageCases={canManageCases}
					currentUser={currentUser}
					onView={(item) => openCaseModal(item, "conversation")}
					onReply={openReplyModal}
					onAssume={(item) =>
						run(
							() => atualizarCasoAtendimento(item.id, { action: "assumir" }),
							"Caso assumido.",
						)
					}
					onClose={(item) => setCaseToClose(item)}
					onEditTechnician={(item) => setTechnicianToEdit(item)}
					onDeleteTechnician={confirmDeleteTechnician}
					onToggleBlock={(item) =>
						run(
							() =>
								atualizarTecnicoAtendimento(item.phone, {
									status:
										item.status === "bloqueado" ? "validado" : "bloqueado",
								}),
							"Técnico atualizado.",
						)
					}
				/>
			)}
			{showPagination && items.length > 0 && (
				<PaginationControls
					page={Math.min(pagination.page, totalPages)}
					totalPages={totalPages}
					totalItems={pagination.total}
					pageSize={pagination.pageSize}
					onPageChange={(nextPage) =>
						setPagination((current) => ({
							...current,
							page: Math.min(Math.max(nextPage, 1), totalPages),
						}))
					}
					onPageSizeChange={(nextSize) =>
						setPagination({
							page: 1,
							pageSize: nextSize,
							total: pagination.total,
						})
					}
				/>
			)}
			<ConfirmCloseModal
				item={caseToClose}
				loading={loading}
				onCancel={() => setCaseToClose(null)}
				onConfirm={() => {
					const item = caseToClose;
					setCaseToClose(null);
					run(
						() =>
							atualizarCasoAtendimento(item.id, {
								action: "encerrar",
								status: "encerrado",
								step: "encerrado",
								closedReason: "Encerrado pelo painel de atendimento",
							}),
						"Caso encerrado.",
					);
				}}
			/>
			<TechnicianEditModal
				key={technicianToEdit?.phone || "technician-edit"}
				item={technicianToEdit}
				loading={loading}
				empresaOptions={empresaOptions}
				onCancel={() => setTechnicianToEdit(null)}
				onSave={saveTechnicianEdit}
				onDelete={confirmDeleteTechnician}
			/>
			<AtendimentoCaseModal
				key={`${caseToReply?.id || "case"}-${caseModalInitialTab}`}
				item={caseToReply}
				loading={loading}
				initialTab={caseModalInitialTab}
				onCancel={() => setCaseToReply(null)}
				onSend={sendReply}
			/>
			<ConfirmDeleteTechnicianModal
				item={technicianToDelete}
				loading={loading}
				onCancel={() => setTechnicianToDelete(null)}
				onConfirm={() => {
					const item = technicianToDelete;
					setTechnicianToDelete(null);
					run(() => excluirTecnicoAtendimento(item.phone), "Técnico excluído.");
				}}
			/>
			<ConfirmResetOperationalDataModal
				open={resetDataOpen}
				loading={loading}
				onCancel={() => setResetDataOpen(false)}
				onConfirm={() => {
					setResetDataOpen(false);
					run(
						zerarDadosOperacionaisAtendimento,
						"Dados operacionais do atendimento zerados.",
					);
				}}
			/>
		</div>
	);
}
