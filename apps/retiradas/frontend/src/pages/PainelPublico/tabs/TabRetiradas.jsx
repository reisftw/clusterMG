import { Chart } from "chart.js/auto";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveVpsDate } from "../../../services/vpsDate";
import { calcularMetaBrasilTecpar } from "../../../utils/brasilTecparMeta";
import { logger } from "../../../utils/logger";
import { buildMetaDiariaSchedule } from "../../../utils/metasProjection";
import AnomaliaList from "../components/AnomaliaList";
import EmptyState from "../components/EmptyState";
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

// Extraido pra achado javascript:S3358 (ternario aninhado).
function formatRitmoDiferencaLabel(ritmo) {
	if (!ritmo) return "--";
	const diff = Number(ritmo.ratio || 0) - 100;
	const sign = diff > 0 ? "+" : "";
	return `${sign}${diff.toFixed(1)}%`;
}

function safeNumber(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value) {
	return Math.max(0, Math.min(100, safeNumber(value)));
}

function formatInteger(value) {
	return Math.round(safeNumber(value)).toLocaleString("pt-BR");
}

function formatPercent(value, digits = 1) {
	return `${safeNumber(value).toFixed(digits).replace(".", ",")}%`;
}

function formatSignedInteger(value) {
	const numeric = Math.round(safeNumber(value));
	return `${numeric > 0 ? "+" : ""}${numeric.toLocaleString("pt-BR")}`;
}

function getLatestSaldoRow(saldoDiario = []) {
	return [...saldoDiario]
		.reverse()
		.find((row) => safeNumber(row?.totalDia) > 0 || safeNumber(row?.metaDia) > 0);
}

function buildExecutiveSummary({ d, metaBrasilTecpar, projecao, ritmo, saldoDiario }) {
	const realizado = safeNumber(d?.totalOS);
	const meta = safeNumber(d?.meta);
	const faltam = Math.max(0, meta - realizado);
	const projection = safeNumber(projecao?.projecaoFinal);
	const projectionPercent = meta > 0 ? (projection / meta) * 100 : 0;
	const cancelamentos = safeNumber(d?.cancelamentos);
	const pctCancelamentos =
		cancelamentos > 0 ? (realizado / cancelamentos) * 100 : safeNumber(d?.percentCancelamentos);
	const diasUteisRestantes = safeNumber(projecao?.diasUteisRestantes);
	const plannedDaily = safeNumber(ritmo?.necessario);
	const currentPace = safeNumber(ritmo?.media);
	const requiredDaily =
		diasUteisRestantes > 0 ? Math.ceil(faltam / diasUteisRestantes) : 0;
	const latestSaldo = getLatestSaldoRow(saldoDiario);
	const saldoMes = safeNumber(latestSaldo?.saldoMes, realizado - safeNumber(latestSaldo?.metaAcumulada));
	const projectedGap = projection - meta;
	const operationalStatus =
		projection >= metaBrasilTecpar.meta
			? "ok"
			: projection >= meta
				? "warn"
				: "danger";

	return {
		realizado,
		meta,
		faltam,
		projection,
		projectionPercent,
		cancelamentos,
		pctMeta: meta > 0 ? (realizado / meta) * 100 : safeNumber(d?.percentAchieved),
		pctCancelamentos,
		metaBrasilTecpar,
		diasUteisRestantes,
		plannedDaily,
		currentPace,
		requiredDaily,
		saldoMes,
		projectedGap,
		operationalStatus,
		paceGap: currentPace - plannedDaily,
	};
}

function buildRetorninhoMessage(summary) {
	if (!summary) return "Carregando a leitura executiva do mês.";
	if (summary.operationalStatus === "ok") {
		return `Boa: a projeção atual fecha em ${formatInteger(summary.projection)} O.S. e supera a meta Brasil Tecpar de ${formatInteger(summary.metaBrasilTecpar.meta)}.`;
	}
	if (summary.requiredDaily > summary.plannedDaily && summary.diasUteisRestantes > 0) {
		return `Para fechar o mês, precisamos de ${formatInteger(summary.requiredDaily)} O.S./dia útil nos próximos ${formatInteger(summary.diasUteisRestantes)} dias úteis.`;
	}
	return `O mês está em ${formatPercent(summary.pctMeta)} da meta, com saldo acumulado de ${formatSignedInteger(summary.saldoMes)} O.S.`;
}

function buildPriorityActions({ summary, anomalias, regionais }) {
	const actions = [];
	if (summary?.requiredDaily > summary?.plannedDaily) {
		actions.push({
			title: "Reforçar produção dos dias úteis restantes",
			desc: `Necessário atual: ${formatInteger(summary.requiredDaily)} O.S./dia útil contra meta planejada de ${formatInteger(summary.plannedDaily)}.`,
			tone: "danger",
		});
	}

	const criticalAnomaly = (anomalias || []).find(
		(item) => String(item?.severity || item?.tipo || "").toLowerCase().includes("crit"),
	);
	if (criticalAnomaly) {
		actions.push({
			title: "Auditar anomalia crítica",
			desc: criticalAnomaly.message || criticalAnomaly.descricao || criticalAnomaly.titulo || "Existe desvio crítico no período.",
			tone: "danger",
		});
	}

	const lowestRegional = [...(regionais || [])]
		.filter((item) => safeNumber(item?.meta80 ?? item?.meta) > 0)
		.sort((a, b) => safeNumber(a?.percent ?? a?.pct) - safeNumber(b?.percent ?? b?.pct))[0];
	if (lowestRegional) {
		actions.push({
			title: `Acelerar ${lowestRegional.name || lowestRegional.nome}`,
			desc: `Regional em ${formatPercent(safeNumber(lowestRegional.percent ?? lowestRegional.pct))}, abaixo do ritmo esperado.`,
			tone: "warn",
		});
	}

	if (summary?.saldoMes < 0) {
		actions.push({
			title: "Fechar o gap acumulado",
			desc: `Saldo do mês em ${formatSignedInteger(summary.saldoMes)} O.S.; acompanhar recuperação diária no saldo por dia.`,
			tone: "warn",
		});
	}

	if (!actions.length) {
		actions.push({
			title: "Manter cadência operacional",
			desc: "Indicadores principais estão dentro da leitura esperada para o período.",
			tone: "ok",
		});
	}

	return actions.slice(0, 5);
}

function buildChannelSummary(saldoDiario = []) {
	const totals = saldoDiario.reduce(
		(acc, row) => ({
			equipe: acc.equipe + safeNumber(row?.equipe),
			agente: acc.agente + safeNumber(row?.agente),
			loja: acc.loja + safeNumber(row?.loja),
			regionais: acc.regionais + safeNumber(row?.regionais),
		}),
		{ equipe: 0, agente: 0, loja: 0, regionais: 0 },
	);
	const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
	return [
		{ key: "equipe", label: "Equipe técnica", value: totals.equipe, color: "#0b5cff" },
		{ key: "agente", label: "Agente autorizado", value: totals.agente, color: "#009f72" },
		{ key: "loja", label: "Entrega loja", value: totals.loja, color: "#ff6b00" },
		{ key: "regionais", label: "Regionais", value: totals.regionais, color: "#7c3aed" },
	].map((item) => ({
		...item,
		percent: total > 0 ? (item.value / total) * 100 : 0,
	}));
}

function buildRankingItems(d, agentesData, month, activeTab) {
	if (activeTab === "regionais") return d?.regionais || [];
	if (activeTab === "tecnicos") return d?.technicians || [];
	if (activeTab === "agentes") return agentesData?.[month]?.cidades || [];
	if (activeTab === "loja") {
		const cidades = new Map();
		for (const row of d?.rawDays || []) {
			for (const item of row?.lojaDetalhes || row?.entregaLojaDetalhes || []) {
				const name = item.cidade || item.name || item.nome || "Sem cidade";
				cidades.set(name, (cidades.get(name) || 0) + safeNumber(item.total || item.quantidade || 1));
			}
		}
		if (!cidades.size) {
			return (d?.rawDays || d?.saldoDiario || [])
				.map((row) => ({
					name: `Dia ${safeNumber(row?.dia)}`,
					total: safeNumber(row?.loja),
					percent: 100,
					meta80: 0,
				}))
				.filter((item) => item.total > 0)
				.sort((a, b) => b.total - a.total);
		}
		return [...cidades.entries()].map(([name, total]) => ({ name, total }));
	}
	return [];
}

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
						<th>Gap</th>
						<th>% Ating.</th>
						<th>Ritmo/dia</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((item) => {
						const realizado = Number(item.total ?? item.realizado ?? 0);
						const meta = Math.round(Number(item.meta80 ?? 110));
						const gap = realizado - meta;
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
								<td className={gap >= 0 ? "positive" : "negative"}>
									{formatSignedInteger(gap)}
								</td>
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

function ExecutiveKpi({ label, value, sub, tone = "blue", meta }) {
	return (
		<div className={`retiradas-exec-kpi ${tone}`}>
			<span>{label}</span>
			<strong>{value}</strong>
			<p>{sub}</p>
			{meta ? <small>{meta}</small> : null}
		</div>
	);
}

function OperationalMetric({ label, value, sub, tone = "neutral" }) {
	return (
		<div className={`retiradas-operational-metric ${tone}`}>
			<span>{label}</span>
			<strong>{value}</strong>
			<p>{sub}</p>
		</div>
	);
}

function SectionHeading({ eyebrow, title, action }) {
	return (
		<div className="retiradas-section-heading">
			<div>
				<span>{eyebrow}</span>
				<h2>{title}</h2>
			</div>
			{action}
		</div>
	);
}

function OperationalHealth({ summary }) {
	const progress = clampPercent(summary?.pctMeta);
	const brasilProgress =
		summary?.metaBrasilTecpar?.meta > 0
			? (summary.realizado / summary.metaBrasilTecpar.meta) * 100
			: 0;

	return (
		<section className={`retiradas-health-card ${summary?.operationalStatus || "warn"}`}>
			<SectionHeading eyebrow="Saúde operacional" title="Fechamento do mês" />
			<div className="retiradas-health-main">
				<div>
					<span>Meta oficial</span>
					<strong>{formatPercent(progress)}</strong>
					<p>{formatInteger(summary?.realizado)} de {formatInteger(summary?.meta)} O.S.</p>
				</div>
				<div>
					<span>Brasil Tecpar 65%</span>
					<strong>{formatPercent(brasilProgress)}</strong>
					<p>Meta fixa: {formatInteger(summary?.metaBrasilTecpar?.meta)}</p>
				</div>
			</div>
			<div className="retiradas-health-track" aria-hidden="true">
				<span style={{ width: `${clampPercent(progress)}%` }} />
			</div>
			<div className="retiradas-health-grid">
				<OperationalMetric
					label="Saldo acumulado"
					value={formatSignedInteger(summary?.saldoMes)}
					sub="Realizado contra meta acumulada"
					tone={summary?.saldoMes >= 0 ? "ok" : "danger"}
				/>
				<OperationalMetric
					label="Gap projetado"
					value={formatSignedInteger(summary?.projectedGap)}
					sub="Projeção - meta do mês"
					tone={summary?.projectedGap >= 0 ? "ok" : "danger"}
				/>
			</div>
		</section>
	);
}

function RetorninhoInsight({ summary }) {
	return (
		<section className="retiradas-retorninho-exec">
			<div>
				<span>Leitura do Retorninho</span>
				<h2>{buildRetorninhoMessage(summary)}</h2>
				<p>
					Painel executivo recalculado com meta, cancelamentos, ritmo atual,
					projeção e saldo diário do período selecionado.
				</p>
			</div>
			<img src="/retorninho-prancheta.png" alt="" loading="lazy" />
		</section>
	);
}

function PriorityActions({ actions }) {
	return (
		<section className="card retiradas-priority-card">
			<SectionHeading eyebrow="Ações prioritárias" title="Próximos movimentos" />
			<div className="retiradas-priority-list">
				{actions.map((action, index) => (
					<div key={`${action.title}-${index}`} className={`retiradas-priority-item ${action.tone}`}>
						<strong>{index + 1}</strong>
						<div>
							<h3>{action.title}</h3>
							<p>{action.desc}</p>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function ChannelProduction({ channels }) {
	return (
		<section className="card retiradas-channel-card">
			<SectionHeading eyebrow="Produção por canal" title="Origem das retiradas" />
			<div className="retiradas-channel-stack" aria-hidden="true">
				{channels.map((channel) => (
					<span
						key={channel.key}
						style={{
							width: `${Math.max(0, channel.percent)}%`,
							background: channel.color,
						}}
					/>
				))}
			</div>
			<div className="retiradas-channel-grid">
				{channels.map((channel) => (
					<div key={channel.key} className="retiradas-channel-row">
						<span style={{ background: channel.color }} />
						<div>
							<strong>{channel.label}</strong>
							<p>{formatPercent(channel.percent)} do total</p>
						</div>
						<b>{formatInteger(channel.value)}</b>
					</div>
				))}
			</div>
		</section>
	);
}

function RankingTabs({ d, agentesData, month }) {
	const [activeTab, setActiveTab] = useState("regionais");
	const tabs = [
		{ key: "regionais", label: "Regionais", metaRef: 110 },
		{ key: "agentes", label: "Agentes autorizados", metaRef: 25 },
		{ key: "loja", label: "Entrega loja", metaRef: 10 },
	];
	const currentTab = tabs.find((tab) => tab.key === activeTab) || tabs[0];
	const items = buildRankingItems(d, agentesData, month, activeTab);

	return (
		<section className="card retiradas-ranking-card">
			<SectionHeading eyebrow="Ranking operacional" title="Quem está puxando o resultado" />
			<div className="retiradas-ranking-tabs">
				{tabs.map((tab) => (
					<button
						key={tab.key}
						type="button"
						className={tab.key === activeTab ? "active" : ""}
						onClick={() => setActiveTab(tab.key)}
					>
						{tab.label}
					</button>
				))}
			</div>
			<RankingList items={items || []} metaRef={currentTab.metaRef} label="O.S" />
		</section>
	);
}

function OperationalAlerts({ anomalias, minimized, onToggle }) {
	const total = anomalias?.length || 0;
	const critical = (anomalias || []).filter((item) =>
		String(item?.severity || item?.tipo || "").toLowerCase().includes("crit"),
	).length;
	const attention = Math.max(0, total - critical);

	return (
		<section className="card retiradas-alert-card">
			<div className="card-title card-title-split">
				<span>Alertas operacionais</span>
				<button type="button" onClick={onToggle} className="comparativo-action-btn neutral">
					{minimized ? "Expandir" : "Minimizar"}
				</button>
			</div>
			<div className="retiradas-alert-summary">
				<OperationalMetric label="Críticos" value={formatInteger(critical)} sub="Exigem ação" tone={critical ? "danger" : "ok"} />
				<OperationalMetric label="Atenção" value={formatInteger(attention)} sub="Monitorar" tone={attention ? "warn" : "ok"} />
				<OperationalMetric label="Total" value={formatInteger(total)} sub="No período" tone="neutral" />
			</div>
			{!minimized ? <AnomaliaList anomalias={anomalias || []} /> : null}
		</section>
	);
}

function DailyBalancePreview({ saldoDiario, expanded, onToggle }) {
	const rows = expanded ? saldoDiario : (saldoDiario || []).slice(-7);

	return (
		<section className="card grid-full retiradas-daily-card">
			<SectionHeading
				eyebrow="Saldo diário"
				title={expanded ? "Mês completo" : "Últimos 7 dias com dados"}
				action={
					<button type="button" className="comparativo-action-btn neutral" onClick={onToggle}>
						{expanded ? "Ver resumo" : "Ver mês completo"}
					</button>
				}
			/>
			<div className="saldo-wrap">
				<table className="saldo-table">
					<thead>
						<tr>
							<th>Dia</th>
							<th>Equipe Técnica</th>
							<th>Agente Aut.</th>
							<th>Entregue Loja</th>
							<th>Regionais</th>
							<th>Total Dia</th>
							<th>Meta Diária</th>
							<th>Saldo Dia</th>
							<th>Saldo Mês</th>
						</tr>
					</thead>
					<tbody>
						<SaldoTable saldoDiario={rows || []} />
					</tbody>
				</table>
			</div>
		</section>
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
	const [saldoExpandido, setSaldoExpandido] = useState(false);
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
	const executiveSummary = useMemo(
		() =>
			buildExecutiveSummary({
				d,
				metaBrasilTecpar,
				projecao,
				ritmo,
				saldoDiario,
			}),
		[d, metaBrasilTecpar, projecao, ritmo, saldoDiario],
	);
	const priorityActions = useMemo(
		() =>
			buildPriorityActions({
				summary: executiveSummary,
				anomalias,
				regionais: regionaisFiltradas,
			}),
		[anomalias, executiveSummary, regionaisFiltradas],
	);
	const channelSummary = useMemo(
		() => buildChannelSummary(saldoDiario),
		[saldoDiario],
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
		const { metaAcumuladaPorDia: metaBrasilAcumuladaPorDia } =
			buildMetaDiariaSchedule({
				month,
				meta: metaBrasilTecpar.meta,
				feriadosSet,
				year,
			});
		const brasilTecparLine = saldoDiario.map((s) =>
			Number(metaBrasilAcumuladaPorDia.get(Number(s.dia)) ?? 0),
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
				brasilTecparLine.push(
					metaBrasilAcumuladaPorDia.get(Number(ponto.dia)) ??
						Number(metaBrasilTecpar.meta || 0),
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
						label: "Brasil Tecpar 65%",
						data: brasilTecparLine,
						borderColor: "#009f72",
						borderDash: [2, 5],
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
	}, [d, saldoDiario, projecao, month, feriadosSet, metaBrasilTecpar.meta]);

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

			<section className="retiradas-command-header">
				<div>
					<span>Dashboard Retiradas</span>
					<h1>Centro de comando operacional</h1>
					<p>
						{selectedSourceLabel} · {periodLabel} · atualizado em{" "}
						{lastUpdateText || "carregando"}
					</p>
				</div>
				<button
					type="button"
					className="retiradas-refresh-button"
					onClick={() => window.location.reload()}
				>
					Atualizar
				</button>
			</section>

			<section className="retiradas-exec-grid">
				<ExecutiveKpi
					label="Realizado"
					value={formatInteger(executiveSummary.realizado)}
					sub={`${formatPercent(executiveSummary.pctMeta)} da meta · ${formatPercent(executiveSummary.pctCancelamentos)} dos cancelamentos`}
					tone="orange"
					meta={totalTrend.value ? `vs. mês anterior ${totalTrend.value}` : null}
				/>
				<ExecutiveKpi
					label="Meta"
					value={formatInteger(executiveSummary.meta)}
					sub="Objetivo oficial do mês"
					tone="blue"
					meta={metaTrend.value ? `vs. mês anterior ${metaTrend.value}` : null}
				/>
				<ExecutiveKpi
					label="Faltam"
					value={formatInteger(executiveSummary.faltam)}
					sub={`Para bater a meta · ${formatInteger(executiveSummary.metaBrasilTecpar.falta)} para Brasil Tecpar 65%`}
					tone={executiveSummary.faltam > 0 ? "red" : "green"}
				/>
				<ExecutiveKpi
					label="Projeção"
					value={projecao ? formatInteger(executiveSummary.projection) : "--"}
					sub={
						projecao
							? `${formatPercent(executiveSummary.projectionPercent)} da meta no fechamento`
							: "Calculando curva do mês"
					}
					tone="purple"
					meta={projectionTrend.value ? `vs. mês anterior ${projectionTrend.value}` : null}
				/>
			</section>

			<section className="retiradas-operational-grid">
				<OperationalMetric
					label="Brasil Tecpar 65%"
					value={formatInteger(executiveSummary.metaBrasilTecpar.meta)}
					sub={
						executiveSummary.metaBrasilTecpar.atingiu
							? "Meta fixa já atingida"
							: `${formatInteger(executiveSummary.metaBrasilTecpar.falta)} O.S. restantes`
					}
					tone={executiveSummary.metaBrasilTecpar.atingiu ? "ok" : "warn"}
				/>
				<OperationalMetric
					label="Ritmo atual"
					value={`${formatInteger(executiveSummary.currentPace)} O.S./dia`}
					sub={`${formatRitmoDiferencaLabel(ritmo)} contra o planejado`}
					tone={ritmo?.status === "ok" ? "ok" : "warn"}
				/>
				<OperationalMetric
					label="Meta diária planejada"
					value={`${formatInteger(executiveSummary.plannedDaily)} O.S./dia`}
					sub="Baseada nos dias úteis do mês"
					tone="neutral"
				/>
				<OperationalMetric
					label="Dias úteis restantes"
					value={formatInteger(executiveSummary.diasUteisRestantes)}
					sub="Janela operacional disponível"
					tone="neutral"
				/>
				<OperationalMetric
					label="Necessário/dia"
					value={`${formatInteger(executiveSummary.requiredDaily)} O.S./dia`}
					sub="Para fechar a meta"
					tone={
						executiveSummary.requiredDaily > executiveSummary.plannedDaily
							? "danger"
							: "ok"
					}
				/>
			</section>

			<div className="retiradas-focus-grid">
				<OperationalHealth summary={executiveSummary} />

				<section className="card retiradas-evolution-card">
					<SectionHeading
						eyebrow="Evolução do mês"
						title="Realizado x meta x projeção"
						action={
							<span className="retiradas-chart-caption">
								Projeção:{" "}
								{projecao ? formatInteger(executiveSummary.projection) : "--"}
							</span>
						}
					/>
					<div className="chart-container">
						<canvas ref={chartDailyRef} />
					</div>
					<div className="retiradas-chart-metrics">
						<div>
							<span>Média realizada/dia</span>
							<strong>{ritmo?.media || "--"} O.S.</strong>
						</div>
						<div>
							<span>Necessário/dia</span>
							<strong>{ritmo?.necessario || "--"} O.S.</strong>
						</div>
						<div>
							<span>Diferença</span>
							<strong
								className={ritmo?.status === "ok" ? "positive" : "negative"}
							>
								{formatRitmoDiferencaLabel(ritmo)}
							</strong>
						</div>
					</div>
				</section>
			</div>

			<RetorninhoInsight summary={executiveSummary} />

			<ForcaTarefaCard resumo={forcaTarefaResumo} />

			<div className="grid">
				<PriorityActions actions={priorityActions} />
				<ChannelProduction channels={channelSummary} />

				<RankingTabs d={d} agentesData={agentesData} month={month} />
				<div className="card">
					<SectionHeading eyebrow="Metas por regional" title="Gap e status" />
					<RegionalGoalsTable items={regionaisFiltradas || []} />
				</div>

				<OperationalAlerts
					anomalias={anomalias}
					minimized={anomaliasMinimizadas}
					onToggle={() => setAnomaliasMinimizadas((current) => !current)}
				/>

				<DailyBalancePreview
					saldoDiario={saldoDiario || []}
					expanded={saldoExpandido}
					onToggle={() => setSaldoExpandido((current) => !current)}
				/>

				<div className="card grid-full">
					<SectionHeading eyebrow="Comparativo mensal" title="Ano completo" />
					<div className="chart-container">
						<canvas ref={chartMonthlyRef} />
					</div>
				</div>
			</div>
		</div>
	);
}
