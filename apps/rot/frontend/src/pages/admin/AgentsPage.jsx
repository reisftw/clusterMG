import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Star, Trash2, UserRound } from "lucide-react";
import {
	createRotAgent,
	deleteRotAgent,
	fetchRotAgents,
	fetchRotRegionals,
	updateRotAgent,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";

const OPERATION_OPTIONS = [
	{ id: "ROT", label: "ROT" },
	{ id: "FIELD", label: "FIELD" },
	{ id: "DELIVERY", label: "DELIVERY" },
];

const emptyResponsible = { name: "", phone: "", email: "" };

function getInitialForm(agent, regionals) {
	const regionalId = agent?.regionalId || regionals[0]?.id || "";
	return {
		regionalId,
		cityId: agent?.cityId || "",
		cityName: agent?.cityName || "",
		responsible: agent?.responsible || emptyResponsible,
		operationScopes: agent?.operationScopes?.length ? agent.operationScopes : ["ROT"],
	};
}

export default function AgentsPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.agents.manage");
	const [agents, setAgents] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [agentList, regionalList] = await Promise.all([fetchRotAgents(), fetchRotRegionals()]);
			setAgents(agentList);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os agentes.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const grouped = useMemo(() => {
		const map = new Map();
		for (const agent of agents) {
			const key = agent.regionalName || "Sem regional";
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(agent);
		}
		return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [agents]);

	const handleDelete = async (agent) => {
		if (!window.confirm(`Excluir o agente de ${agent.cityName}?`)) return;
		setError("");
		try {
			await deleteRotAgent(agent.id);
			setAgents((current) => current.filter((item) => item.id !== agent.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o agente.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
						<Star size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Agentes</h1>
						<p className="text-sm font-semibold text-slate-500">Agentes autorizados por regional, cidade e escopo operacional.</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} />
						Atualizar
					</button>
					{canManage ? (
						<button type="button" onClick={() => setModal({ agent: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-extrabold text-white shadow-lg shadow-amber-100 hover:bg-amber-600">
							<Plus size={17} /> Novo agente
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{agents.length ? (
				<div className="space-y-4">
					{grouped.map(([regionalName, items]) => (
						<section key={regionalName} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<div className="mb-4 flex items-center justify-between">
								<div>
									<h2 className="text-lg font-black text-slate-950">{regionalName}</h2>
									<p className="text-xs font-bold uppercase tracking-wide text-amber-600">{items.length} agente(s)</p>
								</div>
							</div>
							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
								{items.map((agent) => (
									<article key={agent.id} className="rot-card-hover rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="truncate text-base font-black text-slate-950">{agent.cityName}</p>
												<p className="mt-1 text-xs font-bold text-slate-500">{agent.operationScopes.join(" / ")}</p>
											</div>
											{canManage ? (
												<div className="flex shrink-0 gap-1">
													<button type="button" onClick={() => setModal({ agent })} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-amber-600" title="Editar agente">
														<Edit3 size={15} />
													</button>
													<button type="button" onClick={() => handleDelete(agent)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-red-600" title="Excluir agente">
														<Trash2 size={15} />
													</button>
												</div>
											) : null}
										</div>
										<div className="mt-4 rounded-xl border border-white/80 bg-white/80 p-3">
											<p className="mb-1 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-400">
												<UserRound size={13} /> Responsável
											</p>
											<p className="text-sm font-black text-slate-800">{agent.responsible?.name || "Não informado"}</p>
											<p className="mt-1 text-xs font-semibold text-slate-500">{agent.responsible?.phone || "Sem telefone"} · {agent.responsible?.email || "Sem e-mail"}</p>
										</div>
									</article>
								))}
							</div>
						</section>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
					Nenhum agente cadastrado ainda.
				</div>
			)}

			{modal ? (
				<AgentFormModal
					agent={modal.agent}
					regionals={regionals}
					onClose={() => setModal(null)}
					onSaved={(saved) => {
						setAgents((current) => {
							const exists = current.some((item) => item.id === saved.id);
							const next = exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved];
							return next.sort((a, b) => `${a.regionalName}-${a.cityName}`.localeCompare(`${b.regionalName}-${b.cityName}`));
						});
						setModal(null);
					}}
				/>
			) : null}
		</div>
	);
}

function AgentFormModal({ agent, regionals, onClose, onSaved }) {
	const [form, setForm] = useState(() => getInitialForm(agent, regionals));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const selectedRegional = regionals.find((regional) => regional.id === form.regionalId);
	const cities = selectedRegional?.cities || [];

	const updateResponsible = (field, value) => {
		setForm((current) => ({
			...current,
			responsible: { ...current.responsible, [field]: value },
		}));
	};

	const toggleScope = (scope) => {
		setForm((current) => {
			const hasScope = current.operationScopes.includes(scope);
			const next = hasScope
				? current.operationScopes.filter((item) => item !== scope)
				: [...current.operationScopes, scope];
			return { ...current, operationScopes: next.length ? next : ["ROT"] };
		});
	};

	const submit = async () => {
		setSaving(true);
		setError("");
		try {
			const payload = {
				regionalId: form.regionalId,
				cityId: form.cityId || null,
				cityName: form.cityId ? "" : form.cityName,
				responsible: form.responsible,
				operationScopes: form.operationScopes,
			};
			const saved = agent ? await updateRotAgent(agent.id, payload) : await createRotAgent(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o agente.");
		} finally {
			setSaving(false);
		}
	};

	const cityIsValid = form.cityId || form.cityName.trim();
	const canSave = form.regionalId && cityIsValid && !saving;

	return (
		<ModalShell open title={agent ? "Editar agente" : "Novo agente"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Star size={22} /></span>} onClose={onClose} size="lg">
			<div className="space-y-4">
				{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
				<div className="grid gap-4 md:grid-cols-2">
					<label className="space-y-1.5">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
						<select value={form.regionalId} onChange={(event) => setForm((current) => ({ ...current, regionalId: event.target.value, cityId: "" }))} className="input-field">
							<option value="">Selecione</option>
							{regionals.map((regional) => <option key={regional.id} value={regional.id}>{regional.name}</option>)}
						</select>
					</label>
					<label className="space-y-1.5">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">Cidade cadastrada</span>
						<select value={form.cityId} onChange={(event) => setForm((current) => ({ ...current, cityId: event.target.value, cityName: "" }))} className="input-field">
							<option value="">Digitar cidade manualmente</option>
							{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
						</select>
					</label>
				</div>
				{!form.cityId ? (
					<label className="block space-y-1.5">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">Cidade do agente</span>
						<input value={form.cityName} onChange={(event) => setForm((current) => ({ ...current, cityName: event.target.value.toUpperCase() }))} className="input-field" placeholder="Nome da cidade" />
					</label>
				) : null}
				<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
					<p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Escopo operacional</p>
					<div className="flex flex-wrap gap-2">
						{OPERATION_OPTIONS.map((option) => (
							<label key={option.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
								<input type="checkbox" checked={form.operationScopes.includes(option.id)} onChange={() => toggleScope(option.id)} />
								{option.label}
							</label>
						))}
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					<label className="space-y-1.5">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">Responsável</span>
						<input value={form.responsible.name} onChange={(event) => updateResponsible("name", event.target.value)} className="input-field" placeholder="Nome" />
					</label>
					<label className="space-y-1.5">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">Telefone</span>
						<input value={form.responsible.phone} onChange={(event) => updateResponsible("phone", event.target.value)} className="input-field" placeholder="Telefone" />
					</label>
					<label className="space-y-1.5">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">E-mail</span>
						<input value={form.responsible.email} onChange={(event) => updateResponsible("email", event.target.value)} className="input-field" placeholder="email@sempre.net.br" />
					</label>
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<button type="button" onClick={onClose} className="rot-btn-tactile rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
					<button type="button" disabled={!canSave} onClick={submit} className="rot-btn-tactile rounded-xl bg-amber-500 px-5 py-2 text-sm font-black text-white shadow-lg shadow-amber-100 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50">
						{saving ? "Salvando..." : "Salvar"}
					</button>
				</div>
			</div>
		</ModalShell>
	);
}
