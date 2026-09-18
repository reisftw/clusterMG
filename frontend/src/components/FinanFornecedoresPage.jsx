// Central de Fornecedores (roteiro Finan #8) + Dependência de fornecedor
// (roteiro Finan #9) — agrega finan_orcamento_lancamentos por fornecedor,
// sem fonte de dado nova.
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, TrendingUp, Users2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanFornecedorDetalhe, fetchFinanFornecedores } from "../api/finanApi";
import EmptyState from "./EmptyState";
import ModalShell from "./ModalShell";
import PageLoading from "./PageLoading";
import StatCard from "./StatCard";

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

export default function FinanFornecedoresPage() {
	const [ano] = useState(new Date().getFullYear());
	const [data, setData] = useState({ fornecedores: [], grandTotal: 0, concentracaoTop3Percent: 0 });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState(null);
	// UX_AUDIT.md, Fase 2 (Quick Win): card "Concentração top 3" agora
	// funciona como filtro — clicar nele restringe a tabela aos 3 maiores,
	// exatamente o que o número do card representa.
	const [top3Only, setTop3Only] = useState(false);
	// UX_AUDIT.md, Fase 4 (Otimização de fluxos): paginação — já tinha
	// busca, faltava paginação pra listas longas de fornecedores.
	const [page, setPage] = useState(1);
	const PAGE_SIZE = 20;

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setData(await fetchFinanFornecedores(ano));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os fornecedores.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ano]);

	const filtered = (top3Only ? (data.fornecedores || []).slice(0, 3) : data.fornecedores || []).filter(
		(item) => !query.trim() || String(item.nome || "").toLowerCase().includes(query.trim().toLowerCase()),
	);
	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
	const resetPage = (fn) => (value) => {
		fn(value);
		setPage(1);
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Users2 size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Operação</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Central de Fornecedores</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Ranking de gasto por fornecedor em {ano}, a partir do orçamento importado.
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

			<div className="grid gap-4 sm:grid-cols-3">
				<StatCard label="Fornecedores com lançamento" value={data.fornecedores?.length || 0} />
				<StatCard label="Total gasto no ano" value={formatMoney(data.grandTotal)} />
				<button
					type="button"
					onClick={() => resetPage(setTop3Only)((current) => !current)}
					className={`rounded-2xl border p-5 text-left shadow-sm transition ${
						top3Only
							? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
							: (data.concentracaoTop3Percent || 0) > 50
								? "border-amber-200 bg-amber-50 hover:border-amber-300"
								: "border-slate-200 bg-white hover:border-blue-200"
					}`}
				>
					<div className="flex items-center gap-2">
						{(data.concentracaoTop3Percent || 0) > 50 ? <AlertTriangle size={16} className="text-amber-600" /> : <TrendingUp size={16} className="text-slate-400" />}
						<p className="text-xs font-black uppercase text-slate-500">Concentração top 3</p>
					</div>
					<p className="mt-2 text-2xl font-black text-slate-950">
						{Number(data.concentracaoTop3Percent || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
					</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">
						{top3Only ? "Mostrando só os 3 maiores — clique de novo pra ver todos" : "do gasto do ano concentrado nos 3 maiores fornecedores"}
					</p>
				</button>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<label className="relative block">
					<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
					<input
						value={query}
						onChange={(event) => resetPage(setQuery)(event.target.value)}
						placeholder="Buscar fornecedor..."
						className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
					/>
				</label>
			</div>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{loading ? (
					<PageLoading label="Carregando fornecedores..." />
				) : !filtered.length ? (
					<EmptyState
						icon={Users2}
						title="Nenhum fornecedor encontrado"
						description={
							top3Only
								? "Nenhum dos 3 maiores fornecedores bate com essa busca."
								: query.trim()
									? "Tente outro termo de busca."
									: "Ainda não há lançamentos de fornecedores importados para este ano."
						}
					/>
				) : (
					<>
						{/* UX_AUDIT.md, Fase 5 (Responsividade): mesmo padrão das
						páginas de Contas — cards empilhados abaixo de `sm`. */}
						<div className="divide-y divide-slate-100 sm:hidden">
							{paginated.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => setSelected(item)}
									className="block w-full p-4 text-left hover:bg-blue-50/40"
								>
									<p className="truncate font-black text-slate-950">{item.nome}</p>
									<div className="mt-2 flex items-center justify-between text-sm">
										<span className="font-semibold text-slate-700">{formatMoney(item.total)}</span>
										<span className="font-semibold text-slate-500">
											{Number(item.percentual || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total
										</span>
									</div>
									<div className="mt-1 flex items-center justify-between text-xs text-slate-500">
										<span>Média mensal: {formatMoney(item.mediaMensal)}</span>
										<span>Último: {formatDate(item.ultimo_lancamento)}</span>
									</div>
								</button>
							))}
						</div>

						<div className="hidden overflow-x-auto sm:block">
							<table className="w-full min-w-[760px] text-sm">
								<thead>
									<tr className="border-b border-slate-100 text-left">
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Fornecedor</th>
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Total no ano</th>
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">% do total</th>
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Média mensal</th>
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Último lançamento</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{paginated.map((item) => (
										<tr key={item.id} className="cursor-pointer hover:bg-blue-50/40" onClick={() => setSelected(item)}>
											<td className="px-5 py-3 font-black text-slate-950">{item.nome}</td>
											<td className="px-5 py-3 font-semibold text-slate-700">{formatMoney(item.total)}</td>
											<td className="px-5 py-3 font-semibold text-slate-700">
												{Number(item.percentual || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
											</td>
											<td className="px-5 py-3 font-semibold text-slate-700">{formatMoney(item.mediaMensal)}</td>
											<td className="px-5 py-3 font-semibold text-slate-700">{formatDate(item.ultimo_lancamento)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>

			{!loading && filtered.length > PAGE_SIZE ? (
				<div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
					<p className="text-xs font-bold text-slate-500">
						{filtered.length} fornecedor(es) · página {safePage} de {totalPages}
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
			) : null}

			{selected ? <FornecedorDetailModal fornecedor={selected} ano={ano} onClose={() => setSelected(null)} /> : null}
		</div>
	);
}

function FornecedorDetailModal({ fornecedor, ano, onClose }) {
	const [detail, setDetail] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		fetchFinanFornecedorDetalhe(fornecedor.id, ano)
			.then((data) => {
				if (active) setDetail(data);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [fornecedor.id, ano]);

	return (
		<ModalShell open onClose={onClose} size="2xl" title={fornecedor.nome} description="Fornecedor">
			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Carregando...</p>
			) : (
				<>
					{detail?.score ? (
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<div className="flex items-center justify-between">
								<p className="text-xs font-black uppercase text-slate-500">Supplier Score</p>
								<p
									className={`text-2xl font-black ${
										detail.score.notaFinal >= 80
											? "text-emerald-600"
											: detail.score.notaFinal >= 50
												? "text-amber-600"
												: "text-red-600"
									}`}
								>
									{detail.score.notaFinal}
								</p>
							</div>
							<div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-500">
								<div>
									<p className="text-sm font-black text-slate-900">{detail.score.fatores.regularidadeCusto.nota}</p>
									Regularidade de custo
								</div>
								<div>
									<p className="text-sm font-black text-slate-900">{detail.score.fatores.documentacao.nota}</p>
									Documentação (NF vinculada)
								</div>
								<div>
									<p className="text-sm font-black text-slate-900">{detail.score.fatores.historico.nota}</p>
									Histórico/contrato
								</div>
							</div>
						</div>
					) : null}
					<div className="mt-5">
						<p className="text-xs font-black uppercase text-slate-500">Evolução mensal ({ano})</p>
						<div className="mt-3 space-y-2">
							{(detail?.mensal || []).map((row) => (
								<div key={row.mes} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
									<span className="font-bold text-slate-700">{String(row.mes).padStart(2, "0")}/{ano}</span>
									<span className="font-semibold text-slate-900">{formatMoney(row.total)}</span>
								</div>
							))}
							{!detail?.mensal?.length ? <p className="text-sm text-slate-500">Sem lançamentos no ano.</p> : null}
						</div>
					</div>

					<div className="mt-5">
						<p className="text-xs font-black uppercase text-slate-500">Maiores lançamentos</p>
						<div className="mt-3 space-y-2">
							{(detail?.topLancamentos || []).map((row) => (
								<div key={row.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
									<span className="font-bold text-slate-700">
										{formatDate(row.data)} · {row.conta_nome || "Conta não informada"}
									</span>
									<span className="font-semibold text-slate-900">{formatMoney(row.realizado)}</span>
								</div>
							))}
						</div>
					</div>
				</>
			)}
		</ModalShell>
	);
}
