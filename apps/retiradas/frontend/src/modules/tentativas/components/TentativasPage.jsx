import {
	BarChart3,
	CalendarClock,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Download,
	History,
	MessageCircle,
	MapPin,
	PackageCheck,
	Phone,
	MoreHorizontal,
	RefreshCw,
	Route,
	Save,
	Search,
	Settings,
	ShieldCheck,
	TrendingUp,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import PageHeader from "../../../components/ui/PageHeader";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	baixarHistoricoTentativasCsv,
	buscarConfiguracoesTentativas,
	buscarDetalheTentativa,
	buscarDistribuicaoTentativas,
	buscarHistoricoTentativas,
	buscarMinhaRotaTentativas,
	buscarTimelineTentativa,
	buscarUsuariosTentativas,
	criarRetornoTentativa,
	corrigirContatoTentativa,
	iniciarContatoTentativa,
	listarCidadesTecnicosTentativas,
	listarCidadesTentativas,
	listarLocalidadesTentativas,
	listarTemplatesTentativas,
	removerCidadeTecnicoTentativas,
	salvarCidadeTecnicoTentativas,
	salvarConfiguracoesTentativas,
	salvarResultadoTentativa,
	salvarTemplateTentativas,
} from "../services/tentativasService";
import {
	AuditPanel,
	CallbacksPanel,
	ManagementPanel,
	ProductivityPanel,
	RecoveriesPanel,
} from "./TentativasCentralPanels";

const RESULT_OPTIONS = [
	["NO_RESPONSE", "Sem resposta"],
	["RESPONDED_SCHEDULE", "Cliente respondeu — deseja agendar"],
	["STORE_DELIVERY", "Cliente respondeu — devolverá na loja"],
	["RESPONDED_CALLBACK", "Cliente respondeu — pediu retorno"],
	["REFUSED", "Cliente respondeu — recusou devolução"],
	["INVALID_PHONE", "Número inválido"],
	["UNAVAILABLE_PHONE", "Número indisponível"],
	["ALREADY_RETURNED", "Equipamento já devolvido — aguardando conferência"],
	["EQUIPMENT_NOT_FOUND", "Equipamento não localizado"],
	["OTHER", "Outro motivo"],
];

const ADMIN_TABS = [
	["management", "Gestão", BarChart3],
	["distribution", "Distribuição", Users],
	["admin-recoveries", "Recuperação", PackageCheck],
	["audit", "Auditoria", ShieldCheck],
	["templates", "Templates", MessageCircle],
	["settings", "Configurações", Settings],
];
const OPERATIONAL_TABS = [
	["route", "Minha Carteira", Route],
	["next", "Próximos Contatos", CalendarClock],
	["callbacks", "Retornos", CalendarClock],
	["appointments", "Agendamentos", CalendarClock],
	["recoveries", "Recuperações", PackageCheck],
	["productivity", "Produtividade", TrendingUp],
	["history", "Histórico", History],
];
const MOBILE_OPERATION_TABS = [
	["route", "Carteira", Route],
	["next", "Contatos", MessageCircle],
	["appointments", "Agenda", CalendarClock],
	["callbacks", "Retornos", RefreshCw],
];
const MOBILE_MORE_TABS = OPERATIONAL_TABS.filter(([key]) =>
	["recoveries", "productivity", "history"].includes(key),
);
const ADMIN_TAB_KEYS = new Set(ADMIN_TABS.map(([key]) => key));
const ALL_TAB_KEYS = new Set([...OPERATIONAL_TABS, ...ADMIN_TABS].map(([key]) => key));
const CITY_PAGE_SIZE = 8;
const ASSOCIATED_CITY_PAGE_SIZE = 10;

function normalizeSearch(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function formatNumber(value) {
	return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function resultLabel(value) {
	return RESULT_OPTIONS.find(([key]) => key === value)?.[1] || value || "-";
}

function saoPauloDateKey() {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

function whatsappPreferenceKey(user) {
	const identity = user?.uid || user?.id || user?.email || "usuario";
	return `tentativas:whatsapp:${identity}:${saoPauloDateKey()}`;
}

function customerIdentification(item) {
	const name = item?.cliente || item?.customerName || "Cliente sem nome";
	const code = item?.codigo_cliente || item?.customerCode;
	return code ? `(${code}) ${name}` : name;
}

function canManage(user) {
	return (
		hasPermission(user, "tentativas.gestao.visualizar") ||
		hasPermission(user, "tentativas.carteiras.gerenciar") ||
		hasPermission(user, "tentativas.distribuir") ||
		hasPermission(user, "tentativas.templates.gerenciar") ||
		hasPermission(user, "tentativas.configuracoes.gerenciar")
	);
}

function TabButton({ active, icon: Icon, children, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex min-h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition sm:min-h-11 sm:py-2 ${
				active
					? "bg-blue-600 text-white shadow-lg shadow-blue-200"
					: "border border-slate-200 bg-white text-slate-600"
			}`}
		>
			<Icon className="h-4 w-4 shrink-0" />
			<span>{children}</span>
		</button>
	);
}

function PaginationControls({ page, totalPages, onPageChange }) {
	if (totalPages <= 1) return null;
	return (
		<div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
			<button
				type="button"
				onClick={() => onPageChange(Math.max(page - 1, 1))}
				disabled={page <= 1}
				className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 disabled:opacity-40"
			>
				<ChevronLeft className="h-4 w-4" /> Anterior
			</button>
			<span className="text-sm font-black text-slate-500">
				Página {page} de {totalPages}
			</span>
			<button
				type="button"
				onClick={() => onPageChange(Math.min(page + 1, totalPages))}
				disabled={page >= totalPages}
				className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 disabled:opacity-40"
			>
				Próxima <ChevronRight className="h-4 w-4" />
			</button>
		</div>
	);
}

function CityDropdown({
	cities = [],
	value = "",
	onChange,
	label = "Escolha a cidade",
	helper = "A lista abre fechada para ficar mais fácil de navegar.",
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const selectedCity = cities.find((item) => item.cidade === value);
	const citySearchTerm = normalizeSearch(search);
	const filteredCities = citySearchTerm
		? cities.filter((item) => normalizeSearch(item.cidade).includes(citySearchTerm))
		: cities;
	const totalPages = Math.max(1, Math.ceil(filteredCities.length / CITY_PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const paginatedCities = filteredCities.slice(
		(currentPage - 1) * CITY_PAGE_SIZE,
		currentPage * CITY_PAGE_SIZE,
	);
	const selectCity = (item) => {
		onChange?.(item.cidade);
		setOpen(false);
		setSearch("");
		setPage(1);
	};
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
			<p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">{label}</p>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="mt-2 flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left transition hover:border-blue-300 sm:px-4"
			>
				<span className="min-w-0">
					<strong className="block truncate text-base font-black text-slate-950 sm:text-lg">
						{selectedCity?.cidade || value || "Selecionar cidade"}
					</strong>
					<span className="block truncate text-xs font-bold text-slate-500 sm:text-sm">
						{selectedCity
							? `${formatNumber(selectedCity.total)} clientes disponíveis`
							: `${formatNumber(cities.length)} cidades disponíveis`}
					</span>
				</span>
				<ChevronDown className="h-5 w-5 shrink-0 text-slate-500" />
			</button>
			<p className="mt-2 hidden text-sm font-semibold text-slate-500 sm:block">{helper}</p>
			{open ? (
				<ModalShell
					title="Selecionar cidade"
					description={helper}
					size="md"
					onClose={() => setOpen(false)}
				>
					<label className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3">
						<Search className="h-4 w-4 text-slate-400" />
						<input
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(1);
							}}
							placeholder="Buscar cidade"
							className="h-11 flex-1 bg-transparent text-sm font-bold outline-none"
						/>
					</label>
					<div className="mt-3 grid gap-2">
						{paginatedCities.map((item) => (
							<button
								type="button"
								key={item.cidade_normalizada || item.cidade}
								onClick={() => selectCity(item)}
								className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 text-left transition ${
									value === item.cidade
										? "border-blue-400 bg-blue-50"
										: "border-slate-200 bg-white hover:border-blue-200"
								}`}
							>
								<span>
									<strong className="block font-black text-slate-950">{item.cidade}</strong>
									<span className="text-xs font-bold text-slate-500">
										{formatNumber(item.pending ?? item.total)} pendentes
									</span>
								</span>
								<span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-700">
									{formatNumber(item.total)}
								</span>
							</button>
						))}
						{!paginatedCities.length ? (
							<div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">
								Nenhuma cidade encontrada.
							</div>
						) : null}
					</div>
					<div className="mt-3">
						<PaginationControls
							page={currentPage}
							totalPages={totalPages}
							onPageChange={setPage}
						/>
					</div>
				</ModalShell>
			) : null}
		</section>
	);
}

function NeighborhoodDropdown({ items = [], value = "", onChange, onUseLocation, hasLocation }) {
	const [open, setOpen] = useState(false);
	const selected = items.find((item) => {
		const itemValue = item.bairro === "Bairro nao informado" ? "__SEM_BAIRRO__" : item.groupKey || item.bairro;
		return itemValue === value;
	});
	const choose = (nextValue) => {
		onChange?.(nextValue);
		setOpen(false);
	};
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Bairro e proximidade</p>
					<p className="mt-1 truncate text-sm font-bold text-slate-600">{selected?.bairro || "Todos os bairros"}</p>
				</div>
				<button type="button" onClick={() => setOpen(true)} className="min-h-11 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700">Escolher</button>
			</div>
			{open ? (
				<ModalShell title="Selecionar bairro" description="Bairros equivalentes aparecem agrupados sem alterar os dados originais." size="md" onClose={() => setOpen(false)}>
					<div className="grid gap-2">
						<button type="button" onClick={() => choose("")} className={`min-h-12 rounded-xl border px-4 text-left font-black ${!value ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700"}`}>Todos os bairros</button>
						{items.map((item) => {
							const itemValue = item.bairro === "Bairro nao informado" ? "__SEM_BAIRRO__" : item.groupKey || item.bairro;
							return (
								<button type="button" key={itemValue} onClick={() => choose(itemValue)} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 text-left ${value === itemValue ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}>
									<span className="min-w-0"><strong className="block truncate text-slate-950">{item.bairro}</strong><span className="text-xs font-bold text-slate-500">{formatNumber(item.opportunities)} oportunidade(s){item.originalValues?.length > 1 ? ` · ${item.originalValues.length} variações agrupadas` : ""}</span></span>
									{item.distanceKm != null ? <span className="shrink-0 text-xs font-black text-emerald-700">{item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`}</span> : null}
								</button>
							);
						})}
					</div>
					<button type="button" onClick={() => { onUseLocation?.(); setOpen(false); }} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-black text-white"><MapPin className="h-4 w-4" />{hasLocation ? "Atualizar minha localização" : "Usar minha localização"}</button>
				</ModalShell>
			) : null}
		</section>
	);
}

function UserLookup({ value = {}, onChange }) {
	const [search, setSearch] = useState("");
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(false);
	const selectedLabel = value.userName || value.technicianName || value.nome || "";

	const loadUsers = useCallback(async (term) => {
		if (term.trim().length < 2) {
			setItems([]);
			return;
		}
		setLoading(true);
		try {
			const result = await buscarUsuariosTentativas({ q: term });
			setItems(result.items || []);
		} finally {
			setLoading(false);
		}
	}, []);

	const selectUser = (user) => {
		onChange?.({
			userId: user.uid || user.id,
			userEmail: user.email,
			userName: user.nome || user.email,
		});
		setSearch("");
		setItems([]);
	};

	return (
		<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
			<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
				Técnico responsável
			</p>
			{selectedLabel ? (
				<div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white p-3">
					<div>
						<strong className="block text-sm font-black text-slate-950">{selectedLabel}</strong>
						<span className="text-xs font-bold text-slate-500">{value.userEmail}</span>
					</div>
					<button
						type="button"
						onClick={() => onChange?.({ userId: "", userEmail: "", userName: "" })}
						className="rounded-lg p-2 text-red-600 hover:bg-red-50"
						aria-label="Limpar técnico"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
			) : null}
			<label className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
				<Search className="h-4 w-4 text-slate-400" />
				<input
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
						void loadUsers(event.target.value);
					}}
					placeholder="Digite nome, e-mail ou ID"
					className="h-11 flex-1 bg-transparent text-sm font-bold outline-none"
				/>
			</label>
			{loading ? (
				<p className="mt-2 text-xs font-bold text-slate-500">Buscando usuários...</p>
			) : null}
			{items.length ? (
				<div className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
					{items.map((user) => (
						<button
							type="button"
							key={user.uid || user.id}
							onClick={() => selectUser(user)}
							className="block w-full border-b border-slate-100 p-3 text-left last:border-b-0 hover:bg-blue-50"
						>
							<strong className="block text-sm font-black text-slate-950">{user.nome}</strong>
							<span className="text-xs font-bold text-slate-500">
								{user.email} · {user.role || "sem cargo"}
							</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function ResultModal({ contact, onClose, onSaved, editing = false, correctionAllowed = false }) {
	const [sentConfirmed, setSentConfirmed] = useState(true);
	const [result, setResult] = useState("NO_RESPONSE");
	const [observation, setObservation] = useState("");
	const [callbackAt, setCallbackAt] = useState("");
	const [preferredChannel, setPreferredChannel] = useState("WHATSAPP");
	const [recoveryModality, setRecoveryModality] = useState("");
	const [correctionReason, setCorrectionReason] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!contact) return;
		setSentConfirmed(contact.sent_confirmed !== false);
		setResult(contact.result || "NO_RESPONSE");
		setObservation(contact.observation || "");
		setCallbackAt(contact.callback_at || "");
		setPreferredChannel(contact.preferred_channel || "WHATSAPP");
		setRecoveryModality(contact.recovery_modality || "");
		setCorrectionReason("");
		setError("");
	}, [contact]);
	if (!contact) return null;
	const save = async () => {
		if (result === "RESPONDED_CALLBACK" && !callbackAt && !(editing && correctionAllowed)) {
			setError("Informe a data e o horário solicitados pelo cliente.");
			return;
		}
		if (editing && correctionAllowed && correctionReason.trim().length < 5) {
			setError("Informe uma justificativa com pelo menos 5 caracteres.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = {
				sentConfirmed,
				result,
				observation,
				callbackAt: callbackAt ? new Date(callbackAt).toISOString() : null,
				preferredChannel,
				recoveryModality,
				correctionReason,
			};
			if (editing && correctionAllowed) {
				await corrigirContatoTentativa(contact.contactId, payload);
			} else {
				await salvarResultadoTentativa(contact.contactId, payload);
			}
			onSaved?.();
			onClose();
		} catch (err) {
			setError(err.message || "Falha ao salvar resultado.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell
			title={editing ? "Atualizar tratativa" : "Como foi o contato?"}
			description={editing ? "Revise o resultado registrado sem criar uma nova tentativa." : "Confirme o envio manual no WhatsApp e registre o resultado."}
			size="lg"
			onClose={onClose}
			footer={
				<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
					<button type="button" onClick={onClose} className="rounded-xl border px-4 py-3 font-black">
						Cancelar
					</button>
					<button
						type="button"
						onClick={save}
						disabled={saving}
						className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-60"
					>
						{saving ? "Salvando..." : editing ? "Salvar tratativa" : "Salvar e próximo"}
					</button>
				</div>
			}
		>
			<div className="space-y-4">
				{error ? <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
				<div className="grid grid-cols-2 gap-3">
					<button
						type="button"
						onClick={() => setSentConfirmed(true)}
						className={`rounded-2xl border p-4 text-left font-black ${
							sentConfirmed ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200"
						}`}
					>
						SIM, enviei
					</button>
					<button
						type="button"
						onClick={() => setSentConfirmed(false)}
						className={`rounded-2xl border p-4 text-left font-black ${
							!sentConfirmed ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200"
						}`}
					>
						NÃO enviei
					</button>
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					{RESULT_OPTIONS.map(([key, label]) => (
						<button
							type="button"
							key={key}
							onClick={() => setResult(key)}
							className={`rounded-xl border px-4 py-3 text-left text-sm font-black ${
								result === key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</div>
				{["RESPONDED_CALLBACK", "RESPONDED_SCHEDULE", "STORE_DELIVERY"].includes(result) && !(editing && correctionAllowed) ? (
					<div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-2">
						<label className="grid gap-1 text-sm font-black text-slate-700">
							{result === "RESPONDED_CALLBACK" ? "Data e horário do retorno" : "Data combinada"}
							<input
								type="datetime-local"
								value={callbackAt}
								onChange={(event) => setCallbackAt(event.target.value)}
								required={result === "RESPONDED_CALLBACK"}
								className="min-h-12 rounded-xl border border-blue-200 bg-white px-3 font-bold"
							/>
						</label>
						<label className="grid gap-1 text-sm font-black text-slate-700">
							Canal preferencial
							<select value={preferredChannel} onChange={(event) => setPreferredChannel(event.target.value)} className="min-h-12 rounded-xl border border-blue-200 bg-white px-3 font-bold">
								<option value="WHATSAPP">WhatsApp</option>
								<option value="PHONE">Ligação</option>
								<option value="SMS">SMS</option>
								<option value="OTHER">Outro canal autorizado</option>
							</select>
						</label>
						{result !== "RESPONDED_CALLBACK" ? (
							<label className="grid gap-1 text-sm font-black text-slate-700 sm:col-span-2">
								Modalidade da devolução
								<select value={recoveryModality || (result === "STORE_DELIVERY" ? "STORE_DELIVERY" : "TECHNICIAN_COLLECTION")} onChange={(event) => setRecoveryModality(event.target.value)} className="min-h-12 rounded-xl border border-blue-200 bg-white px-3 font-bold">
									<option value="TECHNICIAN_COLLECTION">Coleta por técnico</option>
									<option value="STORE_DELIVERY">Entrega em loja</option>
								</select>
							</label>
						) : null}
					</div>
				) : null}
				<textarea
					value={observation}
					onChange={(event) => setObservation(event.target.value)}
					maxLength={500}
					placeholder="Observação curta, se necessário"
					className="min-h-24 w-full rounded-2xl border border-slate-200 p-3 font-semibold outline-none focus:border-blue-400"
				/>
				{editing && correctionAllowed ? (
					<label className="grid gap-1 text-sm font-black text-slate-700">
						Justificativa da correção
						<textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={500} placeholder="Explique por que o registro precisa ser corrigido" className="min-h-20 w-full rounded-2xl border border-amber-200 bg-amber-50 p-3 font-semibold outline-none focus:border-amber-400" />
					</label>
				) : null}
			</div>
		</ModalShell>
	);
}

function WhatsappChoiceModal({ contact, onChoose, onClose }) {
	if (!contact) return null;
	return (
		<ModalShell
			title="Qual WhatsApp você usa?"
			description="Escolha apenas no primeiro envio do dia. O sistema lembrará sua opção até amanhã."
			size="md"
			onClose={onClose}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<button
					type="button"
					onClick={() => onChoose("normal")}
					className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 transition hover:border-emerald-400"
				>
					<MessageCircle className="h-7 w-7" />
					<strong className="font-black">WhatsApp comum</strong>
				</button>
				<button
					type="button"
					onClick={() => onChoose("business")}
					className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-800 transition hover:border-blue-400"
				>
					<Phone className="h-7 w-7" />
					<strong className="font-black">WhatsApp Business</strong>
				</button>
			</div>
			<p className="mt-3 text-center text-xs font-bold text-slate-500">
				Você poderá alterar a preferência na tela de rota.
			</p>
		</ModalShell>
	);
}

function MyRoute() {
	const { currentUser } = useAuthContext();
	const [cities, setCities] = useState([]);
	const [city, setCity] = useState("");
	const [localities, setLocalities] = useState([]);
	const [neighborhood, setNeighborhood] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [priority, setPriority] = useState("");
	const [sort, setSort] = useState("priority");
	const [page, setPage] = useState(1);
	const [position, setPosition] = useState(null);
	const [routeData, setRouteData] = useState(null);
	const [detail, setDetail] = useState(null);
	const [scheduleItem, setScheduleItem] = useState(null);
	const [scheduleAt, setScheduleAt] = useState("");
	const [scheduleObservation, setScheduleObservation] = useState("");
	const [scheduleError, setScheduleError] = useState("");
	const [pendingContact, setPendingContact] = useState(null);
	const [whatsappChoiceContact, setWhatsappChoiceContact] = useState(null);
	const [whatsappPreference, setWhatsappPreference] = useState(() =>
		window.localStorage.getItem(whatsappPreferenceKey(currentUser)),
	);
	const [contactingId, setContactingId] = useState("");
	const contactInFlightRef = useRef(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const loadCities = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const data = await listarCidadesTentativas();
			const items = data.items || [];
			setCities(items);
			if (items[0]?.cidade) {
				setCity((currentCity) => currentCity || items[0].cidade);
			}
		} catch (err) {
			setError(err.message || "Falha ao carregar cidades.");
		} finally {
			setLoading(false);
		}
	}, []);

	const loadRoute = useCallback(async (selectedCity = city, targetPage = 1) => {
		if (!selectedCity) return;
		setLoading(true);
		setError("");
		try {
			setRouteData(await buscarMinhaRotaTentativas({
				cidade: selectedCity,
				bairro: neighborhood,
				q: search,
				priority,
				sort,
				page: targetPage,
				limit: 30,
				latitude: position?.latitude,
				longitude: position?.longitude,
			}));
			setPage(targetPage);
		} catch (err) {
			setError(err.message || "Falha ao carregar rota.");
		} finally {
			setLoading(false);
		}
	}, [city, neighborhood, position, priority, search, sort]);

	const loadLocalities = useCallback(async (selectedCity = city) => {
		if (!selectedCity) return;
		try {
			const data = await listarLocalidadesTentativas({
				cidade: selectedCity,
				latitude: position?.latitude,
				longitude: position?.longitude,
			});
			setLocalities(data.items || []);
		} catch {
			setLocalities([]);
		}
	}, [city, position]);

	const requestLocation = () => {
		if (!navigator.geolocation) {
			setError("Localização não disponível neste dispositivo.");
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(location) => {
				setPosition({ latitude: location.coords.latitude, longitude: location.coords.longitude });
				setSort("distance");
			},
			() => setError("Não foi possível acessar sua localização. Você pode continuar escolhendo pelo bairro."),
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
		);
	};

	useEffect(() => {
		loadCities();
	}, [loadCities]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(1);
		}, 350);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	useEffect(() => {
		if (city) {
			void loadRoute(city, 1);
			void loadLocalities(city);
		}
	}, [city, neighborhood, priority, sort, position, loadRoute, loadLocalities]);

	const openWhatsapp = (started, preference) => {
		const url =
			preference === "business"
				? started.whatsappBusinessUrl || started.whatsappUrl
				: started.whatsappNormalUrl || started.whatsappUrl;
		window.open(url, "_blank", "noopener,noreferrer");
		setPendingContact(started);
	};

	const chooseWhatsapp = (preference) => {
		window.localStorage.setItem(whatsappPreferenceKey(currentUser), preference);
		setWhatsappPreference(preference);
		openWhatsapp(whatsappChoiceContact, preference);
		setWhatsappChoiceContact(null);
	};

	const resetWhatsappPreference = () => {
		window.localStorage.removeItem(whatsappPreferenceKey(currentUser));
		setWhatsappPreference(null);
	};

	const contact = async (item) => {
		if (contactInFlightRef.current) return;
		contactInFlightRef.current = true;
		setContactingId(item.id);
		setError("");
		try {
			const started = await iniciarContatoTentativa(item.id);
			window.sessionStorage.setItem(
				"tentativas:lastContact",
				JSON.stringify({ contactId: started.contactId, opportunityId: item.id }),
			);
			const savedPreference = window.localStorage.getItem(
				whatsappPreferenceKey(currentUser),
			);
			if (savedPreference === "normal" || savedPreference === "business") {
				setWhatsappPreference(savedPreference);
				openWhatsapp(started, savedPreference);
			} else {
				setWhatsappChoiceContact(started);
			}
		} catch (err) {
			setError(err.message || "Falha ao abrir WhatsApp.");
		} finally {
			contactInFlightRef.current = false;
			setContactingId("");
		}
	};

	const openDetail = async (item) => {
		const [record, timeline] = await Promise.all([
			buscarDetalheTentativa(item.id),
			buscarTimelineTentativa(item.id),
		]);
		setDetail({ ...record, timeline: timeline.items || [] });
	};

	const scheduleCallback = async () => {
		if (!scheduleAt) {
			setScheduleError("Informe a data e o horário do retorno.");
			return;
		}
		try {
			await criarRetornoTentativa(scheduleItem.id, {
				callbackAt: new Date(scheduleAt).toISOString(),
				observation: scheduleObservation,
				preferredChannel: "WHATSAPP",
			});
			setScheduleItem(null);
			setScheduleAt("");
			setScheduleObservation("");
			await loadRoute();
		} catch (err) {
			setScheduleError(err.message || "Falha ao agendar retorno.");
		}
	};

	if (loading && !routeData) return <Spinner />;

	return (
		<div className="space-y-4">
			{error ? <div className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">{error}</div> : null}
			{whatsappPreference ? (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
					<span>
						Envios de hoje: {whatsappPreference === "business" ? "WhatsApp Business" : "WhatsApp comum"}
					</span>
					<button type="button" onClick={resetWhatsappPreference} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 font-black">
						Alterar
					</button>
				</div>
			) : null}
			<CityDropdown
				cities={cities}
				value={city}
				onChange={(value) => {
					setCity(value);
					setNeighborhood("");
					setPage(1);
				}}
				helper="Abra a lista somente quando precisar trocar a cidade. A rota mostra apenas O.S de retirada."
			/>

			<NeighborhoodDropdown
				items={localities}
				value={neighborhood}
				onChange={(value) => { setNeighborhood(value); setPage(1); }}
				onUseLocation={requestLocation}
				hasLocation={Boolean(position)}
			/>

			<section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Minha Rota</p>
						<h2 className="text-2xl font-black text-slate-950">{city || "Sem cidade"}</h2>
						<p className="text-sm font-bold text-slate-500">
							{formatNumber(routeData?.summary?.total)} clientes · {formatNumber(routeData?.summary?.pending)} pendentes · {formatNumber(routeData?.summary?.worked)} trabalhados
						</p>
					</div>
					<button
						type="button"
						onClick={() => loadRoute()}
						className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 font-black"
					>
						<RefreshCw className="h-4 w-4" /> Atualizar
					</button>
				</div>
				<div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
					<label className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3">
						<Search className="h-4 w-4 text-slate-400" />
						<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cliente, código, OS ou bairro" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
					</label>
					<select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
						<option value="">Todas as prioridades</option><option value="CRITICA">Crítica</option><option value="ALTA">Alta</option><option value="MEDIA">Média</option><option value="BAIXA">Baixa</option><option value="RETORNO_AGENDADO">Retorno agendado</option>
					</select>
					<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
						<option value="priority">Maior prioridade</option><option value="oldest">OS mais antiga</option><option value="distance" disabled={!position}>Mais próximo</option>
					</select>
				</div>
				<div className="mt-4 grid gap-3">
					{(routeData?.items || []).map((item) => (
						<article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
							<div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
								<div className="min-w-0">
									<h3 className="truncate text-base font-black text-slate-950 sm:text-lg">{item.cliente || "Cliente sem nome"}</h3>
									<p className="mt-1 truncate text-sm font-bold text-slate-500">({item.codigoCliente}) · {item.bairro || "Bairro não informado"} · {item.cidade}</p>
									<p className="mt-2 text-sm font-bold text-slate-600">Aberta há {formatNumber(item.osAgeDays)} dias · {formatNumber(item.attemptCount)} tentativa(s)</p>
									<div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black">
										<span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{item.priority} · score {item.priorityScore}</span>
										{item.distanceKm != null ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"><MapPin className="mr-1 inline h-3 w-3" />{item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`}</span> : null}
									</div>
									{item.recommendedAction ? <p className="mt-2 text-xs font-bold text-slate-500">Próxima ação: {item.recommendedAction}</p> : null}
									{item.nextAttemptAt ? (
										<p className="mt-1 text-xs font-black text-amber-700">
											Próxima tentativa permitida: {formatDateTime(item.nextAttemptAt)}
										</p>
									) : null}
								</div>
								<div className="grid min-w-0 grid-cols-3 gap-2 sm:w-[310px]">
									<button
										type="button"
										onClick={() => contact(item)}
										disabled={Boolean(contactingId)}
										className="col-span-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 font-black text-white disabled:cursor-wait disabled:opacity-60"
									>
										<Phone className="h-4 w-4" />
										{contactingId === item.id ? "Buscando contato..." : "Abrir no WhatsApp"}
									</button>
									<button
										type="button"
										onClick={() => openDetail(item)}
										className="min-h-11 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700"
									>
										Detalhes
									</button>
									<button type="button" onClick={() => openDetail(item)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700"><History className="h-4 w-4" /> Histórico</button>
									<button
										type="button"
										onClick={() => { setScheduleItem(item); setScheduleError(""); }}
										className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2 text-xs font-black text-blue-700"
									>
										<CalendarClock className="h-4 w-4" /> Agendar
									</button>
								</div>
							</div>
						</article>
					))}
					{!routeData?.items?.length ? (
						<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
							<strong className="text-lg font-black text-slate-700">Nenhum cliente disponível</strong>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Você não possui oportunidades disponíveis para esta cidade neste momento.
							</p>
						</div>
					) : null}
				</div>
				<PaginationControls page={page} totalPages={Math.max(1, Math.ceil(Number(routeData?.total || 0) / Number(routeData?.limit || 30)))} onPageChange={(nextPage) => void loadRoute(city, nextPage)} />
			</section>

			<ResultModal contact={pendingContact} onClose={() => setPendingContact(null)} onSaved={() => loadRoute()} />
			<WhatsappChoiceModal
				contact={whatsappChoiceContact}
				onChoose={chooseWhatsapp}
				onClose={() => setWhatsappChoiceContact(null)}
			/>
			{scheduleItem ? (
				<ModalShell title="Agendar retorno" description={`Combine o próximo contato com ${scheduleItem.cliente || "o cliente"}.`} size="md" onClose={() => setScheduleItem(null)} footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setScheduleItem(null)} className="rounded-xl border px-4 py-3 font-black">Cancelar</button><button type="button" onClick={() => void scheduleCallback()} className="rounded-xl bg-blue-600 px-4 py-3 font-black text-white">Salvar retorno</button></div>}>
					<div className="space-y-3">
						{scheduleError ? <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{scheduleError}</div> : null}
						<label className="grid gap-1 text-sm font-black text-slate-700">Data e horário<input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 px-3 font-bold" /></label>
						<label className="grid gap-1 text-sm font-black text-slate-700">Observação<textarea value={scheduleObservation} onChange={(event) => setScheduleObservation(event.target.value)} maxLength={500} className="min-h-24 rounded-xl border border-slate-200 p-3 font-semibold" /></label>
					</div>
				</ModalShell>
			) : null}
			{detail ? (
				<ModalShell title="Detalhe do cliente" size="3xl" onClose={() => setDetail(null)}>
					<div className="space-y-4">
						<div className="rounded-2xl bg-slate-50 p-4">
							<h3 className="font-black text-slate-950">{detail.item?.cliente}</h3>
							<p className="mt-1 text-sm font-bold text-slate-500">
								OS {detail.item?.os} · {detail.item?.cidade} · {detail.item?.telefone || "Sem telefone"}
							</p>
						</div>
						{detail.item?.priorityFactors?.length ? (
							<div>
								<h4 className="text-sm font-black uppercase tracking-[0.1em] text-slate-500">Por que esta prioridade?</h4>
								<div className="mt-2 grid gap-2 sm:grid-cols-2">{detail.item.priorityFactors.map((factor) => <div key={factor.key} className="rounded-xl border border-slate-200 p-3 text-sm"><strong>{factor.label} · +{factor.contribution}</strong><p className="text-slate-500">{factor.detail}</p></div>)}</div>
							</div>
						) : null}
						<div className="space-y-2">
							{(detail.contacts || []).map((contact) => (
								<div key={contact.id} className="rounded-xl border border-slate-200 p-3 text-sm">
									<strong>{formatDateTime(contact.created_at)}</strong> · {resultLabel(contact.result || contact.event_type)}
									<p className="text-slate-500">{contact.observation || contact.status}</p>
								</div>
							))}
						</div>
						{detail.timeline?.length ? (
							<div>
								<h4 className="text-sm font-black uppercase tracking-[0.1em] text-slate-500">Linha do tempo</h4>
								<div className="mt-2 space-y-2">{detail.timeline.map((event) => <div key={event.id} className="rounded-xl border-l-4 border-blue-500 bg-slate-50 p-3 text-sm"><strong>{event.event_type}</strong><p className="text-slate-500">{formatDateTime(event.occurred_at)} · {event.actor_name || "Sistema"}</p></div>)}</div>
							</div>
						) : null}
					</div>
				</ModalShell>
			) : null}
		</div>
	);
}

function DistributionTab() {
	const [items, setItems] = useState([]);
	const [cities, setCities] = useState([]);
	const [availableCities, setAvailableCities] = useState([]);
	const [associatedSearch, setAssociatedSearch] = useState("");
	const [associatedPage, setAssociatedPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [form, setForm] = useState({ userId: "", userEmail: "", userName: "", cidade: "", permanent: true });
	const load = async () => {
		const [distribution, cityLinks] = await Promise.all([
			buscarDistribuicaoTentativas(),
			listarCidadesTecnicosTentativas(),
		]);
		setItems(distribution.items || []);
		setCities(cityLinks.items || []);
	};
	useEffect(() => {
		let cancelled = false;
		async function loadInitial() {
			const [distribution, cityLinks] = await Promise.all([
				buscarDistribuicaoTentativas(),
				listarCidadesTecnicosTentativas(),
			]);
			if (cancelled) return;
			setItems(distribution.items || []);
			setCities(cityLinks.items || []);
			setLoading(false);
			listarCidadesTentativas()
				.then((cityOptions) => {
					if (!cancelled) setAvailableCities(cityOptions.items || []);
				})
				.catch(() => {
					if (!cancelled) setAvailableCities([]);
				});
		}
		void loadInitial();
		return () => {
			cancelled = true;
		};
	}, []);
	const saveCity = async () => {
		setMessage("");
		const saved = await salvarCidadeTecnicoTentativas(form);
		setForm({ userId: "", userEmail: "", userName: "", cidade: "", permanent: true });
		await load();
		setMessage(`Cidade associada ao técnico. ${formatNumber(saved.balance?.assigned || saved.assigned)} oportunidade(s) distribuída(s) nesta atualização.`);
	};
	const associatedSearchTerm = normalizeSearch(associatedSearch);
	const filteredAssociatedCities = associatedSearchTerm
		? cities.filter((item) =>
			normalizeSearch(`${item.user_name} ${item.user_email} ${item.cidade}`).includes(associatedSearchTerm),
		)
		: cities;
	const associatedTotalPages = Math.max(
		1,
		Math.ceil(filteredAssociatedCities.length / ASSOCIATED_CITY_PAGE_SIZE),
	);
	const associatedCurrentPage = Math.min(associatedPage, associatedTotalPages);
	const associatedCitiesPage = filteredAssociatedCities.slice(
		(associatedCurrentPage - 1) * ASSOCIATED_CITY_PAGE_SIZE,
		associatedCurrentPage * ASSOCIATED_CITY_PAGE_SIZE,
	);
	if (loading) return <Spinner />;
	return (
		<div className="space-y-4">
			{message ? <div className="rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-700">{message}</div> : null}
			<div className="grid gap-4 xl:grid-cols-[1fr_440px]">
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-1">
						<p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">
							Distribuição atual
						</p>
						<h2 className="text-2xl font-black text-slate-950">Técnicos por cidade</h2>
						<p className="text-sm font-semibold text-slate-500">
							Apenas oportunidades de retirada entram nessa distribuição.
						</p>
					</div>
					<div className="mt-4 grid gap-3 md:grid-cols-2">
						{items.map((item) => (
							<div key={`${item.technician_user_id}-${item.cidade}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<strong className="block text-slate-950">{item.technician_name || "Sem técnico"}</strong>
								<p className="mt-1 text-sm font-bold text-slate-500">{item.cidade}</p>
								<div className="mt-3 grid grid-cols-3 gap-2 text-center">
									<div className="rounded-xl bg-white p-2"><strong>{formatNumber(item.opportunities)}</strong><span className="block text-[11px] font-bold text-slate-500">Oportun.</span></div>
									<div className="rounded-xl bg-white p-2"><strong>{formatNumber(item.pending)}</strong><span className="block text-[11px] font-bold text-slate-500">Pendentes</span></div>
									<div className="rounded-xl bg-white p-2"><strong>{item.coverage}%</strong><span className="block text-[11px] font-bold text-slate-500">Cobertura</span></div>
								</div>
							</div>
						))}
						{!items.length ? (
							<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center font-bold text-slate-500">
								Nenhuma distribuição ativa.
							</div>
						) : null}
					</div>
				</section>

				<div className="space-y-4">
					<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
						<h2 className="text-lg font-black text-slate-950">Associar cidade</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Escolha um usuário com cargo Técnico e uma cidade do mapa. Administradores e BackOffice não recebem carteira.
						</p>
						<div className="mt-4 grid gap-3">
							<UserLookup
								value={form}
								onChange={(user) => setForm((current) => ({ ...current, ...user }))}
							/>
							<CityDropdown
								cities={availableCities}
								value={form.cidade}
								onChange={(cidade) => setForm((current) => ({ ...current, cidade }))}
								label="Cidade atendida"
								helper="A cidade fica vinculada ao técnico selecionado."
							/>
							<label className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
								<input
									type="checkbox"
									checked={form.permanent}
									onChange={(event) => setForm((current) => ({ ...current, permanent: event.target.checked }))}
								/>
								Associação permanente
							</label>
							<button
								type="button"
								onClick={saveCity}
								disabled={!form.userId || !form.cidade}
								className="rounded-2xl bg-blue-600 p-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
							>
								Salvar associação
							</button>
						</div>
					</section>

					<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">
						Ao associar uma cidade, todas as oportunidades disponíveis são divididas automaticamente entre os técnicos ativos. Contatos já iniciados permanecem com o técnico responsável.
					</div>
				</div>
			</div>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">Cidades associadas</h2>
						<p className="text-sm font-semibold text-slate-500">
							Mostrando {formatNumber(associatedCitiesPage.length)} de {formatNumber(filteredAssociatedCities.length)} vínculos.
						</p>
					</div>
					<label className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 px-3">
						<Search className="h-4 w-4 text-slate-400" />
						<input
							value={associatedSearch}
							onChange={(event) => {
								setAssociatedSearch(event.target.value);
								setAssociatedPage(1);
							}}
							placeholder="Buscar técnico ou cidade"
							className="h-11 min-w-0 bg-transparent text-sm font-bold outline-none"
						/>
					</label>
				</div>
				<div className="mt-4 grid gap-2">
					{associatedCitiesPage.map((item) => (
						<div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
							<span>
								<strong className="block text-slate-950">{item.user_name || item.user_email}</strong>
								<span className="font-bold text-slate-500">{item.cidade}</span>
							</span>
							<button
								type="button"
								onClick={async () => {
									await removerCidadeTecnicoTentativas(item.id);
									await load();
								}}
								className="rounded-xl p-2 text-red-600 hover:bg-red-50"
								aria-label="Remover associação"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
					))}
					{!associatedCitiesPage.length ? (
						<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center font-bold text-slate-500">
							Nenhuma associação encontrada.
						</div>
					) : null}
				</div>
				<div className="mt-4">
					<PaginationControls
						page={associatedCurrentPage}
						totalPages={associatedTotalPages}
						onPageChange={setAssociatedPage}
					/>
				</div>
			</section>
		</div>
	);
}

function HistoryTab() {
	const { currentUser } = useAuthContext();
	const correctionAllowed = hasPermission(currentUser, "tentativas.registros.corrigir");
	const [query, setQuery] = useState("");
	const [data, setData] = useState({ items: [], total: 0, page: 1, limit: 10 });
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [editingContact, setEditingContact] = useState(null);
	const pageSize = 10;
	const load = async (targetPage = page) => {
		setLoading(true);
		try {
			const result = await buscarHistoricoTentativas({ q: query, page: targetPage, limit: pageSize });
			setData(result);
			setPage(targetPage);
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => {
		let cancelled = false;
		async function loadInitial() {
			const result = await buscarHistoricoTentativas({ page: 1, limit: pageSize });
			if (!cancelled) {
				setData(result);
				setLoading(false);
			}
		}
		void loadInitial();
		return () => {
			cancelled = true;
		};
	}, []);
	const totalPages = Math.max(1, Math.ceil(Number(data.total || 0) / pageSize));
	const changePage = (nextPage) => {
		void load(nextPage);
	};
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<input className="min-h-12 rounded-2xl border px-4" placeholder="Cliente, OS, telefone ou cidade" value={query} onChange={(e) => setQuery(e.target.value)} />
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={() => void load(1)} className="rounded-xl border px-4 py-3 font-black">Buscar</button>
					<button type="button" onClick={() => void load(page)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 font-black disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</button>
					<button type="button" onClick={() => baixarHistoricoTentativasCsv({ q: query })} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-black text-white"><Download className="h-4 w-4" /> CSV</button>
				</div>
			</div>
			<div className={`mt-4 space-y-2 ${loading ? "opacity-60" : ""}`}>
				{data.items.map((item) => (
					<div key={item.id} className="rounded-2xl border p-4">
						<strong>{formatDateTime(item.created_at)} · {item.technician_name}</strong>
						<p className="mt-1 text-sm font-black text-slate-700">
							Enviado para: {customerIdentification(item)}
						</p>
						<p className="text-sm font-bold text-slate-500">
							{item.phone || "Telefone não informado"} · OS {item.os} · {item.cidade}
						</p>
						<p className="text-sm">{resultLabel(item.result || item.event_type)} · tentativa {item.attempt_number}</p>
						{item.opportunity_active && !item.assignment_released_at ? (
							<button
								type="button"
								onClick={() => setEditingContact({ ...item, contactId: item.id })}
								className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700"
							>
								Atualizar tratativa
							</button>
						) : null}
					</div>
				))}
				{!loading && !data.items.length ? (
					<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center font-bold text-slate-500">Nenhum registro encontrado.</div>
				) : null}
			</div>
			<div className="mt-4 space-y-2">
				<p className="text-center text-xs font-bold text-slate-500">{formatNumber(data.total)} registro(s) no histórico</p>
				<PaginationControls page={page} totalPages={totalPages} onPageChange={changePage} />
			</div>
			<ResultModal
				contact={editingContact}
				editing
				correctionAllowed={correctionAllowed}
				onClose={() => setEditingContact(null)}
				onSaved={() => void load(page)}
			/>
		</section>
	);
}

function TemplatesTab() {
	const [items, setItems] = useState([]);
	const emptyForm = { name: "", attemptNumber: 1, body: "", active: true, isDefault: false, changeReason: "" };
	const [form, setForm] = useState(emptyForm);
	const load = async () => setItems((await listarTemplatesTentativas()).items || []);
	useEffect(() => {
		let cancelled = false;
		async function loadInitial() {
			const result = await listarTemplatesTentativas();
			if (!cancelled) setItems(result.items || []);
		}
		void loadInitial();
		return () => {
			cancelled = true;
		};
	}, []);
	const save = async () => {
		await salvarTemplateTentativas(form);
		setForm(emptyForm);
		load();
	};
	return (
		<div className="grid gap-4 lg:grid-cols-[420px_1fr]">
			<section className="rounded-3xl border bg-white p-5 shadow-sm">
				<h2 className="font-black">Template</h2>
				<div className="mt-3 grid gap-2">
					<input className="rounded-xl border p-3" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
					<input className="rounded-xl border p-3" type="number" min="1" value={form.attemptNumber} onChange={(e) => setForm({ ...form, attemptNumber: e.target.value })} />
					<textarea className="min-h-48 rounded-xl border p-3" placeholder="Mensagem com {{cliente}}, {{nome_cliente}}, {{codigo_cliente}}, {{primeiro_nome}}, {{tecnico}}, {{empresa}}, {{cidade}}, {{os}}, {{data}}" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
					<input className="rounded-xl border p-3" placeholder="Motivo da alteração" value={form.changeReason || ""} onChange={(e) => setForm({ ...form, changeReason: e.target.value })} />
					<label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Padrão da tentativa</label>
					<button type="button" onClick={save} className="rounded-xl bg-blue-600 p-3 font-black text-white">Salvar template</button>
				</div>
			</section>
			<section className="rounded-3xl border bg-white p-5 shadow-sm">
				<h2 className="font-black">Templates ativos</h2>
				<div className="mt-3 grid gap-3">
					{items.map((item) => (
						<button type="button" key={item.id} onClick={() => setForm({ id: item.id, name: item.name, body: item.body, attemptNumber: item.attempt_number, active: item.active, isDefault: item.is_default, changeReason: "" })} className="rounded-2xl border p-4 text-left">
							<strong>{item.name}</strong>
							<p className="text-sm text-slate-500">Tentativa {item.attempt_number} · {item.is_default ? "padrão" : "alternativo"} · versão {item.version || 1}</p>
						</button>
					))}
				</div>
			</section>
		</div>
	);
}

function SettingsTab() {
	const [form, setForm] = useState(null);
	useEffect(() => { buscarConfiguracoesTentativas().then(setForm); }, []);
	if (!form) return <Spinner />;
	const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
	const updateWeight = (key, value) => setForm((current) => ({ ...current, score_weights: { ...(current.score_weights || {}), [key]: Number(value) } }));
	const updateThreshold = (key, value) => setForm((current) => ({ ...current, alert_thresholds: { ...(current.alert_thresholds || {}), [key]: Number(value) } }));
	const weights = form.score_weights || {};
	const thresholds = form.alert_thresholds || {};
	return (
		<section className="max-w-5xl rounded-3xl border bg-white p-5 shadow-sm">
			<div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">Política de contato</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Versão {form.version || 1}</span></div>
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<label className="grid gap-1 font-bold">Meta cobertura (%)<input className="rounded-xl border p-3" type="number" value={form.coverage_goal} onChange={(e) => update("coverage_goal", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Intervalo mínimo (h)<input className="rounded-xl border p-3" type="number" value={form.min_interval_hours} onChange={(e) => update("min_interval_hours", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Máximo tentativas<input className="rounded-xl border p-3" type="number" value={form.max_attempts} onChange={(e) => update("max_attempts", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Qtd. campanha<input className="rounded-xl border p-3" type="number" value={form.default_campaign_size} onChange={(e) => update("default_campaign_size", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Início<input className="rounded-xl border p-3" value={form.allowed_start_time} onChange={(e) => update("allowed_start_time", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Fim<input className="rounded-xl border p-3" value={form.allowed_end_time} onChange={(e) => update("allowed_end_time", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Bloqueio de duplicidade (h)<input className="rounded-xl border p-3" type="number" min="1" value={form.contact_dedupe_hours || 12} onChange={(e) => update("contact_dedupe_hours", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Aviso antecipado de retorno (min)<input className="rounded-xl border p-3" type="number" min="0" value={form.callback_grace_minutes || 30} onChange={(e) => update("callback_grace_minutes", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Política de duplicidade<select className="rounded-xl border bg-white p-3" value={form.duplicate_policy || "WARN"} onChange={(e) => update("duplicate_policy", e.target.value)}><option value="WARN">Avisar</option><option value="BLOCK">Bloquear</option></select></label>
			</div>
			<div className="mt-6 border-t border-slate-200 pt-5">
				<h3 className="font-black text-slate-950">Pesos da prioridade</h3>
				<p className="mt-1 text-sm font-semibold text-slate-500">A pontuação é normalizada e cada fator fica visível no detalhe da oportunidade.</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{[["osAge", "Tempo da OS"], ["equipment", "Equipamentos"], ["attemptHistory", "Histórico de tentativas"], ["responseHistory", "Histórico de respostas"], ["pendingCallback", "Retorno pendente"], ["timeWithoutContact", "Tempo sem contato"]].map(([key, label]) => <label key={key} className="grid gap-1 font-bold">{label}<input className="rounded-xl border p-3" type="number" min="0" max="100" value={weights[key] ?? 0} onChange={(e) => updateWeight(key, e.target.value)} /></label>)}
				</div>
			</div>
			<div className="mt-6 border-t border-slate-200 pt-5">
				<h3 className="font-black text-slate-950">Limites dos alertas gerenciais</h3>
				<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{[["staleWalletHours", "Carteira parada (h)"], ["overdueCallbacks", "Retornos vencidos"], ["invalidPhonePercent", "Telefones inválidos (%)"], ["highPriorityWithoutContact", "Prioridades sem contato"]].map(([key, label]) => <label key={key} className="grid gap-1 font-bold">{label}<input className="rounded-xl border p-3" type="number" min="0" value={thresholds[key] ?? 0} onChange={(e) => updateThreshold(key, e.target.value)} /></label>)}
				</div>
			</div>
			<label className="mt-5 grid gap-1 font-bold">Motivo da alteração<input className="rounded-xl border p-3" value={form.changeReason || ""} onChange={(e) => update("changeReason", e.target.value)} placeholder="Ex.: ajuste da política operacional de novembro" /></label>
			<button type="button" onClick={async () => setForm(await salvarConfiguracoesTentativas(form))} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-black text-white"><Save className="h-4 w-4" /> Salvar</button>
		</section>
	);
}

export default function TentativasPage() {
	const { currentUser } = useAuthContext();
	const admin = useMemo(() => canManage(currentUser), [currentUser]);
	const requestedTab = useMemo(() => {
		const value = new URLSearchParams(window.location.search).get("tab") || "route";
		return ALL_TAB_KEYS.has(value) ? value : "route";
	}, []);
	const [tab, setTab] = useState(requestedTab);
	const [workspace, setWorkspace] = useState(ADMIN_TAB_KEYS.has(requestedTab) ? "management" : "operation");
	const [moreOpen, setMoreOpen] = useState(false);
	const tabs = admin && workspace === "management" ? ADMIN_TABS : OPERATIONAL_TABS;
	const activeTab = !admin && ADMIN_TAB_KEYS.has(tab) ? "route" : tab;
	const selectTab = useCallback((nextTab) => {
		setTab(nextTab);
		const url = new URL(window.location.href);
		url.searchParams.set("tab", nextTab);
		window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
	}, []);
	const changeWorkspace = (nextWorkspace) => {
		setWorkspace(nextWorkspace);
		selectTab(nextWorkspace === "management" ? "management" : "route");
	};
	return (
		<div className="retiradas-native-page w-full min-w-0 space-y-5 pb-24 md:pb-0">
			<PageHeader
				eyebrow="Esteira operacional"
				title="Tentativas"
				description="Match → contato manual via WhatsApp → resposta → agendamento → retirada."
				icon={<div className="rounded-2xl bg-blue-600 p-3 text-white"><MessageCircle className="h-6 w-6" /></div>}
			/>
			{admin ? (
				<div className="inline-flex w-fit rounded-2xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Alternar área do módulo">
					<button type="button" onClick={() => changeWorkspace("operation")} className={`min-h-10 rounded-xl px-4 text-sm font-black ${workspace === "operation" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Operação</button>
					<button type="button" onClick={() => changeWorkspace("management")} className={`min-h-10 rounded-xl px-4 text-sm font-black ${workspace === "management" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Gestão</button>
				</div>
			) : null}
			<div className={`retiradas-native-tabs -mx-3 min-w-0 gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0 ${workspace === "operation" ? "hidden md:flex" : "flex"}`}>
				{tabs.map(([key, label, Icon]) => (
					<TabButton key={key} icon={Icon} active={activeTab === key} onClick={() => selectTab(key)}>{label}</TabButton>
				))}
			</div>
			{activeTab === "route" ? <MyRoute /> : null}
			{activeTab === "next" ? <CallbacksPanel period="upcoming" title="Próximos contatos" /> : null}
			{activeTab === "callbacks" ? <CallbacksPanel period="all" /> : null}
			{activeTab === "appointments" ? <RecoveriesPanel scheduledOnly /> : null}
			{activeTab === "recoveries" ? <RecoveriesPanel /> : null}
			{activeTab === "productivity" ? <ProductivityPanel /> : null}
			{activeTab === "management" ? <ManagementPanel /> : null}
			{activeTab === "distribution" ? <DistributionTab /> : null}
			{activeTab === "admin-recoveries" ? <RecoveriesPanel /> : null}
			{activeTab === "history" ? <HistoryTab /> : null}
			{activeTab === "audit" ? <AuditPanel /> : null}
			{activeTab === "templates" ? <TemplatesTab /> : null}
			{activeTab === "settings" ? <SettingsTab /> : null}
			{workspace === "operation" ? (
				<nav className="fixed inset-x-0 bottom-0 z-layout-sticky grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden" aria-label="Navegação de Tentativas">
					{MOBILE_OPERATION_TABS.map(([key, label, Icon]) => (
						<button key={key} type="button" onClick={() => selectTab(key)} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-black ${activeTab === key ? "bg-blue-50 text-blue-700" : "text-slate-500"}`} aria-current={activeTab === key ? "page" : undefined}>
							<Icon className="h-5 w-5" /><span className="truncate">{label}</span>
						</button>
					))}
					<button type="button" onClick={() => setMoreOpen(true)} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-black ${MOBILE_MORE_TABS.some(([key]) => key === activeTab) ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}>
						<MoreHorizontal className="h-5 w-5" /><span>Mais</span>
					</button>
				</nav>
			) : null}
			{moreOpen ? (
				<ModalShell title="Mais opções" description="Acesse os demais recursos da operação." size="sm" onClose={() => setMoreOpen(false)}>
					<div className="grid gap-2">
						{MOBILE_MORE_TABS.map(([key, label, Icon]) => (
							<button key={key} type="button" onClick={() => { selectTab(key); setMoreOpen(false); }} className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 text-left font-black ${activeTab === key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700"}`}><Icon className="h-5 w-5" />{label}</button>
						))}
					</div>
				</ModalShell>
			) : null}
		</div>
	);
}
