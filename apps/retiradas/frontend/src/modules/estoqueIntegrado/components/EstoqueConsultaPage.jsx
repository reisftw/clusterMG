import {
	AlertCircle,
	Boxes,
	CheckCircle2,
	History,
	Loader2,
	PackageSearch,
	RefreshCw,
	Search,
	Send,
	UserRound,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasAnyPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	atualizarTecnicosSolicitacao,
	buscarSolicitacaoOrdemServico,
	buscarTecnicosSolicitacao,
	criarSolicitacaoPorEquipamento,
} from "../../serviceOrders/requests/services/serviceOrderRequestsService";
import {
	consultarEquipamentoSempre,
	consultarEquipamentoPorSerialSempre,
	consultarHistoricoSempre,
	normalizeMacInput,
	normalizeSerialInput,
} from "../services/sempreEstoqueService";

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function InfoCard({ icon: Icon, label, value, helper, tone = "slate" }) {
	const tones = {
		slate: "border-slate-200 bg-white text-slate-800",
		green: "border-emerald-200 bg-emerald-50 text-emerald-900",
		blue: "border-blue-200 bg-blue-50 text-blue-900",
		orange: "border-orange-200 bg-orange-50 text-orange-900",
	};

	return (
		<div
			className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}
		>
			<div className="flex items-start gap-3">
				<span className="rounded-xl bg-white/80 p-2 shadow-sm">
					<Icon size={18} />
				</span>
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide opacity-70">
						{label}
					</p>
					<p className="mt-1 break-words text-base font-black">
						{value || "-"}
					</p>
					{helper ? (
						<p className="mt-1 text-xs font-semibold opacity-70">{helper}</p>
					) : null}
				</div>
			</div>
		</div>
	);
}

function HistoryItem({ note }) {
	const firstItem = note.itens?.[0] || {};
	const origem =
		firstItem.estoqueOrigem?.display ||
		firstItem.estoqueOrigem?.descricao ||
		"-";
	const destino =
		firstItem.estoqueDestino?.display ||
		firstItem.estoqueDestino?.descricao ||
		"-";

	return (
		<article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-sm font-black text-slate-900">
						Nota {note.numero || note.id || "-"}
					</p>
					<p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
						{note.tipoOperacao?.descricao ||
							note.status ||
							note.situacao ||
							"Movimentacao"}
					</p>
				</div>
				<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
					{formatDate(note.atualizadoEm || note.criadoEm || note.emitidoEm)}
				</span>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				<div className="rounded-xl bg-slate-50 p-3">
					<p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
						Origem
					</p>
					<p className="mt-1 text-sm font-bold text-slate-700">{origem}</p>
				</div>
				<div className="rounded-xl bg-slate-50 p-3">
					<p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
						Destino
					</p>
					<p className="mt-1 text-sm font-bold text-slate-700">{destino}</p>
				</div>
			</div>

			{firstItem.produto?.descricao ? (
				<p className="mt-3 text-sm font-semibold text-slate-600">
					{firstItem.produto.descricao}
				</p>
			) : null}
			{note.observacao ? (
				<p className="mt-2 text-xs font-semibold text-slate-500">
					{note.observacao}
				</p>
			) : null}
		</article>
	);
}

function validateMacForSearch(normalizedMac) {
	if (normalizedMac.length !== 12 || normalizedMac === "FFFFFFFFFFFF") {
		return "Informe um MAC valido com 12 caracteres.";
	}
	return "";
}

function validateSerialForSearch(normalizedSerial) {
	if (normalizedSerial.length < 8) {
		return "Informe um serial valido com pelo menos 8 caracteres.";
	}
	return "";
}

function EquipmentSummary({ equipment, onAssign }) {
	if (!equipment) return null;

	const primary = equipment.primary || null;
	const stockLocal = equipment.stockLocal || null;

	return (
		<section className="grid gap-4 lg:grid-cols-4">
			<InfoCard
				icon={equipment.found ? CheckCircle2 : AlertCircle}
				label="Status"
				value={
					equipment.found ? primary?.status || "Encontrado" : "Nao encontrado"
				}
				helper={
					primary?.vinculadoTipo ? `Vinculo: ${primary.vinculadoTipo}` : ""
				}
				tone={equipment.found ? "green" : "orange"}
			/>
			<InfoCard
				icon={Boxes}
				label="Estoque atual"
				value={stockLocal?.descricao || primary?.estoqueLocal}
				helper={stockLocal?.seniorId || primary?.estoqueLocalId}
				tone="blue"
			/>
			<InfoCard
				icon={PackageSearch}
				label="Produto"
				value={primary?.produtoNome}
				helper={primary?.produtoId}
			/>
			<InfoCard
				icon={UserRound}
				label="Vinculado em"
				value={primary?.vinculadoEm || primary?.origemStatus}
				helper={
					primary?.cpfCnpjMascarado ? `Doc: ${primary.cpfCnpjMascarado}` : ""
				}
			/>
			{equipment.found && onAssign ? (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 lg:col-span-4">
					<div>
						<p className="text-sm font-black text-blue-950">O equipamento esta com um cliente?</p>
						<p className="text-xs font-semibold text-blue-700">Localize a O.S. de retirada aberta e encaminhe para qualquer tecnico cadastrado no HubSoft.</p>
					</div>
					<button type="button" onClick={onAssign} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700">
						<Send size={17} /> Encaminhar O.S. para tecnico
					</button>
				</div>
			) : null}
		</section>
	);
}

function SerialSummary({ result }) {
	if (!result) return null;

	const autoIsp = result.autoIsp || {};
	const hubsoft = result.hubsoft || {};

	return (
		<section className="grid gap-4 lg:grid-cols-4">
			<InfoCard
				icon={CheckCircle2}
				label="Serial encontrado"
				value={result.serial?.toUpperCase()}
				helper={autoIsp.status ? `AutoISP: ${autoIsp.status}` : "AutoISP"}
				tone="green"
			/>
			<InfoCard
				icon={PackageSearch}
				label="Descricao na OLT"
				value={result.loginRadius || autoIsp.descricaoOlt}
				helper={autoIsp.olt || autoIsp.pon}
				tone="blue"
			/>
			<InfoCard
				icon={hubsoft.found === false ? AlertCircle : UserRound}
				label="Cliente HubSoft"
				value={
					hubsoft.clientCode
						? `(${hubsoft.clientCode}) ${hubsoft.clientName}`
						: hubsoft.clientName || "Nao localizado"
				}
				helper={hubsoft.error || "Busca por Login radius"}
				tone={hubsoft.found === false ? "orange" : "slate"}
			/>
			<InfoCard
				icon={Boxes}
				label="Equipamento"
				value={autoIsp.modelo || "-"}
				helper={autoIsp.erpId ? `ERP ${autoIsp.erpId}` : ""}
			/>
		</section>
	);
}

function LoadingSteps({ steps, currentIndex }) {
	if (!steps?.length) return null;

	return (
		<div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
			<div className="flex items-center gap-2 text-sm font-black text-blue-900">
				<Loader2 size={18} className="animate-spin" />
				Consultando, aguarde...
			</div>
			<div className="mt-3 grid gap-2">
				{steps.map((step, index) => {
					const done = index < currentIndex;
					const active = index === currentIndex;
					return (
						<div
							key={step}
							className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${
								active
									? "bg-white text-blue-800 shadow-sm"
									: done
										? "text-emerald-700"
										: "text-slate-400"
							}`}
						>
							{done ? (
								<CheckCircle2 size={15} />
							) : active ? (
								<Loader2 size={15} className="animate-spin" />
							) : (
								<span className="h-[15px] w-[15px] rounded-full border border-current" />
							)}
							{step}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function EquipmentAssignmentModal({ mac, equipment, onClose }) {
	const [technicians, setTechnicians] = useState([]);
	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState("");
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [activeRequest, setActiveRequest] = useState(null);
	const [lookup, setLookup] = useState(null);

	const filteredTechnicians = useMemo(() => {
		const query = search.trim().toLocaleLowerCase("pt-BR");
		return technicians
			.filter((technician) =>
				query
					? `${technician.displayName || ""} ${technician.name || ""}`
							.toLocaleLowerCase("pt-BR")
							.includes(query)
					: true,
			)
			.slice(0, 150);
	}, [search, technicians]);

	useEffect(() => {
		let mounted = true;
		buscarTecnicosSolicitacao()
			.then((response) => {
				if (mounted) setTechnicians(Array.isArray(response?.items) ? response.items : []);
			})
			.catch((loadError) => {
				if (mounted) setError(loadError?.message || "Nao foi possivel carregar os tecnicos.");
			})
			.finally(() => {
				if (mounted) setLoading(false);
			});
		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		if (!activeRequest?.id || ["COMPLETED", "FAILED"].includes(activeRequest.status)) return undefined;
		const timer = window.setInterval(async () => {
			try {
				const response = await buscarSolicitacaoOrdemServico(activeRequest.id);
				if (response?.item) setActiveRequest(response.item);
			} catch (pollError) {
				setError(pollError?.message || "Falha ao acompanhar o encaminhamento.");
			}
		}, 1000);
		return () => window.clearInterval(timer);
	}, [activeRequest?.id, activeRequest?.status]);

	async function refreshTechnicians() {
		setRefreshing(true);
		setError("");
		try {
			const response = await atualizarTecnicosSolicitacao();
			setTechnicians(Array.isArray(response?.items) ? response.items : []);
		} catch (refreshError) {
			setError(refreshError?.message || "Nao foi possivel atualizar os tecnicos.");
		} finally {
			setRefreshing(false);
		}
	}

	async function submit() {
		const technician = technicians.find(
			(item) => String(item.id) === String(selectedId),
		);
		if (!technician) return;
		setSubmitting(true);
		setError("");
		try {
			const response = await criarSolicitacaoPorEquipamento(mac, technician);
			setLookup(response?.lookup || null);
			setActiveRequest(response?.item || null);
		} catch (submitError) {
			setError(submitError?.message || "Nao foi possivel encaminhar a O.S.");
		} finally {
			setSubmitting(false);
		}
	}

	const primary = equipment?.primary || {};
	const finished = activeRequest?.status === "COMPLETED";
	const failed = activeRequest?.status === "FAILED";

	return (
		<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Encaminhar ordem de servico">
			<div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
				<header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Encaminhamento HubSoft</p>
						<h2 className="mt-1 text-xl font-black text-slate-950">Enviar O.S. para tecnico</h2>
						<p className="mt-2 text-sm font-semibold text-slate-600">{primary.vinculadoEm || primary.origemStatus || "Cliente vinculado"} · {mac}</p>
					</div>
					<button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Fechar"><X size={19} /></button>
				</header>

				<div className="space-y-4 p-5 sm:p-6">
					{!activeRequest ? (
						<>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="text-sm font-black text-slate-800">Tecnico que recebera a O.S.</p>
								<button type="button" onClick={refreshTechnicians} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 disabled:opacity-50">
									<RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Atualizar tecnicos
								</button>
							</div>
							<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Pesquisar entre ${technicians.length} tecnicos`} className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none focus:border-blue-500 focus:bg-white" />
							<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
								<option value="">{loading ? "Carregando tecnicos..." : "Selecione um tecnico"}</option>
								{filteredTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.displayName || technician.name}{technician.isWithdrawal ? " · Retirada" : ""}</option>)}
							</select>
							<p className="text-xs font-semibold text-slate-500">Antes de alterar, o sistema confirma o cliente e aceita somente O.S. aberta de retirada.</p>
						</>
					) : null}

					{lookup ? (
						<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
							<p className="font-black">O.S. {lookup.serviceOrderNumber} · {lookup.serviceOrderType}</p>
							<p className="mt-1 font-semibold">Cliente ({lookup.clientCode}) {lookup.clientName}</p>
							{lookup.currentTechnicians?.length ? <p className="mt-1 text-xs font-semibold">Tecnico atual: {lookup.currentTechnicians.join(", ")}</p> : null}
						</div>
					) : null}

					{activeRequest ? (
						<div className={`rounded-2xl border p-4 ${failed ? "border-red-200 bg-red-50 text-red-800" : finished ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
							<div className="flex items-center gap-2 font-black">{!finished && !failed ? <Loader2 size={17} className="animate-spin" /> : null}{activeRequest.stage}</div>
							<div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70"><div className={`h-full rounded-full ${failed ? "bg-red-500" : finished ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${Math.max(4, Number(activeRequest.progress || 0))}%` }} /></div>
							{finished ? <p className="mt-3 text-sm font-semibold">{activeRequest.resultMessage}</p> : null}
							{failed ? <p className="mt-3 text-sm font-semibold">{activeRequest.errorMessage}</p> : null}
						</div>
					) : null}

					{error ? <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</div> : null}
				</div>

				<footer className="flex justify-end gap-3 border-t border-slate-200 p-5 sm:p-6">
					<button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">{finished || failed ? "Fechar" : "Cancelar"}</button>
					{!activeRequest ? <button type="button" onClick={submit} disabled={!selectedId || submitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300">{submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{submitting ? "Validando O.S..." : "Confirmar encaminhamento"}</button> : null}
				</footer>
			</div>
		</div>
	);
}

function HistorySection({ history }) {
	if (!history) return null;

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="rounded-xl bg-blue-50 p-2 text-blue-700">
						<History size={18} />
					</span>
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Historico de Movimentacoes
						</h2>
						<p className="text-xs font-semibold text-slate-500">
							{history.meta?.totalItems ?? history.notes?.length ?? 0}{" "}
							registro(s) encontrados para {history.mac}
						</p>
					</div>
				</div>
			</div>

			{history.notes?.length ? (
				<div className="grid gap-3">
					{history.notes.map((note) => (
						<HistoryItem key={note.id || note.numero} note={note} />
					))}
				</div>
			) : (
				<div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
					Nenhuma movimentacao encontrada para este MAC.
				</div>
			)}
		</section>
	);
}

export default function EstoqueConsultaPage() {
	const { currentUser } = useAuthContext();
	const [searchMode, setSearchMode] = useState("mac");
	const [query, setQuery] = useState("");
	const [equipment, setEquipment] = useState(null);
	const [history, setHistory] = useState(null);
	const [serialResult, setSerialResult] = useState(null);
	const [loading, setLoading] = useState(false);
	const [loadingSteps, setLoadingSteps] = useState([]);
	const [loadingStepIndex, setLoadingStepIndex] = useState(0);
	const [error, setError] = useState("");
	const [assignmentOpen, setAssignmentOpen] = useState(false);
	const canAssignServiceOrder =
		["admin", "backoffice", "backoffice_retirada"].includes(
			String(currentUser?.role || "").trim().toLowerCase(),
		) &&
		hasAnyPermission(currentUser, ["service_orders.requests.create"]);

	const normalizedQuery = useMemo(
		() =>
			searchMode === "serial"
				? normalizeSerialInput(query)
				: normalizeMacInput(query),
		[query, searchMode],
	);
	const serialLikeInput = useMemo(() => normalizeSerialInput(query), [query]);
	const looksLikeSerialInMacMode =
		searchMode === "mac" && serialLikeInput.length > 12;

	const currentSteps = useMemo(
		() =>
			searchMode === "serial"
				? [
						"Validando serial",
						"Consultando AutoISP",
						"Lendo descricao na OLT",
						"Consultando HubSoft por Login radius",
						"Montando resultado",
					]
				: [
						"Validando MAC",
						"Consultando equipamento",
						"Buscando historico",
						"Montando resultado",
					],
		[searchMode],
	);

	function switchMode(nextMode) {
		setAssignmentOpen(false);
		setSearchMode(nextMode);
		setQuery("");
		setEquipment(null);
		setHistory(null);
		setSerialResult(null);
		setError("");
	}

	async function handleSubmit(event) {
		event.preventDefault();
		setError("");
		setEquipment(null);
		setHistory(null);
		setSerialResult(null);
		setAssignmentOpen(false);
		setLoadingStepIndex(0);

		if (looksLikeSerialInMacMode) {
			setError(
				"Esse valor parece ser um serial. Clique em Serial para consultar no AutoISP e HubSoft.",
			);
			return;
		}

		const validationError =
			searchMode === "serial"
				? validateSerialForSearch(normalizedQuery)
				: validateMacForSearch(normalizedQuery);
		if (validationError) {
			setError(validationError);
			return;
		}

		setLoading(true);
		setLoadingSteps(currentSteps);
		const intervalId = window.setInterval(() => {
			setLoadingStepIndex((current) =>
				Math.min(current + 1, currentSteps.length - 1),
			);
		}, searchMode === "serial" ? 2200 : 1200);
		try {
			if (searchMode === "serial") {
				const result = await consultarEquipamentoPorSerialSempre(normalizedQuery);
				setSerialResult(result);
				if (result?.partial && result?.message) setError(result.message);
			} else {
				const [equipmentResult, historyResult] = await Promise.all([
					consultarEquipamentoSempre(normalizedQuery),
					consultarHistoricoSempre(normalizedQuery, { limit: 20 }),
				]);
				setEquipment(equipmentResult);
				setHistory(historyResult);
			}
		} catch (err) {
			setError(
				err?.message ||
					(searchMode === "serial"
						? "Nao foi possivel consultar o serial."
						: "Nao foi possivel consultar a API Sempre."),
			);
		} finally {
			window.clearInterval(intervalId);
			setLoadingStepIndex(currentSteps.length - 1);
			setLoading(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
							INTEGRACAO SEMPRE
						</p>
						<h1 className="mt-2 text-2xl font-black text-slate-950">
							Consulta de Estoque
						</h1>
						<p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
							Consulte por MAC para ver vinculo atual e historico, ou por serial
							para localizar o cliente via AutoISP e HubSoft.
						</p>
						<div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide">
							<span className="text-slate-400">Pesquisar por</span>
							<button
								type="button"
								onClick={() => switchMode("mac")}
								className={`rounded-full px-3 py-1.5 transition ${
									searchMode === "mac"
										? "bg-blue-600 text-white"
										: "bg-slate-100 text-slate-600 hover:bg-slate-200"
								}`}
							>
								MAC
							</button>
							<button
								type="button"
								onClick={() => switchMode("serial")}
								className={`rounded-full px-3 py-1.5 transition ${
									searchMode === "serial"
										? "bg-blue-600 text-white"
										: "bg-slate-100 text-slate-600 hover:bg-slate-200"
								}`}
							>
								Serial
							</button>
						</div>
					</div>
					<span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
						<PackageSearch size={14} />
						{searchMode === "serial" ? "AutoISP / HubSoft" : "Senior / Playground"}
					</span>
				</div>

				<form
					onSubmit={handleSubmit}
					className="mt-6 flex flex-col gap-3 sm:flex-row"
				>
					<div className="relative flex-1">
						<Search
							size={18}
							className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
						/>
						<input
							value={query}
							onChange={(event) =>
								setQuery(
									searchMode === "serial"
										? normalizeSerialInput(event.target.value)
										: normalizeMacInput(event.target.value),
								)
							}
							placeholder={
								searchMode === "serial"
									? "Digite ou cole o serial. Ex: 4857544361b277b7"
									: "Digite ou cole o MAC. Ex: 544B542C68E0"
							}
							className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-black uppercase tracking-wide text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
						/>
					</div>
					<button
						type="submit"
						disabled={loading}
						className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
					>
						{loading ? (
							<Loader2 size={18} className="animate-spin" />
						) : (
							<Search size={18} />
						)}
						Consultar
					</button>
				</form>

				{looksLikeSerialInMacMode ? (
					<div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
						<AlertCircle size={18} />
						Esse codigo tem mais de 12 caracteres e parece serial.
						<button
							type="button"
							onClick={() => setSearchMode("serial")}
							className="rounded-full bg-orange-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white"
						>
							Pesquisar como serial
						</button>
					</div>
				) : null}

				{loading ? (
					<LoadingSteps steps={loadingSteps} currentIndex={loadingStepIndex} />
				) : null}

				{error ? (
					<div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
						<AlertCircle size={18} />
						{error}
					</div>
				) : null}
			</section>

			<EquipmentSummary
				equipment={equipment}
				onAssign={
					canAssignServiceOrder ? () => setAssignmentOpen(true) : null
				}
			/>
			<SerialSummary result={serialResult} />
			<HistorySection history={history} />

			{assignmentOpen && equipment?.found ? (
				<EquipmentAssignmentModal
					mac={normalizedQuery}
					equipment={equipment}
					onClose={() => setAssignmentOpen(false)}
				/>
			) : null}
		</div>
	);
}
