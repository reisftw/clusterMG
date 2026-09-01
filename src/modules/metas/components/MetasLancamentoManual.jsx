import { Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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

let nextRowId = 0;

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

function createRows(names = []) {
	return names.map((name) => ({
		id: createRowId(),
		name,
		total: "",
		dailyText: "",
		cancelamentos: "",
		meta: "",
	}));
}

function rowsFromPerformance(items = [], fallbackNames = []) {
	if (Array.isArray(items) && items.length > 0) {
		return items.map((item) => ({
			id: createRowId(),
			name: item.name || item.nome || "",
			total: item.total || "",
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
		total: item.total || "",
		dailyText: dailyToText(item.daily),
		cancelamentos: item.cancelamentos || "",
		meta: item.meta || "",
	}));
}

function sourceMonthData(allData, month, source) {
	const monthData = allData?.[month] || null;
	if (!monthData) return null;
	return source === MANUAL_META_SOURCES.ONNET ? monthData.onnet : monthData;
}

function buildInitialState(allData, agentesData, month, source) {
	const data = sourceMonthData(allData, month, source);
	return {
		cancelamentos: data?.cancelamentos || "",
		tecnicos: rowsFromPerformance(
			data?.technicians,
			source === MANUAL_META_SOURCES.SEMPRE ? DEFAULT_SEMPRE_TECHNICIANS : [],
		),
		regionais: rowsFromPerformance(data?.regionais, DEFAULT_REGIONAIS),
		agentes: rowsFromAgents(agentesData?.[month] || []),
		loja: {
			total: data?.lojaTotal || "",
			dailyText: dailyToText(
				(data?.rawDays || data?.saldoDiario || []).map((row) => row?.loja || 0),
			),
		},
	};
}

function sumRows(rows = [], dayCount = 31) {
	return rows.reduce((sum, row) => {
		const dailyTotal = parseDailyMetaValues(row.dailyText, dayCount).reduce(
			(total, value) => total + Number(value || 0),
			0,
		);
		return sum + (dailyTotal || Number(row.total || 0));
	}, 0);
}

function SectionEditor({
	title,
	description,
	nameLabel = "Nome",
	rows,
	setRows,
	showGoalFields = false,
}) {
	const updateRow = (id, patch) => {
		setRows((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
		);
	};
	const removeRow = (id) => {
		setRows((current) => current.filter((row) => row.id !== id));
	};
	const addRow = () => {
		setRows((current) => [
			...current,
			{
				id: createRowId(),
				name: "",
				total: "",
				dailyText: "",
				cancelamentos: "",
				meta: "",
			},
		]);
	};

	return (
		<section className="rounded-2xl border border-gray-100 bg-white p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 className="text-sm font-black text-gray-900">{title}</h3>
					<p className="mt-1 text-xs text-gray-500">{description}</p>
				</div>
				<button
					type="button"
					onClick={addRow}
					className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
				>
					<Plus size={14} />
					Adicionar
				</button>
			</div>

			<div className="mt-4 space-y-3">
				{rows.map((row, index) => (
					<div
						key={row.id}
						className="grid gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 lg:grid-cols-[1.2fr_0.45fr_1.6fr_auto]"
					>
						<label className="space-y-1">
							<span className="text-[11px] font-bold uppercase text-gray-400">
								{nameLabel} {index + 1}
							</span>
							<input
								type="text"
								value={row.name}
								onChange={(event) =>
									updateRow(row.id, { name: event.target.value })
								}
								className="input-field"
								placeholder={nameLabel}
							/>
						</label>
						<label className="space-y-1">
							<span className="text-[11px] font-bold uppercase text-gray-400">
								Total
							</span>
							<input
								type="number"
								min="0"
								value={row.total}
								onChange={(event) =>
									updateRow(row.id, { total: event.target.value })
								}
								className="input-field"
								placeholder="0"
							/>
						</label>
						<label className="space-y-1">
							<span className="text-[11px] font-bold uppercase text-gray-400">
								Entregas por dia
							</span>
							<input
								type="text"
								value={row.dailyText}
								onChange={(event) =>
									updateRow(row.id, { dailyText: event.target.value })
								}
								className="input-field"
								placeholder="Ex: 3 0 1 4 2"
							/>
						</label>
						<button
							type="button"
							onClick={() => removeRow(row.id)}
							className="mt-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50"
							title="Remover linha"
						>
							<Trash2 size={16} />
						</button>
						{showGoalFields ? (
							<div className="grid gap-2 lg:col-span-4 sm:grid-cols-2">
								<label className="space-y-1">
									<span className="text-[11px] font-bold uppercase text-gray-400">
										Cancelamentos da cidade
									</span>
									<input
										type="number"
										min="0"
										value={row.cancelamentos}
										onChange={(event) =>
											updateRow(row.id, {
												cancelamentos: event.target.value,
											})
										}
										className="input-field"
										placeholder="0"
									/>
								</label>
								<label className="space-y-1">
									<span className="text-[11px] font-bold uppercase text-gray-400">
										Meta da cidade
									</span>
									<input
										type="number"
										min="0"
										value={row.meta}
										onChange={(event) =>
											updateRow(row.id, { meta: event.target.value })
										}
										className="input-field"
										placeholder="Calcula 80% se vazio"
									/>
								</label>
							</div>
						) : null}
					</div>
				))}
			</div>
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
	const [source, setSource] = useState(MANUAL_META_SOURCES.SEMPRE);
	const [year, setYear] = useState(new Date().getFullYear());
	const initialState = useMemo(
		() =>
			buildInitialState(
				allData,
				agentesData,
				month,
				MANUAL_META_SOURCES.SEMPRE,
			),
		[agentesData, allData, month],
	);
	const [cancelamentos, setCancelamentos] = useState(
		initialState.cancelamentos,
	);
	const [tecnicos, setTecnicos] = useState(initialState.tecnicos);
	const [regionais, setRegionais] = useState(initialState.regionais);
	const [agentes, setAgentes] = useState(initialState.agentes);
	const [loja, setLoja] = useState(initialState.loja);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const dayCount = getDaysInMetaMonth(month, year);
	const normalizedConfig = useMemo(
		() => normalizeMetasBaseConfig(metasBaseConfig),
		[metasBaseConfig],
	);
	const metaPercent = getMetaPercentForBase(normalizedConfig, source, month);
	const metaCalculada = Math.round(
		Number(cancelamentos || 0) * (Number(metaPercent || 0) / 100),
	);
	const totalPreview =
		sumRows(tecnicos, dayCount) +
		sumRows(regionais, dayCount) +
		sumRows(source === MANUAL_META_SOURCES.SEMPRE ? agentes : [], dayCount) +
		(parseDailyMetaValues(loja.dailyText, dayCount).reduce(
			(sum, value) => sum + value,
			0,
		) || Number(loja.total || 0));

	const hydrateSource = (nextSource) => {
		const nextState = buildInitialState(allData, agentesData, month, nextSource);
		setSource(nextSource);
		setCancelamentos(nextState.cancelamentos);
		setTecnicos(nextState.tecnicos);
		setRegionais(nextState.regionais);
		setAgentes(nextState.agentes);
		setLoja(nextState.loja);
		setMessage("");
		setError("");
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setMessage("");
		setError("");
		try {
			await onSave({
				mes: month,
				fonte: source,
				ano: year,
				lancamento: {
					cancelamentos,
					tecnicos,
					regionais,
					agentes: source === MANUAL_META_SOURCES.SEMPRE ? agentes : [],
					loja,
				},
			});
			setMessage("Lançamento publicado no /acompanhamento e no /painel.");
		} catch (err) {
			setError(err?.message || "Não foi possível lançar as metas.");
		}
	};

	return (
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
							podem ser separados por espaço, vírgula ou ponto e vírgula.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{[
							{ id: MANUAL_META_SOURCES.SEMPRE, label: "SEMPRE" },
							{ id: MANUAL_META_SOURCES.ONNET, label: "ONNET" },
						].map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => hydrateSource(option.id)}
								className={`rounded-xl px-4 py-2 text-sm font-black ${
									source === option.id
										? "bg-blue-600 text-white shadow-sm"
										: "bg-white text-gray-600 hover:bg-blue-100"
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>

				<div className="mt-5 grid gap-3 md:grid-cols-4">
					<label className="space-y-1.5">
						<span className="text-xs font-bold text-gray-600">Ano</span>
						<input
							type="number"
							min="2020"
							max="2100"
							value={year}
							onChange={(event) => setYear(Number(event.target.value) || year)}
							className="input-field bg-white"
						/>
					</label>
					<label className="space-y-1.5">
						<span className="text-xs font-bold text-gray-600">
							Cancelamentos do mês anterior
						</span>
						<input
							type="number"
							min="0"
							value={cancelamentos}
							onChange={(event) => setCancelamentos(event.target.value)}
							className="input-field bg-white"
							placeholder="2910"
						/>
					</label>
					<div className="rounded-xl bg-white p-3">
						<p className="text-xs font-bold text-gray-500">
							Meta cadastrada ({formatNumber(metaPercent)}%)
						</p>
						<p className="mt-1 text-2xl font-black text-blue-700">
							{formatNumber(metaCalculada)}
						</p>
					</div>
					<div className="rounded-xl bg-white p-3">
						<p className="text-xs font-bold text-gray-500">
							Total lançado nesta fonte
						</p>
						<p className="mt-1 text-2xl font-black text-emerald-700">
							{formatNumber(totalPreview)}
						</p>
					</div>
				</div>
			</section>

			<SectionEditor
				title={`Técnicos ${source === MANUAL_META_SOURCES.ONNET ? "ONNET" : "SEMPRE"}`}
				description="Cadastre os técnicos e os lançamentos de retirada por dia."
				rows={tecnicos}
				setRows={setTecnicos}
			/>

			<SectionEditor
				title="Regionais"
				description="Use as regionais atuais e informe os lançamentos por dia."
				rows={regionais}
				setRows={setRegionais}
			/>

			{source === MANUAL_META_SOURCES.SEMPRE ? (
				<SectionEditor
					title="Agente autorizado"
					description="Cadastre as cidades/agentes autorizados. Estes dados também alimentam o ranking de agentes."
					nameLabel="Cidade"
					rows={agentes}
					setRows={setAgentes}
					showGoalFields
				/>
			) : null}

			<section className="rounded-2xl border border-gray-100 bg-white p-4">
				<h3 className="text-sm font-black text-gray-900">Entregue em loja</h3>
				<div className="mt-4 grid gap-3 md:grid-cols-[0.4fr_1fr]">
					<label className="space-y-1">
						<span className="text-[11px] font-bold uppercase text-gray-400">
							Total
						</span>
						<input
							type="number"
							min="0"
							value={loja.total}
							onChange={(event) =>
								setLoja((current) => ({
									...current,
									total: event.target.value,
								}))
							}
							className="input-field"
							placeholder="0"
						/>
					</label>
					<label className="space-y-1">
						<span className="text-[11px] font-bold uppercase text-gray-400">
							Entregas por dia
						</span>
						<input
							type="text"
							value={loja.dailyText}
							onChange={(event) =>
								setLoja((current) => ({
									...current,
									dailyText: event.target.value,
								}))
							}
							className="input-field"
							placeholder="Ex: 10 8 7 12"
						/>
					</label>
				</div>
			</section>

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
	);
}
