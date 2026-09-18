import { useEffect, useState } from "react";
import { CheckCircle2, DatabaseZap, Pencil, Plug, RefreshCw, ServerCog, XCircle } from "lucide-react";
import { fetchRotIntegrations, requestRotApi, saveRotIntegration, syncRotLegacyOperationData } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";

// Mesmo padrao visual da Central de Integrações do Retiradas
// (src/modules/integracoes/components/IntegracoesPage.jsx): header com
// icone+titulo+contador, KPIs, tabela. Adaptado porque o catalogo da Operação
// e fixo por provedor (nao ha CRUD livre de registros arbitrarios) — o
// "editar" abre um modal com os campos daquele provedor.
export default function IntegrationsPage() {
	const [items, setItems] = useState([]);
	const [apiStatuses, setApiStatuses] = useState({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [editing, setEditing] = useState(null);
	const [syncState, setSyncState] = useState({ loading: false, result: null, error: "" });

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchRotIntegrations());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as integrações.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const activeCount = items.filter((item) => item.configured).length;

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
							<Plug size={18} />
						</div>
						<div>
							<h1 className="text-xl font-black text-gray-900">Central de Integrações</h1>
							<p className="text-sm text-gray-500">Chaves e credenciais dos serviços externos usados pela Operação.</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
							{activeCount}/{items.length} configuradas
						</span>
						<button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
							<RefreshCw size={14} /> Atualizar
						</button>
					</div>
				</div>
			</section>

			{error ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

			<section className="grid gap-3 md:grid-cols-2">
				<div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Integrações no catálogo</p>
					<p className="mt-1 text-2xl font-black text-gray-900">{items.length}</p>
				</div>
				<div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-green-600">Configuradas</p>
					<p className="mt-1 text-2xl font-black text-green-800">{activeCount}</p>
				</div>
			</section>

			<LegacySyncPanel syncState={syncState} setSyncState={setSyncState} />

			<InternalApisPanel statuses={apiStatuses} setStatuses={setApiStatuses} />

			<section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
				{!items.length ? (
					<div className="p-8 text-center">
						<Plug size={30} className="mx-auto text-gray-300" />
						<p className="mt-3 text-sm font-semibold text-gray-700">Nenhuma integração no catálogo ainda.</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-100 text-sm">
							<thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
								<tr>
									<th className="px-5 py-3">Integração</th>
									<th className="px-5 py-3">Campos</th>
									<th className="px-5 py-3">Status</th>
									<th className="px-5 py-3">Ações</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 bg-white">
								{items.map((item) => (
									<tr key={item.provider}>
										<td className="px-5 py-3">
											<p className="font-bold text-gray-900">{item.label}</p>
											<p className="text-xs text-gray-500">{item.description}</p>
										</td>
										<td className="px-5 py-3 text-xs text-gray-500">{item.fields.map((field) => field.label).join(", ")}</td>
										<td className="px-5 py-3">
											{item.configured ? (
												<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
													<CheckCircle2 size={14} /> Configurado
												</span>
											) : (
												<span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">
													<XCircle size={14} /> Pendente
												</span>
											)}
										</td>
										<td className="px-5 py-3">
											<button
												type="button"
												onClick={() => setEditing(item)}
												className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
												title="Editar"
											>
												<Pencil size={16} />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{editing ? (
				<IntegrationModal
					item={editing}
					onClose={() => setEditing(null)}
					onSaved={async () => {
						setEditing(null);
						await load();
					}}
				/>
			) : null}
		</div>
	);
}

function LegacySyncPanel({ syncState, setSyncState }) {
	const runSync = async () => {
		setSyncState({ loading: true, result: null, error: "" });
		try {
			const result = await syncRotLegacyOperationData();
			setSyncState({ loading: false, result, error: "" });
		} catch (err) {
			setSyncState({ loading: false, result: null, error: err?.message || "Falha ao sincronizar dados do Retiradas." });
		}
	};
	const entries = syncState.result ? Object.entries(syncState.result) : [];
	return (
		<section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-start gap-3">
					<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
						<DatabaseZap size={20} />
					</span>
					<div>
						<h2 className="text-base font-black text-slate-950">Sincronização com dados do Retiradas</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Preenche Operação com regionais, agentes, empresas, técnicos, acertos e entregas existentes no sistema principal.
						</p>
						{syncState.error ? <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{syncState.error}</p> : null}
						{entries.length ? (
							<div className="mt-3 flex flex-wrap gap-2">
								{entries.map(([key, value]) => (
									<span key={key} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
										{key}: {value}
									</span>
								))}
							</div>
						) : null}
					</div>
				</div>
				<button
					type="button"
					onClick={runSync}
					disabled={syncState.loading}
					className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-60"
				>
					<RefreshCw size={16} className={syncState.loading ? "animate-spin" : ""} />
					{syncState.loading ? "Sincronizando..." : "Sincronizar agora"}
				</button>
			</div>
		</section>
	);
}

const INTERNAL_APIS = [
	{
		id: "regionals",
		label: "Regionais canônicas",
		path: "/admin/regionals",
		description: "Base canônica de regionais, cidades e responsáveis.",
	},
	{
		id: "agents",
		label: "Agentes",
		path: "/admin/agents",
		description: "Agentes autorizados por regional, cidade e escopo operacional.",
	},
	{
		id: "companies",
		label: "Empresas",
		path: "/admin/companies",
		description: "Empresas da Operação com vínculos de regionais, agentes e escopos.",
	},
	{
		id: "technicians",
		label: "Técnicos",
		path: "/admin/technicians",
		description: "Técnicos operacionais vinculados a empresa, regional e escopo.",
	},
	{
		id: "stock-adjustments",
		label: "Acerto de Estoque",
		path: "/admin/stock-adjustments",
		description: "Conferências e acertos de materiais por técnico e regional.",
	},
	{
		id: "tech-deliveries",
		label: "Entrega Técnicos",
		path: "/admin/tech-deliveries",
		description: "Entregas, trocas e devoluções de materiais para técnicos.",
	},
	{
		id: "bag-audit",
		label: "Auditoria Bolsa",
		path: "/admin/bag-audit",
		description: "Auditorias de bolsa, EPIs, ferramentas e materiais.",
	},
	{
		id: "audit-reports",
		label: "Relatórios Auditoria",
		path: "/admin/audit-reports",
		description: "Resumo consolidado de acertos, entregas e auditorias.",
	},
];

function InternalApisPanel({ statuses, setStatuses }) {
	const [testingAll, setTestingAll] = useState(false);

	const testApi = async (api) => {
		const startedAt = performance.now();
		setStatuses((current) => ({
			...current,
			[api.id]: { status: "testing", message: "Testando...", checkedAt: new Date().toISOString() },
		}));
		try {
			const data = await requestRotApi(api.path);
			const durationMs = Math.round(performance.now() - startedAt);
			const total = Array.isArray(data?.items) ? data.items.length : null;
			setStatuses((current) => ({
				...current,
				[api.id]: {
					status: "ok",
					message: total === null ? `OK em ${durationMs}ms` : `OK em ${durationMs}ms · ${total} registro(s)`,
					checkedAt: new Date().toISOString(),
				},
			}));
		} catch (err) {
			setStatuses((current) => ({
				...current,
				[api.id]: {
					status: "error",
					message: err?.message || "Falha ao testar API.",
					checkedAt: new Date().toISOString(),
				},
			}));
		}
	};

	const testAll = async () => {
		setTestingAll(true);
		try {
			for (const api of INTERNAL_APIS) {
				await testApi(api);
			}
		} finally {
			setTestingAll(false);
		}
	};

	return (
		<section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
			<div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
						<ServerCog size={18} />
					</span>
					<div>
						<h2 className="text-base font-black text-slate-950">APIs internas da Operação</h2>
						<p className="text-sm font-semibold text-slate-500">Endpoints criados nas fases da migração para conferência rápida.</p>
					</div>
				</div>
				<button
					type="button"
					onClick={testAll}
					disabled={testingAll}
					className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
				>
					<RefreshCw size={14} className={testingAll ? "animate-spin" : ""} />
					Testar todas
				</button>
			</div>
			<div className="divide-y divide-slate-100">
				{INTERNAL_APIS.map((api) => {
					const status = statuses[api.id];
					const isTesting = status?.status === "testing";
					const isOk = status?.status === "ok";
					const isError = status?.status === "error";
					return (
						<div key={api.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
							<div>
								<p className="text-sm font-black text-slate-900">{api.label}</p>
								<p className="mt-1 text-xs font-semibold text-slate-500">{api.description}</p>
								<p className="mt-1 font-mono text-xs font-bold text-slate-400">GET /api{api.path}</p>
							</div>
							<div>
								{status ? (
									<span
										className={[
											"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black",
											isOk ? "bg-emerald-50 text-emerald-700" : "",
											isError ? "bg-red-50 text-red-700" : "",
											isTesting ? "bg-blue-50 text-blue-700" : "",
										].join(" ")}
									>
										{isOk ? <CheckCircle2 size={14} /> : null}
										{isError ? <XCircle size={14} /> : null}
										{isTesting ? <RefreshCw size={14} className="animate-spin" /> : null}
										{status.message}
									</span>
								) : (
									<span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">
										<XCircle size={14} /> Não testada
									</span>
								)}
							</div>
							<button
								type="button"
								onClick={() => testApi(api)}
								disabled={isTesting}
								className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
							>
								<RefreshCw size={14} className={isTesting ? "animate-spin" : ""} />
								Testar
							</button>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function IntegrationModal({ item, onClose, onSaved }) {
	const [values, setValues] = useState(() =>
		Object.fromEntries(item.fields.map((field) => [field.key, field.secret ? "" : field.value])),
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const save = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			await saveRotIntegration(item.provider, values);
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell
			open
			title={item.label}
			description={item.description}
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Plug size={22} /></span>}
			onClose={onClose}
			size="sm"
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={save} className="space-y-3">
				{item.fields.map((field) => (
					<label key={field.key} className="block text-xs font-bold text-slate-600">
						{field.label}
						<input
							type={field.secret ? "password" : "text"}
							value={values[field.key] || ""}
							onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
							placeholder={field.secret && field.hasValue ? field.value || "•••••••• (mantido)" : ""}
							className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
				))}
				<div className="flex justify-end gap-2 pt-2">
					<button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
						Cancelar
					</button>
					<button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : "Salvar"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}
