import {
	AlertTriangle,
	CheckCircle2,
	Download,
	Eye,
	Filter,
	RefreshCw,
	Search,
	ShieldCheck,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	buildCancelamentosExportUrl,
	buscarCancelamentos,
	buscarCompetenciasCancelamentos,
	buscarDetalheCancelamento,
	buscarFiltrosCancelamentos,
	buscarHistoricoSyncCancelamentos,
	buscarResumoCancelamentos,
	competenciaAtual,
	sincronizarCompetenciaCancelamentos,
	sincronizarHistoricoCancelamentos,
	validarCompetenciaCancelamentos,
} from "../services/serviceOrderCancellationsService";

const NUMBER = new Intl.NumberFormat("pt-BR");
const PERCENT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
const EMPTY_SUMMARY = {
	geral: { ftth: 0, naoFtth: 0, total: 0 },
	empresas: {},
	equipamentos: { comEquipamento: 0, semEquipamento: 0 },
};

function formatNumber(value) {
	return NUMBER.format(Number(value || 0));
}

function formatPercent(value) {
	return `${PERCENT.format(Number(value || 0))}%`;
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("pt-BR");
}

function competenciaLabel(value) {
	if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return value || "-";
	const [year, month] = value.split("-");
	const date = new Date(Number(year), Number(month) - 1, 1);
	return new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		year: "numeric",
	}).format(date);
}

function KpiCard({ title, value, helper, tone = "blue" }) {
	const tones = {
		blue: "bg-blue-50 text-blue-700 border-blue-100",
		green: "bg-emerald-50 text-emerald-700 border-emerald-100",
		orange: "bg-orange-50 text-orange-700 border-orange-100",
		red: "bg-red-50 text-red-700 border-red-100",
		slate: "bg-slate-50 text-slate-700 border-slate-100",
	};
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
				{title}
			</p>
			<div className="mt-3 flex items-end justify-between gap-3">
				<p className="text-3xl font-black text-slate-950">{value}</p>
				<span className={`rounded-2xl border px-3 py-2 text-xs font-black ${tones[tone]}`}>
					{helper}
				</span>
			</div>
		</div>
	);
}

function StatusBadge({ status }) {
	const map = {
		NOT_SYNCED: "bg-slate-100 text-slate-700",
		SYNCING: "bg-blue-100 text-blue-700",
		SYNCED: "bg-emerald-100 text-emerald-700",
		ERROR: "bg-red-100 text-red-700",
		UPDATE_AVAILABLE: "bg-amber-100 text-amber-700",
		VALIDATED: "bg-emerald-100 text-emerald-700",
		PENDING: "bg-amber-100 text-amber-700",
		REQUIRES_REVALIDATION: "bg-red-100 text-red-700",
	};
	return (
		<span className={`rounded-full px-3 py-1 text-xs font-black ${map[status] || map.NOT_SYNCED}`}>
			{status || "NOT_SYNCED"}
		</span>
	);
}

function CompactTable({ title, columns, rows, empty = "Sem dados." }) {
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="text-lg font-black text-slate-950">{title}</h2>
			<div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
				<table className="min-w-full divide-y divide-slate-100 text-left text-sm">
					<thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
						<tr>
							{columns.map((column) => (
								<th key={column.key} className={column.className || "px-4 py-3"}>
									{column.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{rows.length ? (
							rows.map((row, index) => (
								<tr key={`${row.name || row.cidade || row.regional || row.tecnologia}-${index}`}>
									{columns.map((column) => (
										<td key={column.key} className={column.cellClassName || "px-4 py-3 font-semibold text-slate-700"}>
											{column.render ? column.render(row) : row[column.key]}
										</td>
									))}
								</tr>
							))
						) : (
							<tr>
								<td colSpan={columns.length} className="px-4 py-8 text-center text-sm font-black text-slate-400">
									{empty}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function DetailModal({ item, onClose }) {
	if (!item) return null;
	const groups = [
		["Cliente", [
			["Nome", item.clienteNome],
			["Código", item.codigoCliente],
			["ID cliente", item.clienteId],
			["ID serviço", item.clienteServicoId],
			["Plano", item.numeroPlano],
		]],
		["Serviço", [
			["Empresa", item.empresa],
			["Serviço", item.servico],
			["Tecnologia original", item.tecnologiaOriginal],
			["Classificação", item.classificacaoTecnologia],
			["Velocidade", item.velocidade],
			["Grupo serviço", item.grupoServico],
			["Grupo padrão", item.grupoPadrao],
		]],
		["Cancelamento", [
			["Data", formatDate(item.dataCancelamento)],
			["Motivo", item.motivoCancelamento],
			["Usuário", item.usuarioCancelamento],
		]],
		["Localização e auditoria", [
			["Cidade", item.cidade],
			["Regional", item.regionalNome],
			["Bairro", item.bairro],
			["Endereço", item.endereco],
			["Equipamento comodato", item.equipamentoComodato || "Sem equipamento"],
			["Valor", item.valor],
			["Faturas geradas", item.faturasGeradas],
			["Faturas quitadas", item.faturasQuitadas],
			["Faturas em aberto", item.faturasEmAberto],
		]],
	];
	return (
		<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/55 p-4">
			<div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
				<div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
							Cancelamento
						</p>
						<h2 className="mt-1 text-2xl font-black text-slate-950">
							{item.clienteNome || "Cliente sem nome"}
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 p-2 text-slate-600"
						aria-label="Fechar"
					>
						<X size={18} />
					</button>
				</div>
				<div className="grid gap-4 p-6 md:grid-cols-2">
					{groups.map(([title, rows]) => (
						<section key={title} className="rounded-2xl border border-slate-200 p-4">
							<h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">
								{title}
							</h3>
							<div className="mt-3 divide-y divide-slate-100">
								{rows.map(([label, value]) => (
									<div key={label} className="grid grid-cols-[150px_1fr] gap-3 py-2 text-sm">
										<span className="font-black text-slate-500">{label}</span>
										<span className="break-words font-semibold text-slate-900">
											{value || "-"}
										</span>
									</div>
								))}
							</div>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}

export default function ServiceOrderCancellationsPage() {
	const [competencia, setCompetencia] = useState(competenciaAtual());
	const [summary, setSummary] = useState(null);
	const [competencias, setCompetencias] = useState([]);
	const [filters, setFilters] = useState({});
	const [items, setItems] = useState([]);
	const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
	const [syncHistory, setSyncHistory] = useState([]);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState("");
	const [detail, setDetail] = useState(null);
	const [historyModalOpen, setHistoryModalOpen] = useState(false);
	const [historyRange, setHistoryRange] = useState({
		startCompetencia: "2026-01",
		endCompetencia: competenciaAtual(),
	});
	const [tableFilters, setTableFilters] = useState({
		empresa: "",
		classificacao: "",
		tecnologia: "",
		regional: "",
		cidade: "",
		motivo: "",
		servico: "",
		q: "",
	});

	const currentSummary = useMemo(
		() => ({
			...EMPTY_SUMMARY,
			...(summary?.competencia?.summary || {}),
			geral: {
				...EMPTY_SUMMARY.geral,
				...(summary?.competencia?.summary?.geral || {}),
			},
			empresas: summary?.competencia?.summary?.empresas || {},
			equipamentos: {
				...EMPTY_SUMMARY.equipamentos,
				...(summary?.competencia?.summary?.equipamentos || {}),
			},
		}),
		[summary],
	);
	const empresas = useMemo(
		() => currentSummary.empresas || {},
		[currentSummary],
	);
	const status = summary?.competencia?.status || "NOT_SYNCED";
	const validationStatus = summary?.competencia?.validationStatus || "PENDING";

	async function loadStaticData() {
		const [competenciasResponse, historyResponse] = await Promise.all([
			buscarCompetenciasCancelamentos(),
			buscarHistoricoSyncCancelamentos(),
		]);
		setCompetencias(competenciasResponse?.items || []);
		setSyncHistory(historyResponse?.items || []);
	}

	async function loadCompetencia(
		nextPage = pagination.page,
		nextFilters = tableFilters,
		nextLimit = pagination.limit,
	) {
		setLoading(true);
		setError("");
		try {
			const [summaryResponse, filtersResponse, tableResponse] = await Promise.all([
				buscarResumoCancelamentos(competencia),
				buscarFiltrosCancelamentos(competencia),
				buscarCancelamentos({
					competencia,
					...nextFilters,
					page: nextPage,
					limit: nextLimit,
				}),
			]);
			setSummary(summaryResponse);
			setFilters(filtersResponse || {});
			setItems(tableResponse?.data || []);
			setPagination({
				page: tableResponse?.page || nextPage,
				limit: tableResponse?.limit || pagination.limit,
				total: tableResponse?.total || 0,
				totalPages: tableResponse?.totalPages || 1,
			});
		} catch (err) {
			setError(err?.message || "Não foi possível carregar cancelamentos.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		loadStaticData().catch(() => {});
	}, []);

	useEffect(() => {
		loadCompetencia(1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [competencia]);

	async function refreshAll() {
		await Promise.all([loadStaticData(), loadCompetencia(pagination.page)]);
	}

	async function handleSync() {
		setActionLoading(true);
		setError("");
		try {
			await sincronizarCompetenciaCancelamentos(competencia);
			await refreshAll();
		} catch (err) {
			setError(err?.message || "Não foi possível iniciar sincronização.");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleHistorySync() {
		setActionLoading(true);
		setError("");
		try {
			await sincronizarHistoricoCancelamentos(historyRange);
			setHistoryModalOpen(false);
			await refreshAll();
		} catch (err) {
			setError(err?.message || "Não foi possível iniciar histórico.");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleValidate() {
		setActionLoading(true);
		setError("");
		try {
			await validarCompetenciaCancelamentos(competencia);
			await refreshAll();
		} catch (err) {
			setError(err?.message || "Não foi possível validar competência.");
		} finally {
			setActionLoading(false);
		}
	}

	async function openDetail(id) {
		try {
			const response = await buscarDetalheCancelamento(id);
			setDetail(response?.item || null);
		} catch (err) {
			setError(err?.message || "Não foi possível abrir detalhes.");
		}
	}

	const empresaRows = useMemo(() => {
		const names = ["SEMPRE", "ONNET"];
		const rows = names.map((name) => ({
			name,
			...(empresas[name] || { ftth: 0, naoFtth: 0, total: 0 }),
		}));
		rows.push({ name: "Total", ...currentSummary.geral });
		return rows;
	}, [currentSummary.geral, empresas]);

	const exportUrl = buildCancelamentosExportUrl({
		competencia,
		...tableFilters,
	});

	return (
		<div className="space-y-6 p-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
							Ordem de Serviço / Cancelamentos
						</p>
						<h1 className="mt-2 text-3xl font-black text-slate-950">
							Cancelamentos
						</h1>
						<p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">
							Consulta e validação mensal do churn por empresa e tecnologia.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<select
							value={competencia}
							onChange={(event) => setCompetencia(event.target.value)}
							className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700"
						>
							<option value={competencia}>{competenciaLabel(competencia)}</option>
							{competencias.map((item) => (
								<option key={item.competencia} value={item.competencia}>
									{competenciaLabel(item.competencia)}
								</option>
							))}
						</select>
						<button
							type="button"
							onClick={refreshAll}
							disabled={loading}
							className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700"
						>
							<RefreshCw size={16} /> Atualizar
						</button>
						<button
							type="button"
							onClick={handleSync}
							disabled={actionLoading}
							className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white"
						>
							<RefreshCw size={16} /> Sincronizar
						</button>
						<button
							type="button"
							onClick={() => setHistoryModalOpen(true)}
							className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700"
						>
							<Filter size={16} /> Sincronizar histórico
						</button>
					</div>
				</div>

				<div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<StatusBadge status={status} />
					<StatusBadge status={validationStatus} />
					<span className="text-sm font-bold text-slate-600">
						Última sincronização: {formatDateTime(summary?.competencia?.lastSyncedAt)}
					</span>
					{summary?.competencia?.lastError ? (
						<span className="inline-flex items-center gap-2 text-sm font-black text-red-700">
							<AlertTriangle size={16} /> {summary.competencia.lastError}
						</span>
					) : null}
					{validationStatus === "REQUIRES_REVALIDATION" ? (
						<span className="inline-flex items-center gap-2 text-sm font-black text-red-700">
							<AlertTriangle size={16} /> Os dados mudaram após a validação.
						</span>
					) : null}
				</div>
			</section>

			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
					{error}
				</div>
			) : null}

			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
				<KpiCard title="Total de cancelamentos" value={formatNumber(currentSummary.geral.total)} helper="geral" />
				<KpiCard title="FTTH / Fibra" value={formatNumber(currentSummary.geral.ftth)} helper={formatPercent((currentSummary.geral.ftth / Math.max(currentSummary.geral.total, 1)) * 100)} tone="green" />
				<KpiCard title="Não FTTH" value={formatNumber(currentSummary.geral.naoFtth)} helper={formatPercent((currentSummary.geral.naoFtth / Math.max(currentSummary.geral.total, 1)) * 100)} tone="orange" />
				<KpiCard title="Com equipamento" value={formatNumber(currentSummary.equipamentos?.comEquipamento)} helper="comodato" tone="blue" />
				<KpiCard title="Sem equipamento" value={formatNumber(currentSummary.equipamentos?.semEquipamento)} helper="auditar" tone="slate" />
			</section>

			<section className="grid gap-4 md:grid-cols-2">
				{["SEMPRE", "ONNET"].map((empresa) => {
					const row = empresas[empresa] || { ftth: 0, naoFtth: 0, total: 0 };
					return (
						<div key={empresa} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
							<div className="flex items-center justify-between">
								<h2 className="text-xl font-black text-slate-950">{empresa}</h2>
								<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
									Total {formatNumber(row.total)}
								</span>
							</div>
							<div className="mt-4 grid grid-cols-2 gap-3">
								<div className="rounded-2xl bg-emerald-50 p-4">
									<p className="text-xs font-black uppercase text-emerald-700">FTTH/Fibra</p>
									<p className="mt-2 text-3xl font-black text-emerald-950">{formatNumber(row.ftth)}</p>
								</div>
								<div className="rounded-2xl bg-orange-50 p-4">
									<p className="text-xs font-black uppercase text-orange-700">Não FTTH</p>
									<p className="mt-2 text-3xl font-black text-orange-950">{formatNumber(row.naoFtth)}</p>
								</div>
							</div>
						</div>
					);
				})}
			</section>

			<CompactTable
				title="Cancelamentos por Empresa"
				rows={empresaRows}
				columns={[
					{ key: "name", label: "Empresa" },
					{ key: "ftth", label: "FTTH/Fibra", render: (row) => formatNumber(row.ftth) },
					{ key: "naoFtth", label: "Não FTTH", render: (row) => formatNumber(row.naoFtth) },
					{ key: "total", label: "Total", render: (row) => formatNumber(row.total) },
					{ key: "percent", label: "% FTTH", render: (row) => formatPercent((row.ftth / Math.max(row.total, 1)) * 100) },
				]}
			/>

			<div className="grid gap-4 xl:grid-cols-2">
				<CompactTable
					title="Cancelamentos por Regional"
					rows={summary?.porRegional || []}
					columns={[
						{ key: "regional", label: "Regional" },
						{ key: "sempreFtth", label: "Sempre FTTH", render: (row) => formatNumber(row.sempreFtth) },
						{ key: "sempreNaoFtth", label: "Sempre Não FTTH", render: (row) => formatNumber(row.sempreNaoFtth) },
						{ key: "onnetFtth", label: "Onnet FTTH", render: (row) => formatNumber(row.onnetFtth) },
						{ key: "onnetNaoFtth", label: "Onnet Não FTTH", render: (row) => formatNumber(row.onnetNaoFtth) },
						{ key: "total", label: "Total", render: (row) => formatNumber(row.total) },
					]}
				/>
				<CompactTable
					title="Tecnologias"
					rows={summary?.tecnologias || []}
					columns={[
						{ key: "tecnologia", label: "Tecnologia original" },
						{ key: "empresa", label: "Empresa" },
						{ key: "classificacao", label: "Classificação" },
						{ key: "total", label: "Quantidade", render: (row) => formatNumber(row.total) },
					]}
				/>
			</div>

			<CompactTable
				title="Cancelamentos por Cidade"
				rows={summary?.porCidade || []}
				columns={[
					{ key: "cidade", label: "Cidade" },
					{ key: "regional", label: "Regional" },
					{ key: "sempreFtth", label: "Sempre FTTH", render: (row) => formatNumber(row.sempreFtth) },
					{ key: "sempreNaoFtth", label: "Sempre Não FTTH", render: (row) => formatNumber(row.sempreNaoFtth) },
					{ key: "onnetFtth", label: "Onnet FTTH", render: (row) => formatNumber(row.onnetFtth) },
					{ key: "onnetNaoFtth", label: "Onnet Não FTTH", render: (row) => formatNumber(row.onnetNaoFtth) },
					{ key: "total", label: "Total", render: (row) => formatNumber(row.total) },
				]}
			/>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">Tabela detalhada</h2>
						<p className="text-sm font-semibold text-slate-500">
						Mostrando {formatNumber(items.length)} de {formatNumber(pagination.total)} registros, 15 por página.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={handleValidate}
							disabled={actionLoading || !currentSummary.geral.total}
							className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-40"
						>
							<ShieldCheck size={16} /> Validar competência
						</button>
						<a
							href={exportUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700"
						>
							<Download size={16} /> CSV
						</a>
					</div>
				</div>

				<div className="mt-4 grid gap-2 md:grid-cols-4 xl:grid-cols-9">
					<div className="relative md:col-span-2">
						<Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
						<input
							value={tableFilters.q}
							onChange={(event) => setTableFilters((current) => ({ ...current, q: event.target.value }))}
							onKeyDown={(event) => {
								if (event.key === "Enter") loadCompetencia(1);
							}}
							placeholder="cliente, código, serviço, cidade ou regional"
							className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none"
						/>
					</div>
					<input
						value={tableFilters.cidade}
						onChange={(event) => setTableFilters((current) => ({ ...current, cidade: event.target.value }))}
						onKeyDown={(event) => {
							if (event.key === "Enter") loadCompetencia(1);
						}}
						placeholder="Pesquisar cidade"
						className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 outline-none"
					/>
					<input
						value={tableFilters.regional}
						onChange={(event) => setTableFilters((current) => ({ ...current, regional: event.target.value }))}
						onKeyDown={(event) => {
							if (event.key === "Enter") loadCompetencia(1);
						}}
						placeholder="Pesquisar regional"
						className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 outline-none"
					/>
					{[
						["empresa", ["", "SEMPRE", "ONNET"]],
						["classificacao", ["", "FTTH", "NAO_FTTH"]],
						["tecnologia", ["", ...(filters.tecnologias || [])]],
						["motivo", ["", ...(filters.motivos || [])]],
					].map(([key, options]) => (
						<select
							key={key}
							value={tableFilters[key]}
							onChange={(event) => setTableFilters((current) => ({ ...current, [key]: event.target.value }))}
							className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"
						>
							{options.map((option) => (
								<option key={option || "all"} value={option}>
									{option || "Todos"}
								</option>
							))}
						</select>
					))}
					<button
						type="button"
						onClick={() => loadCompetencia(1)}
						className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white"
					>
						<Filter size={14} /> Filtrar
					</button>
				</div>

				<div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
					<table className="min-w-full divide-y divide-slate-100 text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
							<tr>
								<th className="px-4 py-3">Cliente</th>
								<th className="px-4 py-3">Empresa</th>
								<th className="px-4 py-3">Serviço</th>
								<th className="px-4 py-3">Tecnologia</th>
								<th className="px-4 py-3">Cidade</th>
								<th className="px-4 py-3">Data</th>
								<th className="px-4 py-3">Motivo</th>
								<th className="px-4 py-3">Ações</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{loading ? (
								<tr>
									<td colSpan={8} className="px-4 py-10 text-center font-black text-slate-500">
										Carregando cancelamentos...
									</td>
								</tr>
							) : items.length ? (
								items.map((item) => (
									<tr key={item.id} className="align-top">
										<td className="px-4 py-3">
											<p className="font-black text-slate-950">{item.clienteNome || "-"}</p>
											<p className="text-xs font-semibold text-slate-500">
												{item.codigoCliente || "-"} · {item.clienteServicoId || "-"}
											</p>
										</td>
										<td className="px-4 py-3 font-black text-slate-700">{item.empresa}</td>
										<td className="max-w-sm px-4 py-3 font-semibold text-slate-700">{item.servico}</td>
										<td className="px-4 py-3">
											<p className="font-black text-slate-800">{item.tecnologiaOriginal || "-"}</p>
											<p className="text-xs font-black text-blue-600">{item.classificacaoTecnologia}</p>
										</td>
										<td className="px-4 py-3">
											<p className="font-semibold text-slate-700">{item.cidade || "-"}</p>
											<p className="text-xs font-semibold text-slate-500">{item.regionalNome || "Sem regional"}</p>
										</td>
										<td className="px-4 py-3 font-semibold text-slate-700">{formatDate(item.dataCancelamento)}</td>
										<td className="max-w-xs px-4 py-3 text-xs font-semibold text-slate-600">{item.motivoCancelamento || "-"}</td>
										<td className="px-4 py-3">
											<button
												type="button"
												onClick={() => openDetail(item.id)}
												className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
											>
												<Eye size={14} /> Ver
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={8} className="px-4 py-10 text-center font-black text-slate-500">
										Nenhum cancelamento encontrado.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-black text-slate-600">
					<span>
						Mostrando página {pagination.page} de {pagination.totalPages} · {formatNumber(pagination.total)} registro(s) · 15 por página
					</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={loading || pagination.page <= 1}
							onClick={() => loadCompetencia(Math.max(1, pagination.page - 1))}
							className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-40"
						>
							Anterior
						</button>
						<button
							type="button"
							disabled={loading || pagination.page >= pagination.totalPages}
							onClick={() => loadCompetencia(Math.min(pagination.totalPages, pagination.page + 1))}
							className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-40"
						>
							Próxima
						</button>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-xl font-black text-slate-950">Histórico mensal e sincronizações</h2>
				<div className="mt-4 grid gap-4 xl:grid-cols-2">
					<div className="space-y-2">
						{competencias.slice(0, 12).map((item) => (
							<button
								key={item.competencia}
								type="button"
								onClick={() => setCompetencia(item.competencia)}
								className="flex w-full items-center justify-between rounded-2xl border border-slate-200 p-3 text-left"
							>
								<span>
									<span className="block font-black text-slate-900">{competenciaLabel(item.competencia)}</span>
									<span className="text-xs font-semibold text-slate-500">Total {formatNumber(item.totalRecords)}</span>
								</span>
								<span className="flex flex-wrap justify-end gap-2">
									<StatusBadge status={item.status} />
									<StatusBadge status={item.validationStatus} />
								</span>
							</button>
						))}
					</div>
					<div className="space-y-2">
						{syncHistory.map((run) => (
							<div key={run.id} className="rounded-2xl border border-slate-200 p-3">
								<div className="flex items-center justify-between gap-3">
									<p className="font-black text-slate-900">
										{run.competencia ? competenciaLabel(run.competencia) : `${run.startCompetencia} até ${run.endCompetencia}`}
									</p>
									<StatusBadge status={run.status} />
								</div>
								<p className="mt-1 text-xs font-semibold text-slate-500">
									{formatDateTime(run.startedAt)} · Total {formatNumber(run.totalHubsoft)}
									{run.error ? ` · ${run.error}` : ""}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{historyModalOpen ? (
				<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4">
					<div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
						<h2 className="text-xl font-black text-slate-950">Sincronizar histórico</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Cada competência será consultada separadamente no HubSoft.
						</p>
						<div className="mt-5 grid gap-3">
							<label className="text-sm font-black text-slate-700">
								Mês inicial
								<input
									type="month"
									value={historyRange.startCompetencia}
									onChange={(event) => setHistoryRange((current) => ({ ...current, startCompetencia: event.target.value }))}
									className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
								/>
							</label>
							<label className="text-sm font-black text-slate-700">
								Mês final
								<input
									type="month"
									value={historyRange.endCompetencia}
									onChange={(event) => setHistoryRange((current) => ({ ...current, endCompetencia: event.target.value }))}
									className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
								/>
							</label>
						</div>
						<div className="mt-6 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setHistoryModalOpen(false)}
								className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={handleHistorySync}
								disabled={actionLoading}
								className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white"
							>
								<CheckCircle2 size={16} /> Iniciar
							</button>
						</div>
					</div>
				</div>
			) : null}

			<DetailModal item={detail} onClose={() => setDetail(null)} />
		</div>
	);
}
