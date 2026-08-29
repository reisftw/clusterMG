import { Chart } from "chart.js/auto";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveVpsDate } from "../../../services/vpsDate";
import CityModal from "../components/CityModal";
import CityTable from "../components/CityTable";
import EmptyState from "../components/EmptyState";
import KpiCard from "../components/KpiCard";
import RankingList from "../components/RankingList";
import { MONTH_ORDER } from "../utils/constants";
import { gerarPDFMetaMensal } from "../utils/pdfAgentes";

function normalizeMonthName(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function getMonthsFromCurrent(month, allData) {
	const currentIndex = MONTH_ORDER.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);

	if (currentIndex < 0) {
		return MONTH_ORDER.filter((item) => {
			const data = getMonthRecord(allData, item);
			return Number(data?.totalRealizado || 0) > 0;
		});
	}

	return Array.from(
		{ length: MONTH_ORDER.length },
		(_, offset) =>
			MONTH_ORDER[
				(currentIndex - offset + MONTH_ORDER.length) % MONTH_ORDER.length
			],
	).filter(
		(item) => Number(getMonthRecord(allData, item)?.totalRealizado || 0) > 0,
	);
}

function resolveMonthKey(allData = {}, month) {
	const normalizedMonth = normalizeMonthName(month);
	return (
		Object.keys(allData || {}).find(
			(key) => normalizeMonthName(key) === normalizedMonth,
		) || month
	);
}

function getMonthRecord(allData = {}, month) {
	const key = resolveMonthKey(allData, month);
	return allData?.[key] || null;
}

function getCityStatus(cidade) {
	const pct = Number(cidade?.pct || 0);
	if (pct > 100) return { key: "over", label: "Acima da Meta" };
	if (pct >= 80) return { key: "done", label: "Meta Atingida" };
	if (pct >= 50) return { key: "progress", label: "Em Andamento" };
	if (pct > 0) return { key: "below", label: "Abaixo" };
	return { key: "critical", label: "Crítico" };
}

function getFilteredSummary(cidades = [], fallback = {}) {
	if (!cidades.length) {
		return {
			totalRealizado: Number(fallback.totalRealizado || 0),
			totalMeta: Number(fallback.totalMeta || 0),
			totalCancelamentos: Number(fallback.totalCancelamentos || 0),
			totalFalta: Number(fallback.totalFalta || 0),
			percentAchieved: Number(fallback.percentAchieved || 0),
		};
	}

	const totals = cidades.reduce(
		(acc, cidade) => ({
			totalRealizado: acc.totalRealizado + Number(cidade.realizado || 0),
			totalMeta: acc.totalMeta + Number(cidade.meta80 || 0),
			totalCancelamentos:
				acc.totalCancelamentos + Number(cidade.cancelamentos || 0),
			totalFalta: acc.totalFalta + Number(cidade.falta || 0),
		}),
		{
			totalRealizado: 0,
			totalMeta: 0,
			totalCancelamentos: 0,
			totalFalta: 0,
		},
	);

	return {
		...totals,
		percentAchieved:
			totals.totalCancelamentos > 0
				? (totals.totalRealizado / totals.totalCancelamentos) * 100
				: 0,
	};
}

function formatLastUpdate(value) {
	if (!value) return "Sincronizado";
	const raw =
		typeof value === "object"
			? value.texto ||
				value.lastUpdate ||
				value.updatedAt ||
				value.data ||
				value.ultimaAtualizacao ||
				value.atualizadoEm
			: value;

	if (!raw) return "Sincronizado";
	const date = resolveVpsDate(raw);
	if (!date) return String(raw);

	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getPeriodLabel(month) {
	const index = MONTH_ORDER.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);
	if (index < 0) return "--";
	const year = new Date().getFullYear();
	const first = new Date(year, index, 1);
	const last = new Date(year, index + 1, 0);
	return `${first.toLocaleDateString("pt-BR")} - ${last.toLocaleDateString("pt-BR")}`;
}

function StatusMap({ cidades = [] }) {
	const groups = [
		{ key: "done", title: "Meta atingida", tone: "done" },
		{ key: "progress", title: "Em andamento", tone: "progress" },
		{ key: "below", title: "Abaixo", tone: "below" },
		{ key: "critical", title: "Crítico", tone: "critical" },
	].map((group) => ({
		...group,
		items: cidades.filter((cidade) => {
			const status = getCityStatus(cidade).key;
			if (group.key === "done") return status === "done" || status === "over";
			return status === group.key;
		}),
	}));

	return (
		<div className="agentes-status-map">
			{groups.map((group) => (
				<section
					className={`agentes-status-group ${group.tone}`}
					key={group.key}
				>
					<div className="agentes-status-heading">
						<span>{group.title}</span>
						<strong>{group.items.length}</strong>
					</div>
					<div className="agentes-city-chips">
						{(group.items.length ? group.items : [{ nome: "Sem cidades" }]).map(
							(cidade) => (
								<span key={`${group.key}-${cidade.nome}`}>{cidade.nome}</span>
							),
						)}
					</div>
				</section>
			))}
		</div>
	);
}

export default function TabAgentes({ allData, month, lastUpdate }) {
	const dataMonthKey = useMemo(
		() => resolveMonthKey(allData, month),
		[allData, month],
	);
	const d = getMonthRecord(allData, month);
	const [selectedCity, setSelectedCity] = useState(null);
	const [cityFilter, setCityFilter] = useState("todas");
	const [statusFilter, setStatusFilter] = useState("todos");

	const chartCidadesRef = useRef(null);
	const chartDailyRef = useRef(null);
	const chartMonthlyRef = useRef(null);
	const chartCidadesInst = useRef(null);
	const chartDailyInst = useRef(null);
	const chartMonthlyInst = useRef(null);

	const intFmt = useMemo(
		() =>
			new Intl.NumberFormat("pt-BR", {
				maximumFractionDigits: 0,
			}),
		[],
	);

	const pctFmt = useMemo(
		() =>
			new Intl.NumberFormat("pt-BR", {
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			}),
		[],
	);

	const cidades = useMemo(() => {
		const base = Array.isArray(d?.cidades) ? d.cidades : [];
		return [...base].sort(
			(a, b) => Number(b.realizado || 0) - Number(a.realizado || 0),
		);
	}, [d]);

	const filteredCities = useMemo(() => {
		return cidades.filter((cidade) => {
			const cityMatches =
				cityFilter === "todas" ||
				normalizeMonthName(cidade.nome) === cityFilter;
			const statusMatches =
				statusFilter === "todos" || getCityStatus(cidade).key === statusFilter;
			return cityMatches && statusMatches;
		});
	}, [cidades, cityFilter, statusFilter]);

	const summary = useMemo(
		() => getFilteredSummary(filteredCities, d),
		[d, filteredCities],
	);

	const topCity = filteredCities[0] || cidades[0] || null;
	const abaixoCount = cidades.filter(
		(cidade) => Number(cidade.pct || 0) < 50,
	).length;
	const periodLabel = useMemo(
		() => getPeriodLabel(dataMonthKey),
		[dataMonthKey],
	);
	const lastUpdateText = useMemo(
		() => formatLastUpdate(lastUpdate),
		[lastUpdate],
	);

	useEffect(() => {
		if (!d || !chartCidadesRef.current) return;
		if (chartCidadesInst.current) chartCidadesInst.current.destroy();

		const all = filteredCities;
		const chartH = Math.max(360, all.length * 34 + 80);
		chartCidadesRef.current.parentElement.style.height = `${chartH}px`;

		chartCidadesInst.current = new Chart(chartCidadesRef.current, {
			type: "bar",
			data: {
				labels: all.map((c) => c.nome),
				datasets: [
					{
						label: "Realizado",
						data: all.map((c) => Math.round(Number(c.realizado) || 0)),
						backgroundColor: "#FF6B00",
						borderRadius: 5,
						barThickness: 12,
					},
					{
						label: "Meta 80%",
						data: all.map((c) => Math.round(Number(c.meta80) || 0)),
						backgroundColor: "rgba(0,48,135,0.55)",
						borderRadius: 5,
						barThickness: 12,
					},
				],
			},
			options: {
				indexAxis: "y",
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top" },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.dataset.label}: ${intFmt.format(ctx.parsed.x || 0)}`,
						},
					},
				},
				scales: {
					x: {
						beginAtZero: true,
						grid: { color: "rgba(15, 23, 42, 0.06)" },
						ticks: {
							callback: (value) => intFmt.format(value),
						},
					},
					y: { grid: { display: false } },
				},
			},
		});
	}, [d, filteredCities, intFmt]);

	useEffect(() => {
		if (!d || !chartDailyRef.current) return;
		if (chartDailyInst.current) chartDailyInst.current.destroy();

		let daily =
			cityFilter === "todas"
				? Array.isArray(d.totalDaily)
					? d.totalDaily.map((v) => Math.round(Number(v) || 0))
					: []
				: filteredCities.reduce((acc, cidade) => {
						const cityDaily = Array.isArray(cidade.daily) ? cidade.daily : [];
						cityDaily.forEach((value, index) => {
							acc[index] = (acc[index] || 0) + Math.round(Number(value) || 0);
						});
						return acc;
					}, []);

		let lastActive = -1;
		daily.forEach((v, i) => {
			if (v > 0) lastActive = i;
		});

		if (lastActive >= 0) {
			daily = daily.slice(0, lastActive + 1);
		}

		const accumulated = [];
		let sum = 0;

		for (let i = 0; i < daily.length; i++) {
			sum += daily[i];
			accumulated.push(sum);
		}

		const labels = daily.map((_, i) => `Dia ${i + 1}`);

		chartDailyInst.current = new Chart(chartDailyRef.current, {
			type: "line",
			data: {
				labels,
				datasets: [
					{
						label: "Acumulado Geral",
						data: accumulated,
						borderColor: "#FF6B00",
						backgroundColor: "rgba(255,107,0,0.1)",
						fill: true,
						tension: 0.35,
						pointRadius: 3,
						borderWidth: 2,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top" },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.dataset.label}: ${intFmt.format(ctx.parsed.y || 0)}`,
						},
					},
				},
				scales: {
					y: {
						beginAtZero: true,
						grid: { color: "rgba(15, 23, 42, 0.06)" },
						ticks: {
							callback: (value) => intFmt.format(value),
						},
					},
					x: { grid: { display: false } },
				},
			},
		});
	}, [d, filteredCities, cityFilter, intFmt]);

	useEffect(() => {
		if (!chartMonthlyRef.current) return;
		if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();

		const mesesComDados = getMonthsFromCurrent(dataMonthKey, allData);

		chartMonthlyInst.current = new Chart(chartMonthlyRef.current, {
			type: "bar",
			data: {
				labels: mesesComDados,
				datasets: [
					{
						label: "Realizado",
						data: mesesComDados.map((m) =>
							Math.round(
								Number(getMonthRecord(allData, m)?.totalRealizado || 0),
							),
						),
						backgroundColor: "#FF6B00",
						borderRadius: 8,
					},
					{
						label: "Meta 80%",
						data: mesesComDados.map((m) =>
							Math.round(Number(getMonthRecord(allData, m)?.totalMeta || 0)),
						),
						backgroundColor: "rgba(0,48,135,0.5)",
						borderRadius: 8,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top" },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.dataset.label}: ${intFmt.format(ctx.parsed.y || 0)}`,
						},
					},
				},
				scales: {
					y: {
						beginAtZero: true,
						grid: { color: "rgba(15, 23, 42, 0.06)" },
						ticks: {
							callback: (value) => intFmt.format(value),
						},
					},
					x: { grid: { display: false } },
				},
			},
		});
	}, [allData, dataMonthKey, intFmt]);

	useEffect(() => {
		return () => {
			if (chartCidadesInst.current) chartCidadesInst.current.destroy();
			if (chartDailyInst.current) chartDailyInst.current.destroy();
			if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();
		};
	}, []);

	if (!d)
		return (
			<EmptyState
				icon="🏢"
				title="Sem dados para este mês"
				desc="Aguardando sincronização com a VPS."
			/>
		);

	const rankItems = filteredCities.map((c) => ({
		...c,
		name: c.nome,
		total: Math.round(Number(c.realizado) || 0),
		percent: Number(c.pct) || 0,
	}));

	const filterActive = cityFilter !== "todas" || statusFilter !== "todos";

	return (
		<div className="agentes-dashboard">
			<div className="agentes-filterbar">
				<label>
					<span>Base do painel</span>
					<select defaultValue="sempre">
						<option value="sempre">SEMPRE</option>
					</select>
				</label>

				<label>
					<span>Período</span>
					<input type="text" value={periodLabel} readOnly />
				</label>

				<label>
					<span>Cidade</span>
					<select
						value={cityFilter}
						onChange={(event) => setCityFilter(event.target.value)}
					>
						<option value="todas">Todas</option>
						{cidades.map((cidade) => (
							<option key={cidade.nome} value={normalizeMonthName(cidade.nome)}>
								{cidade.nome}
							</option>
						))}
					</select>
				</label>

				<label>
					<span>Status</span>
					<select
						value={statusFilter}
						onChange={(event) => setStatusFilter(event.target.value)}
					>
						<option value="todos">Todos</option>
						<option value="done">Meta atingida</option>
						<option value="progress">Em andamento</option>
						<option value="below">Abaixo</option>
						<option value="critical">Crítico</option>
					</select>
				</label>

				<div className="agentes-filter-update">
					<span>Última atualização</span>
					<strong>{lastUpdateText}</strong>
				</div>
			</div>

			<div className="kpis agentes-kpis">
				<KpiCard
					label="Total realizado"
					value={intFmt.format(Number(summary.totalRealizado || 0))}
					sub="Retiradas concluídas"
					color="orange"
				/>
				<KpiCard
					label="Meta 80%"
					value={intFmt.format(Math.round(Number(summary.totalMeta || 0)))}
					sub={`Cancelamentos: ${intFmt.format(Number(summary.totalCancelamentos || 0))}`}
					color="blue"
				/>
				<KpiCard
					label="% atingido da meta"
					value={`${pctFmt.format(Number(summary.percentAchieved || 0))}%`}
					sub={`Faltam ${intFmt.format(Math.max(0, Math.round(Number(summary.totalFalta || 0))))} retiradas`}
					color="green"
				/>
				<KpiCard
					label="Falta para meta"
					value={intFmt.format(
						Math.max(0, Math.round(Number(summary.totalFalta || 0))),
					)}
					sub="Retiradas pendentes"
					color="red"
				/>
			</div>

			<div className="agentes-focus-grid">
				<section className="agentes-performance-card">
					<div className="agentes-section-topline">
						<span>Desempenho dos agentes</span>
						<strong className="agentes-alert-pill">Atenção</strong>
					</div>

					<h2>
						{Number(summary.percentAchieved || 0) >= 80
							? "Carteira dentro do ritmo esperado"
							: "Carteira abaixo da meta ideal"}
					</h2>
					<p>
						A carteira está em{" "}
						{pctFmt.format(Number(summary.percentAchieved || 0))}% da meta.
						{topCity
							? ` ${topCity.nome} lidera a recuperação, mas ${abaixoCount} cidades seguem abaixo do ritmo.`
							: " Selecione uma cidade para aprofundar a leitura."}
					</p>

					<div className="agentes-main-progress">
						<span
							style={{
								width: `${Math.min(Number(summary.percentAchieved || 0), 100)}%`,
							}}
						/>
						<strong>
							{pctFmt.format(Number(summary.percentAchieved || 0))}%
						</strong>
					</div>

					<div className="agentes-summary-row">
						<div>
							<span>Realizado</span>
							<strong>
								{intFmt.format(Number(summary.totalRealizado || 0))}
							</strong>
						</div>
						<div>
							<span>Meta</span>
							<strong>
								{intFmt.format(Math.round(Number(summary.totalMeta || 0)))}
							</strong>
						</div>
						<div>
							<span>Falta</span>
							<strong>
								{intFmt.format(
									Math.max(0, Math.round(Number(summary.totalFalta || 0))),
								)}
							</strong>
						</div>
					</div>

					<div className="agentes-campaign-card">
						<img src="/retorninho-estela.webp" alt="" loading="lazy" />
						<div>
							<h3>Evite pendências no seu cadastro</h3>
							<p>Devolva seu equipamento com facilidade.</p>
						</div>
					</div>
				</section>

				<section className="card agentes-city-chart-card">
					<div className="card-title card-title-split">
						<span>Realizado vs Meta por Cidade</span>
						<span className="agentes-chart-caption">
							{filterActive ? "Filtros aplicados" : `${cidades.length} cidades`}
						</span>
					</div>
					<div className="chart-container agentes-city-chart">
						<canvas ref={chartCidadesRef} />
					</div>
				</section>
			</div>

			<div className="agentes-secondary-grid">
				<section className="card">
					<div className="card-title">🏆 Ranking por cidade</div>
					<RankingList
						items={rankItems}
						metaRef={Number(summary.totalMeta) || 0}
						label="retiradas"
					/>
					<button type="button" className="rank-complete-action">
						Ver ranking completo
					</button>
				</section>

				<section className="card">
					<div className="card-title">Mapa de status das cidades</div>
					<StatusMap cidades={cidades} />
				</section>
			</div>

			<section className="card agentes-table-card">
				<div className="card-title-split">
					<div className="card-title">Detalhamento por Cidade</div>
					<button
						type="button"
						className="btn-meta-mensal"
						onClick={() => gerarPDFMetaMensal(dataMonthKey, filteredCities)}
						disabled={!filteredCities.length}
					>
						Meta Mensal
					</button>
				</div>
				<CityTable cidades={filteredCities} onCityClick={setSelectedCity} />
			</section>

			<section className="card agentes-chart-wide">
				<div className="card-title">
					Evolução Diária Acumulada — Total Geral
				</div>
				<div className="chart-container">
					<canvas ref={chartDailyRef} />
				</div>
			</section>

			<section className="card agentes-chart-wide">
				<div className="card-title">Comparativo Mensal — Ano Completo</div>
				<div className="chart-container">
					<canvas ref={chartMonthlyRef} />
				</div>
			</section>

			{selectedCity && (
				<CityModal
					cidade={selectedCity}
					month={dataMonthKey}
					allData={allData}
					onClose={() => setSelectedCity(null)}
				/>
			)}
		</div>
	);
}
