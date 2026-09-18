import { Chart } from "chart.js/auto";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveVpsDate } from "../../../services/vpsDate";
import { calcularMetaBrasilTecpar } from "../../../utils/brasilTecparMeta";
import { logger } from "../../../utils/logger";
import { buildMetaDiariaSchedule } from "../../../utils/metasProjection";
import AnomaliaList from "../components/AnomaliaList";
import EmptyState from "../components/EmptyState";
import KpiCard from "../components/KpiCard";
import RankingList from "../components/RankingList";
import SaldoTable from "../components/SaldoTable";
import { calcAnomalias } from "../utils/calcAnomalias";
import { calcProjecao, calcSaldoDiario } from "../utils/calcProjecao";
import { calcRitmo } from "../utils/calcRitmo";

const MONTHS = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

const RETIRADAS_DATA_SOURCES = [
	{ key: "sempre", label: "SEMPRE" },
	{ key: "onnet", label: "ONNET" },
	{ key: "onnetSempre", label: "ONNET + SEMPRE" },
];

function normalizeMonthName(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function getMonthDataBySource(monthData, source) {
	if (!monthData) return null;
	if (source === "onnet") return monthData.onnet || null;
	if (source === "onnetSempre") return monthData.onnetSempre || null;
	return monthData;
}

function buildAllDataBySource(allData, source) {
	return Object.fromEntries(
		Object.entries(allData || {})
			.map(([monthName, monthData]) => [
				monthName,
				getMonthDataBySource(monthData, source),
			])
			.filter(([, monthData]) => Boolean(monthData)),
	);
}

function formatLastUpdate(value) {
	if (!value) return "";
	if (typeof value === "string") {
		const isoDate = new Date(value);
		if (!Number.isNaN(isoDate.getTime())) {
			return isoDate.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		}
		return value;
	}

	const raw =
		value.texto ||
		value.lastUpdate ||
		value.updatedAt ||
		value.data ||
		value.ultimaAtualizacao ||
		value.atualizadoEm ||
		null;

	if (typeof raw === "string") {
		const isoDate = new Date(raw);
		if (!Number.isNaN(isoDate.getTime())) {
			return isoDate.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		}
		return raw;
	}

	const date = resolveVpsDate(raw);
	if (!date || Number.isNaN(date.getTime())) return "";

	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getMonthsFromCurrent(month, allData) {
	const currentIndex = MONTHS.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);

	if (currentIndex < 0) {
		return Object.keys(allData || {}).filter(
			(item) => Number(allData[item]?.totalOS || 0) > 0,
		);
	}

	return Array.from(
		{ length: MONTHS.length },
		(_, offset) =>
			MONTHS[(currentIndex - offset + MONTHS.length) % MONTHS.length],
	)
		.map(
			(monthName) =>
				Object.keys(allData || {}).find(
					(item) => normalizeMonthName(item) === normalizeMonthName(monthName),
				) || monthName,
		)
		.filter((item, index, array) => array.indexOf(item) === index)
		.filter((item) => Number(allData[item]?.totalOS || 0) > 0);
}

function getMonthIndex(month) {
	return MONTHS.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);
}

function getPreviousMonthData(month, allData) {
	const index = getMonthIndex(month);
	if (index < 0) return null;

	for (let offset = 1; offset < MONTHS.length; offset += 1) {
		const previousName =
			MONTHS[(index - offset + MONTHS.length) % MONTHS.length];
		const key =
			Object.keys(allData || {}).find(
				(item) => normalizeMonthName(item) === normalizeMonthName(previousName),
			) || previousName;
		if (allData?.[key]) return allData[key];
	}

	return null;
}

function formatTrend(current, previous, suffix = "%") {
	const currentNumber = Number(current || 0);
	const previousNumber = Number(previous || 0);
	if (!previousNumber) return { value: null, tone: "neutral" };

	const delta = ((currentNumber - previousNumber) / previousNumber) * 100;
	return {
		value: `${delta >= 0 ? "↑ +" : "↓ "}${delta.toFixed(1).replace(".", ",")}${suffix}`,
		tone: delta >= 0 ? "positive" : "negative",
	};
}

function getPanelPeriodLabel(month, monthData, lastDayWithData) {
	const monthIndex = getMonthIndex(month);
	const year =
		Number(monthData?.ano || monthData?.year) || new Date().getFullYear();
	if (monthIndex < 0) return "--";

	const firstDay = new Date(year, monthIndex, 1);
	const lastDay =
		lastDayWithData > 0
			? new Date(year, monthIndex, lastDayWithData)
			: new Date(year, monthIndex + 1, 0);

	return `${firstDay.toLocaleDateString("pt-BR")} - ${lastDay.toLocaleDateString("pt-BR")}`;
}

function getLastDayWithRetiradas(data) {
	return (data?.rawDays || []).reduce((ultimoDia, row, index) => {
		const dia = Number(row?.dia || index + 1);
		return Number(row?.totalDia) > 0 ? dia || ultimoDia : ultimoDia;
	}, 0);
}

function hasSelectedRegional(data, selectedRegional) {
	if (selectedRegional === "todas") return true;
	return (data?.regionais || []).some(
		(item) => normalizeMonthName(item?.name || item?.nome) === selectedRegional,
	);
}

function getPerformanceTitle(ritmo) {
	if (!ritmo) return "Calculando ritmo do mes";
	if (ritmo.status === "ok") return "Ritmo adequado para a meta";
	if (ritmo.status === "danger") return "Ritmo critico para o fechamento";
	return "Ritmo abaixo do esperado";
}

function getPerformanceCopy(ritmo) {
	if (!ritmo) {
		return "Avaliando realizado, meta e dias uteis restantes para calcular o ritmo ideal.";
	}
	return `A media diaria esta em ${ritmo.media} O.S./dia util. O necessario e ${ritmo.necessario} O.S./dia util, com ${ritmo.ratio}% do ritmo esperado.`;
}

function getRegionalStatus(item) {
	const pct = Number(item?.percent ?? item?.pct ?? 0);
	if (pct >= 100) return { label: "OK", className: "ok" };
	if (pct < 50) return { label: "Critico", className: "critical" };
	return { label: "Atencao", className: "warning" };
}

function RegionalGoalsTable({ items = [] }) {
	const rows = items.slice(0, 7);

	return (
		<div className="regional-goals-wrap">
			<table className="regional-goals-table">
				<thead>
					<tr>
						<th>Regional</th>
						<th>Realizado</th>
						<th>Meta</th>
						<th>% Ating.</th>
						<th>Ritmo/dia</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((item) => {
						const realizado = Number(item.total ?? item.realizado ?? 0);
						const meta = Math.round(Number(item.meta80 ?? 110));
						const pct = Number(item.percent ?? item.pct ?? 0);
						const daily = Array.isArray(item.daily)
							? item.daily.filter((value) => Number(value || 0) > 0)
							: [];
						const ritmoDia = daily.length > 0 ? realizado / daily.length : 0;
						const status = getRegionalStatus(item);

						return (
							<tr key={item.name ?? item.nome}>
								<td>{item.name ?? item.nome}</td>
								<td>{realizado.toLocaleString("pt-BR")}</td>
								<td>{meta.toLocaleString("pt-BR")}</td>
								<td className={pct >= 80 ? "positive" : "negative"}>
									{pct.toFixed(1).replace(".", ",")}%
								</td>
								<td>{ritmoDia.toFixed(1).replace(".", ",")}</td>
								<td>
									<span className={`regional-status-pill ${status.className}`}>
										{status.label}
									</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<button type="button" className="regional-goals-action">
				Ver todas as regionais
			</button>
		</div>
	);
}

function RetiradasFilterBar({
	allData,
	dataSource,
	lastUpdateText,
	month,
	periodLabel,
	selectedRegional,
	setDataSource,
	setSelectedRegional,
}) {
	const regionais = allData?.[month]?.regionais || [];

	return (
		<div className="retiradas-filterbar">
			<label>
				<span>Base do painel</span>
				<select
					value={dataSource}
					onChange={(event) => setDataSource(event.target.value)}
				>
					{RETIRADAS_DATA_SOURCES.map((source) => {
						const hasData = Boolean(
							getMonthDataBySource(allData?.[month], source.key),
						);
						return (
							<option key={source.key} value={source.key} disabled={!hasData}>
								{source.label}
							</option>
						);
					})}
				</select>
			</label>

			<label>
				<span>Período</span>
				<input type="text" value={periodLabel} readOnly />
			</label>

			<label>
				<span>Regional</span>
				<select
					value={selectedRegional}
					onChange={(event) => setSelectedRegional(event.target.value)}
				>
					<option value="todas">Todas</option>
					{regionais.map((item) => {
						const name = item.name || item.nome;
						return (
							<option key={name} value={normalizeMonthName(name)}>
								{name}
							</option>
						);
					})}
				</select>
			</label>

			<label>
				<span>Equipe tecnica</span>
				<select defaultValue="todas">
					<option value="todas">Todas</option>
					<option value="com-producao">Com producao</option>
				</select>
			</label>

			<label>
				<span>Entrega loja</span>
				<select defaultValue="todas">
					<option value="todas">Todas</option>
					<option value="com-entrega">Com entrega</option>
				</select>
			</label>

			<div className="retiradas-filter-update">
				<span>Última atualização:</span>
				<strong>{lastUpdateText || "Carregando..."}</strong>
			</div>
		</div>
	);
}

function parseLocalDate(value) {
	if (!value) return null;
	const [year, month, day] = String(value).split("-").map(Number);
	if (!year || !month || !day) return null;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateBR(value) {
	const date = parseLocalDate(value);
	return date
		? date.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
			})
		: "--";
}

function formatCompactNumber(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
		maximumFractionDigits: 1,
	});
}

function getAnonymousTechnicianName(position) {
	return `Técnico ${String(position).padStart(2, "0")}`;
}

function buildForcaTarefaDetalhes({
	items,
	meta,
	divisor,
	start,
	end,
	year,
	monthIndex,
	nameKey = "name",
	limit = 7,
	anonymizeNames = false,
}) {
	const metaIndividual = divisor > 0 ? meta / divisor : meta;

	return (Array.isArray(items) ? items : [])
		.map((item) => {
			const daily = Array.isArray(item.daily) ? item.daily : [];
			const realizado = daily.reduce((sum, value, index) => {
				const current = new Date(year, monthIndex, index + 1);
				if (current < start || current > end) return sum;
				return sum + Number(value || 0);
			}, 0);

			return {
				name: item[nameKey] || item.name || item.nome || "Sem nome",
				realizado,
				falta: Math.max(0, metaIndividual - realizado),
			};
		})
		.sort((a, b) => b.realizado - a.realizado)
		.slice(0, limit)
		.map((item, index) => ({
			...item,
			displayName: anonymizeNames
				? getAnonymousTechnicianName(index + 1)
				: item.name,
		}));
}

function buildForcaTarefaResumo(
	config,
	monthData,
	month,
	agenteMonthData = null,
) {
	if (!config?.ativa || !monthData) return null;

	const start = parseLocalDate(config.inicio);
	const end = parseLocalDate(config.fim);
	if (!start || !end || start > end) return null;

	const monthIndex = MONTHS.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);
	if (monthIndex < 0) return null;

	let year = null;
	for (
		let candidate = start.getFullYear();
		candidate <= end.getFullYear();
		candidate += 1
	) {
		const monthStart = new Date(candidate, monthIndex, 1);
		const monthEnd = new Date(candidate, monthIndex + 1, 0);
		if (monthEnd >= start && monthStart <= end) {
			year = candidate;
			break;
		}
	}
	if (!year) return null;

	const rawDays = Array.isArray(monthData.rawDays) ? monthData.rawDays : [];
	const daysInRange = rawDays.filter((row) => {
		const dia = Number(row?.dia);
		if (!dia) return false;
		const current = new Date(year, monthIndex, dia);
		return current >= start && current <= end;
	});

	const metas = config.metas || {};
	const metaRegionais = Number(metas.regionais) || 0;
	const metaAgentes = Number(metas.agentes) || 0;
	const metaTecnicos = Number(metas.tecnicos) || 0;
	const regionaisDetalhe = buildForcaTarefaDetalhes({
		items: monthData.regionais,
		meta: metaRegionais,
		divisor: 7,
		start,
		end,
		year,
		monthIndex,
		limit: 7,
	});
	const agentesDetalhe = buildForcaTarefaDetalhes({
		items: agenteMonthData?.cidades,
		meta: metaAgentes,
		divisor: 10,
		start,
		end,
		year,
		monthIndex,
		nameKey: "nome",
		limit: 7,
	});
	const tecnicosDetalhe = buildForcaTarefaDetalhes({
		items: monthData.technicians,
		meta: metaTecnicos,
		divisor: 7,
		start,
		end,
		year,
		monthIndex,
		limit: 7,
		anonymizeNames: true,
	});

	const grupos = [
		{
			key: "regionais",
			label: "Regionais",
			meta: metaRegionais,
			realizado: daysInRange.reduce(
				(sum, row) => sum + Number(row.regionais || 0),
				0,
			),
			detalhes: regionaisDetalhe,
			detalheLabel: "Regional",
			detalheMeta: metaRegionais / 7,
		},
		{
			key: "agentes",
			label: "Agente autorizado",
			meta: metaAgentes,
			realizado: daysInRange.reduce(
				(sum, row) => sum + Number(row.agente || 0),
				0,
			),
			detalhes: agentesDetalhe,
			detalheLabel: "Cidade",
			detalheMeta: metaAgentes / 10,
		},
		{
			key: "tecnicos",
			label: "Tecnicos de retirada",
			meta: metaTecnicos,
			realizado: daysInRange.reduce(
				(sum, row) => sum + Number(row.equipe || 0),
				0,
			),
			detalhes: tecnicosDetalhe,
			detalheLabel: "Técnico",
			detalheMeta: metaTecnicos / 7,
		},
	].map((grupo) => ({
		...grupo,
		falta: Math.max(0, grupo.meta - grupo.realizado),
		pct:
			grupo.meta > 0 ? Math.min(100, (grupo.realizado / grupo.meta) * 100) : 0,
	}));

	return {
		periodo: `${formatDateBR(config.inicio)} a ${formatDateBR(config.fim)}`,
		grupos,
		totalRealizado: grupos.reduce((sum, item) => sum + item.realizado, 0),
		totalMeta: grupos.reduce((sum, item) => sum + item.meta, 0),
	};
}

function ForcaTarefaCard({ resumo }) {
	if (!resumo) return null;

	return (
		<div
			className="card"
			style={{
				marginBottom: 16,
				borderColor: "rgba(255,107,0,0.25)",
				background:
					"linear-gradient(135deg, rgba(255,107,0,0.08), rgba(0,48,135,0.04))",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 18,
					flexWrap: "wrap",
				}}
			>
				<div
					className="card-title card-title-split"
					style={{ flex: "1 1 280px" }}
				>
					<span>Forca tarefa</span>
					<span
						style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}
					>
						{resumo.periodo}
					</span>
				</div>
				<img
					src="/retorninho-prancheta.png"
					alt="Retorninho com plano de acao"
					loading="lazy"
					style={{
						width: "clamp(112px, 16vw, 190px)",
						maxWidth: "38%",
						height: "auto",
						objectFit: "contain",
						marginTop: -20,
						marginBottom: -18,
						filter: "drop-shadow(0 14px 22px rgba(0, 48, 135, 0.18))",
					}}
				/>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: 14,
					marginTop: 16,
				}}
			>
				{resumo.grupos.map((grupo) => (
					<div
						key={grupo.key}
						style={{
							border: "1px solid var(--line)",
							borderRadius: 18,
							padding: 16,
							background: "#fff",
						}}
					>
						<div
							style={{
								fontSize: 12,
								fontWeight: 800,
								letterSpacing: "0.08em",
								textTransform: "uppercase",
								color: "var(--blue)",
								marginBottom: 10,
							}}
						>
							{grupo.label}
						</div>
						<div
							style={{ fontSize: 30, fontWeight: 900, color: "var(--text)" }}
						>
							{grupo.realizado.toLocaleString("pt-BR")}
							<span
								style={{ fontSize: 14, color: "var(--muted)", marginLeft: 6 }}
							>
								/ {grupo.meta.toLocaleString("pt-BR")}
							</span>
						</div>
						<div
							style={{
								height: 8,
								borderRadius: 999,
								background: "rgba(0,48,135,0.09)",
								overflow: "hidden",
								marginTop: 12,
							}}
						>
							<div
								style={{
									width: `${grupo.pct}%`,
									height: "100%",
									borderRadius: 999,
									background:
										grupo.pct >= 100 ? "var(--green)" : "var(--orange)",
								}}
							/>
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								gap: 8,
								marginTop: 10,
								fontSize: 12,
								fontWeight: 800,
								color: "var(--muted)",
							}}
						>
							<span>{grupo.pct.toFixed(1)}%</span>
							<span>Faltam {grupo.falta.toLocaleString("pt-BR")}</span>
						</div>

						{grupo.detalhes?.length ? (
							<div
								style={{
									marginTop: 14,
									borderTop: "1px solid var(--line)",
									paddingTop: 10,
								}}
							>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "minmax(0, 1fr) auto auto",
										gap: 8,
										fontSize: 11,
										fontWeight: 900,
										color: "var(--muted)",
										textTransform: "uppercase",
										marginBottom: 6,
									}}
								>
									<span>{grupo.detalheLabel || "Item"}</span>
									<span>Fez</span>
									<span>
										Falta p/{" "}
										{formatCompactNumber(grupo.detalheMeta || grupo.meta)}
									</span>
								</div>
								{grupo.detalhes.map((regional) => (
									<div
										key={regional.name}
										style={{
											display: "grid",
											gridTemplateColumns: "minmax(0, 1fr) auto auto",
											gap: 8,
											alignItems: "center",
											padding: "5px 0",
											fontSize: 12,
											fontWeight: 800,
											color: "var(--text)",
										}}
									>
										<span
											style={{
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{regional.displayName || regional.name}
										</span>
										<span style={{ color: "var(--blue)" }}>
											{regional.realizado.toLocaleString("pt-BR")}
										</span>
										<span
											style={{
												color:
													regional.falta > 0 ? "var(--orange)" : "var(--green)",
											}}
										>
											{formatCompactNumber(regional.falta)}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}

export default function TabRetiradas({
	allData,
	month,
	lastUpdate,
	forcaTarefa,
	agentesData = {},
	feriadosSet: feriadosCalendario = null,
}) {
	const [dataSource, setDataSource] = useState("sempre");
	const [selectedRegional, setSelectedRegional] = useState("todas");
	const selectedAllData = useMemo(
		() => buildAllDataBySource(allData, dataSource),
		[allData, dataSource],
	);
	const d = selectedAllData[month];
	const selectedSourceLabel =
		RETIRADAS_DATA_SOURCES.find((item) => item.key === dataSource)?.label ||
		"SEMPRE";
	const lastUpdateText = useMemo(
		() => formatLastUpdate(lastUpdate),
		[lastUpdate],
	);
	const forcaTarefaResumo = useMemo(
		() =>
			dataSource === "sempre"
				? buildForcaTarefaResumo(forcaTarefa, d, month, agentesData?.[month])
				: null,
		[agentesData, d, dataSource, forcaTarefa, month],
	);

	const [projecao, setProjecao] = useState(null);
	const [ritmo, setRitmo] = useState(null);
	const [saldoDiario, setSaldoDiario] = useState([]);
	const [feriadosSet, setFeriadosSet] = useState(() => new Set());
	const [anomaliasMinimizadas, setAnomaliasMinimizadas] = useState(false);
	const anomalias = useMemo(() => calcAnomalias(d), [d]);
	const lastDayWithData = useMemo(
		() => getLastDayWithRetiradas(d),
		[d],
	);
	const regionaisFiltradas = useMemo(() => {
		const items = Array.isArray(d?.regionais) ? d.regionais : [];
		if (selectedRegional === "todas") return items;
		return items.filter(
			(item) =>
				normalizeMonthName(item?.name || item?.nome) === selectedRegional,
		);
	}, [d, selectedRegional]);
	const previousMonthData = useMemo(
		() => getPreviousMonthData(month, selectedAllData),
		[month, selectedAllData],
	);
	const totalTrend = useMemo(
		() => formatTrend(d?.totalOS, previousMonthData?.totalOS),
		[d, previousMonthData],
	);
	const metaTrend = useMemo(
		() => formatTrend(d?.meta, previousMonthData?.meta),
		[d, previousMonthData],
	);
	const atingimentoTrend = useMemo(
		() =>
			formatTrend(
				d?.percentAchieved,
				previousMonthData?.percentAchieved,
				" p.p.",
			),
		[d, previousMonthData],
	);
	const projectionTrend = useMemo(
		() => formatTrend(projecao?.projecaoFinal, previousMonthData?.totalOS),
		[previousMonthData, projecao],
	);
	const periodLabel = useMemo(
		() => getPanelPeriodLabel(month, d, lastDayWithData),
		[d, lastDayWithData, month],
	);
	const metaBrasilTecpar = useMemo(
		() =>
			calcularMetaBrasilTecpar({
				cancelamentos: d?.cancelamentos,
				totalOS: d?.totalOS,
			}),
		[d],
	);

	useEffect(() => {
		if (hasSelectedRegional(d, selectedRegional)) return undefined;

		const timeoutId = window.setTimeout(() => {
			setSelectedRegional("todas");
		}, 0);

		return () => window.clearTimeout(timeoutId);
	}, [d, selectedRegional]);

	const chartDailyRef = useRef(null);
	const chartMonthlyRef = useRef(null);
	const chartDailyInst = useRef(null);
	const chartMonthlyInst = useRef(null);

	useEffect(() => {
		let active = true;

		if (!d) {
			return () => {
				active = false;
			};
		}

		void Promise.resolve().then(async () => {
			if (!active) return;

			setProjecao(null);
			setRitmo(null);
			setSaldoDiario([]);
			setFeriadosSet(feriadosCalendario || new Set());

			try {
				const saldo = await calcSaldoDiario(d, month, feriadosCalendario);
				const calendarioAplicado = saldo.feriadosSet || new Set();
				const [nextProjecao, nextRitmo] = await Promise.all([
					calcProjecao(d, month, calendarioAplicado),
					calcRitmo(d, month, calendarioAplicado),
				]);

				if (!active) return;
				setProjecao(nextProjecao);
				setRitmo(nextRitmo);
				setSaldoDiario(saldo.lista || []);
				setFeriadosSet(calendarioAplicado);
			} catch (error) {
				if (!active) return;
				logger.error("[TabRetiradas] Erro ao calcular indicadores:", error);
				setProjecao(null);
				setRitmo(null);
				setSaldoDiario([]);
			}
		});

		return () => {
			active = false;
		};
	}, [d, feriadosCalendario, month]);

	useEffect(() => {
		if (chartDailyInst.current) {
			chartDailyInst.current.destroy();
			chartDailyInst.current = null;
		}
		if (!d || !saldoDiario.length || !chartDailyRef.current) return;

		const labels = saldoDiario.map((s) => `Dia ${s.dia}`);
		let sum = 0;
		const accumulated = saldoDiario.map((s) => {
			sum += Number(s.totalDia) || 0;
			return sum;
		});
		const year = Number(d?.ano || d?.year) || new Date().getFullYear();
		const { metaAcumuladaPorDia } = buildMetaDiariaSchedule({
			month,
			meta: d.meta,
			feriadosSet,
			year,
		});
		const metaLine = saldoDiario.map((s) =>
			Number(s.metaAcumulada ?? metaAcumuladaPorDia.get(Number(s.dia)) ?? 0),
		);

		const projecaoLine = new Array(saldoDiario.length).fill(null);
		if (projecao && projecao.diasUteisRestantes > 0) {
			for (const ponto of projecao.projecaoPorDia || []) {
				labels.push(`Dia ${ponto.dia}`);
				projecaoLine.push(ponto.valor);
				accumulated.push(null);
				metaLine.push(
					metaAcumuladaPorDia.get(Number(ponto.dia)) ?? Number(d.meta || 0),
				);
			}
			projecaoLine[saldoDiario.length - 1] = Number(d.totalOS) || 0;
		}

		chartDailyInst.current = new Chart(chartDailyRef.current, {
			type: "line",
			data: {
				labels,
				datasets: [
					{
						label: "Realizado Acumulado",
						data: accumulated,
						borderColor: "#FF6B00",
						backgroundColor: "rgba(255,107,0,0.08)",
						fill: true,
						tension: 0.4,
						pointRadius: 3,
						borderWidth: 2,
					},
					{
						label: "Meta",
						data: metaLine,
						borderColor: "#003087",
						borderDash: [6, 4],
						borderWidth: 2,
						pointRadius: 0,
						fill: false,
					},
					{
						label: "Projecao",
						data: projecaoLine,
						borderColor: "#7C3AED",
						borderDash: [4, 4],
						borderWidth: 2,
						pointRadius: 3,
						fill: false,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { position: "top" } },
				scales: {
					y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
					x: { grid: { display: false } },
				},
			},
		});
	}, [d, saldoDiario, projecao, month, feriadosSet]);

	useEffect(() => {
		if (!chartMonthlyRef.current) return;
		if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();

		const mesesComDados = getMonthsFromCurrent(month, selectedAllData);
		const labels = mesesComDados;
		const realizados = mesesComDados.map((m) =>
			Number(selectedAllData[m]?.totalOS || 0),
		);
		const metas = mesesComDados.map((m) =>
			Number(selectedAllData[m]?.meta || 0),
		);
		const mesAtualNormalizado = normalizeMonthName(month);
		const coresRealizado = mesesComDados.map((m) =>
			normalizeMonthName(m) === mesAtualNormalizado ? "#003087" : "#FF6B00",
		);
		const bordasRealizado = mesesComDados.map((m) =>
			normalizeMonthName(m) === mesAtualNormalizado ? "#001b4d" : "#FF6B00",
		);
		const borderWidths = mesesComDados.map((m) =>
			normalizeMonthName(m) === mesAtualNormalizado ? 2 : 0,
		);

		chartMonthlyInst.current = new Chart(chartMonthlyRef.current, {
			type: "bar",
			data: {
				labels,
				datasets: [
					{
						label: "Realizado",
						data: realizados,
						backgroundColor: coresRealizado,
						borderColor: bordasRealizado,
						borderWidth: borderWidths,
						borderRadius: 6,
					},
					{
						label: "Meta",
						data: metas,
						backgroundColor: "rgba(0,48,135,0.5)",
						borderRadius: 6,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { position: "top" } },
				scales: {
					y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
					x: { grid: { display: false } },
				},
			},
		});
	}, [selectedAllData, month]);

	useEffect(() => {
		return () => {
			if (chartDailyInst.current) chartDailyInst.current.destroy();
			if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();
		};
	}, []);

	const filterBar = (
		<RetiradasFilterBar
			allData={allData}
			dataSource={dataSource}
			lastUpdateText={lastUpdateText}
			month={month}
			periodLabel={periodLabel}
			selectedRegional={selectedRegional}
			setDataSource={setDataSource}
			setSelectedRegional={setSelectedRegional}
		/>
	);

	if (!d) {
		return (
			<div>
				{filterBar}
				<EmptyState
					icon="📊"
					title={`Sem dados para ${selectedSourceLabel} neste mes`}
					desc="Aguardando sincronizacao com a VPS."
				/>
			</div>
		);
	}

	return (
		<div>
			{filterBar}

			<div className="kpis">
				<KpiCard
					label="O.S. realizadas"
					value={Number(d.totalOS || 0).toLocaleString("pt-BR")}
					sub="No mes selecionado"
					color="orange"
					trendValue={totalTrend.value}
					trendTone={totalTrend.tone}
				/>
				<KpiCard
					label="Meta"
					value={Math.round(Number(d.meta || 0)).toLocaleString("pt-BR")}
					sub="Objetivo do mes"
					color="blue"
					trendValue={metaTrend.value}
					trendTone={metaTrend.tone}
				/>
				<KpiCard
					label="Brasil Tecpar 65%"
					value={metaBrasilTecpar.meta.toLocaleString("pt-BR")}
					sub={
						metaBrasilTecpar.atingiu
							? `${metaBrasilTecpar.percentAchieved}% da meta fixa · atingida`
							: `Faltam ${metaBrasilTecpar.falta.toLocaleString("pt-BR")} O.S`
					}
					color={metaBrasilTecpar.atingiu ? "green" : "red"}
					trendLabel="meta fixa"
					trendValue="65%"
					trendTone={metaBrasilTecpar.atingiu ? "positive" : "negative"}
				/>
				<KpiCard
					label="Atingimento"
					value={`${Number(d.percentAchieved || 0).toFixed(1)}%`}
					sub={d.status}
					color="green"
					trendValue={atingimentoTrend.value}
					trendTone={atingimentoTrend.tone}
				/>
				<KpiCard
					label="Projecao"
					value={
						projecao
							? Number(projecao.projecaoFinal || 0).toLocaleString("pt-BR")
							: "--"
					}
					sub={
						projecao
							? `${Number(projecao.pctProjecao || 0).toFixed(1)}% da meta · ${Number(projecao.pctProjecaoCancelamentos || 0).toFixed(1)}% dos cancelamentos`
							: "Calculando..."
					}
					color="purple"
					trendValue={projectionTrend.value}
					trendTone={projectionTrend.tone}
				/>
			</div>

			<div className="retiradas-focus-grid">
				<section
					className={`retiradas-performance-card ${ritmo?.status || "warn"}`}
				>
					<div className="retiradas-section-topline">
						<span>Desempenho do mes</span>
						<span
							className={`retiradas-status-chip ${ritmo?.status || "warn"}`}
						>
							{ritmo?.badge || "Calculando"}
						</span>
					</div>

					<h2>{getPerformanceTitle(ritmo)}</h2>

					<p className="retiradas-performance-copy">
						{getPerformanceCopy(ritmo)}
					</p>

					<div className="retiradas-progress-summary">
						<div>
							<span>Realizado</span>
							<strong>{Number(d.totalOS || 0).toLocaleString("pt-BR")}</strong>
						</div>
						<div>
							<span>Atingimento</span>
							<strong>{Number(d.percentAchieved || 0).toFixed(1)}%</strong>
						</div>
						<div>
							<span>Meta</span>
							<strong>
								{Math.round(Number(d.meta || 0)).toLocaleString("pt-BR")}
							</strong>
						</div>
						<div>
							<span>Brasil Tecpar 65%</span>
							<strong>{metaBrasilTecpar.meta.toLocaleString("pt-BR")}</strong>
						</div>
					</div>

					<div className="retiradas-target-track" aria-hidden="true">
						<span
							style={{
								width: `${Math.min(Number(d.percentAchieved || 0), 100)}%`,
							}}
						/>
					</div>
					<div className="retiradas-track-labels">
						<span>0%</span>
						<span>50%</span>
						<span>100%</span>
					</div>

					<div className="retiradas-retorninho-callout">
						<div>
							<span>Retorninho entrou em modo torcida</span>
							<p>
								Estamos abaixo da meta ideal, mas uma boa sequencia hoje ja
								comeca a virar esse placar.
							</p>
						</div>
						<img src="/retorninho-triste.png" alt="" loading="lazy" />
					</div>

					<button type="button" className="retiradas-action-button">
						Acoes recomendadas
					</button>
				</section>

				<section className="card retiradas-evolution-card">
					<div className="card-title card-title-split">
						<span>Evolucao diaria</span>
						<span className="retiradas-chart-caption">
							Projecao:{" "}
							{projecao
								? Number(projecao.projecaoFinal || 0).toLocaleString("pt-BR")
								: "--"}
						</span>
					</div>
					<div className="chart-container">
						<canvas ref={chartDailyRef} />
					</div>
					<div className="retiradas-chart-metrics">
						<div>
							<span>Media realizada/dia</span>
							<strong>{ritmo?.media || "--"} O.S.</strong>
						</div>
						<div>
							<span>Media necessaria/dia</span>
							<strong>{ritmo?.necessario || "--"} O.S.</strong>
						</div>
						<div>
							<span>Diferenca</span>
							<strong
								className={ritmo?.status === "ok" ? "positive" : "negative"}
							>
								{ritmo
									? `${Number(ritmo.ratio || 0) - 100 > 0 ? "+" : ""}${(Number(ritmo.ratio || 0) - 100).toFixed(1)}%`
									: "--"}
							</strong>
						</div>
					</div>
				</section>
			</div>

			<ForcaTarefaCard resumo={forcaTarefaResumo} />

			<div className="grid">
				<div className="card">
					<div className="card-title">🗺️ Ranking Regionais</div>
					<RankingList
						items={regionaisFiltradas || []}
						metaRef={110}
						label="O.S"
					/>
					<button type="button" className="rank-complete-action">
						Ver ranking completo
					</button>
				</div>
				<div className="card">
					<div className="card-title">Metas por regional</div>
					<RegionalGoalsTable items={regionaisFiltradas || []} />
				</div>

				<div className="card grid-full">
					<div
						className="card-title card-title-split"
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 12,
						}}
					>
						<span>🚨 Detector de Anomalias</span>
						<button
							type="button"
							onClick={() => setAnomaliasMinimizadas((current) => !current)}
							className="comparativo-action-btn neutral"
						>
							{anomaliasMinimizadas ? "Expandir" : "Minimizar"}
						</button>
					</div>
					{!anomaliasMinimizadas && (
						<AnomaliaList anomalias={anomalias || []} />
					)}
				</div>

				<div className="card grid-full">
					<div className="card-title">⚖️ Saldo Diario — Meta por Dia</div>
					<div className="saldo-wrap">
						<table className="saldo-table">
							<thead>
								<tr>
									<th>Dia</th>
									<th>Equipe Tecnica</th>
									<th>Agente Aut.</th>
									<th>Entregue Loja</th>
									<th>Regionais</th>
									<th>Total Dia</th>
									<th>Meta Diaria</th>
									<th>Saldo Dia</th>
									<th>Saldo Mes</th>
								</tr>
							</thead>
							<tbody>
								<SaldoTable saldoDiario={saldoDiario || []} />
							</tbody>
						</table>
					</div>
				</div>

				<div className="card grid-full">
					<div className="card-title">📊 Comparativo Mensal — Ano Completo</div>
					<div className="chart-container">
						<canvas ref={chartMonthlyRef} />
					</div>
				</div>
			</div>
		</div>
	);
}
