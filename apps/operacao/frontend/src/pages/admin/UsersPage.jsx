import { useEffect, useMemo, useState } from "react";
import {
	Check,
	Copy,
	KeyRound,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	ShieldCheck,
	SlidersHorizontal,
	Trash2,
	UserCheck,
	UserPlus,
	Users,
} from "lucide-react";
import {
	createRotUser,
	deactivateRotUser,
	fetchRotRegionals,
	fetchRotRoles,
	fetchRotUsers,
	resetRotUserPassword,
	updateRotUser,
} from "../../api/rotApi";
import UserAvatar from "../../components/UserAvatar";
import ModalShell from "../../components/ui/ModalShell";
import ResponsiveDataView from "../../components/ui/ResponsiveDataView";
import Spinner from "../../components/ui/Spinner";

// Mesmo padrao visual de src/modules/auth/components/UsuariosPage.jsx do
// Retiradas: header com KPIs, card de filtros, tabela responsiva
// (ResponsiveDataView) com paginação, modais de criar/editar.
const STATUS_LABEL = { ativo: "Ativo", inativo: "Inativo" };
const OPERATION_SCOPE_LABELS = { ROT: "ROT", FIELD: "Field", DELIVERY: "Delivery" };
const OPERATION_SCOPE_OPTIONS = [
	{ value: "ROT", label: "ROT" },
	{ value: "FIELD", label: "Field" },
	{ value: "DELIVERY", label: "Delivery" },
];
const PAGE_SIZE_OPTIONS = [20, 30, 50];
const fieldClass =
	"h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";
const labelClass = "mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500";

function formatUltimoLogin(value) {
	if (!value) return "Nunca acessou";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Nunca acessou";
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function normalizeOperationScopes(scopes) {
	const values = Array.isArray(scopes) ? scopes : ["ROT"];
	const normalized = values.map((item) => String(item || "").trim().toUpperCase()).filter((item) => OPERATION_SCOPE_LABELS[item]);
	return [...new Set(normalized)].length ? [...new Set(normalized)] : ["ROT"];
}

export default function UsersPage() {
	const [users, setUsers] = useState([]);
	const [roles, setRoles] = useState([]);
	const [regionais, setRegionais] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busca, setBusca] = useState("");
	const [cargoFiltro, setCargoFiltro] = useState("");
	const [regionalFiltro, setRegionalFiltro] = useState("");
	const [operacaoFiltro, setOperacaoFiltro] = useState("");
	const [pagina, setPagina] = useState(1);
	const [itensPorPagina, setItensPorPagina] = useState(20);
	const [modalNovo, setModalNovo] = useState(false);
	const [editando, setEditando] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [usersData, rolesData, regionaisData] = await Promise.all([
				fetchRotUsers(),
				fetchRotRoles(),
				fetchRotRegionals(),
			]);
			setUsers(usersData);
			setRoles(rolesData);
			setRegionais(regionaisData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os usuários.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	useEffect(() => {
		setPagina(1);
	}, [busca, cargoFiltro, regionalFiltro, itensPorPagina]);

	const regionalNome = (id) => regionais.find((item) => item.id === id)?.name || "";

	const usuariosFiltrados = useMemo(() => {
		const term = busca.trim().toLowerCase();
		return users.filter((user) => {
			if (cargoFiltro && user.role !== cargoFiltro) return false;
			if (regionalFiltro && user.regionalId !== regionalFiltro) return false;
			if (operacaoFiltro && !normalizeOperationScopes(user.operationScopes).includes(operacaoFiltro)) return false;
			if (!term) return true;
			return [user.name, user.username, user.email, user.roleName, regionalNome(user.regionalId)]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(term));
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [users, busca, cargoFiltro, regionalFiltro, operacaoFiltro, regionais]);

	const summary = useMemo(() => {
		const ativos = users.filter((user) => user.status === "ativo").length;
		const globais = users.filter((user) => user.isGlobal).length;
		const nuncaAcessou = users.filter((user) => !user.lastLoginAt).length;
		return { ativos, globais, nuncaAcessou };
	}, [users]);

	const totalPaginas = Math.max(1, Math.ceil(usuariosFiltrados.length / itensPorPagina));
	const paginaAtual = Math.min(pagina, totalPaginas);
	const usuariosPaginados = usuariosFiltrados.slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina);

	const handleDeactivate = async (user) => {
		if (!window.confirm(`Desativar o acesso de "${user.name}"?`)) return;
		try {
			await deactivateRotUser(user.id);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível desativar o usuário.");
		}
	};

	const columns = [
		{
			key: "usuario",
			header: "Usuário",
			cardLabel: "Usuário",
			render: (user) => (
				<div className="flex min-w-0 items-center gap-3">
					<UserAvatar
						src={user.avatarUrl}
						name={user.name}
						email={user.email}
						className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-sm font-black text-blue-700"
					/>
					<div className="min-w-0">
						<p className="truncate font-black text-slate-900">{user.name}</p>
						<p className="truncate text-xs font-semibold text-slate-500">@{user.username}</p>
					</div>
				</div>
			),
		},
		{
			key: "regional",
			header: "Regional",
			render: (user) => (user.isGlobal ? "Global (todas)" : regionalNome(user.regionalId) || "-"),
			className: "text-sm font-semibold text-slate-600",
		},
		{
			key: "cargo",
			header: "Cargo",
			render: (user) => <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{user.roleName}</span>,
		},
		{
			key: "operacao",
			header: "Operação",
			render: (user) => (
				<div className="flex flex-wrap gap-1">
					{normalizeOperationScopes(user.operationScopes).map((scope) => (
						<span key={scope} className="inline-flex rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-700">
							{OPERATION_SCOPE_LABELS[scope] || scope}
						</span>
					))}
				</div>
			),
		},
		{
			key: "status",
			header: "Status",
			render: (user) => (
				<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${user.status === "ativo" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
					{STATUS_LABEL[user.status] || user.status}
				</span>
			),
		},
		{
			key: "ultimoLogin",
			header: "Último login",
			render: (user) => formatUltimoLogin(user.lastLoginAt),
			className: "text-sm font-semibold text-slate-600",
		},
		{
			key: "acoes",
			header: "Ações",
			headerClassName: "text-right",
			className: "md:text-right",
			render: (user) => (
				<div className="flex justify-end gap-1">
					<button
						type="button"
						onClick={() => setEditando(user)}
						title="Editar"
						aria-label={`Editar "${user.name}"`}
						className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
					>
						<Pencil size={16} />
					</button>
					<button
						type="button"
						onClick={() => handleDeactivate(user)}
						title="Desativar"
						aria-label={`Desativar "${user.name}"`}
						className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
					>
						<Trash2 size={16} />
					</button>
				</div>
			),
		},
	];

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<Users size={24} />
					</span>
					<div>
						<h2 className="text-2xl font-black text-slate-950">Usuários</h2>
						<p className="text-sm text-slate-500">Cargos, acesso e regionais.</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={load}
						className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
					>
						<RefreshCw size={17} /> Atualizar
					</button>
					<button
						type="button"
						onClick={() => setModalNovo(true)}
						className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
					>
						<Plus size={17} /> Novo usuário
					</button>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Kpi label="Total" value={users.length} icon={Users} tone="blue" suffix="usuários cadastrados" />
				<Kpi label="Ativos" value={summary.ativos} icon={UserCheck} tone="emerald" suffix="com acesso liberado" />
				<Kpi label="Cargos globais" value={summary.globais} icon={ShieldCheck} tone="purple" suffix="todas as regionais" />
				<Kpi label="Nunca acessaram" value={summary.nuncaAcessou} icon={UserPlus} tone="amber" suffix="ainda sem login" />
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800">
					<SlidersHorizontal size={18} className="text-blue-600" />
					Filtros
				</div>
				<div className="grid gap-3 xl:grid-cols-[1.4fr_.8fr_.8fr_.8fr_auto]">
					<label className="relative">
						<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input
							value={busca}
							onChange={(event) => setBusca(event.target.value)}
							placeholder="Buscar por nome, usuário, e-mail, cargo ou regional"
							className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<select value={cargoFiltro} onChange={(event) => setCargoFiltro(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100">
						<option value="">Todos os cargos</option>
						{roles.map((role) => (
							<option key={role.id} value={role.id}>{role.name}</option>
						))}
					</select>
					<select value={regionalFiltro} onChange={(event) => setRegionalFiltro(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100">
						<option value="">Todas as regionais</option>
						{regionais.map((regional) => (
							<option key={regional.id} value={regional.id}>{regional.name}</option>
						))}
					</select>
					<select value={operacaoFiltro} onChange={(event) => setOperacaoFiltro(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100">
						<option value="">Todas operações</option>
						{OPERATION_SCOPE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>{option.label}</option>
						))}
					</select>
					<button
						type="button"
						onClick={() => {
							setBusca("");
							setCargoFiltro("");
							setRegionalFiltro("");
							setOperacaoFiltro("");
						}}
						className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 hover:bg-slate-50"
					>
						Limpar
					</button>
				</div>
			</div>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 className="text-base font-black text-slate-950">Usuários cadastrados</h3>
						<p className="text-sm text-slate-500">Mostrando {usuariosPaginados.length} de {usuariosFiltrados.length} usuário(s) filtrado(s)</p>
					</div>
					<select
						value={itensPorPagina}
						onChange={(event) => setItensPorPagina(Number(event.target.value) || 20)}
						className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						{PAGE_SIZE_OPTIONS.map((option) => (
							<option key={option} value={option}>{option} por página</option>
						))}
					</select>
				</div>

				{error ? <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

				<div className="p-5 pt-4">
					<ResponsiveDataView
						items={usuariosPaginados}
						columns={columns}
						getRowKey={(user) => user.id}
						emptyMessage="Nenhum usuário encontrado. Ajuste os filtros para ampliar a busca."
						minTableWidth="min-w-[860px]"
					/>
				</div>

				{usuariosFiltrados.length ? (
					<div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-sm font-semibold text-slate-500">Página {paginaAtual} de {totalPaginas}</p>
						<div className="flex items-center gap-2">
							<button type="button" onClick={() => setPagina(1)} disabled={paginaAtual <= 1} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">«</button>
							<button type="button" onClick={() => setPagina((current) => Math.max(1, current - 1))} disabled={paginaAtual <= 1} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
							<button type="button" onClick={() => setPagina((current) => Math.min(totalPaginas, current + 1))} disabled={paginaAtual >= totalPaginas} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
							<button type="button" onClick={() => setPagina(totalPaginas)} disabled={paginaAtual >= totalPaginas} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">»</button>
						</div>
					</div>
				) : null}
			</div>

			{modalNovo ? (
				<UsuarioModal
					mode="create"
					roles={roles}
					regionais={regionais}
					onClose={() => setModalNovo(false)}
					onSaved={async () => {
						setModalNovo(false);
						await load();
					}}
				/>
			) : null}

			{editando ? (
				<UsuarioModal
					mode="edit"
					user={editando}
					roles={roles}
					regionais={regionais}
					onClose={() => setEditando(null)}
					onSaved={async () => {
						setEditando(null);
						await load();
					}}
				/>
			) : null}
		</div>
	);
}

function Kpi({ label, value, icon: Icon, tone, suffix }) {
	const tones = {
		blue: "bg-blue-50 text-blue-600 border-blue-100",
		emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
		purple: "bg-purple-50 text-purple-600 border-purple-100",
		amber: "bg-amber-50 text-amber-600 border-amber-100",
	};
	return (
		<div className={`rot-card-hover rounded-2xl border bg-white p-5 shadow-sm ${tones[tone]?.split(" ").slice(2).join(" ") || "border-slate-100"}`}>
			<div className="flex items-center justify-between">
				<span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
				<span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]?.split(" ").slice(0, 2).join(" ")}`}>
					<Icon size={20} />
				</span>
			</div>
			<p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
			<p className="mt-1 text-sm text-slate-500">{suffix}</p>
		</div>
	);
}

function ExtraRegionaisField({ regionais, primaryRegionalId, value, onChange }) {
	const [pendingId, setPendingId] = useState("");
	const available = regionais.filter((regional) => regional.id !== primaryRegionalId && !value.includes(regional.id));
	const addRegional = () => {
		if (!pendingId) return;
		onChange([...value, pendingId]);
		setPendingId("");
	};
	const removeRegional = (id) => onChange(value.filter((item) => item !== id));
	return (
		<div>
			<span className={labelClass}>Regionais adicionais</span>
			<p className="mb-2 text-xs font-semibold text-slate-500">
				Use quando o supervisor/líder responder por mais de uma regional (ex: lançar plantão em outra regional além da principal).
			</p>
			{value.length ? (
				<div className="mb-2 flex flex-wrap gap-1.5">
					{value.map((id) => {
						const regional = regionais.find((item) => item.id === id);
						return (
							<span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
								{regional?.name || id}
								<button type="button" onClick={() => removeRegional(id)} className="text-blue-400 hover:text-blue-700" aria-label={`Remover ${regional?.name || id}`}>
									<Trash2 size={12} />
								</button>
							</span>
						);
					})}
				</div>
			) : null}
			{available.length ? (
				<div className="flex gap-2">
					<select value={pendingId} onChange={(event) => setPendingId(event.target.value)} className={fieldClass}>
						<option value="">Selecione uma regional para adicionar</option>
						{available.map((regional) => <option key={regional.id} value={regional.id}>{regional.name}</option>)}
					</select>
					<button type="button" onClick={addRegional} disabled={!pendingId} className="rot-btn-tactile inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 disabled:opacity-50">
						<Plus size={14} /> +1 regional
					</button>
				</div>
			) : null}
		</div>
	);
}

function UsuarioModal({ mode, user, roles, regionais, onClose, onSaved }) {
	const isEdit = mode === "edit";
	const [form, setForm] = useState({
		name: user?.name || "",
		username: user?.username || "",
		email: user?.email || "",
		role: user?.role || "",
		regionalId: user?.regionalId || "",
		extraRegionalIds: Array.isArray(user?.extraRegionalIds) ? user.extraRegionalIds : [],
		operationScopes: normalizeOperationScopes(user?.operationScopes),
		status: user?.status || "ativo",
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [result, setResult] = useState(null);
	const [gerandoSenha, setGerandoSenha] = useState(false);
	const [senhaGerada, setSenhaGerada] = useState(null);
	const [gerarSenhaInicial, setGerarSenhaInicial] = useState(!isEdit);

	const handleGerarSenha = async () => {
		setGerandoSenha(true);
		setError("");
		try {
			const data = await resetRotUserPassword(user.id, { generatePassword: true });
			setSenhaGerada(data);
		} catch (err) {
			setError(err?.message || "Não foi possível gerar a nova senha.");
		} finally {
			setGerandoSenha(false);
		}
	};

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	const toggleOperationScope = (scope) => {
		setForm((current) => {
			const next = new Set(normalizeOperationScopes(current.operationScopes));
			if (next.has(scope)) next.delete(scope);
			else next.add(scope);
			return { ...current, operationScopes: next.size ? [...next] : ["ROT"] };
		});
	};

	const selectedRole = roles.find((role) => role.id === form.role);
	const needsRegional = selectedRole ? !selectedRole.isGlobal : true;

	const handleSave = async (event) => {
		event.preventDefault();
		if (!form.name.trim() || !form.username.trim() || !form.role) {
			setError("Preencha nome, usuário e cargo.");
			return;
		}
		if (needsRegional && !form.regionalId) {
			setError("Esse cargo é regional — selecione a regional do usuário.");
			return;
		}
		if (!normalizeOperationScopes(form.operationScopes).length) {
			setError("Selecione pelo menos um tipo operacional: ROT, Field ou Delivery.");
			return;
		}
		if (!form.email.trim() && !gerarSenhaInicial) {
			setError("Informe um e-mail. O acesso é enviado por link seguro e não por senha exibida na tela.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			if (isEdit) {
				await updateRotUser(user.id, {
					name: form.name,
					email: form.email || null,
					role: form.role,
					regionalId: form.regionalId || null,
					extraRegionalIds: form.extraRegionalIds,
					operationScopes: normalizeOperationScopes(form.operationScopes),
					status: form.status,
				});
				await onSaved();
			} else {
				const data = await createRotUser({
					name: form.name,
					username: form.username,
					email: form.email || null,
					role: form.role,
					regionalId: form.regionalId || null,
					extraRegionalIds: form.extraRegionalIds,
					operationScopes: normalizeOperationScopes(form.operationScopes),
					generatePassword: gerarSenhaInicial,
				});
				setResult(data);
			}
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o usuário.");
		} finally {
			setSaving(false);
		}
	};

	if (result) {
		return (
			<ModalShell
				open
				title="Usuário criado"
				icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ShieldCheck size={22} /></span>}
				onClose={() => onSaved()}
				size="sm"
			>
				<p className="text-sm font-semibold text-slate-600">
					Usuário <strong>{result.user.name}</strong> (@{result.user.username}) criado.
				</p>
				<p className="mt-2 text-xs font-semibold text-slate-500">
					{result.temporaryPassword
						? "Entregue a senha temporária abaixo ao usuário. No primeiro acesso, ele deverá trocar a senha."
						: result.welcomeEmailSent
						? "Enviamos um link seguro de primeiro acesso por e-mail. O link é de uso único e expira automaticamente."
						: "O usuário foi criado, mas o e-mail de primeiro acesso não foi enviado. Verifique a configuração SMTP e gere um novo link em editar usuário."}
				</p>
				{result.temporaryPassword ? (
					<TemporaryPasswordBox password={result.temporaryPassword} className="mt-4" />
				) : null}
				<button type="button" onClick={() => onSaved()} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
					Fechar
				</button>
			</ModalShell>
		);
	}

	return (
		<ModalShell
			open
			title={isEdit ? "Editar usuário" : "Novo usuário"}
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><UserPlus size={22} /></span>}
			onClose={onClose}
			size="lg"
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
				<label className="sm:col-span-2">
					<span className={labelClass}>Nome completo</span>
					<input value={form.name} onChange={(event) => set("name", event.target.value)} className={fieldClass} />
				</label>
				<label>
					<span className={labelClass}>Usuário</span>
					<input
						value={form.username}
						onChange={(event) => set("username", event.target.value.toLowerCase())}
						disabled={isEdit}
						className={`${fieldClass} ${isEdit ? "opacity-60" : ""}`}
					/>
				</label>
				<label>
					<span className={labelClass}>E-mail (necessário p/ login Google e MFA)</span>
					<input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} className={fieldClass} />
				</label>
				<label>
					<span className={labelClass}>Cargo</span>
					<select value={form.role} onChange={(event) => set("role", event.target.value)} className={fieldClass}>
						<option value="">Selecione</option>
						{roles.map((role) => (
							<option key={role.id} value={role.id}>{role.name}</option>
						))}
					</select>
				</label>
				<div className="sm:col-span-2">
					<span className={labelClass}>Tipo operacional *</span>
					<div className="grid gap-2 sm:grid-cols-3">
						{OPERATION_SCOPE_OPTIONS.map((option) => {
							const checked = normalizeOperationScopes(form.operationScopes).includes(option.value);
							return (
								<label
									key={option.value}
									className={`cursor-pointer rounded-xl border px-3 py-3 text-sm font-black transition ${
										checked ? "border-orange-300 bg-orange-50 text-orange-700 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
									}`}
								>
									<input
										type="checkbox"
										checked={checked}
										onChange={() => toggleOperationScope(option.value)}
										className="mr-2 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
									/>
									{option.label}
								</label>
							);
						})}
					</div>
					<p className="mt-2 text-xs font-semibold text-slate-500">
						Esse campo limita menus, dashboards e dados operacionais do usuário. Use mais de uma opção quando o colaborador atuar em mais de uma frente.
					</p>
				</div>
				<label>
					<span className={labelClass}>
						Regional {needsRegional ? <span className="text-red-500">*</span> : "(cargo é global)"}
					</span>
					<select
						value={form.regionalId}
						onChange={(event) => set("regionalId", event.target.value)}
						disabled={!needsRegional}
						required={needsRegional}
						className={`${fieldClass} ${!needsRegional ? "opacity-60" : ""}`}
					>
						<option value="">{needsRegional ? "Selecione a regional" : "Sem regional"}</option>
						{regionais.map((regional) => (
							<option key={regional.id} value={regional.id}>{regional.name}</option>
						))}
					</select>
					{needsRegional && !regionais.length ? (
						<span className="mt-1 block text-xs font-bold text-amber-600">
							Nenhuma regional cadastrada — crie uma em Sistema → Regionais primeiro.
						</span>
					) : null}
				</label>
				{needsRegional ? (
					<div className="sm:col-span-2">
						<ExtraRegionaisField
							regionais={regionais}
							primaryRegionalId={form.regionalId}
							value={form.extraRegionalIds}
							onChange={(next) => set("extraRegionalIds", next)}
						/>
					</div>
				) : null}
				{isEdit ? (
					<label>
						<span className={labelClass}>Status</span>
						<select value={form.status} onChange={(event) => set("status", event.target.value)} className={fieldClass}>
							<option value="ativo">Ativo</option>
							<option value="inativo">Inativo</option>
						</select>
					</label>
				) : null}

				{!isEdit ? (
					<div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:col-span-2">
						<div className="flex items-start gap-3">
							<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
								<KeyRound size={18} />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-black text-slate-900">Primeiro acesso seguro</p>
								<p className="text-xs font-semibold text-slate-500">
									Gere uma senha temporária para entregar ao usuário e evitar problema com link expirado.
								</p>
								<label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-black text-blue-700">
									<input
										type="checkbox"
										checked={gerarSenhaInicial}
										onChange={(event) => setGerarSenhaInicial(event.target.checked)}
										className="h-4 w-4 rounded border-blue-200 text-blue-600 focus:ring-blue-500"
									/>
									Gerar senha temporária e mostrar após criar
								</label>
								{!gerarSenhaInicial ? (
									<p className="mt-2 text-xs font-semibold text-slate-500">
										Se desmarcar, o sistema volta ao fluxo de link por e-mail e o e-mail passa a ser obrigatório.
									</p>
								) : null}
							</div>
						</div>
					</div>
				) : null}

				{isEdit ? (
					<div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:col-span-2">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-center gap-3">
								<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
									<KeyRound size={20} />
								</span>
								<div>
									<p className="text-sm font-black text-amber-700">Primeiro acesso / redefinição</p>
									<p className="text-xs font-semibold text-amber-900">Gere uma senha temporária para o usuário entrar e trocar a senha.</p>
								</div>
							</div>
							<button
								type="button"
								onClick={handleGerarSenha}
								disabled={gerandoSenha}
								className="rot-btn-tactile inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-xs font-black text-amber-700 shadow-sm hover:bg-amber-50 disabled:opacity-60"
							>
								<KeyRound size={14} />
								{gerandoSenha ? "Gerando..." : "Gerar senha"}
							</button>
						</div>
						{senhaGerada ? (
							<TemporaryPasswordBox password={senhaGerada.temporaryPassword} className="mt-3" />
						) : null}
					</div>
				) : null}

				<div className="mt-2 flex justify-end gap-2 sm:col-span-2">
					<button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
						Cancelar
					</button>
					<button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

function TemporaryPasswordBox({ password, className = "" }) {
	if (!password) return null;
	const copyPassword = async () => {
		await navigator.clipboard?.writeText(password);
	};
	return (
		<div className={`rounded-2xl border border-emerald-200 bg-emerald-50 p-4 ${className}`}>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-emerald-700">Senha temporária gerada</p>
					<p className="mt-1 break-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-lg font-black text-slate-950">
						{password}
					</p>
				</div>
				<button
					type="button"
					onClick={copyPassword}
					className="rot-btn-tactile inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm hover:bg-emerald-700"
				>
					<Copy size={14} />
					Copiar
				</button>
			</div>
			<p className="mt-2 text-xs font-semibold text-emerald-800">
				Mostrada somente agora. O usuário deverá trocar a senha no próximo acesso.
			</p>
		</div>
	);
}
