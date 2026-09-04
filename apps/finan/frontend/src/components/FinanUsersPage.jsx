import { RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	createFinanRole,
	fetchFinanRoles,
	fetchFinanUsers,
	updateFinanRole,
	updateFinanUser,
} from "../api/finanApi";
import UserAvatar from "./UserAvatar";

const FINAN_PERMISSION_CATALOG = [
	["finan.dashboard.view", "Dashboard", "Visualizar"],
	["finan.gestao_orcamentaria.view", "Gestão Orçamentária", "Visualizar"],
	["finan.gestao_orcamentaria.manage", "Gestão Orçamentária", "Gerenciar"],
	["finan.contas_pagar.view", "Contas a Pagar", "Visualizar"],
	["finan.contas_pagar.manage", "Contas a Pagar", "Gerenciar"],
	["finan.contas_receber.view", "Contas a Receber", "Visualizar"],
	["finan.contas_receber.manage", "Contas a Receber", "Gerenciar"],
	["finan.faturamento.view", "Faturamento", "Visualizar"],
	["finan.notas.view", "Notas", "Visualizar"],
	["finan.reports.view", "Reports", "Visualizar"],
	["finan.reports.manage", "Reports", "Gerenciar"],
	["finan.equipe.view", "Equipe", "Visualizar"],
	["finan.equipe.manage", "Equipe", "Gerenciar"],
	["finan.integracoes.view", "Integrações", "Visualizar"],
	["finan.integracoes.manage", "Integrações", "Gerenciar"],
	["finan.configuracoes.view", "Configuração Geral", "Visualizar"],
	["finan.configuracoes.manage", "Configuração Geral", "Gerenciar"],
	["finan.usuarios.manage", "Usuários, Cargos e Permissões", "Gerenciar"],
];

export default function FinanUsersPage({ initialTab = "usuarios" }) {
	const [users, setUsers] = useState([]);
	const [roles, setRoles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [activeTab, setActiveTab] = useState(initialTab);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [nextUsers, nextRoles] = await Promise.all([
				fetchFinanUsers(),
				fetchFinanRoles(),
			]);
			setUsers(nextUsers);
			setRoles(nextRoles);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar usuários do Finan.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	useEffect(() => {
		setActiveTab(initialTab);
	}, [initialTab]);

	const filteredUsers = useMemo(() => {
		const term = query.trim().toLowerCase();
		if (!term) return users;
		return users.filter((user) =>
			[user.name, user.email, user.role_id, user.source_role]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(term)),
		);
	}, [query, users]);

	const summary = useMemo(() => {
		const admins = users.filter(
			(user) => user.role_id === "admin" || user.source_role === "admin",
		).length;
		const financialUsers = users.filter(
			(user) => user.source_role !== "admin" && user.role_id !== "admin",
		).length;
		const active = users.filter((user) => user.status === "ativo").length;
		return { admins, financialUsers, active };
	}, [users]);

	const patchUser = async (id, payload) => {
		setError("");
		try {
			const updated = await updateFinanUser(id, payload);
			setUsers((current) =>
				current.map((user) => (user.id === id ? { ...user, ...updated } : user)),
			);
		} catch (err) {
			setError(err?.message || "Não foi possível atualizar o usuário.");
			throw err;
		}
	};

	return (
		<section>
			<div className="finan-page-title">
				<div>
					<h1>Usuários</h1>
				<p>Admins e usuários financeiros reaproveitados para o Finan.</p>
				</div>
				<button type="button" className="finan-ghost-button" onClick={load}>
					<RefreshCw size={16} />
					Atualizar
				</button>
			</div>

			<div className="finan-kpi-grid">
				<Kpi label="Usuários migrados" value={users.length} />
				<Kpi label="Admins" value={summary.admins} />
				<Kpi label="Financeiro" value={summary.financialUsers} />
				<Kpi label="Ativos" value={summary.active} />
			</div>

			<div className="finan-work-card">
				<div className="finan-tabs">
					<button
						type="button"
						className={activeTab === "usuarios" ? "is-active" : ""}
						onClick={() => setActiveTab("usuarios")}
					>
						Usuários
					</button>
					<button
						type="button"
						className={activeTab === "cargos" ? "is-active" : ""}
						onClick={() => setActiveTab("cargos")}
					>
						Cargos e Permissões
					</button>
				</div>
				<div className="finan-card-heading">
					<div>
						<UsersRound size={20} />
					</div>
					<div>
						<h2>
							{activeTab === "usuarios"
								? "Controle próprio do Finan"
								: "RBAC do financeiro"}
						</h2>
						<p>
							{activeTab === "usuarios"
								? "Perfil, status, avatar e MFA ficam salvos no banco dedicado."
								: "Configure cargos e permissões no mesmo padrão de Cargos e Permissões."}
						</p>
					</div>
				</div>
				{error ? <div className="finan-error">{error}</div> : null}
				{activeTab === "usuarios" ? (
					<>
						<input
							className="finan-search-input"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Buscar por nome, e-mail ou perfil..."
						/>
						{loading ? <p>Carregando usuários...</p> : null}
						<div className="finan-users-list">
							{filteredUsers.map((user) => (
								<UserRow
									key={user.id}
									user={user}
									roles={roles}
									onPatch={(payload) => patchUser(user.id, payload)}
								/>
							))}
							{!loading && !filteredUsers.length ? (
								<p>Nenhum usuário financeiro/admin encontrado.</p>
							) : null}
						</div>
					</>
				) : (
					<RolesPanel
						roles={roles}
						onCreate={async (payload) => {
							const created = await createFinanRole(payload);
							setRoles((current) => [...current, created]);
						}}
						onUpdate={async (id, payload) => {
							const updated = await updateFinanRole(id, payload);
							setRoles((current) =>
								current.map((role) =>
									role.id === id ? { ...role, ...updated } : role,
								),
							);
						}}
					/>
				)}
			</div>
		</section>
	);
}

function Kpi({ label, value }) {
	return (
		<article className="finan-kpi-card">
			<span>{label}</span>
			<strong>{Number(value || 0).toLocaleString("pt-BR")}</strong>
			<p>Banco dedicado</p>
		</article>
	);
}

function UserRow({ user, roles, onPatch }) {
	const [saving, setSaving] = useState(false);

	const update = async (payload) => {
		setSaving(true);
		try {
			await onPatch(payload);
		} finally {
			setSaving(false);
		}
	};

	return (
		<article className="finan-user-row">
			<UserAvatar
				src={user.avatar_url}
				name={user.name}
				email={user.email}
				className="finan-user-avatar"
			/>
			<div>
				<strong>{user.name || user.email}</strong>
				<span>{user.email}</span>
				<span>
					Origem: {user.source_role || "Finan"} · {user.source_system || "finan"}
				</span>
			</div>
			<div className="finan-user-actions">
				<select
					value={user.role_id || ""}
					disabled={saving}
					onChange={(event) => update({ role_id: event.target.value })}
				>
					{roles.map((role) => (
						<option key={role.id} value={role.id}>
							{role.name}
						</option>
					))}
				</select>
				<button
					type="button"
					disabled={saving}
					onClick={() =>
						update({ status: user.status === "ativo" ? "inativo" : "ativo" })
					}
				>
					{user.status === "ativo" ? "Ativo" : "Inativo"}
				</button>
				<button
					type="button"
					disabled={saving}
					onClick={() => update({ mfa_enabled: !user.mfa_enabled })}
				>
					MFA {user.mfa_enabled ? "ligado" : "desligado"}
				</button>
			</div>
		</article>
	);
}

function RolesPanel({ roles, onCreate, onUpdate }) {
	const [draft, setDraft] = useState({
		name: "",
		description: "",
		permissions: ["finan.dashboard.view", "finan.gestao_orcamentaria.view"],
		is_admin: false,
	});
	const [saving, setSaving] = useState("");

	const create = async () => {
		if (!draft.name.trim()) return;
		setSaving("new");
		try {
			await onCreate(draft);
			setDraft({
				name: "",
				description: "",
				permissions: ["finan.dashboard.view", "finan.gestao_orcamentaria.view"],
				is_admin: false,
			});
		} finally {
			setSaving("");
		}
	};

	return (
		<div className="finan-roles-grid">
			<article className="finan-role-card">
				<h3>Novo cargo</h3>
				<input
					value={draft.name}
					onChange={(event) =>
						setDraft((current) => ({ ...current, name: event.target.value }))
					}
					placeholder="Nome do cargo"
				/>
				<input
					value={draft.description}
					onChange={(event) =>
						setDraft((current) => ({
							...current,
							description: event.target.value,
						}))
					}
					placeholder="Descrição"
				/>
				<label className="finan-checkline">
					<input
						type="checkbox"
						checked={draft.is_admin}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								is_admin: event.target.checked,
							}))
						}
					/>
					<span>Administrador do Finan</span>
				</label>
				<PermissionPicker
					value={draft.permissions}
					onChange={(permissions) =>
						setDraft((current) => ({ ...current, permissions }))
					}
				/>
				<button type="button" onClick={create} disabled={saving === "new"}>
					Criar cargo
				</button>
			</article>

			{roles.map((role) => (
				<RoleCard
					key={role.id}
					role={role}
					saving={saving === role.id}
					onSave={async (payload) => {
						setSaving(role.id);
						try {
							await onUpdate(role.id, payload);
						} finally {
							setSaving("");
						}
					}}
				/>
			))}
		</div>
	);
}

function RoleCard({ role, saving, onSave }) {
	const [draft, setDraft] = useState({
		name: role.name || "",
		description: role.description || "",
		permissions: Array.isArray(role.permissions) ? role.permissions : [],
		is_admin: Boolean(role.is_admin),
		active: role.active !== false,
	});

	return (
		<article className={`finan-role-card ${draft.active ? "" : "is-muted"}`}>
			<div className="finan-role-heading">
				<div>
					<h3>{role.name}</h3>
					<span>{role.system_role ? "Cargo do sistema" : "Cargo customizado"}</span>
				</div>
				<ShieldCheck size={18} />
			</div>
			<input
				value={draft.name}
				onChange={(event) =>
					setDraft((current) => ({ ...current, name: event.target.value }))
				}
			/>
			<input
				value={draft.description}
				onChange={(event) =>
					setDraft((current) => ({
						...current,
						description: event.target.value,
					}))
				}
				placeholder="Descrição"
			/>
			<label className="finan-checkline">
				<input
					type="checkbox"
					checked={draft.is_admin}
					onChange={(event) =>
						setDraft((current) => ({
							...current,
							is_admin: event.target.checked,
						}))
					}
				/>
				<span>Administrador do Finan</span>
			</label>
			<label className="finan-checkline">
				<input
					type="checkbox"
					checked={draft.active}
					onChange={(event) =>
						setDraft((current) => ({
							...current,
							active: event.target.checked,
						}))
					}
				/>
				<span>Cargo ativo</span>
			</label>
			<PermissionPicker
				value={draft.permissions}
				onChange={(permissions) =>
					setDraft((current) => ({ ...current, permissions }))
				}
			/>
			<button type="button" onClick={() => onSave(draft)} disabled={saving}>
				{saving ? "Salvando..." : "Salvar cargo"}
			</button>
		</article>
	);
}

function PermissionPicker({ value, onChange }) {
	const selected = new Set(value || []);
	const toggle = (permission) => {
		const next = new Set(selected);
		if (next.has(permission)) next.delete(permission);
		else next.add(permission);
		onChange([...next].sort());
	};

	return (
		<div className="finan-permission-grid">
			{FINAN_PERMISSION_CATALOG.map(([permission, label, action]) => (
				<label key={permission}>
					<input
						type="checkbox"
						checked={selected.has(permission)}
						onChange={() => toggle(permission)}
					/>
					<span>
						<strong>{label}</strong>
						<small>{action}</small>
					</span>
				</label>
			))}
		</div>
	);
}
