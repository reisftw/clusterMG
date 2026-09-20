import {
	Camera,
	CheckCircle2,
	Copy,
	Eye,
	EyeOff,
	Filter,
	KeyRound,
	Lock,
	LockKeyhole,
	Mail,
	Pencil,
	Plus,
	RefreshCw,
	Save,
	Search,
	ShieldCheck,
	SlidersHorizontal,
	Trash2,
	Unlock,
	User,
	UserCheck,
	UserPlus,
	UsersRound,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	createFinanAdminUser,
	createFinanRole,
	deleteFinanAdminUser,
	deleteFinanRole,
	fetchFinanAdminUsers,
	fetchFinanPinManageableUsers,
	fetchFinanRoles,
	fetchFinanSettingSection,
	generateFinanUserFirstAccess,
	resetFinanUserPin,
	saveFinanSettingSection,
	unlockFinanUserPin,
	updateFinanAdminUser,
	updateFinanRole,
	uploadFinanAdminAvatar,
} from "../api/finanApi";
import { useFinanAuth } from "../state/useFinanAuth";
import ConfirmDialog from "./ConfirmDialog";
import ModalShell from "./ModalShell";
import UserAvatar from "./UserAvatar";

// Sem cross-import com src/utils/imageUpload.js do Retiradas (regra do
// projeto — apps/finan e independente); mesma validacao simplificada,
// alinhada ao limite real do multer em POST /admin/avatars
// (compat/routes.js: 700KB, png/jpeg/webp/gif).
const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_AVATAR_BYTES = 700 * 1024;

function validateFinanAvatarFile(file) {
	if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file?.type || "")) {
		throw new Error("Envie apenas imagens PNG, JPEG, WEBP ou GIF.");
	}
	if (file.size > MAX_AVATAR_BYTES) {
		throw new Error("A imagem deve ter até 700 KB.");
	}
}

// Extraido pra achado javascript:S3358 (ternario aninhado, mesmo padrao
// da fase de qualidade do app principal) e agrupado em secoes iguais ao
// catalogo de permissoes do Retiradas (CargosPermissoesPage.jsx), pra dar
// a mesma cara de matriz Visualizar/Gerenciar por secao do menu.
const FINAN_PERMISSION_GROUPS = [
	{
		id: "visao-geral",
		label: "Visão geral",
		features: [
			{ id: "dashboard", label: "Dashboard", view: "finan.dashboard.view", manage: null },
		],
	},
	{
		id: "planejamento",
		label: "Planejamento",
		features: [
			{
				id: "orcamento",
				label: "Gestão Orçamentária",
				view: "finan.gestao_orcamentaria.view",
				manage: "finan.gestao_orcamentaria.manage",
			},
			{
				id: "relatorios-financeiros",
				label: "Relatórios Financeiros",
				view: "relatorios_financeiros:visualizar",
				manage: "relatorios_financeiros:gerenciar",
			},
		],
	},
	{
		id: "operacao",
		label: "Operação",
		features: [
			{
				id: "contas-pagar",
				label: "Contas a Pagar",
				view: "finan.contas_pagar.view",
				manage: "finan.contas_pagar.manage",
			},
			{
				id: "contas-receber",
				label: "Contas a Receber",
				view: "finan.contas_receber.view",
				manage: "finan.contas_receber.manage",
			},
			{ id: "faturamento", label: "Faturamento", view: "finan.faturamento.view", manage: null },
			{ id: "notas", label: "Notas", view: "finan.notas.view", manage: "finan.notas.manage" },
			{
				id: "contratos",
				label: "Contratos recorrentes",
				view: "finan.contratos.view",
				manage: "finan.contratos.manage",
			},
		],
	},
	{
		id: "analises",
		label: "Análises",
		features: [
			{
				id: "reports",
				label: "Reports (Serasa/Tarifas)",
				view: "finan.reports.view",
				manage: "finan.reports.manage",
			},
		],
	},
	{
		id: "sistema",
		label: "Sistema",
		features: [
			{ id: "equipe", label: "Equipe", view: "finan.equipe.view", manage: "finan.equipe.manage" },
			{
				id: "integracoes",
				label: "Integrações",
				view: "finan.integracoes.view",
				manage: "finan.integracoes.manage",
			},
			{
				id: "configuracoes",
				label: "Configuração Geral",
				view: "finan.configuracoes.view",
				manage: "finan.configuracoes.manage",
			},
			{
				id: "usuarios",
				label: "Usuários, Cargos e Permissões",
				view: null,
				manage: "finan.usuarios.manage",
			},
			{ id: "pin", label: "PIN de Bloqueio", view: null, manage: "finan.pin.manage" },
			{
				id: "pendencias",
				label: "Central de Pendências",
				view: "finan.pendencias.view",
				manage: null,
			},
			{
				id: "qualidade_dados",
				label: "Qualidade de Dados",
				view: "finan.qualidade_dados.view",
				manage: null,
			},
			{
				id: "anexos",
				label: "Biblioteca de Documentos",
				view: "finan.anexos.view",
				manage: "finan.anexos.manage",
			},
			{
				id: "calendario",
				label: "Calendário Financeiro",
				view: null,
				manage: "finan.calendario.manage",
			},
		],
	},
];

const ACTION_LABELS = { view: "Visualizar", manage: "Gerenciar" };

// Indice permissionId -> feature, pra togglePermission saber qual e o par
// visualizar/gerenciar da mesma funcionalidade (gerenciar sempre implica
// visualizar, igual ao Retiradas).
function buildPermissionIndex(groups) {
	const index = {};
	groups.forEach((group) => {
		group.features.forEach((feature) => {
			if (feature.view) index[feature.view] = feature;
			if (feature.manage) index[feature.manage] = feature;
		});
	});
	return index;
}

const PERMISSION_INDEX = buildPermissionIndex(FINAN_PERMISSION_GROUPS);

function hasFinanPinManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.pin.manage");
}

function hasFinanConfigManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return (
		permissions.includes("*") || permissions.includes("finan.configuracoes.manage")
	);
}

function hasFinanUsuariosManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.usuarios.manage");
}

const USER_PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function FinanUsersPage({ initialTab = "usuarios" }) {
	const { user: currentUser } = useFinanAuth();
	const canManagePins = hasFinanPinManagePermission(currentUser);
	const canManageConfig = hasFinanConfigManagePermission(currentUser);
	const canManageRoles = hasFinanUsuariosManagePermission(currentUser);
	const [users, setUsers] = useState([]);
	const [roles, setRoles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [activeTab, setActiveTab] = useState(initialTab);
	const [pinUsers, setPinUsers] = useState([]);
	const [pinError, setPinError] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [modalNovo, setModalNovo] = useState(false);
	const [editando, setEditando] = useState(null);
	const [confirmTarget, setConfirmTarget] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");

	const loadPinUsers = async () => {
		if (!canManagePins) return;
		try {
			setPinUsers(await fetchFinanPinManageableUsers());
		} catch (err) {
			setPinError(
				err?.message ||
					"Não foi possível carregar o status de PIN dos usuários.",
			);
		}
	};

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [nextUsers, nextRoles] = await Promise.all([
				fetchFinanAdminUsers(),
				fetchFinanRoles(),
			]);
			setUsers(nextUsers.items);
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
		loadPinUsers();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [canManagePins]);

	useEffect(() => {
		setActiveTab(initialTab);
	}, [initialTab]);

	useEffect(() => {
		setPage(1);
	}, [query, pageSize]);

	const filteredUsers = useMemo(() => {
		const term = query.trim().toLowerCase();
		if (!term) return users;
		return users.filter((user) =>
			[user.name, user.email, user.role_id, user.source_role]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(term)),
		);
	}, [query, users]);

	const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const paginatedUsers = filteredUsers.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);

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

	const removeUser = (user) => setConfirmTarget(user);

	const closeConfirmRemoveUser = () => {
		setConfirmTarget(null);
		setConfirmError("");
	};

	const handleConfirmRemoveUser = async () => {
		if (!confirmTarget) return;
		setConfirming(true);
		setConfirmError("");
		try {
			await deleteFinanAdminUser(confirmTarget.id);
			setUsers((current) =>
				current.map((user) => (user.id === confirmTarget.id ? { ...user, status: "inativo" } : user)),
			);
			closeConfirmRemoveUser();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível desativar o usuário.");
		} finally {
			setConfirming(false);
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<UsersRound size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
								Segurança e acesso
							</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">
								Usuários
							</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Admins e usuários financeiros reaproveitados para o Finan.
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={load}
							className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
						>
							<RefreshCw size={17} />
							Atualizar
						</button>
						{canManageRoles ? (
							<button
								type="button"
								onClick={() => setModalNovo(true)}
								className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700"
							>
								<Plus size={17} />
								Novo usuário
							</button>
						) : null}
					</div>
				</div>
			</header>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Kpi label="Usuários migrados" value={users.length} />
				<Kpi label="Admins" value={summary.admins} />
				<Kpi label="Financeiro" value={summary.financialUsers} />
				<Kpi label="Ativos" value={summary.active} />
			</div>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => setActiveTab("usuarios")}
					className={`rounded-xl px-4 py-2 text-sm font-black transition ${
						activeTab === "usuarios"
							? "bg-blue-600 text-white shadow-sm"
							: "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
					}`}
				>
					Usuários
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("cargos")}
					className={`rounded-xl px-4 py-2 text-sm font-black transition ${
						activeTab === "cargos"
							? "bg-blue-600 text-white shadow-sm"
							: "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
					}`}
				>
					Cargos e Permissões
				</button>
			</div>

			{activeTab === "usuarios" ? (
				<div className="space-y-6">
					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800">
							<SlidersHorizontal size={18} className="text-blue-600" />
							Filtros
						</div>
						<label className="relative block">
							<Search
								className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
								size={18}
							/>
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Buscar por nome, e-mail ou cargo..."
								className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
							/>
						</label>
					</div>

					<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
						<div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h3 className="text-base font-black text-slate-950">
									Usuários cadastrados
								</h3>
								<p className="text-sm text-slate-500">
									Mostrando {paginatedUsers.length} de {filteredUsers.length}{" "}
									usuário(s) filtrado(s)
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-500">
									Total carregado: {users.length}
								</p>
								<select
									value={pageSize}
									onChange={(event) => setPageSize(Number(event.target.value) || 20)}
									className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								>
									{USER_PAGE_SIZE_OPTIONS.map((option) => (
										<option key={option} value={option}>
											{option} por página
										</option>
									))}
								</select>
							</div>
						</div>

						{loading ? (
							<p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">
								Carregando usuários...
							</p>
						) : (
							<>
								{/* UX_AUDIT.md, Fase 5 (Responsividade): abaixo de `sm`,
								cards empilhados (UserCard) no lugar da tabela com min-w. */}
								<div className="divide-y divide-slate-100 sm:hidden">
									{paginatedUsers.map((user) => (
										<UserCard
											key={user.id}
											user={user}
											roles={roles}
											canManage={canManageRoles}
											onEdit={() => setEditando(user)}
											onDelete={() => removeUser(user)}
										/>
									))}
									{!paginatedUsers.length ? (
										<p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
											Nenhum usuário encontrado.
										</p>
									) : null}
								</div>

								<div className="hidden overflow-x-auto sm:block">
								<table className="w-full min-w-[760px] text-sm">
									<thead>
										<tr className="border-b border-slate-100 text-left">
											<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
												Usuário
											</th>
											<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
												Cargo
											</th>
											<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
												Status
											</th>
											<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
												MFA
											</th>
											<th scope="col" className="px-5 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-500">
												Ações
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{paginatedUsers.map((user) => (
											<UserRow
												key={user.id}
												user={user}
												roles={roles}
												canManage={canManageRoles}
												onEdit={() => setEditando(user)}
												onDelete={() => removeUser(user)}
											/>
										))}
									</tbody>
								</table>
								{!paginatedUsers.length ? (
									<p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
										Nenhum usuário financeiro/admin encontrado.
									</p>
								) : null}
								</div>
							</>
						)}

						{filteredUsers.length ? (
							<div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-sm font-semibold text-slate-500">
									Página {currentPage} de {totalPages}
								</p>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setPage(1)}
										disabled={currentPage <= 1}
										className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
									>
										«
									</button>
									<button
										type="button"
										onClick={() => setPage((current) => Math.max(1, current - 1))}
										disabled={currentPage <= 1}
										className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
									>
										Anterior
									</button>
									<button
										type="button"
										onClick={() =>
											setPage((current) => Math.min(totalPages, current + 1))
										}
										disabled={currentPage >= totalPages}
										className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
									>
										Próxima
									</button>
									<button
										type="button"
										onClick={() => setPage(totalPages)}
										disabled={currentPage >= totalPages}
										className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
									>
										»
									</button>
								</div>
							</div>
						) : null}
					</div>

					{canManagePins ? (
						<PinManagementPanel
							pinUsers={pinUsers}
							error={pinError}
							onUnlock={async (id) => {
								await unlockFinanUserPin(id);
								await loadPinUsers();
							}}
							onReset={async (id) => {
								await resetFinanUserPin(id);
								await loadPinUsers();
							}}
						/>
					) : null}

					{modalNovo && canManageRoles ? (
						<NovoFinanUsuarioModal
							roles={roles}
							onClose={() => setModalNovo(false)}
							onCriado={load}
						/>
					) : null}

					{editando && canManageRoles ? (
						<EditarFinanUsuarioModal
							usuario={editando}
							roles={roles}
							onClose={() => setEditando(null)}
							onSalvo={load}
						/>
					) : null}

					<ConfirmDialog
						open={Boolean(confirmTarget)}
						tone="danger"
						title="Desativar este usuário do Finan?"
						description="O usuário deixa de conseguir entrar no sistema. Isso pode ser revertido depois, editando o status dele."
						items={confirmTarget ? [{ label: "Usuário", value: confirmTarget.name || confirmTarget.email }] : []}
						confirmLabel="Desativar usuário"
						cancelLabel="Voltar"
						loading={confirming}
						error={confirmError}
						onConfirm={handleConfirmRemoveUser}
						onCancel={closeConfirmRemoveUser}
					/>
				</div>
			) : (
				<div className="space-y-6">
					{canManageConfig ? <PinIdleTimeoutCard /> : null}
					<RolesPanel
						roles={roles}
						canManage={canManageRoles}
						onCreate={async (payload) => {
							const created = await createFinanRole(payload);
							setRoles((current) => [...current, created]);
							return created;
						}}
						onUpdate={async (id, payload) => {
							const updated = await updateFinanRole(id, payload);
							setRoles((current) =>
								current.map((role) =>
									role.id === id ? { ...role, ...updated } : role,
								),
							);
						}}
						onDelete={async (id) => {
							await deleteFinanRole(id);
							setRoles((current) => current.filter((role) => role.id !== id));
						}}
					/>
				</div>
			)}
		</div>
	);
}

function PinManagementPanel({ pinUsers, error, onUnlock, onReset }) {
	const [busyId, setBusyId] = useState("");

	const run = async (id, action) => {
		setBusyId(id);
		try {
			await action(id);
		} finally {
			setBusyId("");
		}
	};

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
					<ShieldCheck size={20} />
				</div>
				<div>
					<h2 className="text-lg font-black text-slate-950">
						Gerenciar PIN de bloqueio
					</h2>
					<p className="text-sm font-semibold text-slate-500">
						Só usuários abaixo do seu cargo na hierarquia aparecem aqui.
						Resetar apaga o PIN e a palavra secreta — o usuário configura
						tudo de novo no próximo acesso.
					</p>
				</div>
			</div>
			{error ? (
				<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}
			<div className="mt-4 space-y-3">
				{pinUsers.map((pinUser) => (
					<article
						key={pinUser.id}
						className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
					>
						<div>
							<strong className="block text-sm font-black text-slate-950">
								{pinUser.name || pinUser.email}
							</strong>
							<span className="block text-xs font-semibold text-slate-500">
								{pinUser.email}
							</span>
							<span className="block text-xs font-semibold text-slate-500">
								{pinUser.role_name || "Sem cargo"} ·{" "}
								{pinUser.pin_configured
									? "PIN configurado"
									: "PIN não configurado"}
								{pinUser.pin_locked ? " · Bloqueado" : ""}
							</span>
						</div>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								disabled={busyId === pinUser.id || !pinUser.pin_locked}
								onClick={() => run(pinUser.id, onUnlock)}
								className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Unlock size={14} /> Desbloquear
							</button>
							<button
								type="button"
								disabled={busyId === pinUser.id || !pinUser.pin_configured}
								onClick={() => run(pinUser.id, onReset)}
								className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Lock size={14} /> Resetar PIN
							</button>
						</div>
					</article>
				))}
				{!pinUsers.length ? (
					<p className="text-sm font-semibold text-slate-500">
						Nenhum usuário abaixo do seu cargo na hierarquia.
					</p>
				) : null}
			</div>
		</div>
	);
}

// So aparece pra quem tem finan.configuracoes.manage (ou admin). Controla
// depois de quantos minutos de inatividade, numa aba de navegador normal
// (nao no PWA instalado), o Finan pede o PIN de novo — ver
// FinanPinLockContext.jsx no frontend e GET/PUT
// /auth/pin/status|/configuracoes/section/pin_lock no backend.
function PinIdleTimeoutCard() {
	const [minutes, setMinutes] = useState(20);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);

	useEffect(() => {
		let active = true;
		fetchFinanSettingSection("pin_lock")
			.then((data) => {
				if (!active) return;
				const value = Number(
					data?.value?.idleTimeoutMinutes ?? data?.idleTimeoutMinutes,
				);
				if (Number.isFinite(value) && value > 0) setMinutes(value);
			})
			.catch(() => {})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const save = async () => {
		setError("");
		setSuccess(false);
		const value = Math.max(1, Math.round(Number(minutes) || 20));
		setSaving(true);
		try {
			await saveFinanSettingSection("pin_lock", { idleTimeoutMinutes: value });
			setMinutes(value);
			setSuccess(true);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
					<ShieldCheck size={20} />
				</div>
				<div>
					<h2 className="text-lg font-black text-slate-950">
						Bloqueio por inatividade (desktop)
					</h2>
					<p className="text-sm font-semibold text-slate-500">
						Depois de quantos minutos sem uso, numa aba de navegador normal, o
						Finan pede o PIN de novo. No app instalado (PWA), o bloqueio
						continua imediato ao voltar de segundo plano, independente deste
						valor.
					</p>
				</div>
			</div>
			{loading ? (
				<p className="mt-4 text-sm font-semibold text-slate-500">
					Carregando...
				</p>
			) : (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<input
						type="number"
						min={1}
						value={minutes}
						onChange={(event) => setMinutes(event.target.value)}
						className="h-11 w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-800 outline-none focus:border-blue-400"
					/>
					<span className="text-sm font-semibold text-slate-500">minutos</span>
					<button
						type="button"
						onClick={save}
						disabled={saving}
						className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
					>
						{saving ? "Salvando..." : "Salvar"}
					</button>
				</div>
			)}
			{error ? (
				<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}
			{success ? (
				<p className="mt-3 text-sm font-bold text-emerald-700">
					Salvo com sucesso.
				</p>
			) : null}
		</div>
	);
}

function Kpi({ label, value }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<span className="text-xs font-black uppercase tracking-wide text-slate-500">
				{label}
			</span>
			<p className="mt-3 text-3xl font-black text-slate-950">
				{Number(value || 0).toLocaleString("pt-BR")}
			</p>
			<p className="mt-1 text-sm text-slate-500">Banco dedicado</p>
		</div>
	);
}

function roleLabel(roles, roleId) {
	return roles.find((role) => role.id === roleId)?.name || roleId || "Sem cargo";
}

function UserRow({ user, roles, canManage, onEdit, onDelete }) {
	return (
		<tr>
			<td className="px-5 py-3">
				<div className="flex items-center gap-3">
					<UserAvatar
						src={user.avatar_url}
						name={user.name}
						email={user.email}
						className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-700 [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
						initialsClassName="text-xs font-black"
					/>
					<div className="min-w-0">
						<strong className="block truncate text-sm font-black text-slate-950">
							{user.name || user.email}
						</strong>
						<span className="block truncate text-xs font-semibold text-slate-500">
							{user.email}
						</span>
					</div>
				</div>
			</td>
			<td className="px-5 py-3">
				<span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
					{roleLabel(roles, user.role_id)}
				</span>
			</td>
			<td className="px-5 py-3">
				<span
					className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ${
						user.status === "ativo"
							? "bg-emerald-100 text-emerald-700"
							: "bg-slate-100 text-slate-500"
					}`}
				>
					{user.status === "ativo" ? "Ativo" : "Inativo"}
				</span>
			</td>
			<td className="px-5 py-3">
				<span
					className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ${
						user.mfa_enabled
							? "bg-blue-100 text-blue-700"
							: "bg-slate-100 text-slate-500"
					}`}
				>
					{user.mfa_enabled ? "Ligado" : "Desligado"}
				</span>
			</td>
			<td className="px-5 py-3">
				<div className="flex justify-end gap-1">
					{canManage ? (
						<button
							type="button"
							onClick={onEdit}
							className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
							title="Editar"
						>
							<Pencil size={16} />
						</button>
					) : (
						<span className="text-xs font-bold text-slate-400">Somente leitura</span>
					)}
					{canManage ? (
						<button
							type="button"
							onClick={onDelete}
							disabled={user.status !== "ativo"}
							className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
							title={user.status === "ativo" ? "Desativar" : "Já está inativo"}
						>
							<Trash2 size={16} />
						</button>
					) : null}
				</div>
			</td>
		</tr>
	);
}

// UX_AUDIT.md, Fase 5 (Responsividade): versão em card de UserRow pra
// telas abaixo de `sm` — mesma informação e ações, sem scroll horizontal.
function UserCard({ user, roles, canManage, onEdit, onDelete }) {
	return (
		<div className="p-4">
			<div className="flex items-center gap-3">
				<UserAvatar
					src={user.avatar_url}
					name={user.name}
					email={user.email}
					className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-700 [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
					initialsClassName="text-xs font-black"
				/>
				<div className="min-w-0 flex-1">
					<strong className="block truncate text-sm font-black text-slate-950">
						{user.name || user.email}
					</strong>
					<span className="block truncate text-xs font-semibold text-slate-500">
						{user.email}
					</span>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
					{roleLabel(roles, user.role_id)}
				</span>
				<span
					className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ${
						user.status === "ativo"
							? "bg-emerald-100 text-emerald-700"
							: "bg-slate-100 text-slate-500"
					}`}
				>
					{user.status === "ativo" ? "Ativo" : "Inativo"}
				</span>
				<span
					className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ${
						user.mfa_enabled
							? "bg-blue-100 text-blue-700"
							: "bg-slate-100 text-slate-500"
					}`}
				>
					MFA {user.mfa_enabled ? "ligado" : "desligado"}
				</span>
			</div>
			{canManage ? (
				<div className="mt-3 flex gap-2">
					<button
						type="button"
						onClick={onEdit}
						className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-black text-blue-700"
					>
						<Pencil size={14} /> Editar
					</button>
					<button
						type="button"
						onClick={onDelete}
						disabled={user.status !== "ativo"}
						className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-black text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Trash2 size={14} /> {user.status === "ativo" ? "Desativar" : "Inativo"}
					</button>
				</div>
			) : (
				<p className="mt-3 text-xs font-bold text-slate-400">Somente leitura</p>
			)}
		</div>
	);
}

const DEFAULT_NEW_USER_FORM = {
	nome: "",
	email: "",
	role_id: "",
	temporaryPassword: "",
	avatarUrl: "",
};

// Réplica simplificada de NovoUsuarioModal.jsx do Retiradas (sem
// regional/empresa/insumos, que não existem no domínio do Finan) — cria
// via POST /admin/users (compat/routes.js), que já gera senha temporária e
// dispara o e-mail de boas-vindas do Finan.
function NovoFinanUsuarioModal({ roles, onClose, onCriado }) {
	const [form, setForm] = useState(() => ({
		...DEFAULT_NEW_USER_FORM,
		role_id: roles[0]?.id || "",
	}));
	const [saving, setSaving] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [erro, setErro] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [resultado, setResultado] = useState(null);
	const [copiado, setCopiado] = useState(false);

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleAvatarUpload = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setUploading(true);
		setErro("");
		try {
			validateFinanAvatarFile(file);
			set("avatarUrl", await uploadFinanAdminAvatar(file));
		} catch (error) {
			setErro(error?.message || "Não foi possível enviar o avatar.");
		} finally {
			setUploading(false);
		}
	};

	const handleCriar = async () => {
		if (!form.nome.trim() || !form.email.trim()) {
			setErro("Preencha nome e e-mail.");
			return;
		}
		setSaving(true);
		setErro("");
		try {
			const response = await createFinanAdminUser({
				nome: form.nome.trim(),
				email: form.email.trim().toLowerCase(),
				role: form.role_id,
				temporaryPassword: form.temporaryPassword || undefined,
				avatarUrl: form.avatarUrl,
			});
			onCriado();
			setResultado({
				email: form.email.trim().toLowerCase(),
				temporaryPassword: response?.temporaryPassword || "",
			});
		} catch (error) {
			setErro(error?.message || "Erro ao criar usuário.");
		} finally {
			setSaving(false);
		}
	};

	const handleCopiarAcesso = async () => {
		if (!navigator?.clipboard) return;
		await navigator.clipboard.writeText(
			`E-mail: ${resultado?.email || ""}\nSenha temporária: ${resultado?.temporaryPassword || ""}`,
		);
		setCopiado(true);
	};

	if (resultado) {
		return (
			<ModalShell onClose={onClose} showClose={false} size="md" bodyClassName="p-0">
				<div className="space-y-4 p-6">
					<div className="flex justify-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700">
							<KeyRound size={22} />
						</div>
					</div>
					<div className="space-y-2 text-center">
						<h2 className="font-bold text-slate-900">Primeiro acesso gerado</h2>
						<p className="text-sm text-slate-600">
							Compartilhe os dados abaixo com <strong>{resultado.email}</strong> por um canal seguro.
						</p>
					</div>
					<div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
						<p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Senha temporária</p>
						<p className="mt-1 font-mono text-sm font-bold text-blue-900">
							{resultado.temporaryPassword || "-"}
						</p>
					</div>
					{copiado ? (
						<p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
							Acesso copiado com sucesso.
						</p>
					) : null}
					<div className="flex gap-3 pt-1">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
						>
							Fechar
						</button>
						<button
							type="button"
							onClick={handleCopiarAcesso}
							className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
						>
							Copiar acesso
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	return (
		<ModalShell onClose={onClose} showClose={false} size="3xl" bodyClassName="p-0">
			<div className="relative w-full">
				<button
					type="button"
					onClick={onClose}
					className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
					aria-label="Fechar"
				>
					<X size={22} />
				</button>
				<div className="px-5 pb-6 pt-6 sm:px-7">
					<div className="flex items-center gap-4 border-b border-slate-200 pb-5 pr-12">
						<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<UserPlus size={26} />
						</div>
						<div>
							<h2 className="text-2xl font-black tracking-tight text-slate-950">Criar novo usuário</h2>
							<p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
								Preencha as informações abaixo para adicionar um novo usuário ao Finan.
							</p>
						</div>
					</div>

					{erro ? (
						<p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
							{erro}
						</p>
					) : null}

					<div className="mt-5 flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
						<UserAvatar
							src={form.avatarUrl}
							name={form.nome}
							email={form.email}
							className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-lg font-black text-white [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
						/>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-black text-slate-950">Avatar do usuário</p>
							<p className="mt-1 text-xs font-semibold text-slate-500">Opcional. Aceita PNG/JPEG/WEBP/GIF até 700 KB.</p>
						</div>
						<label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-50">
							<Camera size={15} /> {uploading ? "Enviando..." : "Enviar"}
							<input type="file" accept={AVATAR_ACCEPT} disabled={uploading} onChange={handleAvatarUpload} className="hidden" />
						</label>
					</div>

					<div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
						<div className="grid gap-4 lg:grid-cols-2">
							<div>
								<label htmlFor="finan-novo-usuario-nome" className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700">
									<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
										<User size={16} />
									</span>
									<span>
										Nome completo <span className="text-red-500">*</span>
									</span>
								</label>
								<input
									id="finan-novo-usuario-nome"
									value={form.nome}
									onChange={(event) => set("nome", event.target.value)}
									placeholder="Digite o nome completo"
									className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								/>
							</div>
							<div>
								<label htmlFor="finan-novo-usuario-email" className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700">
									<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
										<Mail size={16} />
									</span>
									<span>
										E-mail <span className="text-red-500">*</span>
									</span>
								</label>
								<input
									id="finan-novo-usuario-email"
									type="email"
									value={form.email}
									onChange={(event) => set("email", event.target.value)}
									placeholder="exemplo@email.com"
									className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								/>
							</div>
						</div>

						<div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950">
							<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
								<LockKeyhole size={22} />
							</div>
							<div>
								<h3 className="text-base font-black text-amber-600">Primeiro acesso</h3>
								<p className="mt-1 text-sm leading-relaxed text-amber-900">
									O backend cria uma senha temporária. No primeiro login, o usuário troca pela senha pessoal.
								</p>
							</div>
						</div>

						<div className="mt-5">
							<label htmlFor="finan-novo-usuario-senha" className="mb-3 flex items-center gap-3 text-sm font-extrabold text-violet-700">
								<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
									<ShieldCheck size={18} />
								</span>
								<span>Senha temporária</span>
							</label>
							<div className="relative">
								<input
									id="finan-novo-usuario-senha"
									type={showPassword ? "text" : "password"}
									value={form.temporaryPassword}
									onChange={(event) => set("temporaryPassword", event.target.value)}
									placeholder="Opcional. Se vazio, o sistema gera uma senha."
									className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-14 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								/>
								<button
									type="button"
									onClick={() => setShowPassword((current) => !current)}
									className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
									aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
								>
									{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
								</button>
							</div>
						</div>

						<div className="mt-5">
							<label htmlFor="finan-novo-usuario-cargo" className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700">
								<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
									<ShieldCheck size={16} />
								</span>
								<span>
									Cargo <span className="text-red-500">*</span>
								</span>
							</label>
							<select
								id="finan-novo-usuario-cargo"
								value={form.role_id}
								onChange={(event) => set("role_id", event.target.value)}
								className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
							>
								{roles.map((role) => (
									<option key={role.id} value={role.id}>
										{role.name}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className="mt-5 flex flex-col justify-end gap-3 sm:flex-row">
						<button
							type="button"
							onClick={onClose}
							className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 text-sm font-extrabold text-slate-700 transition hover:bg-slate-200"
						>
							<X size={18} />
							Cancelar
						</button>
						<button
							type="button"
							onClick={handleCriar}
							disabled={saving}
							className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-extrabold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60"
						>
							<UserPlus size={18} />
							{saving ? "Criando..." : "Criar usuário"}
						</button>
					</div>
				</div>
			</div>
		</ModalShell>
	);
}

// Réplica simplificada de EditarUsuarioModal.jsx do Retiradas — edita via
// PUT /admin/users/:id (compat/routes.js): nome, e-mail, cargo, status,
// MFA e avatar num só lugar (o PATCH de /usuarios/:id só cobria
// role_id/status/mfa_enabled).
function EditarFinanUsuarioModal({ usuario, roles, onClose, onSalvo }) {
	const [form, setForm] = useState({
		nome: usuario.name || "",
		email: usuario.email || "",
		role_id: usuario.role_id || roles[0]?.id || "",
		active: usuario.status === "ativo",
		mfa_enabled: Boolean(usuario.mfa_enabled),
		avatarUrl: usuario.avatar_url || "",
	});
	const [saving, setSaving] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [erro, setErro] = useState("");
	const [gerandoSenha, setGerandoSenha] = useState(false);
	const [senhaTemporaria, setSenhaTemporaria] = useState("");

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleAvatarUpload = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setUploading(true);
		setErro("");
		try {
			validateFinanAvatarFile(file);
			set("avatarUrl", await uploadFinanAdminAvatar(file));
		} catch (error) {
			setErro(error?.message || "Não foi possível enviar o avatar.");
		} finally {
			setUploading(false);
		}
	};

	const handleSalvar = async () => {
		if (!form.nome.trim()) {
			setErro("Nome é obrigatório.");
			return;
		}
		setSaving(true);
		setErro("");
		try {
			await updateFinanAdminUser(usuario.id, {
				nome: form.nome.trim(),
				email: form.email.trim().toLowerCase(),
				role: form.role_id,
				status: form.active ? "ativo" : "inativo",
				mfa_enabled: form.mfa_enabled,
				avatarUrl: form.avatarUrl,
			});
			onSalvo();
			onClose();
		} catch (error) {
			setErro(error?.message || "Erro ao salvar usuário.");
		} finally {
			setSaving(false);
		}
	};

	const handleGerarSenha = async () => {
		setGerandoSenha(true);
		setErro("");
		try {
			const response = await generateFinanUserFirstAccess(usuario.id);
			setSenhaTemporaria(response?.temporaryPassword || "");
		} catch (error) {
			setErro(error?.message || "Erro ao gerar senha temporária.");
		} finally {
			setGerandoSenha(false);
		}
	};

	return (
		<ModalShell onClose={onClose} showClose={false} size="3xl" bodyClassName="p-0">
			<div className="relative w-full">
				<button
					type="button"
					onClick={onClose}
					className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
					aria-label="Fechar"
				>
					<X size={22} />
				</button>
				<div className="px-5 pb-6 pt-6 sm:px-7">
					<div className="flex items-center gap-4 border-b border-slate-200 pb-5 pr-12">
						<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<UserCheck size={26} />
						</div>
						<div>
							<h2 className="text-2xl font-black tracking-tight text-slate-950">Editar usuário</h2>
							<p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
								Atualize nome, e-mail, cargo, status e MFA do usuário.
							</p>
						</div>
					</div>

					{erro ? (
						<p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
							{erro}
						</p>
					) : null}

					<div className="mt-5 flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
						<UserAvatar
							src={form.avatarUrl}
							name={form.nome}
							email={form.email}
							className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-lg font-black text-white [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
						/>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-black text-slate-950">Avatar do usuário</p>
							<p className="mt-1 text-xs font-semibold text-slate-500">Aceita PNG/JPEG/WEBP/GIF até 700 KB.</p>
						</div>
						<label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-50">
							<Camera size={15} /> {uploading ? "Enviando..." : "Trocar"}
							<input type="file" accept={AVATAR_ACCEPT} disabled={uploading} onChange={handleAvatarUpload} className="hidden" />
						</label>
					</div>

					<div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
						<div className="grid gap-4 lg:grid-cols-2">
							<div>
								<label htmlFor="finan-editar-usuario-nome" className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700">
									<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
										<User size={16} />
									</span>
									<span>
										Nome completo <span className="text-red-500">*</span>
									</span>
								</label>
								<input
									id="finan-editar-usuario-nome"
									value={form.nome}
									onChange={(event) => set("nome", event.target.value)}
									className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								/>
							</div>
							<div>
								<label htmlFor="finan-editar-usuario-email" className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700">
									<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
										<Mail size={16} />
									</span>
									<span>E-mail</span>
								</label>
								<input
									id="finan-editar-usuario-email"
									type="email"
									value={form.email}
									onChange={(event) => set("email", event.target.value)}
									className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								/>
							</div>
						</div>

						<div className="mt-5 grid gap-4 lg:grid-cols-2">
							<div>
								<label htmlFor="finan-editar-usuario-cargo" className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700">
									<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
										<ShieldCheck size={16} />
									</span>
									<span>
										Cargo <span className="text-red-500">*</span>
									</span>
								</label>
								<select
									id="finan-editar-usuario-cargo"
									value={form.role_id}
									onChange={(event) => set("role_id", event.target.value)}
									className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								>
									{roles.map((role) => (
										<option key={role.id} value={role.id}>
											{role.name}
										</option>
									))}
								</select>
							</div>
							<div className="flex items-end gap-4">
								<label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4">
									<input
										type="checkbox"
										checked={form.active}
										onChange={(event) => set("active", event.target.checked)}
										className="h-4 w-4 rounded border-slate-300"
									/>
									<span className="text-sm font-black text-slate-700">Ativo</span>
								</label>
								<label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4">
									<input
										type="checkbox"
										checked={form.mfa_enabled}
										onChange={(event) => set("mfa_enabled", event.target.checked)}
										className="h-4 w-4 rounded border-slate-300"
									/>
									<span className="text-sm font-black text-slate-700">MFA</span>
								</label>
							</div>
						</div>

						<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex gap-5">
									<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
										<KeyRound size={22} />
									</div>
									<div>
										<p className="text-base font-black text-amber-600">Primeiro acesso / redefinição</p>
										<p className="mt-1 text-sm leading-relaxed text-amber-900">
											Gere uma senha temporária para o usuário entrar e trocar a senha.
										</p>
									</div>
								</div>
								<button
									type="button"
									onClick={handleGerarSenha}
									disabled={gerandoSenha}
									className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-sm font-extrabold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:opacity-60"
								>
									<KeyRound size={14} />
									{gerandoSenha ? "Gerando..." : "Gerar senha"}
								</button>
							</div>
							{senhaTemporaria ? (
								<textarea
									readOnly
									value={`E-mail: ${form.email}\nSenha temporária: ${senhaTemporaria}`}
									className="mt-4 h-20 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
								/>
							) : null}
						</div>
					</div>

					<div className="mt-5 flex flex-col justify-end gap-3 sm:flex-row">
						<button
							type="button"
							onClick={onClose}
							className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 text-sm font-extrabold text-slate-700 transition hover:bg-slate-200"
						>
							<X size={18} />
							Cancelar
						</button>
						<button
							type="button"
							onClick={handleSalvar}
							disabled={saving}
							className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-extrabold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60"
						>
							<UserCheck size={18} />
							{saving ? "Salvando..." : "Salvar"}
						</button>
					</div>
				</div>
			</div>
		</ModalShell>
	);
}

const DEFAULT_ROLE_DRAFT = {
	id: "",
	name: "",
	description: "",
	permissions: ["finan.dashboard.view"],
	is_admin: false,
	active: true,
	hierarchy_level: 999,
};

function draftFromRole(role) {
	return {
		id: role.id,
		name: role.name || "",
		description: role.description || "",
		permissions: Array.isArray(role.permissions) ? role.permissions : [],
		is_admin: Boolean(role.is_admin),
		active: role.active !== false,
		hierarchy_level: Number.isFinite(Number(role.hierarchy_level))
			? Number(role.hierarchy_level)
			: 999,
		systemRole: Boolean(role.system_role),
	};
}

// Mesmo layout de src/modules/auth/components/CargosPermissoesPage.jsx do
// Retiradas: lista de cargos na esquerda (aside) + painel de edicao com a
// matriz de permissoes Visualizar/Gerenciar por secao do menu.
function RolesPanel({ roles, canManage, onCreate, onUpdate, onDelete }) {
	const [selectedId, setSelectedId] = useState(roles[0]?.id || "");
	const [creating, setCreating] = useState(!roles.length);
	const [draft, setDraft] = useState(() =>
		roles[0] ? draftFromRole(roles[0]) : DEFAULT_ROLE_DRAFT,
	);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (creating) return;
		const role = roles.find((item) => item.id === selectedId);
		if (role) setDraft(draftFromRole(role));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedId]);

	const selectRole = (id) => {
		setCreating(false);
		setSelectedId(id);
		setMessage("");
		setError("");
	};

	const startCreate = () => {
		setCreating(true);
		setSelectedId("");
		setDraft(DEFAULT_ROLE_DRAFT);
		setMessage("");
		setError("");
	};

	const startClone = () => {
		if (!draft) return;
		setCreating(true);
		setSelectedId("");
		setDraft({
			...draft,
			id: "",
			name: `${draft.name} (cópia)`,
			systemRole: false,
		});
		setMessage("");
		setError("");
	};

	const setField = (field, value) => {
		setDraft((current) => ({ ...current, [field]: value }));
	};

	const isAdminRole = Boolean(draft?.is_admin);

	const togglePermission = (permissionId, checked) => {
		setDraft((current) => {
			const next = new Set(current.permissions);
			const feature = PERMISSION_INDEX[permissionId];
			if (checked) {
				next.add(permissionId);
				// Gerenciar marca Visualizar automaticamente, igual ao Retiradas.
				if (feature?.manage === permissionId && feature.view) {
					next.add(feature.view);
				}
			} else {
				next.delete(permissionId);
				if (feature?.view === permissionId && feature.manage) {
					next.delete(feature.manage);
				}
			}
			return { ...current, permissions: [...next] };
		});
	};

	const handleSave = async () => {
		if (!draft?.name?.trim()) {
			setError("Informe o nome do cargo.");
			return;
		}
		setSaving(true);
		setError("");
		setMessage("");
		try {
			if (creating) {
				const created = await onCreate(draft);
				setCreating(false);
				setSelectedId(created?.id || "");
				setMessage("Cargo criado.");
			} else {
				await onUpdate(selectedId, draft);
				setMessage("Cargo salvo.");
			}
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o cargo.");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!selectedId || draft?.systemRole) return;
		setDeleting(true);
		setError("");
		try {
			await onDelete(selectedId);
			setSelectedId("");
			setDraft(DEFAULT_ROLE_DRAFT);
			setCreating(true);
			setMessage("Cargo excluído.");
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o cargo.");
		} finally {
			setDeleting(false);
		}
	};

	const selectedCount = draft?.permissions?.length || 0;

	return (
		<div className="space-y-4">
			{!canManage ? (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Você está em modo somente leitura. Alterações de cargos exigem a
					permissão finan.usuarios.manage.
				</div>
			) : null}
			{message ? (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
					{message}
				</div>
			) : null}
			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}

			<div className="grid gap-5 xl:grid-cols-[320px_1fr]">
				<aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-3 flex items-center justify-between gap-2">
						<div className="flex items-center gap-2 text-sm font-black text-slate-800">
							<SlidersHorizontal size={18} className="text-blue-600" />
							Cargos cadastrados
						</div>
						<button
							type="button"
							onClick={startCreate}
							disabled={!canManage}
							className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
						>
							<Plus size={14} /> Novo
						</button>
					</div>
					<div className="space-y-2">
						{roles.map((role) => (
							<button
								type="button"
								key={role.id}
								onClick={() => selectRole(role.id)}
								className={`w-full rounded-xl border px-4 py-3 text-left transition ${
									!creating && selectedId === role.id
										? "border-blue-300 bg-blue-50 text-blue-900"
										: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-black">{role.name || role.id}</span>
									{role.is_admin ? <LockKeyhole size={16} /> : null}
								</div>
								<p className="mt-1 text-xs font-semibold text-slate-500">
									{role.is_admin
										? "Acesso total"
										: `${(role.permissions || []).length} permissão(ões)`}
								</p>
							</button>
						))}
						{!roles.length ? (
							<p className="text-sm font-semibold text-slate-500">
								Nenhum cargo cadastrado ainda.
							</p>
						) : null}
					</div>
				</aside>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					{draft ? (
						<>
							<div className="grid gap-4 lg:grid-cols-[1fr_auto]">
								<label>
									<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
										Nome do cargo
									</span>
									<input
										value={draft.name || ""}
										onChange={(event) => setField("name", event.target.value)}
										disabled={!canManage}
										className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
									/>
								</label>
								<label className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
									<input
										type="checkbox"
										checked={draft.active !== false}
										disabled={!canManage}
										onChange={(event) => setField("active", event.target.checked)}
										className="h-4 w-4 rounded border-slate-300"
									/>
									<span className="text-sm font-black text-slate-700">Ativo</span>
								</label>
							</div>

							<div className="mt-4 grid gap-4 lg:grid-cols-2">
								<label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
									<input
										type="checkbox"
										checked={draft.is_admin}
										disabled={!canManage}
										onChange={(event) => setField("is_admin", event.target.checked)}
										className="h-4 w-4 rounded border-slate-300"
									/>
									<span className="text-sm font-black text-slate-700">
										Administrador do Finan
									</span>
								</label>
								<label className="block">
									<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
										Nível hierárquico (menor = mais alto)
									</span>
									<input
										type="number"
										min={0}
										value={draft.hierarchy_level}
										disabled={!canManage}
										onChange={(event) =>
											setField("hierarchy_level", Number(event.target.value) || 0)
										}
										className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
									/>
								</label>
							</div>

							<label className="mt-4 block">
								<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
									Descrição
								</span>
								<textarea
									value={draft.description || ""}
									onChange={(event) => setField("description", event.target.value)}
									disabled={!canManage}
									rows={2}
									className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
								/>
							</label>

							{isAdminRole ? (
								<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
									Cargos marcados como Administrador do Finan têm acesso total,
									independente da matriz abaixo.
								</div>
							) : null}

							<div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
								{selectedCount} permissão(ões) selecionadas. Gerenciar marca
								Visualizar automaticamente.
							</div>

							<div className="mt-5 space-y-4">
								{FINAN_PERMISSION_GROUPS.map((group) => (
									<PermissionMatrixSection
										key={group.id}
										group={group}
										isAdminRole={isAdminRole}
										selectedPermissions={draft.permissions}
										canEdit={canManage}
										togglePermission={togglePermission}
									/>
								))}
							</div>

							<div className="mt-5 flex flex-wrap justify-end gap-2">
								{!creating ? (
									<button
										type="button"
										onClick={handleDelete}
										disabled={deleting || !canManage || draft.systemRole}
										className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{deleting ? (
											<RefreshCw size={17} className="animate-spin" />
										) : (
											<Trash2 size={17} />
										)}
										Excluir cargo
									</button>
								) : null}
								{!creating ? (
									<button
										type="button"
										onClick={startClone}
										disabled={!canManage}
										className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
									>
										<Copy size={17} />
										Clonar cargo
									</button>
								) : null}
								<button
									type="button"
									onClick={handleSave}
									disabled={saving || !canManage}
									className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
								>
									{saving ? (
										<RefreshCw size={17} className="animate-spin" />
									) : (
										<Save size={17} />
									)}
									{creating ? "Criar cargo" : "Salvar cargo"}
								</button>
							</div>
						</>
					) : (
						<div className="flex min-h-64 flex-col items-center justify-center text-center text-slate-500">
							<CheckCircle2 size={36} className="mb-3 text-blue-500" />
							<p className="font-bold">
								Selecione ou crie um cargo para configurar.
							</p>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

function PermissionMatrixSection({
	group,
	isAdminRole,
	selectedPermissions,
	canEdit,
	togglePermission,
}) {
	return (
		<div className="rounded-2xl border border-slate-200 p-4">
			<h3 className="font-black text-slate-900">{group.label}</h3>
			<div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
				<div className="grid grid-cols-[minmax(0,1fr)_120px_120px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
					<span>Funcionalidade</span>
					<span className="text-center">Visualizar</span>
					<span className="text-center">Gerenciar</span>
				</div>
				{group.features.map((feature) => (
					<PermissionFeatureRow
						key={feature.id}
						feature={feature}
						isAdminRole={isAdminRole}
						selectedPermissions={selectedPermissions}
						canEdit={canEdit}
						togglePermission={togglePermission}
					/>
				))}
			</div>
		</div>
	);
}

function PermissionFeatureRow({
	feature,
	isAdminRole,
	selectedPermissions,
	canEdit,
	togglePermission,
}) {
	const hasView = feature.view
		? isAdminRole || selectedPermissions.includes(feature.view)
		: false;
	const hasManage = feature.manage
		? isAdminRole || selectedPermissions.includes(feature.manage)
		: false;
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-2 border-t border-slate-100 px-4 py-3">
			<p className="text-sm font-black text-slate-900">{feature.label}</p>
			<label className="flex justify-center">
				{feature.view ? (
					<input
						type="checkbox"
						checked={hasView}
						disabled={!canEdit || isAdminRole}
						onChange={(event) => togglePermission(feature.view, event.target.checked)}
						aria-label={`${ACTION_LABELS.view} ${feature.label}`}
						className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
					/>
				) : (
					<span className="text-xs font-bold text-slate-300">-</span>
				)}
			</label>
			<label className="flex justify-center">
				{feature.manage ? (
					<input
						type="checkbox"
						checked={hasManage}
						disabled={!canEdit || isAdminRole}
						onChange={(event) => togglePermission(feature.manage, event.target.checked)}
						aria-label={`${ACTION_LABELS.manage} ${feature.label}`}
						className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
					/>
				) : (
					<span className="text-xs font-bold text-slate-300">-</span>
				)}
			</label>
		</div>
	);
}
