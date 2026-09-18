import {
	AlertCircle,
	Boxes,
	ClipboardList,
	Loader2,
	PackageCheck,
	RefreshCw,
	UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import InfoCard from "./EstoqueInfoCard";
import ReadingStatus from "./ReadingStatus";
import { listarEquipamentosMapaSempre } from "../services/sempreEstoqueService";

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

export default function BolsaTecnicoPage() {
	const [limit, setLimit] = useState(20);
	const [page, setPage] = useState(1);
	const [filters, setFilters] = useState({
		query: "",
		cidade: "",
		tecnico: "",
		estoque: "",
		empresa: "",
	});
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	async function load(options = {}) {
		setLoading(true);
		setError("");
		try {
			setData(
				await listarEquipamentosMapaSempre({
					limit,
					page: options.page || page,
					refresh: options.refresh === true,
					filters: {
						...filters,
						view: "bolsa",
					},
				}),
			);
		} catch (err) {
			setError(err?.message || "Nao foi possivel consultar a bolsa tecnico.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [limit, page, filters]);

	useEffect(() => {
		if (!data?.refreshing) return undefined;
		const timer = setTimeout(() => {
			load();
		}, 5000);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.refreshing, data?.statusLeitura?.updatedAt]);

	const typeGroups = data?.bolsaPorTipo || [];
	const alertas = data?.alertas || {};
	const treatmentSummary = data?.treatmentSummary || {};
	const filterOptions = data?.filterOptions || {};
	const totalEquipamentos = typeGroups.reduce(
		(sum, group) => sum + (group.totalEquipamentos || 0),
		0,
	);
	const responsaveis = new Set(
		typeGroups.flatMap((group) =>
			(group.responsaveis || []).map((holder) => holder.nome),
		),
	);

	function updateFilter(key, value) {
		setPage(1);
		setFilters((current) => ({ ...current, [key]: value }));
	}

	function clearFilters() {
		setPage(1);
		setFilters({
			query: "",
			cidade: "",
			tecnico: "",
			estoque: "",
			empresa: "",
		});
	}

	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
							ESTOQUE
						</p>
						<h1 className="mt-2 text-2xl font-black text-slate-950">
							Bolsa Tecnico
						</h1>
						<p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
							Mostra equipamentos das ordens de retirada do mapa separados por
							tipo e pelo responsavel atual na API Sempre.
						</p>
					</div>
					<span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
						<PackageCheck size={14} />
						Retiradas do mapa
					</span>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h2 className="text-xl font-black text-slate-950">Leitura salva</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							A bolsa usa a ultima leitura salva. Em novo mapa, o sistema
							consulta apenas MACs novos e registra devolucoes.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<select
							value={limit}
							onChange={(event) => {
								setPage(1);
								setLimit(Number(event.target.value));
							}}
							className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none"
						>
							<option value={20}>20 ordens</option>
							<option value={30}>30 ordens</option>
							<option value={50}>50 ordens</option>
							<option value={100}>100 ordens</option>
						</select>
						<button
							type="button"
							onClick={() => load({ refresh: true })}
							disabled={loading}
							className="inline-flex h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
						>
							{loading ? (
								<Loader2 size={18} className="animate-spin" />
							) : (
								<RefreshCw size={18} />
							)}
							Atualizar leitura
						</button>
					</div>
				</div>

				{error ? (
					<div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
						<AlertCircle size={18} />
						{error}
					</div>
				) : null}

				{data?.refreshing ? (
					<div className="mt-4 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
						<Loader2 size={18} className="animate-spin" />
						Leitura em segundo plano. A bolsa sera atualizada assim que
						terminar.
					</div>
				) : null}

				<ReadingStatus status={data?.statusLeitura} />
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-lg font-black text-slate-950">Filtros</h2>
						<p className="text-xs font-semibold text-slate-500">
							A bolsa nao contabiliza vinculo que bate com o nome do cliente da
							O.S.
						</p>
					</div>
					<button
						type="button"
						onClick={clearFilters}
						className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
					>
						Limpar filtros
					</button>
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
					<input
						value={filters.query}
						onChange={(event) => updateFilter("query", event.target.value)}
						placeholder="OS, cliente, MAC..."
						className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
					/>
					<select
						value={filters.cidade}
						onChange={(event) => updateFilter("cidade", event.target.value)}
						className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none"
					>
						<option value="">Todas cidades</option>
						{(filterOptions.cidades || []).map((item) => (
							<option key={item} value={item}>
								{item}
							</option>
						))}
					</select>
					<input
						value={filters.tecnico}
						onChange={(event) => updateFilter("tecnico", event.target.value)}
						placeholder="Tecnico/vinculo"
						className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
					/>
					<input
						value={filters.estoque}
						onChange={(event) => updateFilter("estoque", event.target.value)}
						placeholder="Estoque"
						className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
					/>
					<input
						value={filters.empresa}
						onChange={(event) => updateFilter("empresa", event.target.value)}
						placeholder="Empresa"
						className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
					/>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-3">
				<InfoCard
					icon={ClipboardList}
					label="Ultima leitura"
					value={formatDate(data?.generatedAt)}
					helper={`${data?.totalMacsNovosConsultados ?? 0} novo(s) / ${data?.totalMacsReaproveitados ?? 0} reaproveitado(s)`}
					tone="blue"
				/>
				<InfoCard
					icon={Boxes}
					label="Equipamentos na bolsa"
					value={totalEquipamentos}
					helper={`${data?.totalConsultadas ?? 0} ordem(ns) analisadas`}
					tone="orange"
				/>
				<InfoCard
					icon={UsersRound}
					label="Responsaveis"
					value={responsaveis.size}
					helper="Tecnico/local atual na Sempre"
				/>
				<InfoCard
					icon={AlertCircle}
					label="Divergencias abertas"
					value={alertas.divergenciasAbertas ?? 0}
					helper={`${treatmentSummary.resolvido ?? 0} resolvida(s)`}
					tone={(alertas.divergenciasAbertas ?? 0) ? "red" : "blue"}
				/>
			</section>

			{loading && !data ? (
				<div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-black text-slate-500">
					<Loader2 className="mx-auto mb-3 animate-spin text-blue-600" />
					Carregando bolsa tecnico...
				</div>
			) : null}

			{typeGroups.map((group) => (
				<section
					key={group.tipo}
					className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
				>
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-lg font-black uppercase tracking-wide text-slate-950">
								{group.tipo}
							</h2>
							<p className="text-xs font-semibold text-slate-500">
								{group.totalEquipamentos} equipamento(s) em {group.totalOrdens}{" "}
								ordem(ns)
							</p>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{(group.responsaveis || []).slice(0, 6).map((holder) => (
							<article
								key={`${group.tipo}-${holder.nome}`}
								className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="break-words text-sm font-black text-slate-900">
											{holder.nome}
										</p>
										<p className="mt-1 text-xs font-semibold text-slate-500">
											{holder.totalOrdens} ordem(ns) do mapa
										</p>
									</div>
									<span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
										{holder.totalEquipamentos}
									</span>
								</div>
								<div className="mt-3 grid gap-2">
									{(holder.items || []).slice(0, 6).map((item) => (
										<div
											key={`${item.documentId}-${item.macs?.join("-")}`}
											className="rounded-xl bg-white p-3 text-xs font-semibold text-slate-600"
										>
											<p className="font-black text-slate-800">
												{item.nomeCliente || "Cliente sem nome"}
											</p>
											<p>
												OS {item.numero || "-"} - {item.cidade || "-"}
											</p>
											<p className="break-words">
												MACs: {item.macs?.join(" / ") || "-"}
											</p>
										</div>
									))}
								</div>
							</article>
						))}
					</div>
					{(group.responsaveis || []).length > 6 ? (
						<p className="mt-3 text-xs font-bold text-slate-500">
							Mostrando os 6 maiores responsaveis deste tipo. Use os filtros ou
							a lista paginada por O.S abaixo.
						</p>
					) : null}
				</section>
			))}

			{data?.items?.length ? (
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-lg font-black text-slate-950">
								O.S da bolsa
							</h2>
							<p className="text-xs font-semibold text-slate-500">
								Pagina {data.page || page} de {data.totalPages || 1}.{" "}
								{data.totalFiltered ?? 0} ordem(ns) filtradas.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setPage((current) => Math.max(1, current - 1))}
								disabled={loading || (data.page || page) <= 1}
								className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
							>
								Anterior
							</button>
							<button
								type="button"
								onClick={() =>
									setPage((current) =>
										Math.min(data.totalPages || current + 1, current + 1),
									)
								}
								disabled={
									loading || (data.page || page) >= (data.totalPages || 1)
								}
								className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
							>
								Proxima
							</button>
						</div>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						{(data.items || [])
							.filter(
								(item) =>
									item.responsibleName &&
									!item.responsibleIsClient &&
									item.classificationStatus !== "nao_encontrado",
							)
							.map((item) => (
								<article
									key={`${item.documentId}-${item.macs?.join("-")}`}
									className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="break-words text-sm font-black text-slate-900">
												{item.numero || "-"}
											</p>
											<p className="mt-1 text-xs font-semibold text-slate-500">
												{item.nomeCliente || "-"} - {item.cidade || "-"}
											</p>
										</div>
										<span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
											{item.macs?.length || 0}
										</span>
									</div>
									<div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600">
										<p>
											Tipo: <strong>{item.tipo || "-"}</strong>
										</p>
										<p>
											Tecnico mapa: <strong>{item.tecnico || "-"}</strong>
										</p>
										<p>
											Vinculo atual:{" "}
											<strong>{item.responsibleName || "-"}</strong>
										</p>
										<p className="break-words">
											MACs: <strong>{item.macs?.join(" / ") || "-"}</strong>
										</p>
									</div>
								</article>
							))}
					</div>
				</section>
			) : null}

			{data?.logsRecent?.length ? (
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4">
						<h2 className="text-lg font-black text-slate-950">
							Log de Devolucoes
						</h2>
						<p className="text-xs font-semibold text-slate-500">
							MACs que sumiram da bolsa tecnico no mapa mais recente.
						</p>
					</div>
					<div className="grid gap-3">
						{data.logsRecent.slice(0, 20).map((log) => (
							<article
								key={`${log.id}-${log.createdAt}`}
								className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p className="text-sm font-black text-slate-900">
											{log.mac}
										</p>
										<p className="mt-1 text-xs font-semibold text-slate-500">
											Saiu de {log.responsavelAnterior || "-"} - OS{" "}
											{log.osAnterior || "-"} - {log.cidadeAnterior || "-"}
										</p>
									</div>
									<span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
										{formatDate(log.createdAt)}
									</span>
								</div>
								<p className="mt-2 text-xs font-semibold text-slate-600">
									{log.message}
								</p>
							</article>
						))}
					</div>
				</section>
			) : null}

			{data && !typeGroups.length ? (
				<div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-sm font-bold text-amber-800">
					Nenhum equipamento com responsavel atual encontrado nas ordens de
					retirada do mapa.
				</div>
			) : null}
		</div>
	);
}
