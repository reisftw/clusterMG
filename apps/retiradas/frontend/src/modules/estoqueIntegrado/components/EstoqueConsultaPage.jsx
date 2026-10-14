import {
	AlertCircle,
	Boxes,
	CheckCircle2,
	History,
	Loader2,
	PackageSearch,
	Search,
	UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
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

function EquipmentSummary({ equipment }) {
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
	const [searchMode, setSearchMode] = useState("mac");
	const [query, setQuery] = useState("");
	const [equipment, setEquipment] = useState(null);
	const [history, setHistory] = useState(null);
	const [serialResult, setSerialResult] = useState(null);
	const [loading, setLoading] = useState(false);
	const [loadingSteps, setLoadingSteps] = useState([]);
	const [loadingStepIndex, setLoadingStepIndex] = useState(0);
	const [error, setError] = useState("");

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

			<EquipmentSummary equipment={equipment} />
			<SerialSummary result={serialResult} />
			<HistorySection history={history} />
		</div>
	);
}
