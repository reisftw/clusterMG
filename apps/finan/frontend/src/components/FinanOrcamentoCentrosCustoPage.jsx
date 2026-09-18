// Pedido do usuário (2026-09-10): "Orçamento" (gestao-orcamentaria/orcamento)
// mostra o gasto AGRUPADO POR CATEGORIA — cada categoria puxa os lançamentos
// dos centros de custo que ela contém, mas nunca lista "todo centro de
// custo, que a pessoa é responsável" num lugar só. Esta página é dedicada
// SÓ aos centros de custo (um card por centro, no mesmo estilo que a tela
// de Configurações já usa), com paginação e 4 indicadores pra mapear quem
// estourou o orçamento — sem tocar em FinanceiroPage.jsx (12k+ linhas,
// documentado como frágil no CLAUDE.md): busca os dados direto do MESMO
// endpoint que a Configurações já usa (GET /orcamento/centros-custo).
//
// Correção (mesmo dia, reporte do usuário): "Só apareceu os estourados, e
// não tem botão pra ver mais/movimentações/editar". Duas causas reais:
// (1) a "média geral de uso" era uma MÉDIA aritmética simples — um punhado
// de centros com uso de 500%-1200% (orçamento mensal pequeno comparado a um
// mês de gasto concentrado) puxava a média pra ~198%, o que fazia quase
// nenhum centro cair no balde "na média" e deixava a leitura sem sentido.
// Trocado por MEDIANA, muito mais resistente a esses outliers. (2) os cards
// nunca tiveram nenhum botão de ação — adicionados "Ver detalhes"
// (movimentações + info completa, tudo dado que já vem no mesmo payload,
// sem chamada nova) e "Editar" (deep-link pra Configurações, que já abre o
// modal de edição de verdade via ?editarCentro=, ver useBudgetConfig.js).
//
// Filtro de mês/ano (pedido do usuário, mesmo dia): "amostrar" Mensal/
// Realizado/Uso de um período específico, em vez do padrão (ano mais
// recente da Matriz, mês mais recente com lançamento). Tudo calculado no
// CLIENTE a partir do MESMO payload já carregado — `config.matrix` (uma
// linha por conta+centro+ano, com os 12 meses) e `center.realizedByCompanyBranch`
// (uma entrada por conta+empresa+filial+ano+mês, já com fornecedor/data/
// valor por lançamento) — sem round-trip novo ao trocar o filtro. Deixado
// de fora de propósito: `scope=period` já existe no backend
// (financeiroBudgetConfigRepository.js:budgetPeriodFilters), mas filtra a
// MESMA cláusula WHERE tanto pra Matriz quanto pra lançamentos — pedir só
// um mês faria a Matriz (pensada pra ano inteiro, orçado/12) devolver 1/12
// do valor certo. Fica mais simples e mais seguro filtrar em JS aqui.
import {
	AlertTriangle,
	ChevronLeft,
	ChevronRight,
	Eye,
	Gauge,
	Pencil,
	RefreshCw,
	Search,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildCostCenterMovementsByMonth, costCenterMovementMonthName } from "../modules/financeiro/utils/costCenterMovements";
import { buscarCentrosCustoOrcamentoFinanceiro } from "../modules/financeiro/services/financeiroService";
import { brl, decimal, integer } from "../modules/financeiro/utils/financeiroFormatters";
import EmptyState from "./EmptyState";
import ModalShell from "./ModalShell";
import PageLoading from "./PageLoading";
import { FINAN_ROUTES } from "../routes";

const PAGE_SIZE = 12;
// Quantos pontos percentuais de uso um centro pode se afastar da mediana
// de uso (entre os centros com orçamento definido) e ainda contar como "na
// média" — ajustável se a leitura não bater com a expectativa.
const TOLERANCIA_NA_MEDIA = 15;

// Padrão (sem filtro de período): usa o que o backend já resolve — orçado
// anualizado da Matriz (ano mais recente com dado) / 12, e realizado do mês
// mais recente com lançamento. `comprometidoMes` é um valor MANUAL "do mês
// atual" (não tem histórico por período), por isso só entra no uso quando
// nenhum período específico está selecionado.
function centerMetrics(center) {
	const budget = Number(center.valorMensal || center.orcamentoMensal || 0);
	const realized = Number(center.realizadoImportado || 0);
	const committed = Number(center.comprometidoMes || 0);
	const used = budget > 0 ? ((realized + committed) / budget) * 100 : 0;
	return { budget, realized, committed, used };
}

// Com filtro de período: orçado vem da Matriz (config.matrix) pro
// ano/mês escolhido — soma todas as contas do centro; se só o ano for
// escolhido, usa a média mensal do ano (total do ano / 12), mesma lógica
// de "Mensal" já usada no resto do app. Realizado vem de
// center.realizedByCompanyBranch filtrado pro mesmo ano/mês (soma as
// quebras de empresa/filial). `comprometido` fica de fora (é só "do mês
// atual", não existe versão histórica dele).
function periodCenterMetrics(center, matrixRowsForCenter, year, month) {
	const yearNum = Number(year);
	const monthNum = month ? Number(month) : 0;
	const yearRows = matrixRowsForCenter.filter((row) => Number(row.year) === yearNum);
	const budget = monthNum
		? yearRows.reduce((sum, row) => sum + Number(row.months?.[monthNum - 1] || 0), 0)
		: yearRows.reduce((sum, row) => sum + Number(row.total || 0), 0) / 12;
	const breakdowns = center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial || [];
	const realized = breakdowns
		.filter((item) => Number(item.year) === yearNum && (!monthNum || Number(item.month) === monthNum))
		.reduce((sum, item) => sum + Number(item.realized ?? item.realizado ?? 0), 0);
	const committed = 0;
	const used = budget > 0 ? (realized / budget) * 100 : 0;
	return { budget, realized, committed, used };
}

function median(values) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function statusBadge(status) {
	switch (status) {
		case "estourado":
			return { label: "Estourado", className: "bg-red-50 text-red-700" };
		case "na_media":
			return { label: "Na média", className: "bg-emerald-50 text-emerald-700" };
		case "sem_orcamento":
			return { label: "Sem orçamento", className: "bg-slate-100 text-slate-500" };
		default:
			return { label: "Fora da média", className: "bg-amber-50 text-amber-700" };
	}
}

function buildRanking(centers) {
	const withBudget = centers.filter((item) => item.metrics.budget > 0);
	const medianUsed = median(withBudget.map((item) => item.metrics.used));
	const classified = centers.map((item) => {
		if (item.metrics.budget <= 0) return { ...item, status: "sem_orcamento" };
		if (item.metrics.used > 100) return { ...item, status: "estourado" };
		if (Math.abs(item.metrics.used - medianUsed) <= TOLERANCIA_NA_MEDIA) {
			return { ...item, status: "na_media" };
		}
		return { ...item, status: "fora_da_media" };
	});
	return { classified, medianUsed };
}

function CenterDetailsModal({ item, accountById, initialPeriodKey, onClose }) {
	const { center, metrics } = item;
	// UX_AUDIT.md / teste de carga k6 (2026-09-10): a lista principal desta
	// página carrega SEM o detalhe de movimentações por fornecedor (payload
	// leve — ver financeiroBudgetConfigRepository.js), então `center` aqui
	// não tem `realizedByCompanyBranch[].movements` preenchido. Ao abrir o
	// modal, busca sob demanda SÓ pra este centro
	// (`incluirMovimentacoes=1&centroCustoId=`) — poucas dezenas/centenas de
	// linhas, não os ~5.000 lançamentos inteiros que a lista evita buscar.
	const [detailedCenter, setDetailedCenter] = useState(null);
	const [loadingMovements, setLoadingMovements] = useState(true);
	const [movementsError, setMovementsError] = useState("");

	useEffect(() => {
		let active = true;
		setLoadingMovements(true);
		setMovementsError("");
		buscarCentrosCustoOrcamentoFinanceiro({ incluirMovimentacoes: "1", centroCustoId: center.id })
			.then((response) => {
				if (!active) return;
				const found = (response?.config?.centers || []).find((item2) => item2.id === center.id);
				setDetailedCenter(found || center);
			})
			.catch((err) => {
				if (!active) return;
				setMovementsError(err?.message || "Não foi possível carregar as movimentações.");
				setDetailedCenter(center);
			})
			.finally(() => {
				if (active) setLoadingMovements(false);
			});
		return () => {
			active = false;
		};
	}, [center]);

	const monthGroups = useMemo(
		() => (detailedCenter ? buildCostCenterMovementsByMonth(detailedCenter) : []),
		[detailedCenter],
	);
	// Se um período (ano/mês) estava selecionado na tela quando o usuário
	// clicou em "Ver detalhes", já abre o modal nesse mês — senão cai no
	// mais recente (monthGroups[0], já ordenado do mais novo pro mais velho).
	const [activeKey, setActiveKey] = useState(initialPeriodKey || "");
	useEffect(() => {
		if (!monthGroups.length) return;
		if (monthGroups.some((group) => group.key === activeKey)) return;
		setActiveKey(monthGroups[0].key);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [monthGroups]);
	const activeGroup = monthGroups.find((group) => group.key === activeKey) || monthGroups[0];

	return (
		<ModalShell
			open
			onClose={onClose}
			size="3xl"
			title={center.nome}
			description={`${center.codigo || center.id} · Responsável: ${center.responsavel || "Não informado"} · ${center.diretoria || "Diretoria não informada"}`}
		>
			<>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-xs font-bold text-slate-500">Mensal</p>
						<p className="mt-1 text-sm font-black text-slate-950">{brl.format(metrics.budget)}</p>
					</div>
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-xs font-bold text-slate-500">Realizado</p>
						<p className="mt-1 text-sm font-black text-slate-950">{brl.format(metrics.realized)}</p>
					</div>
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-xs font-bold text-slate-500">Comprometido</p>
						<p className="mt-1 text-sm font-black text-slate-950">{brl.format(metrics.committed)}</p>
					</div>
					<div className="rounded-xl bg-slate-50 p-3">
						<p className="text-xs font-bold text-slate-500">Uso</p>
						<p className="mt-1 text-sm font-black text-slate-950">{decimal.format(metrics.used)}%</p>
					</div>
				</div>

				{(center.contasFinanceiras || []).length ? (
					<div className="mt-4 flex flex-wrap gap-2">
						{(center.contasFinanceiras || []).map((accountId) => {
							const account = accountById.get(accountId);
							return account ? (
								<span key={accountId} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
									{account.codigo || account.id} - {account.nome}
								</span>
							) : null;
						})}
					</div>
				) : null}

				<div className="mt-6">
					<div className="flex items-center justify-between gap-2">
						<p className="text-xs font-black uppercase text-slate-500">Movimentações</p>
						{monthGroups.length ? (
							<div className="flex flex-wrap gap-2">
								{monthGroups.map((group) => (
									<button
										key={group.key}
										type="button"
										onClick={() => setActiveKey(group.key)}
										className={`rounded-lg border px-2.5 py-1 text-xs font-black ${
											(activeGroup?.key || "") === group.key
												? "border-blue-600 bg-blue-600 text-white"
												: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
										}`}
									>
										{group.label}
									</button>
								))}
							</div>
						) : null}
					</div>

					{loadingMovements ? (
						<p className="mt-3 text-sm font-bold text-slate-500">Carregando movimentações...</p>
					) : movementsError ? (
						<p className="mt-3 text-sm font-bold text-red-600">{movementsError}</p>
					) : activeGroup ? (
						<div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
							<div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
								<p className="text-xs font-black text-slate-700">{activeGroup.label}</p>
								<p className="text-sm font-black text-slate-950">{brl.format(activeGroup.total)}</p>
							</div>
							<div className="max-h-72 overflow-y-auto">
								<table className="w-full text-sm">
									<thead className="sticky top-0 bg-white text-left text-xs font-black uppercase text-slate-500">
										<tr>
											<th className="px-4 py-2">Data</th>
											<th className="px-4 py-2">Fornecedor</th>
											<th className="px-4 py-2">Documento</th>
											<th className="px-4 py-2 text-right">Valor</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{activeGroup.rows.map((movement, index) => (
											<tr key={movement.id || `${activeGroup.key}-${index}`}>
												<td className="px-4 py-2 font-bold text-slate-700">{movement.date || "-"}</td>
												<td className="px-4 py-2 font-bold text-slate-900">{movement.supplier || "-"}</td>
												<td className="px-4 py-2 text-slate-600">{movement.document || "-"}</td>
												<td className="px-4 py-2 text-right font-black text-slate-950">{brl.format(Number(movement.value || 0))}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					) : (
						<p className="mt-3 text-sm font-bold text-slate-500">Nenhuma movimentação importada para este centro.</p>
					)}
				</div>

				<div className="mt-6 flex justify-end">
					<Link
						to={`${FINAN_ROUTES.ORCAMENTO_CONFIGURACOES}?editarCentro=${encodeURIComponent(center.id)}`}
						className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-slate-800"
					>
						<Pencil size={14} /> Editar este centro
					</Link>
				</div>
			</>
		</ModalShell>
	);
}

export default function FinanOrcamentoCentrosCustoPage() {
	const [config, setConfig] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("todos");
	const [yearFilter, setYearFilter] = useState("");
	const [monthFilter, setMonthFilter] = useState("");
	const [page, setPage] = useState(1);
	const [detailsItem, setDetailsItem] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			// A resposta real do controller é { ok: true, config: {...} } (ver
			// financeiro.js:getBudgetCostCenters) — não o config direto na raiz.
			const response = await buscarCentrosCustoOrcamentoFinanceiro();
			setConfig(response?.config || response || null);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os centros de custo.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const accountById = useMemo(
		() => new Map((config?.accounts || []).map((account) => [account.id, account])),
		[config],
	);

	const matrixByCenter = useMemo(() => {
		const map = new Map();
		for (const row of config?.matrix || []) {
			const list = map.get(row.costCenterId) || [];
			list.push(row);
			map.set(row.costCenterId, list);
		}
		return map;
	}, [config]);

	const availableYears = useMemo(() => {
		const years = new Set((config?.matrix || []).map((row) => Number(row.year)).filter(Boolean));
		return [...years].sort((a, b) => b - a);
	}, [config]);

	// Volta pra página 1 sempre que qualquer filtro muda.
	const resetPage = (fn) => (value) => {
		fn(value);
		setPage(1);
	};

	const { classified, medianUsed, estouradoCount, naMediaCount, foraDaMediaCount, semOrcamentoCount, maisEstourado, exemploNaMedia } =
		useMemo(() => {
			const centers = (config?.centers || [])
				// Centro sintético só agrega os filhos analíticos (soma calculada
				// em outras telas) — quem carrega orçamento/realizado/responsável
				// de verdade é o centro analítico, que é o que interessa aqui.
				.filter((center) => center.tipoPlano !== "S")
				.map((center) => ({
					center,
					metrics: yearFilter
						? periodCenterMetrics(center, matrixByCenter.get(center.id) || [], yearFilter, monthFilter)
						: centerMetrics(center),
				}));
			const { classified: withStatus, medianUsed: med } = buildRanking(centers);
			const estourados = withStatus.filter((item) => item.status === "estourado");
			const naMedia = withStatus.filter((item) => item.status === "na_media");
			const foraDaMedia = withStatus.filter((item) => item.status === "fora_da_media");
			const semOrcamento = withStatus.filter((item) => item.status === "sem_orcamento");
			const pior = estourados.length
				? estourados.reduce((max, item) => (item.metrics.used > max.metrics.used ? item : max))
				: null;
			const exemplo = naMedia.length
				? naMedia.reduce((closest, item) =>
						Math.abs(item.metrics.used - med) < Math.abs(closest.metrics.used - med) ? item : closest,
					)
				: null;
			return {
				classified: withStatus,
				medianUsed: med,
				estouradoCount: estourados.length,
				naMediaCount: naMedia.length,
				foraDaMediaCount: foraDaMedia.length,
				semOrcamentoCount: semOrcamento.length,
				maisEstourado: pior,
				exemploNaMedia: exemplo,
			};
		}, [config, matrixByCenter, yearFilter, monthFilter]);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return classified
			.filter((item) => {
				if (statusFilter !== "todos" && item.status !== statusFilter) return false;
				if (!query) return true;
				const haystack = [item.center.codigo, item.center.id, item.center.nome, item.center.responsavel, item.center.diretoria]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return haystack.includes(query);
			})
			.sort((a, b) => b.metrics.used - a.metrics.used);
	}, [classified, search, statusFilter]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

	const statusOptions = [
		["todos", "Todos", classified.length],
		["estourado", "Estourados", estouradoCount],
		["na_media", "Na média", naMediaCount],
		["fora_da_media", "Fora da média", foraDaMediaCount],
		["sem_orcamento", "Sem orçamento", semOrcamentoCount],
	];

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
							<Gauge size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Planejamento</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Centros de Custo</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Todo centro de custo analítico, um por card, com quem é o responsável e quanto já foi usado do
								orçamento mensal — pra mapear rápido quem estourou e quem está dentro do esperado. Clique em
								"Todos" pra ver os {integer.format(classified.length)} centros de uma vez.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={17} />
						Atualizar
					</button>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
					<div className="flex items-center gap-2 text-red-700">
						<TrendingUp size={16} />
						<p className="text-xs font-black uppercase">Mais estourado</p>
					</div>
					{maisEstourado ? (
						<>
							<p className="mt-2 truncate text-lg font-black text-slate-950" title={maisEstourado.center.nome}>
								{maisEstourado.center.codigo || maisEstourado.center.id} · {maisEstourado.center.nome}
							</p>
							<p className="mt-1 text-2xl font-black text-red-700">{decimal.format(maisEstourado.metrics.used)}%</p>
							<p className="mt-1 text-xs font-bold text-slate-500">
								{brl.format(maisEstourado.metrics.realized + maisEstourado.metrics.committed)} de{" "}
								{brl.format(maisEstourado.metrics.budget)} orçado
							</p>
						</>
					) : (
						<p className="mt-3 text-sm font-bold text-slate-500">Nenhum centro estourou o orçamento.</p>
					)}
				</div>

				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
					<div className="flex items-center gap-2 text-emerald-700">
						<Gauge size={16} />
						<p className="text-xs font-black uppercase">Na média</p>
					</div>
					{exemploNaMedia ? (
						<>
							<p className="mt-2 truncate text-lg font-black text-slate-950" title={exemploNaMedia.center.nome}>
								{exemploNaMedia.center.codigo || exemploNaMedia.center.id} · {exemploNaMedia.center.nome}
							</p>
							<p className="mt-1 text-2xl font-black text-emerald-700">{decimal.format(exemploNaMedia.metrics.used)}%</p>
							<p className="mt-1 text-xs font-bold text-slate-500">Mediana geral de uso: {decimal.format(medianUsed)}%</p>
						</>
					) : (
						<p className="mt-3 text-sm font-bold text-slate-500">Sem centro representativo da média ainda.</p>
					)}
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-2 text-slate-500">
						<AlertTriangle size={16} className="text-red-500" />
						<p className="text-xs font-black uppercase">Centros estourados</p>
					</div>
					<p className="mt-2 text-2xl font-black text-slate-950">{integer.format(estouradoCount)}</p>
					<p className="mt-1 text-xs font-bold text-slate-500">de {integer.format(classified.length)} centros analíticos</p>
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-2 text-slate-500">
						<TrendingDown size={16} className="text-emerald-500" />
						<p className="text-xs font-black uppercase">Centros na média</p>
					</div>
					<p className="mt-2 text-2xl font-black text-slate-950">{integer.format(naMediaCount)}</p>
					<p className="mt-1 text-xs font-bold text-slate-500">
						uso a até {TOLERANCIA_NA_MEDIA} pontos da mediana ({decimal.format(medianUsed)}%)
					</p>
				</div>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs font-black uppercase text-slate-500">Amostrar período:</span>
						<select
							value={yearFilter}
							onChange={(event) => {
								resetPage(setYearFilter)(event.target.value);
								if (!event.target.value) resetPage(setMonthFilter)("");
							}}
							className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400"
						>
							<option value="">Todos os anos (padrão)</option>
							{availableYears.map((year) => (
								<option key={year} value={year}>
									{year}
								</option>
							))}
						</select>
						<select
							value={monthFilter}
							onChange={(event) => resetPage(setMonthFilter)(event.target.value)}
							disabled={!yearFilter}
							className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400 disabled:opacity-40"
						>
							<option value="">Todos os meses do ano</option>
							{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
								<option key={month} value={month}>
									{costCenterMovementMonthName(month)}
								</option>
							))}
						</select>
						{yearFilter ? (
							<button
								type="button"
								onClick={() => {
									resetPage(setYearFilter)("");
									resetPage(setMonthFilter)("");
								}}
								className="text-xs font-black text-blue-700 underline hover:text-blue-800"
							>
								Limpar período
							</button>
						) : null}
						{yearFilter ? (
							<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
								Mostrando {monthFilter ? `${costCenterMovementMonthName(Number(monthFilter))}/${yearFilter}` : `o ano de ${yearFilter}`} —
								comprometido não entra no uso (só existe "do mês atual")
							</span>
						) : (
							<span className="text-xs font-bold text-slate-400">
								Sem filtro: usa o ano mais recente da Matriz e o mês mais recente com lançamento, por centro.
							</span>
						)}
					</div>

					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<label className="relative block flex-1">
							<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
							<input
								value={search}
								onChange={(event) => resetPage(setSearch)(event.target.value)}
								placeholder="Buscar por código, nome, responsável ou diretoria..."
								className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
							/>
						</label>
						<div className="flex flex-wrap gap-2">
							{statusOptions.map(([value, label, count]) => (
								<button
									key={value}
									type="button"
									onClick={() => resetPage(setStatusFilter)(value)}
									className={`min-h-9 rounded-xl border px-3 text-xs font-black ${
										statusFilter === value
											? "border-blue-600 bg-blue-600 text-white"
											: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
									}`}
								>
									{label} ({integer.format(count)})
								</button>
							))}
						</div>
					</div>
				</div>
			</div>

			{loading ? (
				<PageLoading label="Carregando centros de custo..." />
			) : filtered.length ? (
				<>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{paginated.map((item) => {
							const { center, metrics, status } = item;
							const badge = statusBadge(status);
							const barColor =
								status === "estourado" ? "bg-red-500" : status === "sem_orcamento" ? "bg-slate-300" : status === "na_media" ? "bg-emerald-500" : "bg-amber-400";
							return (
								<article key={center.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-xs font-black uppercase tracking-wide text-indigo-700">
												{center.codigo || center.id}
											</p>
											<h3 className="mt-1 truncate text-base font-black text-slate-950" title={center.nome}>
												{center.nome}
											</h3>
											<p className="mt-1 truncate text-xs font-bold text-slate-500" title={center.responsavel || ""}>
												Responsável: {center.responsavel || "Não informado"}
											</p>
											<p className="mt-1 truncate text-xs font-bold text-slate-400" title={center.diretoria || ""}>
												{center.diretoria || "Diretoria não informada"}
											</p>
										</div>
										<span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${badge.className}`}>{badge.label}</span>
									</div>
									<div className="mt-4 h-3 rounded-full bg-slate-100">
										<div
											className={`h-full rounded-full ${barColor}`}
											style={{ width: `${Math.min(100, Math.max(metrics.used > 0 ? 4 : 0, metrics.used))}%` }}
										/>
									</div>
									<div className="mt-4 grid grid-cols-3 gap-2">
										<div>
											<p className="text-xs font-bold text-slate-500">{yearFilter ? "Orçado" : "Mensal"}</p>
											<p className="text-sm font-black text-slate-950">{brl.format(metrics.budget)}</p>
										</div>
										<div>
											<p className="text-xs font-bold text-slate-500">Realizado</p>
											<p className="text-sm font-black text-slate-950">{brl.format(metrics.realized)}</p>
										</div>
										<div>
											<p className="text-xs font-bold text-slate-500">Uso</p>
											<p className={`text-sm font-black ${status === "estourado" ? "text-red-700" : "text-slate-950"}`}>
												{decimal.format(metrics.used)}%
											</p>
										</div>
									</div>
									<div className="mt-4 flex flex-wrap gap-2 pt-1">
										<button
											type="button"
											onClick={() => setDetailsItem(item)}
											className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
										>
											<Eye size={14} /> Ver detalhes
										</button>
										<Link
											to={`${FINAN_ROUTES.ORCAMENTO_CONFIGURACOES}?editarCentro=${encodeURIComponent(center.id)}`}
											className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50"
										>
											<Pencil size={14} /> Editar
										</Link>
									</div>
								</article>
							);
						})}
					</div>

					<div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
						<p className="text-xs font-bold text-slate-500">
							{integer.format(filtered.length)} centro(s) de custo · página {integer.format(safePage)} de {integer.format(totalPages)}
						</p>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setPage((current) => Math.max(1, current - 1))}
								disabled={safePage <= 1}
								className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
							>
								<ChevronLeft size={14} /> Anterior
							</button>
							<button
								type="button"
								onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
								disabled={safePage >= totalPages}
								className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
							>
								Próxima <ChevronRight size={14} />
							</button>
						</div>
					</div>
				</>
			) : (
				<EmptyState
					icon={Gauge}
					title={`Nenhum centro de custo encontrado${statusFilter !== "todos" ? " para este filtro" : ""}`}
					description={
						statusFilter !== "todos" || search.trim()
							? "Tente limpar a busca ou trocar o filtro de status acima."
							: "Nenhum centro de custo analítico foi encontrado no orçamento importado."
					}
					action={
						statusFilter !== "todos" || search.trim() ? (
							<button
								type="button"
								onClick={() => {
									setStatusFilter("todos");
									setSearch("");
								}}
								className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50"
							>
								Limpar filtros
							</button>
						) : null
					}
				/>
			)}

			{detailsItem ? (
				<CenterDetailsModal
					item={detailsItem}
					accountById={accountById}
					initialPeriodKey={yearFilter && monthFilter ? `${yearFilter}-${String(monthFilter).padStart(2, "0")}` : ""}
					onClose={() => setDetailsItem(null)}
				/>
			) : null}
		</div>
	);
}
