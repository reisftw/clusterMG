import { ChevronDown, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import { listarRegionaisAdmin } from "../../auth/services/authService";
import { buscarAgentes } from "../../regionais/services/agentesService";
import {
	getMetaPercentForBase,
	normalizeMetasBaseConfig,
} from "../constants/metasBaseConfig";
import {
	getDaysInMetaMonth,
	MANUAL_META_SOURCES,
	parseDailyMetaValues,
} from "../utils/manualMetasBuilder";

const DEFAULT_REGIONAIS = [
	"Central Mineira",
	"Metropolitana sub 1",
	"Metropolitana sub 2",
	"Metropolitana sub 3",
	"Oeste de Minas",
	"Sul de Minas",
	"Centro Oeste",
];

const DEFAULT_SEMPRE_TECHNICIANS = [
	"PHILIPE SANTOS",
	"NATHAN PEREIRA",
	"JOSEVAL CAMPOS",
	"JOAO EZIQUIEL",
	"PAULO XAVIER",
	"CLAUDSON FARIA",
	"ANDRE PAULA",
];

const SOURCE_SCOPE_OPTIONS = [
	{ id: MANUAL_META_SOURCES.SEMPRE, label: "Sempre" },
	{ id: MANUAL_META_SOURCES.ONNET, label: "Onnet" },
	{ id: "ambos", label: "Sempre e Onnet" },
];

let nextRowId = 0;
const openSectionsCache = new Map();
const publishResultCache = new Map();

function getOpenSectionsStorageKey(month, year) {
	return `metas-lancamento-open-sections:${month || "mes"}:${year || "ano"}`;
}

function getPublishResultStorageKey(month, year) {
	return `metas-lancamento-publish-result:${month || "mes"}:${year || "ano"}`;
}

function readStoredOpenSections(key) {
	if (typeof window === "undefined") return openSectionsCache.get(key) || {};
	try {
		const raw = window.sessionStorage.getItem(key);
		if (!raw) return openSectionsCache.get(key) || {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return openSectionsCache.get(key) || {};
	}
}

function storeOpenSections(key, value) {
	openSectionsCache.set(key, value);
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(key, JSON.stringify(value || {}));
	} catch {
		// Se o navegador bloquear storage, o cache em memoria ainda segura remounts.
	}
}

function readStoredPublishResult(key) {
	if (typeof window === "undefined") return publishResultCache.get(key) || null;
	try {
		const raw = window.sessionStorage.getItem(key);
		if (!raw) return publishResultCache.get(key) || null;
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return publishResultCache.get(key) || null;
	}
}

function storePublishResult(key, value) {
	if (!value) return;
	publishResultCache.set(key, value);
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Se o navegador bloquear storage, o cache em memoria ainda segura remounts.
	}
}

function clearStoredPublishResult(key) {
	publishResultCache.delete(key);
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.removeItem(key);
	} catch {
		// Sem acao: storage indisponivel nao deve quebrar a tela.
	}
}

function createRowId() {
	nextRowId += 1;
	return `manual-meta-row-${nextRowId}`;
}

function formatNumber(value) {
	return Number(value || 0).toLocaleString("pt-BR");
}

function dailyToText(daily = []) {
	return (Array.isArray(daily) ? daily : [])
		.map((value) => Number(value || 0))
		.join(" ");
}

function normalizeDailyValues(daily = [], dayCount = 31) {
	return Array.from({ length: dayCount }, (_, index) => {
		const value = Number(Array.isArray(daily) ? daily[index] || 0 : 0);
		return Number.isFinite(value) && value > 0 ? value : 0;
	});
}

function rowDaily(row = {}, dayCount = 31) {
	if (Array.isArray(row.daily)) return normalizeDailyValues(row.daily, dayCount);
	return parseDailyMetaValues(row.dailyText, dayCount);
}

function sumDailyValues(row = {}, dayCount = 31) {
	return rowDaily(row, dayCount).reduce(
		(total, value) => total + Number(value || 0),
		0,
	);
}

function createRows(names = []) {
	return names.map((name) => ({
		id: createRowId(),
		name,
		sourceScope: "ambos",
		total: "",
		daily: [],
		cancelamentos: "",
		meta: "",
	}));
}

function rowsFromPerformance(items = [], fallbackNames = [], sourceScope = "ambos") {
	if (Array.isArray(items) && items.length > 0) {
		return items.map((item) => ({
			id: createRowId(),
			name: item.name || item.nome || "",
			sourceScope: item.sourceScope || sourceScope,
			total: item.total || "",
			daily: Array.isArray(item.daily) ? item.daily : parseDailyMetaValues(""),
			dailyText: dailyToText(item.daily),
			cancelamentos: item.cancelamentos || "",
			meta: item.meta || "",
		}));
	}
	return createRows(fallbackNames);
}

function rowsFromAgents(items = []) {
	return (Array.isArray(items) ? items : []).map((item) => ({
		id: createRowId(),
		name: item.cidade || item.name || "",
		sourceScope: MANUAL_META_SOURCES.SEMPRE,
		total: item.total ?? item.realizado ?? "",
		daily: Array.isArray(item.daily) ? item.daily : parseDailyMetaValues(""),
		dailyText: dailyToText(item.daily),
		cancelamentos: item.cancelamentos || "",
		meta: item.meta ?? item.meta80 ?? "",
	}));
}

function rowsFromAgentStore(items = []) {
	return (Array.isArray(items) ? items : [])
		.filter(
			(item) =>
				Number(item.lojaAgentesTotal || 0) > 0 ||
				(Array.isArray(item.lojaAgentesDaily) &&
					item.lojaAgentesDaily.some((value) => Number(value || 0) > 0)),
		)
		.map((item) => ({
			id: createRowId(),
			name: item.cidade || item.name || item.nome || "",
			sourceScope: MANUAL_META_SOURCES.SEMPRE,
			total: item.lojaAgentesTotal || "",
			daily: Array.isArray(item.lojaAgentesDaily)
				? item.lojaAgentesDaily
				: [],
			dailyText: dailyToText(item.lojaAgentesDaily),
			cancelamentos: "",
			meta: "",
		}));
}

function sourceMonthData(allData, month, source) {
	const monthData = allData?.[month] || null;
	if (!monthData) return null;
	return source === MANUAL_META_SOURCES.ONNET ? monthData.onnet : monthData;
}

function mergeRegionalRows(sempreRows = [], onnetRows = []) {
	const merged = new Map();
	const addRows = (rows, sourceScope) => {
		rows.forEach((row) => {
			const key = String(row.name || "").trim().toLowerCase();
			if (!key) return;
			const current = merged.get(key);
			if (!current) {
				merged.set(key, { ...row, sourceScope });
				return;
			}
			merged.set(key, {
				...current,
				sourceScope: current.sourceScope === sourceScope ? sourceScope : "ambos",
			});
		});
	};
	addRows(sempreRows, MANUAL_META_SOURCES.SEMPRE);
	addRows(onnetRows, MANUAL_META_SOURCES.ONNET);
	return [...merged.values()];
}

function getAgentMonthRows(agentesData = {}, month) {
	const monthData = agentesData?.[month];
	if (Array.isArray(monthData)) return monthData;
	if (Array.isArray(monthData?.cidades)) return monthData.cidades;
	if (Array.isArray(monthData?.cidadesRanking)) return monthData.cidadesRanking;
	return [];
}

function buildInitialState(allData, agentesData, month) {
	const sempreData = sourceMonthData(allData, month, MANUAL_META_SOURCES.SEMPRE);
	const onnetData = sourceMonthData(allData, month, MANUAL_META_SOURCES.ONNET);
	const sempreRegionais = rowsFromPerformance(
		sempreData?.regionais,
		DEFAULT_REGIONAIS,
		MANUAL_META_SOURCES.SEMPRE,
	);
	const onnetRegionais = rowsFromPerformance(
		onnetData?.regionais,
		[],
		MANUAL_META_SOURCES.ONNET,
	);
	return {
		cancelamentosSempre: sempreData?.cancelamentos || "",
		cancelamentosOnnet: onnetData?.cancelamentos || "",
		tecnicosSempre: rowsFromPerformance(
			sempreData?.technicians,
			DEFAULT_SEMPRE_TECHNICIANS,
			MANUAL_META_SOURCES.SEMPRE,
		),
		tecnicosOnnet: rowsFromPerformance(
			onnetData?.technicians,
			[],
			MANUAL_META_SOURCES.ONNET,
		),
		regionais: mergeRegionalRows(sempreRegionais, onnetRegionais),
		agentes: rowsFromAgents(getAgentMonthRows(agentesData, month)),
		agentesLoja: rowsFromAgentStore(getAgentMonthRows(agentesData, month)),
		lojaSempre: {
			total: sempreData?.lojaTotal || "",
			daily: (sempreData?.rawDays || sempreData?.saldoDiario || []).map(
				(row) => row?.loja || 0,
			),
		},
		lojaOnnet: {
			total: onnetData?.lojaTotal || "",
			daily: (onnetData?.rawDays || onnetData?.saldoDiario || []).map(
				(row) => row?.loja || 0,
			),
		},
	};
}

function sumRows(rows = [], dayCount = 31) {
	return rows.reduce((sum, row) => {
		const dailyTotal = sumDailyValues(row, dayCount);
		return sum + (dailyTotal || Number(row.total || 0));
	}, 0);
}

function normalizeOptions(values = []) {
	return [
		...new Set(
			values.map((value) => String(value || "").trim()).filter(Boolean),
		),
	].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function mergeRowsWithOptions(rows = [], options = []) {
	const existingByName = new Map(
		rows
			.map((row) => [String(row.name || "").trim().toLowerCase(), row])
			.filter(([name]) => name),
	);
	const optionRows = options.map((name) => {
		const current = existingByName.get(String(name).trim().toLowerCase());
		return current ? { ...current, name } : createRows([name])[0];
	});
	const customRows = rows.filter((row) => {
		const name = String(row.name || "").trim();
		if (!name) return false;
		return !options.some(
			(option) => option.trim().toLowerCase() === name.toLowerCase(),
		);
	});
	return [...optionRows, ...customRows];
}

function DailyGrid({ row, dayCount, onChangeDay }) {
	const values = rowDaily(row, dayCount);
	const weeks = [];
	for (let index = 0; index < values.length; index += 10) {
		weeks.push(values.slice(index, index + 10));
	}
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-3">
			<div className="space-y-3">
				{weeks.map((weekValues, weekIndex) => (
					<div
						key={weekIndex}
						className="grid grid-cols-5 gap-2 sm:grid-cols-10"
					>
						{weekValues.map((value, dayOffset) => {
							const dayIndex = weekIndex * 10 + dayOffset;
							return (
								<label
									key={dayIndex}
									className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 p-1.5"
								>
									<span className="block text-center text-[10px] font-black uppercase text-gray-400">
										Dia {dayIndex + 1}
									</span>
									<input
										type="number"
										min="0"
										value={value || ""}
										onChange={(event) =>
											onChangeDay(dayIndex, event.target.value)
										}
										className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-1 text-center text-sm font-black text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
										placeholder="0"
									/>
								</label>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

function SectionEditor({
	sectionId,
	title,
	description,
	nameLabel = "Nome",
	rows,
	setRows,
	dayCount,
	nameOptions = [],
	allowCustomName = true,
	showGoalFields = false,
	goalPercent = 80,
	showSourceScope = false,
	allowAdd = true,
	allowRemove = true,
	onDirty,
	onSaveCard,
	openSections,
	onSectionOpenChange,
	savingCard = false,
}) {
	const [editingRowId, setEditingRowId] = useState(null);
	const open = Boolean(openSections?.[sectionId]);
	const editingRow = rows.find((row) => row.id === editingRowId) || null;
	const openEditor = (row) => {
		onSectionOpenChange?.(sectionId, true);
		setEditingRowId(row.id);
	};
	const closeEditor = () => {
		setEditingRowId(null);
	};
	const updateRow = (id, patch) => {
		onDirty?.();
		setRows((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
		);
	};
	const removeRow = (id) => {
		onDirty?.();
		setRows((current) => current.filter((row) => row.id !== id));
	};
	const addRow = () => {
		onDirty?.();
		setRows((current) => [
			...current,
			{
				id: createRowId(),
				name: nameOptions.find(
					(option) =>
						!current.some(
							(row) =>
								String(row.name || "").trim().toLowerCase() ===
								String(option || "").trim().toLowerCase(),
						),
				) || "",
				total: "",
				daily: [],
				cancelamentos: "",
				meta: "",
				sourceScope: showSourceScope ? "ambos" : undefined,
			},
		]);
	};
	const updateDay = (row, dayIndex, value) => {
		const daily = rowDaily(row, dayCount);
		daily[dayIndex] = Math.max(0, Number(value || 0));
		updateRow(row.id, {
			daily,
			dailyText: dailyToText(daily),
			total: daily.reduce((sum, item) => sum + Number(item || 0), 0),
		});
	};
	const getRowGoal = (row = {}) =>
		Math.round(Number(row.cancelamentos || 0) * (Number(goalPercent || 0) / 100));
	const saveCard = async () => {
		await onSaveCard?.();
		onSectionOpenChange?.(sectionId, true);
		closeEditor();
	};

	return (
		<section className="rounded-2xl border border-gray-100 bg-white p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<button
					type="button"
					onClick={() => onSectionOpenChange?.(sectionId, !open)}
					className="min-w-0 flex-1 text-left"
					aria-expanded={open}
				>
					<h3 className="text-sm font-black text-gray-900">{title}</h3>
					<p className="mt-1 text-xs text-gray-500">{description}</p>
					<p className="mt-2 text-xs font-bold text-blue-600">
						{open ? "Ocultar lançamentos" : "Abrir lançamentos"}
					</p>
				</button>
				<div className="flex items-center gap-2">
					<span className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
						{rows.length} cards
					</span>
					<ChevronDown
						size={18}
						className={`text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
					/>
				</div>
				{allowAdd && open ? (
					<button
						type="button"
						onClick={addRow}
						className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
					>
						<Plus size={14} />
						Adicionar
					</button>
				) : null}
			</div>

			{open ? (
			<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{rows.map((row, index) => (
					<div
						key={row.id}
						className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-black text-gray-950">
									{row.name || `${nameLabel} ${index + 1}`}
								</p>
								<p className="mt-1 text-xs font-bold text-gray-400">
									{showSourceScope
										? SOURCE_SCOPE_OPTIONS.find(
												(option) => option.id === row.sourceScope,
											)?.label || "Sempre e Onnet"
										: `${dayCount} dias para preencher`}
								</p>
							</div>
							{allowRemove ? (
								<button
									type="button"
									onClick={() => removeRow(row.id)}
									className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50"
									title="Remover linha"
								>
									<Trash2 size={15} />
								</button>
							) : null}
						</div>
						<div className="mt-4 flex items-end justify-between gap-3">
							<div>
								<span className="text-[11px] font-bold uppercase text-gray-400">
									Total lançado
								</span>
								<p className="mt-1 text-2xl font-black text-blue-700">
									{formatNumber(sumDailyValues(row, dayCount) || row.total)}
								</p>
							</div>
							<button
								type="button"
								onClick={() => openEditor(row)}
								className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"
							>
								Preencher
							</button>
						</div>
						{showGoalFields ? (
							<div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-gray-500">
								<span>Cancel.: {formatNumber(row.cancelamentos)}</span>
								<span>Meta: {formatNumber(getRowGoal(row))}</span>
							</div>
						) : null}
					</div>
				))}
			</div>
			) : null}

			{open && editingRow ? (
				<ModalShell
					open
					title={editingRow.name || title}
					description={`Preencha os lançamentos diarios de ${title.toLowerCase()}.`}
					onClose={closeEditor}
					size="6xl"
					footer={
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={closeEditor}
								className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={saveCard}
								disabled={savingCard}
								className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{savingCard ? "Salvando..." : "Salvar card"}
							</button>
						</div>
					}
				>
					<div className="space-y-4">
						<div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_120px]">
							<label className="space-y-1">
								<span className="text-[11px] font-bold uppercase text-gray-400">
									{nameLabel}
								</span>
								{nameOptions.length && !allowCustomName ? (
									<select
										value={editingRow.name}
										onChange={(event) =>
											updateRow(editingRow.id, { name: event.target.value })
										}
										className="input-field bg-white"
									>
										<option value="">Selecionar</option>
										{nameOptions.map((option) => (
											<option key={option} value={option}>
												{option}
											</option>
										))}
									</select>
								) : (
									<input
										type="text"
										value={editingRow.name}
										onChange={(event) =>
											updateRow(editingRow.id, { name: event.target.value })
										}
										className="input-field bg-white"
										placeholder={nameLabel}
										list={nameOptions.length ? `${title}-options` : undefined}
									/>
								)}
								{nameOptions.length && allowCustomName ? (
									<datalist id={`${title}-options`}>
										{nameOptions.map((option) => (
											<option key={option} value={option} />
										))}
									</datalist>
								) : null}
							</label>
							{showSourceScope ? (
								<label className="space-y-1">
									<span className="text-[11px] font-bold uppercase text-gray-400">
										Aparece em
									</span>
									<select
										value={editingRow.sourceScope || "ambos"}
										onChange={(event) =>
											updateRow(editingRow.id, {
												sourceScope: event.target.value,
											})
										}
										className="input-field bg-white"
									>
										{SOURCE_SCOPE_OPTIONS.map((option) => (
											<option key={option.id} value={option.id}>
												{option.label}
											</option>
										))}
									</select>
								</label>
							) : null}
							<div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
								<span className="text-[11px] font-bold uppercase text-gray-400">
									Total
								</span>
								<p className="mt-1 text-2xl font-black text-blue-700">
									{formatNumber(
										sumDailyValues(editingRow, dayCount) || editingRow.total,
									)}
								</p>
							</div>
						</div>
						<DailyGrid
							row={editingRow}
							dayCount={dayCount}
							onChangeDay={(dayIndex, value) =>
								updateDay(editingRow, dayIndex, value)
							}
						/>
						{showGoalFields ? (
							<div className="mt-3 grid gap-2 sm:grid-cols-2">
								<label className="space-y-1">
									<span className="text-[11px] font-bold uppercase text-gray-400">
										Cancelamentos da cidade
									</span>
									<input
										type="number"
										min="0"
										value={editingRow.cancelamentos}
										onChange={(event) =>
											updateRow(editingRow.id, {
												cancelamentos: event.target.value,
											})
										}
										className="input-field"
										placeholder="0"
									/>
								</label>
								<div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
									<span className="text-[11px] font-bold uppercase text-blue-600">
										Meta calculada ({formatNumber(goalPercent)}%)
									</span>
									<p className="mt-1 text-2xl font-black text-blue-700">
										{formatNumber(getRowGoal(editingRow))}
									</p>
								</div>
							</div>
						) : null}
					</div>
				</ModalShell>
			) : null}
		</section>
	);
}

export default function MetasLancamentoManual({
	month,
	allData,
	agentesData,
	metasBaseConfig,
	onSave,
	saving,
	canManage,
}) {
	const [year, setYear] = useState(new Date().getFullYear());
	const initialState = useMemo(
		() => buildInitialState(allData, agentesData, month),
		[agentesData, allData, month],
	);
	const [cancelamentosSempre, setCancelamentosSempre] = useState(
		initialState.cancelamentosSempre,
	);
	const [cancelamentosOnnet, setCancelamentosOnnet] = useState(
		initialState.cancelamentosOnnet,
	);
	const [tecnicosSempre, setTecnicosSempre] = useState(
		initialState.tecnicosSempre,
	);
	const [tecnicosOnnet, setTecnicosOnnet] = useState(initialState.tecnicosOnnet);
	const [regionais, setRegionais] = useState(initialState.regionais);
	const [agentes, setAgentes] = useState(initialState.agentes);
	const [agentesLoja, setAgentesLoja] = useState(initialState.agentesLoja);
	const [lojaSempre, setLojaSempre] = useState([
		{
			id: createRowId(),
			name: "Entregue em loja Sempre",
			...initialState.lojaSempre,
		},
	]);
	const [lojaOnnet, setLojaOnnet] = useState([
		{
			id: createRowId(),
			name: "Entregue em loja Onnet",
			...initialState.lojaOnnet,
		},
	]);
	const [regionalOptions, setRegionalOptions] = useState([]);
	const [agenteOptions, setAgenteOptions] = useState([]);
	const [loadingOptions, setLoadingOptions] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [savingCard, setSavingCard] = useState(false);
	const dayCount = getDaysInMetaMonth(month, year);
	const openSectionsCacheKey = getOpenSectionsStorageKey(month, year);
	const publishResultCacheKey = getPublishResultStorageKey(month, year);
	const [openSections, setOpenSections] = useState(
		() => readStoredOpenSections(openSectionsCacheKey),
	);
	const [publishResult, setPublishResult] = useState(() =>
		readStoredPublishResult(publishResultCacheKey),
	);
	const normalizedConfig = useMemo(
		() => normalizeMetasBaseConfig(metasBaseConfig),
		[metasBaseConfig],
	);
	const metaPercentSempre = getMetaPercentForBase(
		normalizedConfig,
		MANUAL_META_SOURCES.SEMPRE,
		month,
	);
	const metaPercentOnnet = getMetaPercentForBase(
		normalizedConfig,
		MANUAL_META_SOURCES.ONNET,
		month,
	);
	const metaCalculadaSempre = Math.round(
		Number(cancelamentosSempre || 0) * (Number(metaPercentSempre || 0) / 100),
	);
	const metaCalculadaOnnet = Math.round(
		Number(cancelamentosOnnet || 0) * (Number(metaPercentOnnet || 0) / 100),
	);
	const regionaisSempre = regionais.filter((row) =>
		[MANUAL_META_SOURCES.SEMPRE, "ambos", undefined, ""].includes(
			row.sourceScope,
		),
	);
	const regionaisOnnet = regionais.filter((row) =>
		[MANUAL_META_SOURCES.ONNET, "ambos"].includes(row.sourceScope),
	);
	const totalSemprePreview =
		sumRows(tecnicosSempre, dayCount) +
		sumRows(regionaisSempre, dayCount) +
		sumRows(agentes, dayCount) +
		sumRows(lojaSempre, dayCount);
	const totalOnnetPreview =
		sumRows(tecnicosOnnet, dayCount) +
		sumRows(regionaisOnnet, dayCount) +
		sumRows(lojaOnnet, dayCount);
	const totalPreview = totalSemprePreview + totalOnnetPreview;

	const markDirty = useCallback(() => {
		setMessage("");
		setError("");
	}, []);

	useEffect(() => {
		setCancelamentosSempre(initialState.cancelamentosSempre);
		setCancelamentosOnnet(initialState.cancelamentosOnnet);
		setTecnicosSempre(initialState.tecnicosSempre);
		setTecnicosOnnet(initialState.tecnicosOnnet);
		setRegionais(initialState.regionais);
		setAgentes(initialState.agentes);
		setAgentesLoja(initialState.agentesLoja);
		setLojaSempre([
			{
				id: createRowId(),
				name: "Entregue em loja Sempre",
				...initialState.lojaSempre,
			},
		]);
		setLojaOnnet([
			{
				id: createRowId(),
				name: "Entregue em loja Onnet",
				...initialState.lojaOnnet,
			},
		]);
		setMessage("");
		setError("");
	}, [initialState, month]);

	useEffect(() => {
		setOpenSections(readStoredOpenSections(openSectionsCacheKey));
	}, [openSectionsCacheKey]);

	useEffect(() => {
		setPublishResult(readStoredPublishResult(publishResultCacheKey));
	}, [publishResultCacheKey]);

	const loadOptions = useCallback(async (force = false) => {
		setLoadingOptions(true);
		try {
			const [nextRegionais, nextAgentes] = await Promise.all([
				listarRegionaisAdmin(),
				buscarAgentes(force),
			]);
			setRegionalOptions(
				normalizeOptions(nextRegionais.map((regional) => regional.nome)),
			);
			setAgenteOptions(
				normalizeOptions(
					nextAgentes.map((agente) => agente.cidade || agente.nome),
				),
			);
		} catch (err) {
			console.warn("[metas] Falha ao carregar cadastros para lançamento.", err);
		} finally {
			setLoadingOptions(false);
		}
	}, []);

	useEffect(() => {
		loadOptions();
	}, [loadOptions]);

	useEffect(() => {
		if (!regionalOptions.length) return;
		setRegionais((current) => mergeRowsWithOptions(current, regionalOptions));
	}, [regionalOptions]);

	useEffect(() => {
		if (!agenteOptions.length) return;
		setAgentes((current) => mergeRowsWithOptions(current, agenteOptions));
		setAgentesLoja((current) => mergeRowsWithOptions(current, agenteOptions));
	}, [agenteOptions]);

	const buildSavePayload = useCallback(
		() => ({
			mes: month,
			ano: year,
			lancamentosPorFonte: [
				{
					fonte: MANUAL_META_SOURCES.SEMPRE,
					lancamento: {
						cancelamentos: cancelamentosSempre,
						tecnicos: tecnicosSempre,
						regionais: regionaisSempre,
						agentes,
						agentesLoja,
						loja: lojaSempre[0] || {},
					},
				},
				{
					fonte: MANUAL_META_SOURCES.ONNET,
					lancamento: {
						cancelamentos: cancelamentosOnnet,
						tecnicos: tecnicosOnnet,
						regionais: regionaisOnnet,
						agentes: [],
						agentesLoja: [],
						loja: lojaOnnet[0] || {},
					},
				},
			],
		}),
		[
			agentes,
			agentesLoja,
			cancelamentosOnnet,
			cancelamentosSempre,
			lojaOnnet,
			lojaSempre,
			month,
			regionaisOnnet,
			regionaisSempre,
			tecnicosOnnet,
			tecnicosSempre,
			year,
		],
	);

	const saveCurrentCard = useCallback(async () => {
		if (!canManage || saving || savingCard) return;
		setSavingCard(true);
		setError("");
		try {
			await onSave(buildSavePayload());
			setMessage("Card salvo.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o card.");
			throw err;
		} finally {
			setSavingCard(false);
		}
	}, [buildSavePayload, canManage, onSave, saving, savingCard]);

	const setSectionOpen = useCallback((sectionId, open) => {
		setOpenSections((current) => {
			const next = {
				...current,
				[sectionId]: open,
			};
			storeOpenSections(openSectionsCacheKey, next);
			return next;
		});
	}, [openSectionsCacheKey]);

	const handleSubmit = async (event) => {
		event.preventDefault();
		setMessage("");
		setError("");
		setPublishResult(null);
		clearStoredPublishResult(publishResultCacheKey);
		try {
			await onSave(buildSavePayload());
			const successMessage =
				"Lançamento publicado no /acompanhamento, /painel e AA.";
			const nextPublishResult = {
				type: "success",
				title: "Lançamento concluído",
				message: successMessage,
				totalSempre: totalSemprePreview,
				totalOnnet: totalOnnetPreview,
				total: totalPreview,
			};
			setMessage(successMessage);
			storePublishResult(publishResultCacheKey, nextPublishResult);
			setPublishResult(nextPublishResult);
		} catch (err) {
			const errorMessage =
				err?.message || "Não foi possível lançar as metas.";
			const nextPublishResult = {
				type: "error",
				title: "Falha ao lançar",
				message: errorMessage,
			};
			setError(errorMessage);
			storePublishResult(publishResultCacheKey, nextPublishResult);
			setPublishResult(nextPublishResult);
		}
	};

	const closePublishResult = useCallback(() => {
		clearStoredPublishResult(publishResultCacheKey);
		setPublishResult(null);
	}, [publishResultCacheKey]);

	return (
		<>
		<form className="space-y-4" onSubmit={handleSubmit}>
			<section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-wide text-blue-700">
							Lançamento manual
						</p>
						<h2 className="mt-1 text-xl font-black text-gray-950">
							{month} / {year}
						</h2>
						<p className="mt-1 text-sm text-gray-600">
							Informe os dados no mesmo modelo da planilha. Os valores por dia
							devem ser preenchidos no modal de cada card.
						</p>
					</div>
				</div>

				<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
					<label className="space-y-1.5">
						<span className="text-xs font-bold text-gray-600">Ano</span>
						<input
							type="number"
							min="2020"
							max="2100"
							value={year}
							onChange={(event) => {
								markDirty();
								setYear(Number(event.target.value) || year);
							}}
							className="input-field bg-white"
						/>
					</label>
					<label className="space-y-1.5">
						<span className="text-xs font-bold text-gray-600">
							Cancelamentos Sempre
						</span>
						<input
							type="number"
							min="0"
							value={cancelamentosSempre}
							onChange={(event) => {
								markDirty();
								setCancelamentosSempre(event.target.value);
							}}
							className="input-field bg-white"
							placeholder="2910"
						/>
					</label>
					<label className="space-y-1.5">
						<span className="text-xs font-bold text-gray-600">
							Cancelamentos Onnet
						</span>
						<input
							type="number"
							min="0"
							value={cancelamentosOnnet}
							onChange={(event) => {
								markDirty();
								setCancelamentosOnnet(event.target.value);
							}}
							className="input-field bg-white"
							placeholder="0"
						/>
					</label>
					<div className="rounded-xl bg-white p-3">
						<p className="text-xs font-bold text-gray-500">
							Meta Sempre ({formatNumber(metaPercentSempre)}%)
						</p>
						<p className="mt-1 text-2xl font-black text-blue-700">
							{formatNumber(metaCalculadaSempre)}
						</p>
					</div>
					<div className="rounded-xl bg-white p-3">
						<p className="text-xs font-bold text-gray-500">
							Meta Onnet ({formatNumber(metaPercentOnnet)}%)
						</p>
						<p className="mt-1 text-2xl font-black text-blue-700">
							{formatNumber(metaCalculadaOnnet)}
						</p>
					</div>
					<div className="rounded-xl bg-white p-3 xl:col-span-2">
						<p className="text-xs font-bold text-gray-500">
							Total lançado
						</p>
						<div className="mt-2 grid grid-cols-3 gap-2">
							<div>
								<p className="text-[10px] font-black uppercase text-gray-400">
									Sempre
								</p>
								<p className="text-lg font-black text-blue-700">
									{formatNumber(totalSemprePreview)}
								</p>
							</div>
							<div>
								<p className="text-[10px] font-black uppercase text-gray-400">
									Onnet
								</p>
								<p className="text-lg font-black text-sky-700">
									{formatNumber(totalOnnetPreview)}
								</p>
							</div>
							<div>
								<p className="text-[10px] font-black uppercase text-gray-400">
									Todos
								</p>
								<p className="text-lg font-black text-emerald-700">
									{formatNumber(totalPreview)}
								</p>
							</div>
						</div>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-gray-600">
					<span>
						{dayCount} dias disponíveis para lançamento diário neste mês.
					</span>
					<button
						type="button"
						onClick={() => loadOptions(true)}
						className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-white px-2.5 py-1.5 text-blue-700 hover:bg-blue-50"
					>
						<RefreshCw size={13} />
						{loadingOptions ? "Atualizando cadastros..." : "Atualizar cadastros"}
					</button>
				</div>
			</section>

			<SectionEditor
				sectionId="tecnicosSempre"
				title="Técnicos Sempre"
				description="Cadastre os técnicos Sempre e clique no card para lançar por dia."
				rows={tecnicosSempre}
				setRows={setTecnicosSempre}
				dayCount={dayCount}
				onDirty={markDirty}
				onSaveCard={saveCurrentCard}
				openSections={openSections}
				onSectionOpenChange={setSectionOpen}
				savingCard={savingCard}
			/>

			<SectionEditor
				sectionId="tecnicosOnnet"
				title="Técnicos Onnet"
				description="Cadastre os técnicos Onnet e clique no card para lançar por dia."
				rows={tecnicosOnnet}
				setRows={setTecnicosOnnet}
				dayCount={dayCount}
				onDirty={markDirty}
				onSaveCard={saveCurrentCard}
				openSections={openSections}
				onSectionOpenChange={setSectionOpen}
				savingCard={savingCard}
			/>

			<SectionEditor
				sectionId="regionais"
				title="Regionais"
				description="Use as regionais atuais e informe os lançamentos por dia."
				rows={regionais}
				setRows={setRegionais}
				dayCount={dayCount}
				nameOptions={regionalOptions}
				allowCustomName={false}
				showSourceScope
				onDirty={markDirty}
				onSaveCard={saveCurrentCard}
				openSections={openSections}
				onSectionOpenChange={setSectionOpen}
				savingCard={savingCard}
			/>

			<SectionEditor
				sectionId="agentes"
				title="Agente autorizado Sempre"
				description="Selecione a cidade, informe a meta e lance as retiradas por dia. Onnet não utiliza agente autorizado."
				nameLabel="Cidade"
				rows={agentes}
				setRows={setAgentes}
				dayCount={dayCount}
				nameOptions={agenteOptions}
				allowCustomName={false}
				showGoalFields
				goalPercent={metaPercentSempre}
				onDirty={markDirty}
				onSaveCard={saveCurrentCard}
				openSections={openSections}
				onSectionOpenChange={setSectionOpen}
				savingCard={savingCard}
			/>

			<SectionEditor
				sectionId="agentesLoja"
				title="AA - Entrega em loja"
				description="Lance entregas em loja por cidade de agente autorizado. Este bloco aparece no painel AA e não soma na meta operacional."
				nameLabel="Cidade"
				rows={agentesLoja}
				setRows={setAgentesLoja}
				dayCount={dayCount}
				nameOptions={agenteOptions}
				allowCustomName={false}
				onDirty={markDirty}
				onSaveCard={saveCurrentCard}
				openSections={openSections}
				onSectionOpenChange={setSectionOpen}
				savingCard={savingCard}
			/>

			<SectionEditor
				sectionId="lojaSempre"
				title="Entregue em loja Sempre"
				description="Lançamento diário de entrega em loja da operação Sempre."
				rows={lojaSempre}
				setRows={setLojaSempre}
				dayCount={dayCount}
				allowAdd={false}
				allowRemove={false}
				onDirty={markDirty}
				onSaveCard={saveCurrentCard}
				openSections={openSections}
				onSectionOpenChange={setSectionOpen}
				savingCard={savingCard}
			/>

			<SectionEditor
				sectionId="lojaOnnet"
				title="Entregue em loja Onnet"
				description="Lançamento diário de entrega em loja da operação Onnet."
				rows={lojaOnnet}
				setRows={setLojaOnnet}
				dayCount={dayCount}
				allowAdd={false}
				allowRemove={false}
				onDirty={markDirty}
				onSaveCard={saveCurrentCard}
				openSections={openSections}
				onSectionOpenChange={setSectionOpen}
				savingCard={savingCard}
			/>

			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4">
				<div>
					<p className="text-sm font-bold text-gray-900">
						Pronto para publicar?
					</p>
					<p className="text-xs text-gray-500">
						O lançamento atualiza os dados do mês selecionado e mantém o
						histórico dos outros meses.
					</p>
				</div>
				{canManage ? (
					<button
						type="submit"
						disabled={saving}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Send size={16} />
						{saving ? "Lançando..." : "Lançar nos painéis"}
					</button>
				) : null}
				{message ? (
					<p className="w-full rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
						{message}
					</p>
				) : null}
				{error ? (
					<p className="w-full rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
						{error}
					</p>
				) : null}
			</div>
		</form>
		{publishResult ? (
			<ModalShell
				open
				title={publishResult.title}
				description={`${month} / ${year}`}
				onClose={closePublishResult}
				size="lg"
				footer={
					<div className="flex justify-end">
						<button
							type="button"
							onClick={closePublishResult}
							className={`inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-black text-white ${
								publishResult.type === "success"
									? "bg-emerald-600 hover:bg-emerald-700"
									: "bg-red-600 hover:bg-red-700"
							}`}
						>
							Entendi
						</button>
					</div>
				}
			>
				<div
					className={`rounded-2xl border px-4 py-4 ${
						publishResult.type === "success"
							? "border-emerald-100 bg-emerald-50 text-emerald-800"
							: "border-red-100 bg-red-50 text-red-800"
					}`}
				>
					<p className="text-sm font-bold">{publishResult.message}</p>
					{publishResult.type === "success" ? (
						<div className="mt-4 grid grid-cols-3 gap-3 text-center">
							<div className="rounded-xl bg-white px-3 py-2">
								<p className="text-[10px] font-black uppercase text-gray-400">
									Sempre
								</p>
								<p className="text-xl font-black text-blue-700">
									{formatNumber(
										publishResult.totalSempre ?? totalSemprePreview,
									)}
								</p>
							</div>
							<div className="rounded-xl bg-white px-3 py-2">
								<p className="text-[10px] font-black uppercase text-gray-400">
									Onnet
								</p>
								<p className="text-xl font-black text-sky-700">
									{formatNumber(publishResult.totalOnnet ?? totalOnnetPreview)}
								</p>
							</div>
							<div className="rounded-xl bg-white px-3 py-2">
								<p className="text-[10px] font-black uppercase text-gray-400">
									Todos
								</p>
								<p className="text-xl font-black text-emerald-700">
									{formatNumber(publishResult.total ?? totalPreview)}
								</p>
							</div>
						</div>
					) : null}
				</div>
			</ModalShell>
		) : null}
		</>
	);
}
