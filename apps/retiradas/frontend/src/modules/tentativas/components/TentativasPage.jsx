import {
	BarChart3,
	Download,
	History,
	MessageCircle,
	Phone,
	RefreshCw,
	Route,
	Save,
	Settings,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import PageHeader from "../../../components/ui/PageHeader";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	baixarHistoricoTentativasCsv,
	buscarConfiguracoesTentativas,
	buscarDetalheTentativa,
	buscarDistribuicaoTentativas,
	buscarHistoricoTentativas,
	buscarMinhaRotaTentativas,
	buscarRankingTentativas,
	buscarResumoTentativas,
	criarCampanhaTentativas,
	iniciarContatoTentativa,
	listarCidadesTecnicosTentativas,
	listarCidadesTentativas,
	listarTemplatesTentativas,
	removerCidadeTecnicoTentativas,
	salvarCidadeTecnicoTentativas,
	salvarConfiguracoesTentativas,
	salvarResultadoTentativa,
	salvarTemplateTentativas,
} from "../services/tentativasService";

const RESULT_OPTIONS = [
	["NO_RESPONSE", "Sem resposta"],
	["RESPONDED", "Cliente respondeu"],
	["SCHEDULED", "Retirada agendada"],
	["REFUSED", "Cliente recusou"],
	["INVALID_PHONE", "Número inválido"],
	["ALREADY_RETURNED", "Cliente já devolveu"],
	["EQUIPMENT_UNAVAILABLE", "Equipamento indisponível"],
	["CALLBACK_REQUESTED", "Contato posterior"],
	["COMPLETED", "Retirada concluída"],
	["OTHER", "Outro"],
];

const ADMIN_TABS = [
	["overview", "Visão Geral", BarChart3],
	["distribution", "Distribuição", Users],
	["history", "Histórico", History],
	["templates", "Templates", MessageCircle],
	["settings", "Configurações", Settings],
];

function formatNumber(value) {
	return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function resultLabel(value) {
	return RESULT_OPTIONS.find(([key]) => key === value)?.[1] || value || "-";
}

function canManage(user) {
	return (
		hasPermission(user, "tentativas.distribuir") ||
		hasPermission(user, "tentativas.templates.gerenciar") ||
		hasPermission(user, "tentativas.configuracoes.gerenciar")
	);
}

function Kpi({ title, value, helper }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
				{title}
			</p>
			<strong className="mt-2 block text-3xl font-black text-slate-950">
				{value}
			</strong>
			{helper ? <p className="mt-1 text-sm font-semibold text-slate-500">{helper}</p> : null}
		</div>
	);
}

function TabButton({ active, icon: Icon, children, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${
				active
					? "bg-blue-600 text-white shadow-lg shadow-blue-200"
					: "border border-slate-200 bg-white text-slate-600"
			}`}
		>
			<Icon className="h-4 w-4" />
			{children}
		</button>
	);
}

function ResultModal({ contact, onClose, onSaved }) {
	const [sentConfirmed, setSentConfirmed] = useState(true);
	const [result, setResult] = useState("NO_RESPONSE");
	const [observation, setObservation] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	if (!contact) return null;
	const save = async () => {
		setSaving(true);
		setError("");
		try {
			await salvarResultadoTentativa(contact.contactId, {
				sentConfirmed,
				result,
				observation,
			});
			onSaved?.();
			onClose();
		} catch (err) {
			setError(err.message || "Falha ao salvar resultado.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell
			title="Como foi o contato?"
			description="Confirme o envio manual no WhatsApp e registre o resultado."
			size="lg"
			onClose={onClose}
			footer={
				<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
					<button type="button" onClick={onClose} className="rounded-xl border px-4 py-3 font-black">
						Cancelar
					</button>
					<button
						type="button"
						onClick={save}
						disabled={saving}
						className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-60"
					>
						{saving ? "Salvando..." : "Salvar e próximo"}
					</button>
				</div>
			}
		>
			<div className="space-y-4">
				{error ? <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
				<div className="grid grid-cols-2 gap-3">
					<button
						type="button"
						onClick={() => setSentConfirmed(true)}
						className={`rounded-2xl border p-4 text-left font-black ${
							sentConfirmed ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200"
						}`}
					>
						SIM, enviei
					</button>
					<button
						type="button"
						onClick={() => setSentConfirmed(false)}
						className={`rounded-2xl border p-4 text-left font-black ${
							!sentConfirmed ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200"
						}`}
					>
						NÃO enviei
					</button>
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					{RESULT_OPTIONS.map(([key, label]) => (
						<button
							type="button"
							key={key}
							onClick={() => setResult(key)}
							className={`rounded-xl border px-4 py-3 text-left text-sm font-black ${
								result === key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</div>
				<textarea
					value={observation}
					onChange={(event) => setObservation(event.target.value)}
					maxLength={500}
					placeholder="Observação curta, se necessário"
					className="min-h-24 w-full rounded-2xl border border-slate-200 p-3 font-semibold outline-none focus:border-blue-400"
				/>
			</div>
		</ModalShell>
	);
}

function MyRoute() {
	const [cities, setCities] = useState([]);
	const [city, setCity] = useState("");
	const [routeData, setRouteData] = useState(null);
	const [detail, setDetail] = useState(null);
	const [pendingContact, setPendingContact] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const loadCities = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const data = await listarCidadesTentativas();
			const items = data.items || [];
			setCities(items);
			if (items[0]?.cidade) {
				setCity((currentCity) => currentCity || items[0].cidade);
			}
		} catch (err) {
			setError(err.message || "Falha ao carregar cidades.");
		} finally {
			setLoading(false);
		}
	}, []);

	const loadRoute = useCallback(async (selectedCity = city) => {
		if (!selectedCity) return;
		setLoading(true);
		setError("");
		try {
			setRouteData(await buscarMinhaRotaTentativas({ cidade: selectedCity }));
		} catch (err) {
			setError(err.message || "Falha ao carregar rota.");
		} finally {
			setLoading(false);
		}
	}, [city]);

	useEffect(() => {
		loadCities();
	}, [loadCities]);

	useEffect(() => {
		if (city) loadRoute(city);
	}, [city, loadRoute]);

	const contact = async (item) => {
		setError("");
		try {
			const started = await iniciarContatoTentativa(item.id);
			window.sessionStorage.setItem(
				"tentativas:lastContact",
				JSON.stringify({ contactId: started.contactId, opportunityId: item.id }),
			);
			setPendingContact(started);
			window.open(started.whatsappUrl, "_blank", "noopener,noreferrer");
		} catch (err) {
			setError(err.message || "Falha ao abrir WhatsApp.");
		}
	};

	const openDetail = async (item) => {
		setDetail(await buscarDetalheTentativa(item.id));
	};

	if (loading && !routeData) return <Spinner />;

	return (
		<div className="space-y-4">
			{error ? <div className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">{error}</div> : null}
			<section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
					Escolha a cidade
				</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{cities.map((item) => (
						<button
							type="button"
							key={item.cidade_normalizada || item.cidade}
							onClick={() => setCity(item.cidade)}
							className={`min-h-24 rounded-2xl border p-4 text-left transition ${
								city === item.cidade
									? "border-blue-500 bg-blue-50 shadow-sm"
									: "border-slate-200 bg-white"
							}`}
						>
							<strong className="block text-lg font-black text-slate-950">{item.cidade}</strong>
							<span className="mt-1 block text-sm font-bold text-slate-500">
								{formatNumber(item.total)} clientes disponíveis
							</span>
						</button>
					))}
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Minha Rota</p>
						<h2 className="text-2xl font-black text-slate-950">{city || "Sem cidade"}</h2>
						<p className="text-sm font-bold text-slate-500">
							{formatNumber(routeData?.summary?.total)} clientes · {formatNumber(routeData?.summary?.pending)} pendentes · {formatNumber(routeData?.summary?.worked)} trabalhados
						</p>
					</div>
					<button
						type="button"
						onClick={() => loadRoute()}
						className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 font-black"
					>
						<RefreshCw className="h-4 w-4" /> Atualizar
					</button>
				</div>
				<div className="mt-4 grid gap-3">
					{(routeData?.items || []).map((item) => (
						<article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div>
									<h3 className="text-lg font-black text-slate-950">{item.cliente || "Cliente sem nome"}</h3>
									<p className="mt-1 text-sm font-bold text-slate-500">
										OS {item.os} · {item.cidade} · {item.tipoOs || "-"}
									</p>
									<p className="mt-2 text-sm font-bold text-slate-600">
										Aberta há {formatNumber(item.osAgeDays)} dias · Tentativas: {formatNumber(item.attemptCount)} · Prioridade {item.priority}
									</p>
									{item.nextAttemptAt ? (
										<p className="mt-1 text-xs font-black text-amber-700">
											Próxima tentativa permitida: {formatDateTime(item.nextAttemptAt)}
										</p>
									) : null}
								</div>
								<div className="grid grid-cols-2 gap-2 sm:flex">
									<button
										type="button"
										onClick={() => openDetail(item)}
										className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700"
									>
										Detalhes
									</button>
									<button
										type="button"
										onClick={() => contact(item)}
										className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 font-black text-white"
									>
										<Phone className="h-4 w-4" /> Contatar
									</button>
								</div>
							</div>
						</article>
					))}
					{!routeData?.items?.length ? (
						<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
							<strong className="text-lg font-black text-slate-700">Nenhum cliente disponível</strong>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Você não possui oportunidades disponíveis para esta cidade neste momento.
							</p>
						</div>
					) : null}
				</div>
			</section>

			<ResultModal contact={pendingContact} onClose={() => setPendingContact(null)} onSaved={() => loadRoute()} />
			{detail ? (
				<ModalShell title="Detalhe do cliente" size="3xl" onClose={() => setDetail(null)}>
					<div className="space-y-4">
						<div className="rounded-2xl bg-slate-50 p-4">
							<h3 className="font-black text-slate-950">{detail.item?.cliente}</h3>
							<p className="mt-1 text-sm font-bold text-slate-500">
								OS {detail.item?.os} · {detail.item?.cidade} · {detail.item?.telefone || "Sem telefone"}
							</p>
						</div>
						<div className="space-y-2">
							{(detail.contacts || []).map((contact) => (
								<div key={contact.id} className="rounded-xl border border-slate-200 p-3 text-sm">
									<strong>{formatDateTime(contact.created_at)}</strong> · {resultLabel(contact.result || contact.event_type)}
									<p className="text-slate-500">{contact.observation || contact.status}</p>
								</div>
							))}
						</div>
					</div>
				</ModalShell>
			) : null}
		</div>
	);
}

function OverviewTab() {
	const [data, setData] = useState(null);
	const [ranking, setRanking] = useState([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let cancelled = false;
		async function load() {
			const [overview, rankingData] = await Promise.all([
				buscarResumoTentativas(),
				buscarRankingTentativas(),
			]);
			if (cancelled) return;
			setData(overview);
			setRanking(rankingData.items || []);
			setLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);
	if (loading) return <Spinner />;
	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<Kpi title="Oportunidades" value={formatNumber(data.opportunities)} />
				<Kpi title="Clientes trabalhados" value={formatNumber(data.worked)} helper={`${data.coverage}% cobertura`} />
				<Kpi title="Tentativas" value={formatNumber(data.attempts)} />
				<Kpi title="Agendamentos" value={formatNumber(data.scheduled)} helper={`${data.scheduleConversion}% conversão`} />
			</div>
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Funil</h2>
				<div className="mt-4 grid gap-3 sm:grid-cols-5">
					{(data.funnel || []).map((item) => (
						<div key={item.label} className="rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">{item.label}</p>
							<strong className="mt-1 block text-2xl font-black text-blue-700">{formatNumber(item.value)}</strong>
						</div>
					))}
				</div>
			</section>
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Ranking de técnicos</h2>
				<div className="mt-4 overflow-x-auto">
					<table className="min-w-full text-left text-sm">
						<thead className="text-xs uppercase text-slate-500">
							<tr><th className="p-3">Técnico</th><th>Cobertura</th><th>Tentativas</th><th>Respostas</th><th>Agendamentos</th><th>Retiradas</th></tr>
						</thead>
						<tbody>
							{ranking.map((item) => (
								<tr key={item.technician_id} className="border-t">
									<td className="p-3 font-black">{item.technician_name}</td>
									<td className="font-bold">{item.coverage}%</td>
									<td>{formatNumber(item.attempts)}</td>
									<td>{formatNumber(item.responded)}</td>
									<td>{formatNumber(item.scheduled)}</td>
									<td>{formatNumber(item.completed)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}

function DistributionTab() {
	const [items, setItems] = useState([]);
	const [cities, setCities] = useState([]);
	const [form, setForm] = useState({ userId: "", userEmail: "", userName: "", cidade: "", permanent: true });
	const [campaign, setCampaign] = useState({ name: "", cidade: "", technicianUserId: "", technicianName: "", quantity: 30 });
	const load = async () => {
		const [distribution, cityLinks] = await Promise.all([
			buscarDistribuicaoTentativas(),
			listarCidadesTecnicosTentativas(),
		]);
		setItems(distribution.items || []);
		setCities(cityLinks.items || []);
	};
	useEffect(() => {
		let cancelled = false;
		async function loadInitial() {
			const [distribution, cityLinks] = await Promise.all([
				buscarDistribuicaoTentativas(),
				listarCidadesTecnicosTentativas(),
			]);
			if (cancelled) return;
			setItems(distribution.items || []);
			setCities(cityLinks.items || []);
		}
		void loadInitial();
		return () => {
			cancelled = true;
		};
	}, []);
	const saveCity = async () => {
		await salvarCidadeTecnicoTentativas(form);
		setForm({ userId: "", userEmail: "", userName: "", cidade: "", permanent: true });
		load();
	};
	const createCampaign = async () => {
		await criarCampanhaTentativas(campaign);
		setCampaign({ name: "", cidade: "", technicianUserId: "", technicianName: "", quantity: 30 });
		load();
	};
	return (
		<div className="grid gap-4 xl:grid-cols-[1fr_420px]">
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black">Distribuição atual</h2>
				<div className="mt-4 grid gap-3">
					{items.map((item) => (
						<div key={`${item.technician_user_id}-${item.cidade}`} className="rounded-2xl border p-4">
							<strong>{item.technician_name || "Sem técnico"}</strong>
							<p className="text-sm font-bold text-slate-500">{item.cidade} · {formatNumber(item.opportunities)} oportunidades · {item.coverage}% cobertura</p>
						</div>
					))}
				</div>
			</section>
			<div className="space-y-4">
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="font-black">Associar cidade</h2>
					<div className="mt-3 grid gap-2">
						<input className="rounded-xl border p-3" placeholder="ID usuário" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
						<input className="rounded-xl border p-3" placeholder="E-mail" value={form.userEmail} onChange={(e) => setForm({ ...form, userEmail: e.target.value })} />
						<input className="rounded-xl border p-3" placeholder="Nome técnico" value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} />
						<input className="rounded-xl border p-3" placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
						<button type="button" onClick={saveCity} className="rounded-xl bg-blue-600 p-3 font-black text-white">Salvar associação</button>
					</div>
				</section>
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="font-black">Campanha simples</h2>
					<div className="mt-3 grid gap-2">
						<input className="rounded-xl border p-3" placeholder="Nome" value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} />
						<input className="rounded-xl border p-3" placeholder="Cidade" value={campaign.cidade} onChange={(e) => setCampaign({ ...campaign, cidade: e.target.value })} />
						<input className="rounded-xl border p-3" placeholder="ID técnico" value={campaign.technicianUserId} onChange={(e) => setCampaign({ ...campaign, technicianUserId: e.target.value })} />
						<input className="rounded-xl border p-3" placeholder="Nome técnico" value={campaign.technicianName} onChange={(e) => setCampaign({ ...campaign, technicianName: e.target.value })} />
						<input className="rounded-xl border p-3" type="number" value={campaign.quantity} onChange={(e) => setCampaign({ ...campaign, quantity: e.target.value })} />
						<button type="button" onClick={createCampaign} className="rounded-xl bg-emerald-600 p-3 font-black text-white">Criar campanha</button>
					</div>
				</section>
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="font-black">Cidades associadas</h2>
					<div className="mt-3 space-y-2">
						{cities.map((item) => (
							<div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
								<span><strong>{item.user_name || item.user_email}</strong> · {item.cidade}</span>
								<button type="button" onClick={async () => { await removerCidadeTecnicoTentativas(item.id); load(); }} className="text-red-600"><X className="h-4 w-4" /></button>
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	);
}

function HistoryTab() {
	const [query, setQuery] = useState("");
	const [data, setData] = useState({ items: [] });
	const load = async () => setData(await buscarHistoricoTentativas({ q: query, page: 1, limit: 50 }));
	useEffect(() => {
		let cancelled = false;
		async function loadInitial() {
			const result = await buscarHistoricoTentativas({ page: 1, limit: 50 });
			if (!cancelled) setData(result);
		}
		void loadInitial();
		return () => {
			cancelled = true;
		};
	}, []);
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<input className="min-h-12 rounded-2xl border px-4" placeholder="Cliente, OS, telefone ou cidade" value={query} onChange={(e) => setQuery(e.target.value)} />
				<div className="flex gap-2">
					<button type="button" onClick={load} className="rounded-xl border px-4 py-3 font-black">Buscar</button>
					<button type="button" onClick={() => baixarHistoricoTentativasCsv({ q: query })} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-black text-white"><Download className="h-4 w-4" /> CSV</button>
				</div>
			</div>
			<div className="mt-4 space-y-2">
				{data.items.map((item) => (
					<div key={item.id} className="rounded-2xl border p-4">
						<strong>{formatDateTime(item.created_at)} · {item.technician_name}</strong>
						<p className="text-sm font-bold text-slate-500">{item.cliente} · OS {item.os} · {item.cidade}</p>
						<p className="text-sm">{resultLabel(item.result || item.event_type)} · tentativa {item.attempt_number}</p>
					</div>
				))}
			</div>
		</section>
	);
}

function TemplatesTab() {
	const [items, setItems] = useState([]);
	const [form, setForm] = useState({ name: "", attemptNumber: 1, body: "", active: true, isDefault: false });
	const load = async () => setItems((await listarTemplatesTentativas()).items || []);
	useEffect(() => {
		let cancelled = false;
		async function loadInitial() {
			const result = await listarTemplatesTentativas();
			if (!cancelled) setItems(result.items || []);
		}
		void loadInitial();
		return () => {
			cancelled = true;
		};
	}, []);
	const save = async () => {
		await salvarTemplateTentativas(form);
		setForm({ name: "", attemptNumber: 1, body: "", active: true, isDefault: false });
		load();
	};
	return (
		<div className="grid gap-4 lg:grid-cols-[420px_1fr]">
			<section className="rounded-3xl border bg-white p-5 shadow-sm">
				<h2 className="font-black">Template</h2>
				<div className="mt-3 grid gap-2">
					<input className="rounded-xl border p-3" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
					<input className="rounded-xl border p-3" type="number" min="1" value={form.attemptNumber} onChange={(e) => setForm({ ...form, attemptNumber: e.target.value })} />
					<textarea className="min-h-48 rounded-xl border p-3" placeholder="Mensagem com {{cliente}}, {{primeiro_nome}}, {{tecnico}}, {{empresa}}, {{cidade}}, {{os}}, {{data}}" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
					<label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Padrão da tentativa</label>
					<button type="button" onClick={save} className="rounded-xl bg-blue-600 p-3 font-black text-white">Salvar template</button>
				</div>
			</section>
			<section className="rounded-3xl border bg-white p-5 shadow-sm">
				<h2 className="font-black">Templates ativos</h2>
				<div className="mt-3 grid gap-3">
					{items.map((item) => (
						<button type="button" key={item.id} onClick={() => setForm({ id: item.id, name: item.name, body: item.body, attemptNumber: item.attempt_number, active: item.active, isDefault: item.is_default })} className="rounded-2xl border p-4 text-left">
							<strong>{item.name}</strong>
							<p className="text-sm text-slate-500">Tentativa {item.attempt_number} · {item.is_default ? "padrão" : "alternativo"}</p>
						</button>
					))}
				</div>
			</section>
		</div>
	);
}

function SettingsTab() {
	const [form, setForm] = useState(null);
	useEffect(() => { buscarConfiguracoesTentativas().then(setForm); }, []);
	if (!form) return <Spinner />;
	const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
	return (
		<section className="max-w-3xl rounded-3xl border bg-white p-5 shadow-sm">
			<h2 className="text-lg font-black">Política de contato</h2>
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<label className="grid gap-1 font-bold">Meta cobertura (%)<input className="rounded-xl border p-3" type="number" value={form.coverage_goal} onChange={(e) => update("coverage_goal", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Intervalo mínimo (h)<input className="rounded-xl border p-3" type="number" value={form.min_interval_hours} onChange={(e) => update("min_interval_hours", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Máximo tentativas<input className="rounded-xl border p-3" type="number" value={form.max_attempts} onChange={(e) => update("max_attempts", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Qtd. campanha<input className="rounded-xl border p-3" type="number" value={form.default_campaign_size} onChange={(e) => update("default_campaign_size", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Início<input className="rounded-xl border p-3" value={form.allowed_start_time} onChange={(e) => update("allowed_start_time", e.target.value)} /></label>
				<label className="grid gap-1 font-bold">Fim<input className="rounded-xl border p-3" value={form.allowed_end_time} onChange={(e) => update("allowed_end_time", e.target.value)} /></label>
			</div>
			<button type="button" onClick={async () => setForm(await salvarConfiguracoesTentativas(form))} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-black text-white"><Save className="h-4 w-4" /> Salvar</button>
		</section>
	);
}

export default function TentativasPage() {
	const { currentUser } = useAuthContext();
	const admin = useMemo(() => canManage(currentUser), [currentUser]);
	const [tab, setTab] = useState("route");
	const tabs = [["route", "Minha Rota", Route], ...(admin ? ADMIN_TABS : [["history", "Histórico", History]])];
	return (
		<div className="space-y-5">
			<PageHeader
				eyebrow="Esteira operacional"
				title="Tentativas"
				description="Match → contato manual via WhatsApp → resposta → agendamento → retirada."
				icon={<div className="rounded-2xl bg-blue-600 p-3 text-white"><MessageCircle className="h-6 w-6" /></div>}
			/>
			<div className="flex gap-2 overflow-x-auto pb-1">
				{tabs.map(([key, label, Icon]) => (
					<TabButton key={key} icon={Icon} active={tab === key} onClick={() => setTab(key)}>{label}</TabButton>
				))}
			</div>
			{tab === "route" ? <MyRoute /> : null}
			{tab === "overview" ? <OverviewTab /> : null}
			{tab === "distribution" ? <DistributionTab /> : null}
			{tab === "history" ? <HistoryTab /> : null}
			{tab === "templates" ? <TemplatesTab /> : null}
			{tab === "settings" ? <SettingsTab /> : null}
		</div>
	);
}
