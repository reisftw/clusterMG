import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Edit3, ExternalLink, Mail, MapPin, Plus, RefreshCw, Search, Trash2, Upload, UsersRound } from "lucide-react";
import {
	createRotCompany,
	deleteRotCompany,
	fetchRotAgents,
	fetchRotCompanies,
	fetchRotRegionals,
	updateRotCompany,
} from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const OPERATION_OPTIONS = ["ROT", "FIELD", "DELIVERY"];
const STATUS_OPTIONS = ["Ativa", "Inativa"];
const ATUACAO_OPTIONS = ["Ambos", "Ativacao", "Manutencao"];
const LOGO_MAX_BYTES = 450 * 1024;

function initialForm(company) {
	return {
		name: company?.name || "",
		cnpj: company?.cnpj || "",
		logoUrl: company?.logoUrl || "",
		status: company?.status || "Ativa",
		atuacao: company?.atuacao || "Ambos",
		authorizedAgent: company?.authorizedAgent || false,
		responsible: company?.responsible || { name: "", email: "" },
		regionalIds: company?.regionalIds || [],
		agentIds: company?.agentIds || [],
		operationScopes: company?.operationScopes?.length ? company.operationScopes : ["ROT"],
		notes: company?.notes || "",
	};
}

function initials(name = "") {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase() || "E";
}

function slugifyCompany(value = "") {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export default function CompaniesPage() {
	const { slug } = useParams();
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.companies.manage");
	const [companies, setCompanies] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [agents, setAgents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null);
	const [query, setQuery] = useState("");
	const [regionalFilter, setRegionalFilter] = useState("all");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [companyList, regionalList, agentList] = await Promise.all([
				fetchRotCompanies(),
				fetchRotRegionals(),
				fetchRotAgents().catch(() => []),
			]);
			setCompanies(companyList);
			setRegionals(regionalList);
			setAgents(agentList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as empresas.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return companies.filter((company) => {
			const matchesRegional = regionalFilter === "all" || company.regionalIds?.includes(regionalFilter);
			const haystack = [
				company.name,
				company.cnpj,
				company.responsible?.name,
				company.responsible?.email,
				...(company.regionalNames || []),
			].join(" ").toLowerCase();
			return matchesRegional && (!needle || haystack.includes(needle));
		});
	}, [companies, query, regionalFilter]);

	const stats = useMemo(() => {
		const technicians = companies.reduce((sum, company) => sum + Number(company.techniciansCount || 0), 0);
		return {
			total: companies.length,
			active: companies.filter((company) => company.status === "Ativa").length,
			technicians,
			regionals: new Set(companies.flatMap((company) => company.regionalIds || [])).size,
		};
	}, [companies]);

	const handleDelete = async (company) => {
		if (!window.confirm(`Inativar a empresa "${company.name}"?`)) return;
		setError("");
		try {
			await deleteRotCompany(company.id);
			setCompanies((current) => current.filter((item) => item.id !== company.id));
		} catch (err) {
			setError(err?.message || "Não foi possível inativar a empresa.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	if (slug) {
		const selectedCompany = companies.find(
			(company) =>
				company.slug === slug ||
				company.id === slug ||
				slugifyCompany(company.name) === slug,
		);
		return (
			<CompanyProfile
				company={selectedCompany}
				canManage={canManage}
				onEdit={() => selectedCompany && setModal({ company: selectedCompany })}
				onDelete={() => selectedCompany && handleDelete(selectedCompany)}
				notFound={!selectedCompany}
				formModal={modal ? (
					<CompanyFormModal
						company={modal.company}
						regionals={regionals}
						agents={agents}
						onClose={() => setModal(null)}
						onSaved={(saved) => {
							setCompanies((current) => current.map((item) => (item.id === saved.id ? saved : item)));
							setModal(null);
						}}
					/>
				) : null}
			/>
		);
	}

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-blue-100 bg-white px-5 py-5 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div className="flex items-center gap-4">
						<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<Building2 size={24} />
						</span>
						<div>
							<h1 className="text-2xl font-black text-slate-950">Empresas</h1>
							<p className="text-sm font-semibold text-slate-500">Gerencie empresas, técnicos, responsáveis, regionais e visualize o histórico de acertos.</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
							<RefreshCw size={16} /> Atualizar
						</button>
						{canManage ? (
							<button type="button" onClick={() => setModal({ company: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-100 hover:bg-blue-700">
								<Plus size={17} /> Nova empresa
							</button>
						) : null}
					</div>
				</div>
			</section>

			<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<KpiCard icon={Building2} label="Empresas" value={stats.total} hint="Total cadastradas" tone="blue" />
				<KpiCard icon={CheckCircle2} label="Ativas" value={stats.active} hint="Empresas ativas" tone="green" />
				<KpiCard icon={UsersRound} label="Técnicos" value={stats.technicians} hint="Total cadastrados" tone="purple" />
				<KpiCard icon={MapPin} label="Regionais" value={stats.regionals} hint="Regionais ativas" tone="amber" />
			</section>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="text-xl font-black text-slate-950">Empresas cadastradas</h2>
						<p className="text-sm font-semibold text-blue-600">{filtered.length} registro(s)</p>
					</div>
					<div className="flex flex-col gap-2 md:flex-row">
						<label className="relative">
							<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 md:w-[32rem]"
								placeholder="Buscar por empresa, regional, cidade ou responsável"
							/>
						</label>
						<select value={regionalFilter} onChange={(event) => setRegionalFilter(event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
							<option value="all">Todas as regionais</option>
							{regionals.map((regional) => <option key={regional.id} value={regional.id}>{regional.name}</option>)}
						</select>
					</div>
				</div>

				{filtered.length ? (
					<div className="grid gap-4 xl:grid-cols-3">
						{filtered.map((company) => (
							<CompanyCard key={company.id} company={company} canManage={canManage} onEdit={() => setModal({ company })} onDelete={() => handleDelete(company)} />
						))}
					</div>
				) : (
					<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
						Nenhuma empresa encontrada.
					</div>
				)}
			</section>

			{modal ? (
				<CompanyFormModal
					company={modal.company}
					regionals={regionals}
					agents={agents}
					onClose={() => setModal(null)}
					onSaved={(saved) => {
						setCompanies((current) => {
							const exists = current.some((item) => item.id === saved.id);
							const next = exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved];
							return next.sort((a, b) => a.name.localeCompare(b.name));
						});
						setModal(null);
					}}
				/>
			) : null}
		</div>
	);
}

function KpiCard({ icon: Icon, label, value, hint, tone }) {
	const toneClasses = {
		blue: "bg-blue-50 text-blue-700 border-blue-100",
		green: "bg-emerald-50 text-emerald-700 border-emerald-100",
		purple: "bg-violet-50 text-violet-700 border-violet-100",
		amber: "bg-amber-50 text-amber-700 border-amber-100",
	};
	return (
		<div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-center gap-4">
				<span className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClasses[tone]}`}>
					<Icon size={22} />
				</span>
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
					<p className="text-3xl font-black text-slate-950">{value}</p>
					<p className="text-xs font-semibold text-slate-500">{hint}</p>
				</div>
			</div>
			<span className={`h-8 w-16 rounded-full ${toneClasses[tone].split(" ")[0]}`} />
		</div>
	);
}

function CompanyCard({ company, canManage, onEdit, onDelete }) {
	const deliveryCount = Number(company.deliveryCount || 0);
	const fieldCount = Number(company.fieldCount || 0);
	const techniciansCount = Number(company.techniciansCount || deliveryCount + fieldCount || 0);
	const techniciansPreview = Array.isArray(company.technicians) ? company.technicians.slice(0, 3) : [];
	return (
		<article className="rot-card-hover rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-start gap-4">
				{company.logoUrl ? (
					<img src={company.logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-slate-100 object-contain" />
				) : (
					<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl font-black text-blue-700">{initials(company.name)}</span>
				)}
				<div className="min-w-0">
					<h3 className="truncate text-base font-black text-slate-950">{company.name}</h3>
					<p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{company.regionalNames?.join(", ") || "Sem regional"} · {company.atuacao}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">CNPJ: {company.cnpj || "-"}</p>
					<p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Mail size={13} /> {company.responsible?.email || "Sem e-mail"}</p>
				</div>
			</div>
			<div className="mt-5 grid grid-cols-3 gap-2">
				<MiniStat label="Téc." value={techniciansCount} tone="blue" />
				<MiniStat label="Delivery" value={deliveryCount} tone="slate" />
				<MiniStat label="Field" value={fieldCount} tone="green" />
			</div>
			{techniciansPreview.length ? (
				<div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
					<p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Técnicos vinculados</p>
					<p className="mt-1 truncate text-xs font-bold text-slate-600">
						{techniciansPreview.map((technician) => technician.name).join(", ")}
						{techniciansCount > techniciansPreview.length ? ` +${techniciansCount - techniciansPreview.length}` : ""}
					</p>
				</div>
			) : null}
			<div className="mt-4 flex gap-2">
				<NavLink to={`/empresas/${company.slug || slugifyCompany(company.name) || company.id}`} className="rot-btn-tactile inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700">
					Ver perfil <ExternalLink size={14} />
				</NavLink>
				{canManage ? (
					<>
						<button type="button" onClick={onEdit} className="rot-btn-tactile flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" title="Editar">
							<Edit3 size={16} />
						</button>
						<button type="button" onClick={onDelete} className="rot-btn-tactile flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50" title="Inativar">
							<Trash2 size={16} />
						</button>
					</>
				) : null}
			</div>
		</article>
	);
}

function CompanyProfile({ company, canManage, onEdit, onDelete, notFound, formModal }) {
	if (notFound) {
		return (
			<div className="space-y-5">
				<NavLink to="/admin/empresas" className="inline-flex items-center gap-2 text-sm font-black text-blue-700">
					<ArrowLeft size={16} /> Voltar para empresas
				</NavLink>
				<section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
					<h1 className="text-2xl font-black text-slate-950">Empresa não encontrada</h1>
					<p className="mt-2 text-sm font-semibold text-slate-500">Confira se o link está correto ou volte para a listagem.</p>
				</section>
			</div>
		);
	}
	const deliveryCount = Number(company.deliveryCount || 0);
	const fieldCount = Number(company.fieldCount || 0);
	const technicians = Array.isArray(company.technicians) ? company.technicians : [];
	return (
		<div className="space-y-5">
			<NavLink to="/admin/empresas" className="inline-flex items-center gap-2 text-sm font-black text-blue-700">
				<ArrowLeft size={16} /> Voltar para empresas
			</NavLink>
			<section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex min-w-0 items-center gap-4">
						{company.logoUrl ? (
							<img src={company.logoUrl} alt="" className="h-20 w-20 shrink-0 rounded-3xl bg-slate-100 object-contain" />
						) : (
							<span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-blue-50 text-3xl font-black text-blue-700">{initials(company.name)}</span>
						)}
						<div className="min-w-0">
							<p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Perfil da empresa</p>
							<h1 className="truncate text-3xl font-black text-slate-950">{company.name}</h1>
							<p className="mt-1 text-sm font-bold text-slate-500">{company.regionalNames?.join(", ") || "Sem regional"} · {company.atuacao}</p>
							<p className="mt-1 text-sm font-semibold text-slate-500">CNPJ: {company.cnpj || "-"}</p>
						</div>
					</div>
					{canManage ? (
						<div className="flex gap-2">
							<button type="button" onClick={onEdit} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
								<Edit3 size={16} /> Editar
							</button>
							<button type="button" onClick={onDelete} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-red-100 bg-white px-4 text-sm font-black text-red-600 hover:bg-red-50">
								<Trash2 size={16} /> Inativar
							</button>
						</div>
					) : null}
				</div>
			</section>

			<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<KpiCard icon={UsersRound} label="Técnicos" value={technicians.length} hint="Total vinculados" tone="blue" />
				<KpiCard icon={Building2} label="Delivery" value={deliveryCount} hint="Atuação Delivery" tone="purple" />
				<KpiCard icon={CheckCircle2} label="Field" value={fieldCount} hint="Atuação Field Service" tone="green" />
				<KpiCard icon={MapPin} label="Regionais" value={company.regionalIds?.length || 0} hint="Regionais vinculadas" tone="amber" />
			</section>

			<section className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Dados gerais</h2>
					<dl className="mt-4 space-y-3 text-sm">
						<ProfileRow label="Status" value={company.status || "-"} />
						<ProfileRow label="Escopos" value={(company.operationScopes || []).join(", ") || "-"} />
						<ProfileRow label="Responsável" value={company.responsible?.name || "-"} />
						<ProfileRow label="E-mail" value={company.responsible?.email || "-"} />
						<ProfileRow label="Agentes" value={company.agentNames?.join(", ") || "-"} />
					</dl>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Técnicos vinculados</h2>
					<div className="mt-4 grid gap-3 md:grid-cols-2">
						{technicians.length ? technicians.map((technician) => (
							<div key={technician.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<p className="font-black text-slate-950">{technician.name}</p>
								<p className="mt-1 text-xs font-bold text-slate-500">{technician.regionalName || "Sem regional"} · {technician.cityName || "Sem cidade"}</p>
								<p className="mt-2 text-xs font-semibold text-slate-500">{technician.email || "Sem e-mail"} · {technician.phone || "Sem telefone"}</p>
								<p className="mt-3 text-xs font-black uppercase tracking-wide text-blue-700">{(technician.operationScopes || []).join(" · ") || technician.operationalArea || "-"}</p>
							</div>
						)) : (
							<p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-400 md:col-span-2">Nenhum técnico vinculado.</p>
						)}
					</div>
				</div>
			</section>
			{formModal}
		</div>
	);
}

function ProfileRow({ label, value }) {
	return (
		<div className="flex justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
			<dt className="font-bold text-slate-500">{label}</dt>
			<dd className="text-right font-black text-slate-900">{value}</dd>
		</div>
	);
}

function MiniStat({ label, value, tone }) {
	const classes = {
		blue: "bg-blue-50 text-blue-700 border-blue-100",
		slate: "bg-slate-50 text-slate-800 border-slate-200",
		green: "bg-emerald-50 text-emerald-700 border-emerald-100",
	};
	return (
		<div className={`rounded-xl border p-3 ${classes[tone]}`}>
			<p className="text-[10px] font-black uppercase">{label}</p>
			<p className="mt-1 text-xl font-black">{value}</p>
		</div>
	);
}

function toggleListValue(values, value) {
	return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toggleOperationScope(values, value) {
	const next = toggleListValue(values, value);
	return next.length ? next : ["ROT"];
}

function CompanyFormModal({ company, regionals, agents, onClose, onSaved }) {
	const [form, setForm] = useState(() => initialForm(company));
	const [regionalToAdd, setRegionalToAdd] = useState("");
	const [citySearch, setCitySearch] = useState("");
	const [agentSearch, setAgentSearch] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const selectedRegionals = regionals.filter((regional) => form.regionalIds.includes(regional.id));
	const availableCities = selectedRegionals.flatMap((regional) => (regional.cities || []).map((city) => ({ ...city, regionalName: regional.name })));
	const visibleCities = availableCities
		.filter((city) => !citySearch.trim() || `${city.name} ${city.regionalName}`.toLowerCase().includes(citySearch.trim().toLowerCase()))
		.slice(0, 8);
	const visibleAgents = agents
		.filter((agent) => {
			const regionalOk = !form.regionalIds.length || form.regionalIds.includes(agent.regionalId);
			const needle = agentSearch.trim().toLowerCase();
			const text = `${agent.cityName || ""} ${agent.regionalName || ""} ${agent.responsible?.name || ""}`.toLowerCase();
			return regionalOk && (!needle || text.includes(needle));
		})
		.slice(0, 8);

	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	const updateResponsible = (field, value) => update("responsible", { ...form.responsible, [field]: value });

	const uploadLogo = (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		if (file.size > LOGO_MAX_BYTES) {
			setError("A logo deve ter no máximo 450 KB.");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => update("logoUrl", String(reader.result || ""));
		reader.readAsDataURL(file);
	};

	const fillRegional = () => {
		if (!regionalToAdd) return;
		update("regionalIds", [...new Set([...form.regionalIds, regionalToAdd])]);
		setRegionalToAdd("");
	};

	const submit = async () => {
		setSaving(true);
		setError("");
		try {
			const saved = company ? await updateRotCompany(company.id, form) : await createRotCompany(form);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a empresa.");
		} finally {
			setSaving(false);
		}
	};

	const canSave = form.name.trim() && !saving;

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
			<div className="mx-auto max-w-6xl rounded-3xl border border-blue-100 bg-white p-6 shadow-2xl">
				<div className="mb-7 flex items-start justify-between gap-4">
					<div>
						<h2 className="text-2xl font-black text-slate-950">{company ? "Editar empresa" : "Cadastrar empresa"}</h2>
						<p className="text-sm font-semibold text-slate-500">Dados usados para alertas, perfil, técnicos e histórico de acerto de estoque.</p>
					</div>
					<button type="button" onClick={onClose} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
						× Fechar
					</button>
				</div>
				{error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

				<div className="grid gap-5 lg:grid-cols-[22rem_1fr_1fr]">
					<div className="space-y-2">
						<p className="text-xs font-black uppercase tracking-wide text-slate-500">Logo da empresa</p>
						<div className="rounded-3xl border border-dashed border-blue-200 bg-slate-50 p-4 text-center">
							{form.logoUrl ? (
								<img src={form.logoUrl} alt="" className="mx-auto h-28 w-28 rounded-3xl object-contain shadow-sm" />
							) : (
								<span className="mx-auto flex h-28 w-28 items-center justify-center rounded-3xl bg-slate-100 text-2xl font-black text-blue-700">{initials(form.name)}</span>
							)}
							<label className="rot-btn-tactile mx-auto mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">
								<Upload size={15} /> Enviar logo
								<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} className="hidden" />
							</label>
							<p className="mt-3 text-xs font-bold text-slate-500">PNG, JPG ou WebP até 450 KB.</p>
						</div>
					</div>

					<div className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							<Field label="Empresa"><input value={form.name} onChange={(event) => update("name", event.target.value)} className="input-field" placeholder="Nome da empresa" /></Field>
							<Field label="CNPJ"><input value={form.cnpj} onChange={(event) => update("cnpj", event.target.value)} className="input-field" placeholder="00.000.000/0000-00" /></Field>
							<Field label="E-mail de alertas"><input value={form.responsible.email} onChange={(event) => updateResponsible("email", event.target.value)} className="input-field" placeholder="alertas@empresa.com" /></Field>
							<Field label="Responsável"><input value={form.responsible.name} onChange={(event) => updateResponsible("name", event.target.value)} className="input-field" placeholder="Nome do responsável" /></Field>
						</div>
						<Field label="Regionais de atuação">
							<div className="flex gap-2">
								<select value={regionalToAdd} onChange={(event) => setRegionalToAdd(event.target.value)} className="input-field">
									<option value="">Selecione uma regional</option>
									{regionals.map((regional) => <option key={regional.id} value={regional.id}>{regional.name}</option>)}
								</select>
								<button type="button" onClick={fillRegional} className="rot-btn-tactile inline-flex h-12 items-center gap-2 rounded-xl bg-blue-400 px-5 text-sm font-black text-white hover:bg-blue-500"><Plus size={15} /> Preencher</button>
							</div>
							<div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
								{selectedRegionals.length ? (
									<div className="flex flex-wrap gap-2">
										{selectedRegionals.map((regional) => (
											<button key={regional.id} type="button" onClick={() => update("regionalIds", form.regionalIds.filter((id) => id !== regional.id))} className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 shadow-sm">
												{regional.name} ×
											</button>
										))}
									</div>
								) : "Nenhuma regional preenchida."}
							</div>
						</Field>
						<div className="grid gap-4 md:grid-cols-2">
							<Field label="Atuação"><select value={form.atuacao} onChange={(event) => update("atuacao", event.target.value)} className="input-field">{ATUACAO_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
							<Field label="Status da empresa"><select value={form.status} onChange={(event) => update("status", event.target.value)} className="input-field">{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
						</div>
						<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
							<p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-700">☆ Agente autorizado</p>
							<label className="inline-flex items-center gap-2 text-sm font-black text-slate-800">
								<input type="checkbox" checked={form.authorizedAgent} onChange={(event) => update("authorizedAgent", event.target.checked)} />
								É agente?
							</label>
						</div>
					</div>

					<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
						<p className="text-xs font-black uppercase tracking-wide text-blue-700">Supervisão por técnico</p>
						<p className="mt-2 text-sm font-bold leading-relaxed text-blue-900">Escolha Delivery ou Field Service em cada técnico. O supervisor vem das Regionais preenchidas.</p>
						<div className="mt-5">
							<p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Escopo operacional</p>
							<div className="flex flex-wrap gap-2">
								{OPERATION_OPTIONS.map((option) => (
									<label key={option} className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-bold text-slate-700">
										<input type="checkbox" checked={form.operationScopes.includes(option)} onChange={() => update("operationScopes", toggleOperationScope(form.operationScopes, option))} />
										{option}
									</label>
								))}
							</div>
						</div>
					</div>
				</div>

				<div className="mt-6">
					<div className="mb-3 flex items-center justify-between">
						<div>
							<p className="text-xs font-black uppercase tracking-wide text-slate-500">Cidades de atuação da empresa</p>
							<p className="text-xs font-bold text-slate-400">{availableCities.length} cidade(s) carregada(s)</p>
						</div>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
						<input value={citySearch} onChange={(event) => setCitySearch(event.target.value)} className="input-field mb-3 bg-white" placeholder="Digite o nome da cidade para localizar" />
						{availableCities.length ? (
							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
								{visibleCities.map((city) => <span key={`${city.regionalId}-${city.id}`} className="truncate rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">{city.name} · {city.regionalName}</span>)}
								{!visibleCities.length ? <span className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-400 shadow-sm">Nenhuma cidade encontrada.</span> : null}
							</div>
						) : (
							<div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-400">Preencha uma ou mais regionais para carregar as cidades.</div>
						)}
					</div>
				</div>

				<div className="mt-6">
					<div className="mb-3 flex items-center justify-between">
						<p className="text-xs font-black uppercase tracking-wide text-slate-500">Agentes vinculados</p>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
						<input value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} className="input-field mb-3 bg-white" placeholder="Digite cidade, regional ou responsável do agente" />
						{agents.length ? (
							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
								{visibleAgents.map((agent) => (
									<label key={agent.id} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm">
										<input type="checkbox" checked={form.agentIds.includes(agent.id)} onChange={() => update("agentIds", toggleListValue(form.agentIds, agent.id))} />
										{agent.cityName} · {agent.regionalName}
									</label>
								))}
								{!visibleAgents.length ? <span className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-400 shadow-sm">Nenhum agente encontrado.</span> : null}
							</div>
						) : (
							<div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-400">Nenhum agente cadastrado ainda.</div>
						)}
					</div>
				</div>

				<div className="mt-6 flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rot-btn-tactile rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
					<button type="button" disabled={!canSave} onClick={submit} className="rot-btn-tactile rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
						{saving ? "Salvando..." : "Salvar empresa"}
					</button>
				</div>
			</div>
		</div>
	);
}

function Field({ label, children }) {
	return (
		<label className="block space-y-1.5">
			<span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
			{children}
		</label>
	);
}
