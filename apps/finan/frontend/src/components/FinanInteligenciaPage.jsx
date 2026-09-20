// Fase 2 do Roteiro Finan — Inteligência: Finan Score (#5) + Forecast
// (#4) + Anomalias (#2) na visão geral, Comparador de períodos (#3) e
// Simulador financeiro (#20) em abas dedicadas.
import {
	AlertTriangle,
	Calculator,
	FileText,
	Gauge,
	History,
	Plus,
	RefreshCw,
	Scale,
	Sparkles,
	Trash2,
	TrendingDown,
	TrendingUp,
	Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	calcularFinanBusinessCase,
	excluirFinanBusinessCase,
	fetchFinanAnomalias,
	fetchFinanBriefing,
	fetchFinanBusinessCases,
	fetchFinanComparador,
	fetchFinanForecast,
	fetchFinanScore,
	salvarFinanBusinessCase,
	simularFinanCenario,
} from "../api/finanApi";

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value) {
	return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const MONTHS = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CONFIANCA_LABEL = {
	sem_dados: "Sem dados suficientes",
	muito_baixa: "Confiança muito baixa (menos de 3 meses de histórico)",
	baixa: "Confiança baixa (menos de 6 meses de histórico)",
	media: "Confiança média",
};

const TABS = [
	{ id: "geral", label: "Visão Geral" },
	{ id: "comparador", label: "Comparador de Períodos" },
	{ id: "simulador", label: "Simulador" },
	{ id: "briefing", label: "Briefing Executivo" },
	{ id: "business-case", label: "Business Case" },
];

export default function FinanInteligenciaPage() {
	const [tab, setTab] = useState("geral");

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex items-start gap-4">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<Sparkles size={24} />
					</span>
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Fase 2 — Inteligência</p>
						<h1 className="mt-1 text-2xl font-black text-slate-950">Inteligência Financeira</h1>
						<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
							Score, forecast, anomalias e comparação de períodos. Ainda com pouco histórico real — cada número mostra
							o quanto de dado usou pra chegar nele.
						</p>
					</div>
				</div>
			</header>

			<div className="flex flex-wrap gap-2">
				{TABS.map((item) => (
					<button
						key={item.id}
						type="button"
						onClick={() => setTab(item.id)}
						className={`rounded-xl px-4 py-2 text-sm font-black transition ${
							tab === item.id ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
						}`}
					>
						{item.label}
					</button>
				))}
			</div>

			{tab === "geral" ? <VisaoGeralTab /> : null}
			{tab === "comparador" ? <ComparadorTab /> : null}
			{tab === "simulador" ? <SimuladorTab /> : null}
			{tab === "briefing" ? <BriefingTab /> : null}
			{tab === "business-case" ? <BusinessCaseTab /> : null}
		</div>
	);
}

// Roteiro Finan #45 (Briefing Executivo automático, reune #44/#43/#18/#1).
function BriefingTab() {
	const [periodo, setPeriodo] = useState("mensal");
	const [briefing, setBriefing] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");
		fetchFinanBriefing(periodo)
			.then((data) => {
				if (active) setBriefing(data);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível gerar o briefing.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [periodo]);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				{["diario", "semanal", "mensal"].map((item) => (
					<button
						key={item}
						type="button"
						onClick={() => setPeriodo(item)}
						className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase ${
							periodo === item ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
						}`}
					>
						{item}
					</button>
				))}
			</div>
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Gerando briefing...</p>
			) : briefing ? (
				<>
					<div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
						<div className="flex items-center gap-2 text-sm font-black text-blue-900">
							<FileText size={16} /> Resumo pronto para reunião
						</div>
						<p className="mt-2 text-sm font-semibold text-blue-900">{briefing.resumoTexto}</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<p className="text-xs font-black uppercase text-slate-500">Despesas — {briefing.range.label}</p>
							<p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(briefing.despesas.realizadoPeriodo)}</p>
							<p className="text-xs text-slate-500">{briefing.despesas.linhas} lançamento(s) · {briefing.despesas.fornecedores} fornecedor(es)</p>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<p className="text-xs font-black uppercase text-slate-500">Orçamento do mês</p>
							<p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(briefing.orcamentoMes.realizado)}</p>
							<p className="text-xs text-slate-500">de {formatMoney(briefing.orcamentoMes.orcado)} ({formatPercent(briefing.orcamentoMes.percentual)})</p>
						</div>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<p className="text-sm font-black text-slate-900">Riscos e recomendações</p>
						<div className="mt-3 space-y-2">
							{briefing.riscos.map((risco, index) => (
								<div key={risco.id} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
									<p className="text-sm font-bold text-amber-900">{risco.texto}</p>
									{briefing.recomendacoes[index] ? (
										<p className="mt-1 text-xs font-semibold text-amber-700">→ {briefing.recomendacoes[index]}</p>
									) : null}
								</div>
							))}
							{!briefing.riscos.length ? <p className="text-sm text-slate-500">Nenhum risco identificado no momento.</p> : null}
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}

// Roteiro Finan #46 (Business Case dentro do Finan).
function BusinessCaseTab() {
	const [form, setForm] = useState({ nome: "", investimentoInicial: "", economiaMensal: "", prazoMeses: "12", taxaDescontoMensal: "1" });
	const [resultado, setResultado] = useState(null);
	const [casos, setCasos] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const loadCasos = () => fetchFinanBusinessCases().then(setCasos).catch(() => {});
	useEffect(() => {
		loadCasos();
	}, []);

	const parsedInput = () => ({
		investimentoInicial: Number(form.investimentoInicial) || 0,
		economiaMensal: Number(form.economiaMensal) || 0,
		prazoMeses: Number(form.prazoMeses) || 12,
		taxaDescontoMensal: (Number(form.taxaDescontoMensal) || 0) / 100,
	});

	const handleCalcular = async () => {
		setLoading(true);
		setError("");
		try {
			setResultado(await calcularFinanBusinessCase(parsedInput()));
		} catch (err) {
			setError(err?.message || "Não foi possível calcular.");
		} finally {
			setLoading(false);
		}
	};

	const handleSalvar = async () => {
		if (!form.nome.trim()) {
			setError("Dê um nome ao caso antes de salvar.");
			return;
		}
		try {
			await salvarFinanBusinessCase({ nome: form.nome.trim(), ...parsedInput() });
			await loadCasos();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o caso.");
		}
	};

	return (
		<div className="space-y-4">
			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-2 text-sm font-black text-slate-900">
					<Calculator size={16} /> Calculadora de ROI / Payback / VPL / TIR
				</div>
				{error ? <p className="mt-2 text-sm font-bold text-red-700">{error}</p> : null}
				<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					<label className="text-xs font-black uppercase text-slate-500">
						Nome do caso
						<input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
					</label>
					<label className="text-xs font-black uppercase text-slate-500">
						Investimento inicial (R$)
						<input type="number" value={form.investimentoInicial} onChange={(e) => setForm((f) => ({ ...f, investimentoInicial: e.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
					</label>
					<label className="text-xs font-black uppercase text-slate-500">
						Economia mensal (R$)
						<input type="number" value={form.economiaMensal} onChange={(e) => setForm((f) => ({ ...f, economiaMensal: e.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
					</label>
					<label className="text-xs font-black uppercase text-slate-500">
						Prazo (meses)
						<input type="number" value={form.prazoMeses} onChange={(e) => setForm((f) => ({ ...f, prazoMeses: e.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
					</label>
					<label className="text-xs font-black uppercase text-slate-500">
						Taxa de desconto (% a.m.)
						<input type="number" value={form.taxaDescontoMensal} onChange={(e) => setForm((f) => ({ ...f, taxaDescontoMensal: e.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
					</label>
				</div>
				<div className="mt-4 flex gap-2">
					<button type="button" onClick={handleCalcular} disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
						Calcular
					</button>
					<button type="button" onClick={handleSalvar} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100">
						<Plus size={14} /> Salvar caso
					</button>
				</div>
			</div>

			{resultado ? (
				<div className={`rounded-2xl border p-5 shadow-sm ${resultado.viavel ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
					<div className="grid gap-3 sm:grid-cols-4">
						<div>
							<p className="text-xs font-black uppercase text-slate-500">ROI</p>
							<p className="text-xl font-black text-slate-950">{formatPercent(resultado.roi)}</p>
						</div>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">Payback</p>
							<p className="text-xl font-black text-slate-950">{resultado.paybackMeses ? `${resultado.paybackMeses} meses` : "—"}</p>
						</div>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">VPL</p>
							<p className="text-xl font-black text-slate-950">{formatMoney(resultado.vpl)}</p>
						</div>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">TIR</p>
							<p className="text-xl font-black text-slate-950">{resultado.tir !== null ? formatPercent(resultado.tir) : "—"}</p>
						</div>
					</div>
					<p className="mt-3 text-sm font-bold text-slate-800">{resultado.resumoExecutivo}</p>
				</div>
			) : null}

			{casos.length ? (
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<p className="text-sm font-black text-slate-900">Casos salvos</p>
					<div className="mt-3 space-y-2">
						{casos.map((caso) => (
							<div key={caso.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
								<div>
									<p className="font-bold text-slate-800">{caso.nome}</p>
									<p className="text-xs text-slate-500">
										ROI {formatPercent(caso.resultados.roi)} · VPL {formatMoney(caso.resultados.vpl)} ·{" "}
										{caso.resultados.viavel ? "Viável" : "Inviável"}
									</p>
								</div>
								<button
									type="button"
									onClick={() => excluirFinanBusinessCase(caso.id).then(loadCasos)}
									className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
								>
									<Trash2 size={14} />
								</button>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

function VisaoGeralTab() {
	const [score, setScore] = useState(null);
	const [forecast, setForecast] = useState(null);
	const [anomalias, setAnomalias] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [scoreData, forecastData, anomaliasData] = await Promise.all([
				fetchFinanScore(),
				fetchFinanForecast(),
				fetchFinanAnomalias(),
			]);
			setScore(scoreData);
			setForecast(forecastData);
			setAnomalias(anomaliasData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a inteligência financeira.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	if (loading) return <p className="text-sm font-semibold text-slate-500">Analisando...</p>;
	if (error) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>;

	const scoreColor = score.score >= 70 ? "text-emerald-600" : score.score >= 40 ? "text-amber-600" : "text-red-600";

	return (
		<div className="space-y-6">
			<div className="grid gap-4 lg:grid-cols-[280px_1fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
					<div className="flex items-center justify-center gap-2 text-xs font-black uppercase text-slate-500">
						<Gauge size={16} />
						Finan Score
					</div>
					<p className={`mt-3 text-5xl font-black ${scoreColor}`}>{score.score}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">de 100</p>
					<button type="button" onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">
						<RefreshCw size={13} />
						Atualizar
					</button>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<p className="text-sm font-black text-slate-900">Por que {score.score}?</p>
					<div className="mt-3 space-y-2">
						{score.fatores.map((fator) => (
							<div key={fator.id} className="flex items-center gap-3">
								<span className="w-40 shrink-0 text-xs font-bold text-slate-600">{fator.label}</span>
								<div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
									<div className={`h-2 rounded-full ${fator.valor >= 70 ? "bg-emerald-500" : fator.valor >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${fator.valor}%` }} />
								</div>
								<span className="w-10 shrink-0 text-right text-xs font-black text-slate-900">{fator.valor}</span>
							</div>
						))}
					</div>
					{score.forasDoEscopo?.length ? (
						<p className="mt-3 text-xs font-semibold text-slate-400">
							Ainda fora da nota: {score.forasDoEscopo.join(", ")}. {score.forasDoEscopoMotivo}
						</p>
					) : null}
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-2 text-sm font-black text-slate-900">
						<TrendingUp size={16} className="text-blue-600" />
						Previsão para o próximo mês
					</div>
					{forecast.amostras === 0 ? (
						<p className="mt-2 text-sm font-semibold text-slate-500">Sem histórico suficiente ainda para prever.</p>
					) : (
						<>
							<p className="mt-3 text-xs font-bold uppercase text-amber-700">{CONFIANCA_LABEL[forecast.confianca]}</p>
							<div className="mt-3 grid grid-cols-3 gap-2 text-center">
								<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
									<p className="text-[10px] font-black uppercase text-emerald-700">Otimista</p>
									<p className="mt-1 text-sm font-black text-emerald-900">{formatMoney(forecast.otimista)}</p>
								</div>
								<div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
									<p className="text-[10px] font-black uppercase text-blue-700">Provável</p>
									<p className="mt-1 text-sm font-black text-blue-900">{formatMoney(forecast.provavel)}</p>
								</div>
								<div className="rounded-xl border border-red-200 bg-red-50 p-3">
									<p className="text-[10px] font-black uppercase text-red-700">Conservador</p>
									<p className="mt-1 text-sm font-black text-red-900">{formatMoney(forecast.conservador)}</p>
								</div>
							</div>
							<p className="mt-2 text-xs font-semibold text-slate-500">Baseado em {forecast.amostras} mês(es) de histórico real.</p>
						</>
					)}
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-2 text-sm font-black text-slate-900">
						<AlertTriangle size={16} className="text-amber-600" />
						Possíveis anomalias este mês
					</div>
					{anomalias.length ? (
						<div className="mt-3 space-y-2">
							{anomalias.map((item, index) => (
								<div key={`${item.fornecedorNome}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
									<p className="text-xs font-black text-amber-900">
										{item.fornecedorNome} · {item.contaNome}
									</p>
									<p className="mt-1 text-xs font-semibold text-amber-800">
										{formatMoney(item.valorAtual)} — {formatPercent(Math.abs(item.percentual))} {item.direcao} da média histórica
										({formatMoney(item.mediaHistorica)}, {item.amostras} mês(es))
									</p>
								</div>
							))}
						</div>
					) : (
						<p className="mt-2 text-sm font-semibold text-slate-500">
							Nenhuma anomalia detectada (ou histórico ainda curto demais para comparar).
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function ComparadorTab() {
	const now = new Date();
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [filtros, setFiltros] = useState({
		anoA: now.getFullYear(),
		mesA: now.getMonth() + 1,
		anoB: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
		mesB: now.getMonth() === 0 ? 12 : now.getMonth(),
	});

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setData(await fetchFinanComparador(filtros));
		} catch (err) {
			setError(err?.message || "Não foi possível comparar os períodos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-end gap-3">
					<div className="flex items-end gap-2">
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">Mês A</span>
							<select value={filtros.mesA} onChange={(e) => setFiltros((c) => ({ ...c, mesA: Number(e.target.value) }))} className="h-10 rounded-lg border border-slate-200 px-2 text-sm font-semibold">
								{MONTHS.slice(1).map((label, index) => (
									<option key={label} value={index + 1}>{label}</option>
								))}
							</select>
						</label>
						<input type="number" value={filtros.anoA} onChange={(e) => setFiltros((c) => ({ ...c, anoA: Number(e.target.value) }))} className="h-10 w-20 rounded-lg border border-slate-200 px-2 text-sm font-semibold" />
					</div>
					<Scale size={18} className="mb-2 text-slate-400" />
					<div className="flex items-end gap-2">
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">Mês B</span>
							<select value={filtros.mesB} onChange={(e) => setFiltros((c) => ({ ...c, mesB: Number(e.target.value) }))} className="h-10 rounded-lg border border-slate-200 px-2 text-sm font-semibold">
								{MONTHS.slice(1).map((label, index) => (
									<option key={label} value={index + 1}>{label}</option>
								))}
							</select>
						</label>
						<input type="number" value={filtros.anoB} onChange={(e) => setFiltros((c) => ({ ...c, anoB: Number(e.target.value) }))} className="h-10 w-20 rounded-lg border border-slate-200 px-2 text-sm font-semibold" />
					</div>
					<button type="button" onClick={load} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">
						Comparar
					</button>
				</div>
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Comparando...</p>
			) : data ? (
				<>
					{!data.temDadosSuficientes ? (
						<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
							Sem dados suficientes no período B ({MONTHS[data.periodoB.mes]}/{data.periodoB.ano}) — o comparador fica mais útil
							conforme mais meses forem importados.
						</div>
					) : null}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<p className="text-xs font-black uppercase text-slate-500">{MONTHS[data.periodoA.mes]}/{data.periodoA.ano}</p>
							<p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(data.periodoA.realizado)}</p>
							<p className="text-xs text-slate-500">Orçado: {formatMoney(data.periodoA.orcado)}</p>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<p className="text-xs font-black uppercase text-slate-500">{MONTHS[data.periodoB.mes]}/{data.periodoB.ano}</p>
							<p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(data.periodoB.realizado)}</p>
							<p className="text-xs text-slate-500">Orçado: {formatMoney(data.periodoB.orcado)}</p>
						</div>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex items-center gap-2 text-sm font-black text-slate-900">
							{data.variacaoOrcamento.absoluta >= 0 ? <TrendingUp size={16} className="text-red-600" /> : <TrendingDown size={16} className="text-emerald-600" />}
							Variação: {formatMoney(Math.abs(data.variacaoOrcamento.absoluta))} ({formatPercent(data.variacaoOrcamento.percentual)})
						</div>
						{/* Roteiro Finan #44 (Explicação automática de variação, usa #43) */}
						{data.explicacaoAutomatica ? (
							<p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
								{data.explicacaoAutomatica}
							</p>
						) : null}
					</div>
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<p className="text-sm font-black text-slate-900">Fornecedores que mais mudaram</p>
						<div className="mt-3 space-y-2">
							{data.maioresVariacoesFornecedores.map((item) => (
								<div key={item.id || item.nome} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
									<span className="font-bold text-slate-700">{item.nome}</span>
									<span className={`font-black ${item.absoluta >= 0 ? "text-red-600" : "text-emerald-600"}`}>
										{formatMoney(item.totalAtual)} ({formatPercent(item.percentual)})
									</span>
								</div>
							))}
							{!data.maioresVariacoesFornecedores.length ? <p className="text-sm text-slate-500">Sem lançamentos suficientes.</p> : null}
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}

function SimuladorTab() {
	const now = new Date();
	const [tipo, setTipo] = useState("fornecedor");
	const [id, setId] = useState("");
	const [percentual, setPercentual] = useState("10");
	const [resultado, setResultado] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleSimular = async () => {
		if (!id.trim()) {
			setError("Informe o ID do fornecedor ou da conta.");
			return;
		}
		setLoading(true);
		setError("");
		try {
			setResultado(await simularFinanCenario({ tipo, id: id.trim(), percentual: Number(percentual), ano: now.getFullYear(), mes: now.getMonth() + 1 }));
		} catch (err) {
			setError(err?.message || "Não foi possível simular.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-2 text-sm font-black text-slate-900">
					<Wand2 size={16} className="text-blue-600" />
					E se...?
				</div>
				<p className="mt-1 text-xs font-semibold text-slate-500">
					Simula o impacto de um aumento/redução percentual sobre um fornecedor ou conta no mês corrente, sem alterar
					nenhum dado real.
				</p>
				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Tipo</span>
						<select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400">
							<option value="fornecedor">Fornecedor</option>
							<option value="conta">Conta/Categoria</option>
						</select>
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">ID</span>
						<input value={id} onChange={(e) => setId(e.target.value)} placeholder="ID do fornecedor/conta" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Variação (%)</span>
						<input type="number" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
				</div>
				<p className="mt-2 text-[11px] font-semibold text-slate-400">
					Dica: veja o ID de um fornecedor na Central de Fornecedores (passe o mouse ou abra o detalhe).
				</p>
				<button type="button" onClick={handleSimular} disabled={loading} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
					{loading ? "Simulando..." : "Simular"}
				</button>
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{resultado ? (
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<p className="text-xs font-black uppercase text-slate-500">Hoje</p>
						<p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(resultado.atual.total)}</p>
						<p className="text-xs text-slate-500">{formatPercent(resultado.atual.usedPercent)} do orçamento</p>
					</div>
					<div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
						<p className="text-xs font-black uppercase text-blue-700">Cenário simulado</p>
						<p className="mt-2 text-2xl font-black text-blue-950">{formatMoney(resultado.simulado.total)}</p>
						<p className="text-xs text-blue-700">{formatPercent(resultado.simulado.usedPercent)} do orçamento</p>
					</div>
					<div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-600">
						<History size={14} className="mr-1.5 inline" />
						Item simulado: {formatMoney(resultado.simulado.valorItemAntes)} → {formatMoney(resultado.simulado.valorItemDepois)}
					</div>
				</div>
			) : null}
		</div>
	);
}
