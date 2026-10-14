import {
	AlertTriangle,
	BadgeDollarSign,
	Check,
	CheckCircle2,
	Download,
	Play,
	Plus,
	RefreshCw,
	Save,
	Search,
	ShieldAlert,
	ShoppingBag,
	SlidersHorizontal,
	Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import { hasAnyPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { ROUTES } from "../../../router/routes";
import { mercadoApi } from "../services/mercadoService";

const statusLabels = {
	DRAFT: "Rascunho",
	AVAILABLE: "Disponível",
	ACCEPTED: "Aceito",
	IN_EXECUTION: "Em execução",
	SUBMITTED: "Submetido",
	APPROVED: "Aprovado",
	CANCELED: "Cancelado",
	WITHDRAWN: "Desistido",
};

const statusClasses = {
	DRAFT: "bg-slate-100 text-slate-700",
	AVAILABLE: "bg-cyan-50 text-cyan-800",
	ACCEPTED: "bg-blue-50 text-blue-800",
	IN_EXECUTION: "bg-indigo-50 text-indigo-800",
	SUBMITTED: "bg-amber-50 text-amber-800",
	APPROVED: "bg-emerald-50 text-emerald-800",
	CANCELED: "bg-red-50 text-red-800",
	WITHDRAWN: "bg-slate-100 text-slate-500",
};

function money(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function Badge({ status }) {
	return (
		<span
			className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusClasses[status] || "bg-slate-100 text-slate-700"}`}
		>
			{statusLabels[status] || status || "-"}
		</span>
	);
}

function ErrorState({ message }) {
	if (!message) return null;
	return (
		<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
			{message}
		</div>
	);
}

function EmptyState({ title, description }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
			<p className="text-lg font-black text-slate-900">{title}</p>
			<p className="mt-2 text-sm font-semibold text-slate-500">{description}</p>
		</div>
	);
}

function Kpi({ icon: Icon, label, value, detail }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
						{label}
					</p>
					<p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
				</div>
				<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
					<Icon size={22} />
				</div>
			</div>
			{detail ? <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p> : null}
		</div>
	);
}

function useLoad(loader, deps = []) {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [version, setVersion] = useState(0);
	const loaderRef = useRef(loader);
	const depsKey = useMemo(() => JSON.stringify(deps), [deps]);

	useEffect(() => {
		loaderRef.current = loader;
	});

	useEffect(() => {
		let active = true;
		Promise.resolve().then(() => {
			if (!active) return;
			setLoading(true);
			setError("");
			loaderRef.current()
				.then((result) => {
					if (active) setData(result);
				})
				.catch((err) => {
					if (active) setError(err?.message || "Falha ao carregar dados.");
				})
				.finally(() => {
					if (active) setLoading(false);
				});
		});
		return () => {
			active = false;
		};
	}, [depsKey, version]);

	return { data, loading, error, reload: () => setVersion((cur) => cur + 1) };
}

export function MercadoDashboardPage() {
	const { data, loading, error, reload } = useLoad(() => mercadoApi.dashboard());
	const lotes = data?.lotes || [];
	const os = data?.os || [];
	const totalByStatus = Object.fromEntries(lotes.map((item) => [item.status, item.total]));
	const osRecuperadas = os
		.filter((item) => item.desfecho === "RECUPERADA")
		.reduce((sum, item) => sum + Number(item.total || 0), 0);
	const osTotal = os.reduce((sum, item) => sum + Number(item.total || 0), 0);
	const taxa = osTotal ? Math.round((osRecuperadas / osTotal) * 100) : 0;

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
				<div>
					<h1 className="text-2xl font-black text-slate-950">Dashboard do Mercado</h1>
					<p className="text-sm font-semibold text-slate-500">
						Marketplace, execução, SLA e financeiro em uma visão operacional.
					</p>
				</div>
				<button
					type="button"
					onClick={reload}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700"
				>
					<RefreshCw size={16} />
					Atualizar
				</button>
			</div>
			<ErrorState message={error} />
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Kpi icon={ShoppingBag} label="Disponíveis" value={totalByStatus.AVAILABLE || 0} />
				<Kpi icon={Play} label="Em execução" value={(totalByStatus.ACCEPTED || 0) + (totalByStatus.IN_EXECUTION || 0)} />
				<Kpi icon={CheckCircle2} label="Aprovados" value={totalByStatus.APPROVED || 0} />
				<Kpi icon={BadgeDollarSign} label="Taxa recuperação" value={`${taxa}%`} detail={`${osRecuperadas}/${osTotal} OS`} />
			</div>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Ranking de empresas</h2>
				<div className="mt-4 divide-y divide-slate-100">
					{(data?.rankingEmpresas || []).map((item) => (
						<div key={item.accepted_by_empresa_id} className="flex items-center justify-between py-3">
							<div>
								<p className="font-black text-slate-900">{item.accepted_by_empresa_nome || item.accepted_by_empresa_id}</p>
								<p className="text-xs font-semibold text-slate-500">{item.accepted_by_empresa_id}</p>
							</div>
							<span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-700">
								{item.lotes} lote(s)
							</span>
						</div>
					))}
					{!data?.rankingEmpresas?.length ? (
						<EmptyState title="Sem empresas em execução" description="Os lotes aceitos aparecerão aqui." />
					) : null}
				</div>
			</section>
		</div>
	);
}

function LotesTable({ data, onAction, actionLabel, actionIcon: ActionIcon }) {
	const items = data?.items || [];
	if (!items.length) {
		return <EmptyState title="Nenhum lote encontrado" description="Ajuste os filtros ou gere novos lotes." />;
	}
	return (
		<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			<div className="overflow-x-auto">
				<table className="min-w-full divide-y divide-slate-100 text-sm">
					<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500">
						<tr>
							<th className="px-4 py-3">Lote</th>
							<th className="px-4 py-3">Cidade</th>
							<th className="px-4 py-3">Equipamento</th>
							<th className="px-4 py-3">OS</th>
							<th className="px-4 py-3">Valor</th>
							<th className="px-4 py-3">Status</th>
							<th className="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{items.map((item) => (
							<tr key={item.id}>
								<td className="px-4 py-3">
									<Link to={`/mercado/lotes/${item.id}`} className="font-black text-cyan-700 hover:underline">
										{item.codigo}
									</Link>
								</td>
								<td className="px-4 py-3 font-bold text-slate-700">{item.cidade}</td>
								<td className="px-4 py-3 text-slate-600">{item.equipamentoTipo}</td>
								<td className="px-4 py-3 text-slate-600">{item.quantidadeOs}</td>
								<td className="px-4 py-3 font-black text-slate-900">{money(item.valorContratado ?? item.valorPotencial)}</td>
								<td className="px-4 py-3"><Badge status={item.status} /></td>
								<td className="px-4 py-3 text-right">
									{onAction ? (
										<button
											type="button"
											onClick={() => onAction(item)}
											className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
										>
											{ActionIcon ? <ActionIcon size={14} /> : null}
											{actionLabel}
										</button>
									) : null}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function LotesPageBase({ status, title, description, action }) {
	const [filters, setFilters] = useState({ cidade: "", equipamentoTipo: "" });
	const [busy, setBusy] = useState("");
	const loader = () => mercadoApi.lotes({ status, ...filters });
	const { data, loading, error, reload } = useLoad(loader, [status, filters.cidade, filters.equipamentoTipo]);
	const handleAction = async (item) => {
		if (!action) return;
		setBusy(item.id);
		try {
			await action.handler(item);
			reload();
		} finally {
			setBusy("");
		}
	};

	return (
		<div className="space-y-5">
			<div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
				<div>
					<h1 className="text-2xl font-black text-slate-950">{title}</h1>
					<p className="text-sm font-semibold text-slate-500">{description}</p>
				</div>
				<div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
					<input
						value={filters.cidade}
						onChange={(event) => setFilters((cur) => ({ ...cur, cidade: event.target.value }))}
						placeholder="Filtrar cidade"
						className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-cyan-500"
					/>
					<input
						value={filters.equipamentoTipo}
						onChange={(event) => setFilters((cur) => ({ ...cur, equipamentoTipo: event.target.value }))}
						placeholder="Filtrar equipamento"
						className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-cyan-500"
					/>
					<button
						type="button"
						onClick={reload}
						className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
					>
						<Search size={16} />
						Buscar
					</button>
				</div>
			</div>
			<ErrorState message={error} />
			{loading ? <Spinner fullScreen /> : null}
			{busy ? (
				<div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-black text-cyan-800">
					Processando ação do lote...
				</div>
			) : null}
			{!loading ? (
				<LotesTable
					data={data}
					onAction={action ? handleAction : null}
					actionLabel={action?.label}
					actionIcon={action?.icon}
				/>
			) : null}
		</div>
	);
}

export function MercadoDisponiveisPage() {
	return (
		<LotesPageBase
			status="AVAILABLE"
			title="Lotes disponíveis"
			description="Aceite lotes sem expor dados detalhados antes da contratação."
			action={{ label: "Aceitar", icon: Check, handler: (item) => mercadoApi.aceitarLote(item.id) }}
		/>
	);
}

export function MercadoLotesPage() {
	const { currentUser } = useAuthContext();
	const canManage = hasAnyPermission(currentUser, ["mercado.lotes.manage"]);
	const [form, setForm] = useState({ cidade: "", equipamentoTipo: "ONU", quantidade: 15 });
	const [message, setMessage] = useState("");
	const [refreshKey, setRefreshKey] = useState(0);
	const create = async () => {
		setMessage("Gerando lote a partir das OS elegíveis...");
		try {
			await mercadoApi.gerarLotes(form);
			setMessage("Lote gerado e publicado.");
			setRefreshKey((cur) => cur + 1);
		} catch (error) {
			setMessage(error?.message || "Não foi possível gerar o lote.");
		}
	};
	return (
		<div className="space-y-5">
			{canManage ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_auto]">
						<input className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" placeholder="Cidade" value={form.cidade} onChange={(e) => setForm((cur) => ({ ...cur, cidade: e.target.value }))} />
						<input className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" placeholder="Equipamento" value={form.equipamentoTipo} onChange={(e) => setForm((cur) => ({ ...cur, equipamentoTipo: e.target.value }))} />
						<select className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" value={form.quantidade} onChange={(e) => setForm((cur) => ({ ...cur, quantidade: Number(e.target.value) }))}>
							<option value={15}>15 OS</option>
							<option value={25}>25 OS</option>
							<option value={35}>35 OS</option>
						</select>
						<button type="button" onClick={create} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-black text-slate-950">
							<Plus size={16} />
							Gerar lote
						</button>
					</div>
					{message ? <p className="mt-3 text-sm font-bold text-slate-600">{message}</p> : null}
				</section>
			) : null}
			<LotesPageBase
				key={refreshKey}
				title="Gestão de lotes"
				description="Administre rascunhos, lotes publicados, aceitos e submetidos."
			/>
		</div>
	);
}

export function MercadoMeusLotesPage() {
	return (
		<LotesPageBase
			status="ACCEPTED"
			title="Meus lotes"
			description="Lotes aceitos pela empresa vinculada ao seu usuário."
		/>
	);
}

export function MercadoLoteDetalhePage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { data, loading, error, reload } = useLoad(() => mercadoApi.lote(id), [id]);
	const [message, setMessage] = useState("");
	const lote = data?.item;
	const os = data?.os || [];

	const updateOs = async (item, desfecho, submeter = false) => {
		setMessage(`Atualizando OS ${item.numOs || item.id}...`);
		try {
			await mercadoApi.atualizarOs(item.id, { desfecho, submeter });
			setMessage("OS atualizada.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao atualizar OS.");
		}
	};

	if (loading) return <Spinner fullScreen />;
	if (!lote) return <ErrorState message={error || "Lote não encontrado."} />;

	return (
		<div className="space-y-5">
			<button type="button" onClick={() => navigate(-1)} className="text-sm font-black text-cyan-700">Voltar</button>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-black text-slate-950">{lote.codigo}</h1>
							<Badge status={lote.status} />
						</div>
						<p className="mt-2 text-sm font-semibold text-slate-500">
							{lote.cidade} · {lote.equipamentoTipo} · {lote.quantidadeOs} OS
						</p>
					</div>
					<div className="text-left lg:text-right">
						<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Valor contratado</p>
						<p className="text-2xl font-black text-slate-950">{money(lote.valorContratado ?? lote.valorPotencial)}</p>
					</div>
				</div>
			</section>
			{message ? <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-sm font-black text-cyan-800">{message}</div> : null}
			<div className="space-y-3">
				{os.map((item) => (
					<div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
							<div>
								<p className="text-sm font-black text-slate-950">OS {item.numOs || "-"}</p>
								<p className="text-sm font-semibold text-slate-600">{item.bairro} · {item.endereco}</p>
								<p className="text-xs font-semibold text-slate-500">{item.nomeCliente || "Cliente protegido"} · {item.equipamentoTipo}</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Badge status={item.status} />
								<button type="button" onClick={() => updateOs(item, "RECUPERADA", true)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Recuperada</button>
								<button type="button" onClick={() => updateOs(item, "TENTATIVAS_ESGOTADAS", true)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">Tentativas esgotadas</button>
								<button type="button" onClick={() => mercadoApi.tentativa(item.id, { canal: "telefone", resultado: "registrada" }).then(reload)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">+ Tentativa</button>
							</div>
						</div>
					</div>
				))}
				{!os.length ? <EmptyState title="Sem OS neste lote" description="A geração automática incluirá as ordens elegíveis aqui." /> : null}
			</div>
		</div>
	);
}

export function MercadoExecucaoPage() {
	return <MercadoLoteDetalhePage />;
}

export function MercadoAprovacoesPage() {
	const { data, loading, error, reload } = useLoad(() => mercadoApi.backoffice());
	const [message, setMessage] = useState("");
	const approve = async (item, status) => {
		setMessage("Registrando conferência...");
		try {
			await mercadoApi.aprovarOs(item.id, { status, justificativa: "Conferência pelo BackOffice" });
			setMessage("Conferência registrada.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao registrar conferência.");
		}
	};
	if (loading) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<h1 className="text-2xl font-black text-slate-950">Aprovações BackOffice</h1>
			<ErrorState message={error || message} />
			{(data?.items || []).map((item) => (
				<div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<p className="font-black text-slate-950">OS {item.numOs} · {item.loteCodigo}</p>
							<p className="text-sm font-semibold text-slate-500">{item.empresaNome} · {item.desfecho || "Sem desfecho"}</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<button type="button" onClick={() => approve(item, "APPROVED")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Aprovar</button>
							<button type="button" onClick={() => approve(item, "CORRECTION_REQUESTED")} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950">Correção</button>
							<button type="button" onClick={() => approve(item, "REJECTED")} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">Rejeitar</button>
						</div>
					</div>
				</div>
			))}
			{!data?.items?.length ? <EmptyState title="Nada em conferência" description="OS submetidas pelas empresas aparecerão aqui." /> : null}
		</div>
	);
}

export function MercadoFinanceiroPage() {
	const competenciaAtual = new Date().toISOString().slice(0, 7);
	const [competencia, setCompetencia] = useState(competenciaAtual);
	const { data, loading, error, reload } = useLoad(() => mercadoApi.financeiro({ competencia }), [competencia]);
	const [message, setMessage] = useState("");
	const gerar = async () => {
		setMessage("Gerando apuração...");
		try {
			await mercadoApi.gerarApuracao({ competencia });
			setMessage("Apuração gerada.");
			reload();
		} catch (error) {
			setMessage(error?.message || "Falha ao gerar apuração.");
		}
	};
	if (loading) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
				<div>
					<h1 className="text-2xl font-black text-slate-950">Financeiro</h1>
					<p className="text-sm font-semibold text-slate-500">Apuração por empresa, lote e OS.</p>
				</div>
				<div className="flex gap-2">
					<input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
					<button type="button" onClick={gerar} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">
						<RefreshCw size={16} />
						Gerar
					</button>
				</div>
			</div>
			<ErrorState message={error || message} />
			<div className="grid gap-4">
				{(data?.items || []).map((item) => (
					<div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<p className="font-black text-slate-950">{item.empresa_nome}</p>
								<p className="text-sm font-semibold text-slate-500">{item.competencia} · {item.status}</p>
							</div>
							<div className="grid grid-cols-2 gap-4 text-right md:grid-cols-4">
								<div><p className="text-xs font-bold text-slate-500">Contratado</p><p className="font-black">{money(item.total_contratado)}</p></div>
								<div><p className="text-xs font-bold text-slate-500">Aprovado</p><p className="font-black">{money(item.total_aprovado)}</p></div>
								<div><p className="text-xs font-bold text-slate-500">Liberado</p><p className="font-black">{money(item.total_liberado)}</p></div>
								<div><p className="text-xs font-bold text-slate-500">Pago</p><p className="font-black">{money(item.total_pago)}</p></div>
							</div>
						</div>
					</div>
				))}
				{!data?.items?.length ? <EmptyState title="Sem apurações" description="Gere a apuração depois da aprovação integral dos lotes." /> : null}
			</div>
		</div>
	);
}

export function MercadoHistoricoPage() {
	const { data, loading, error } = useLoad(() => mercadoApi.historico());
	if (loading) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<h1 className="text-2xl font-black text-slate-950">Histórico e auditoria</h1>
			<ErrorState message={error} />
			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="divide-y divide-slate-100">
					{(data?.items || []).map((item) => (
						<div key={item.id} className="py-3">
							<p className="font-black text-slate-950">{item.tipo}</p>
							<p className="text-sm font-semibold text-slate-600">{item.descricao}</p>
							<p className="text-xs font-semibold text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")} · {item.created_by_name || "Sistema"}</p>
						</div>
					))}
					{!data?.items?.length ? <EmptyState title="Sem eventos" description="Os eventos operacionais aparecerão aqui." /> : null}
				</div>
			</div>
		</div>
	);
}

export function MercadoRelatoriosPage() {
	return (
		<div className="space-y-5">
			<h1 className="text-2xl font-black text-slate-950">Relatórios</h1>
			<div className="grid gap-4 md:grid-cols-3">
				<Kpi icon={Download} label="Exportação" value="CSV/XLSX" detail="Preparado para apurações e lotes." />
				<Kpi icon={ShieldAlert} label="SLA" value="Individual" detail="Relatório por OS e empresa." />
				<Kpi icon={AlertTriangle} label="Pendências" value="BackOffice" detail="Correções, rejeições e exceções." />
			</div>
			<EmptyState title="Relatórios analíticos em evolução" description="A base normalizada já separa lotes, OS, financeiro e auditoria para os exports da próxima rodada." />
		</div>
	);
}

export function MercadoConfiguracoesPage() {
	const { currentUser } = useAuthContext();
	const canManage = hasAnyPermission(currentUser, ["mercado.config.manage"]);
	const { data, loading, error, reload } = useLoad(() => Promise.all([
		mercadoApi.config(),
		mercadoApi.empresas(),
		mercadoApi.habilitacoes(),
	]).then(([config, empresas, habilitacoes]) => ({ config, empresas, habilitacoes })));
	const [draft, setDraft] = useState(null);
	const [selectedEmpresa, setSelectedEmpresa] = useState("");
	const [message, setMessage] = useState("");
	const config = draft || data?.config?.config;

	useEffect(() => {
		if (!data?.config?.config || draft) return;
		Promise.resolve().then(() => setDraft(data.config.config));
	}, [data?.config?.config, draft]);

	const update = (section, key, value) => {
		setDraft((cur) => ({
			...(cur || {}),
			[section]: {
				...((cur || {})[section] || {}),
				[key]: value,
			},
		}));
	};
	const save = async () => {
		setMessage("Salvando configuração versionada...");
		try {
			await mercadoApi.saveConfig(config);
			setMessage("Configuração salva em nova versão.");
			reload();
		} catch (err) {
			setMessage(err?.message || "Falha ao salvar configuração.");
		}
	};
	const enableEmpresa = async () => {
		const empresa = data?.empresas?.items?.find((item) => item.id === selectedEmpresa);
		if (!empresa) return;
		setMessage("Atualizando habilitação da empresa...");
		try {
			await mercadoApi.saveHabilitacao({
				empresaId: empresa.id,
				empresaNome: empresa.nome,
				enabled: true,
				cidadesAutorizadas: empresa.cidades || [],
			});
			setMessage("Empresa habilitada no Mercado.");
			reload();
		} catch (err) {
			setMessage(err?.message || "Falha ao habilitar empresa.");
		}
	};

	if (loading || !config) return <Spinner fullScreen />;
	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
						<SlidersHorizontal size={22} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Mercado</h1>
						<p className="text-sm font-semibold text-slate-500">
							Configurações versionadas do marketplace de retiradas.
						</p>
					</div>
				</div>
			</section>
			<ErrorState message={error || message} />
			{!canManage ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">
					Você está em modo somente leitura.
				</div>
			) : null}
			<div className="grid gap-4 xl:grid-cols-2">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="font-black text-slate-950">Lotes e prazos</h2>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<label className="text-sm font-bold text-slate-600">
							Lotes por empresa
							<input disabled={!canManage} type="number" value={config.lotes.maxLotesSimultaneosPorEmpresa} onChange={(e) => update("lotes", "maxLotesSimultaneosPorEmpresa", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
						<label className="text-sm font-bold text-slate-600">
							Lotes por cidade
							<input disabled={!canManage} type="number" value={config.lotes.maxLotesSimultaneosPorCidade} onChange={(e) => update("lotes", "maxLotesSimultaneosPorCidade", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
						<label className="text-sm font-bold text-slate-600">
							SLA operacional (horas)
							<input disabled={!canManage} type="number" value={config.prazos.slaHoras} onChange={(e) => update("prazos", "slaHoras", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
						<label className="text-sm font-bold text-slate-600">
							Regularização (dias)
							<input disabled={!canManage} type="number" value={config.prazos.regularizacaoDias} onChange={(e) => update("prazos", "regularizacaoDias", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
					</div>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="font-black text-slate-950">Financeiro</h2>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<label className="text-sm font-bold text-slate-600">
							Preço base por OS
							<input disabled={!canManage} type="number" value={config.financeiro.precoBasePorEquipamento} onChange={(e) => update("financeiro", "precoBasePorEquipamento", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
						<label className="text-sm font-bold text-slate-600">
							Valor tentativa
							<input disabled={!canManage} type="number" value={config.financeiro.valorTentativa} onChange={(e) => update("financeiro", "valorTentativa", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
						<label className="text-sm font-bold text-slate-600">
							Desconto agendamento
							<input disabled={!canManage} type="number" value={config.financeiro.descontoAgendamento} onChange={(e) => update("financeiro", "descontoAgendamento", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
						<label className="text-sm font-bold text-slate-600">
							Penalização por hora
							<input disabled={!canManage} type="number" value={config.financeiro.penalizacaoPorHora} onChange={(e) => update("financeiro", "penalizacaoPorHora", Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
						</label>
					</div>
				</section>
			</div>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="font-black text-slate-950">Empresas habilitadas</h2>
				<div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
					<select disabled={!canManage} value={selectedEmpresa} onChange={(e) => setSelectedEmpresa(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
						<option value="">Selecione uma empresa existente</option>
						{(data?.empresas?.items || []).map((empresa) => (
							<option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
						))}
					</select>
					<button disabled={!canManage || !selectedEmpresa} type="button" onClick={enableEmpresa} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">
						<Upload size={16} />
						Habilitar
					</button>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					{(data?.habilitacoes?.items || []).map((item) => (
						<span key={item.empresa_id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
							{item.empresa_nome} · {item.enabled ? "Ativa" : "Inativa"}
						</span>
					))}
				</div>
			</section>
			{canManage ? (
				<button type="button" onClick={save} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 text-sm font-black text-slate-950">
					<Save size={18} />
					Salvar nova versão
				</button>
			) : null}
		</div>
	);
}
