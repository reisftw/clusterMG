import {
	Camera,
	Eye,
	EyeOff,
	KeyRound,
	LockKeyhole,
	Mail,
	MapPin,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	ShieldCheck,
	SlidersHorizontal,
	Trash2,
	User,
	UserCheck,
	UserPlus,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import ResponsiveDataView from "../../../components/ui/ResponsiveDataView";
import Spinner from "../../../components/ui/Spinner";
import UserAvatar from "../../../components/ui/UserAvatar";
import {
	CARGOS_RETIRADAS,
	getRoleLabel,
	hasPermission,
	ROLES,
} from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import { obterPreferenciasNotificacoes } from "../../../services/internalNotificationsService";
import { AVATAR_ACCEPT, validateImageFile } from "../../../utils/imageUpload";
import { listarInsumosAdministrativos } from "../../insumosAdministrativos/services/insumosAdministrativosService";
import {
	criarUsuarioAdmin,
	deletarUsuarioAdmin,
	enviarAvatarAdmin,
	listarCargosAdmin,
	listarEmpresasAdmin,
	listarRegionaisAdmin,
	listarUsuariosAdmin,
} from "../services/authService";
import EditarUsuarioModal from "./EditarUsuarioModal";
import UserInsumosScopeFields from "./UserInsumosScopeFields";

const ROLE_STYLES = {
	[ROLES.ADMIN]: "bg-red-100 text-red-700",
	[ROLES.GESTOR]: "bg-blue-100 text-blue-700",
	[ROLES.TECNICO]: "bg-green-100 text-green-700",
	[ROLES.ESTOQUE]: "bg-amber-100 text-amber-700",
	[ROLES.SUPERVISOR_ESTOQUE]: "bg-orange-100 text-orange-700",
	[ROLES.BACKOFFICE_RETIRADA]: "bg-cyan-100 text-cyan-700",
	[ROLES.SUPERVISOR]: "bg-violet-100 text-violet-700",
	[ROLES.SUPERVISOR_ADMINISTRATIVO]: "bg-purple-100 text-purple-700",
	[ROLES.ANALISTA_ADMINISTRATIVO]: "bg-sky-100 text-sky-700",
	[ROLES.LIDER_EMPRESA]: "bg-indigo-100 text-indigo-700",
	[ROLES.AGENTE_AUTORIZADO]: "bg-amber-100 text-amber-700",
	[ROLES.BACKOFFICE]: "bg-emerald-100 text-emerald-700",
	[ROLES.VISITANTE]: "bg-slate-100 text-slate-700",
};

const CACHE_TTL = 10 * 60 * 1000;
const USUARIOS_PAGE_SIZE_OPTIONS = [20, 30, 50, 100];
const fieldClass =
	"w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400";
const labelClass =
	"mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700";
const labelIconClass =
	"flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600";

function formatUltimoLogin(value) {
	if (!value) return "Nunca acessou";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Nunca acessou";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getCallableErrorMessage(error, fallbackMessage) {
	const message = String(error?.message || "");

	if (message.includes("already-exists") || message.includes("ja cadastrado")) {
		return "E-mail ja cadastrado.";
	}

	if (message.includes("Permissao insuficiente")) {
		return "Voce nao tem permissao para executar esta acao.";
	}

	if (message.includes("Autenticacao obrigatoria")) {
		return "Sua sessao expirou. Entre novamente para continuar.";
	}

	if (message) {
		return message;
	}

	return message || fallbackMessage;
}

function buildAllowedRoles(currentUser, cargosOptions = CARGOS_RETIRADAS) {
	const normalizedRole = String(
		currentUser?.role || currentUser || "",
	).toLowerCase();
	if (normalizedRole === ROLES.SUPERVISOR)
		return [ROLES.BACKOFFICE, ROLES.LIDER_EMPRESA];
	if (normalizedRole === ROLES.SUPERVISOR_ADMINISTRATIVO)
		return [
			ROLES.ANALISTA_ADMINISTRATIVO,
			ROLES.LIDER_EMPRESA,
			ROLES.AGENTE_AUTORIZADO,
		];
	if (normalizedRole !== ROLES.ADMIN) {
		if (
			hasPermission(currentUser, "configuracao.usuarios.manage") ||
			hasPermission(currentUser, "manage_users")
		) {
			return cargosOptions
				.map((cargo) => cargo.value)
				.filter(
					(role) => role && role !== ROLES.ADMIN && role !== normalizedRole,
				);
		}
		return [];
	}
	return cargosOptions.map((cargo) => cargo.value).filter(Boolean);
}

function requiresEmpresa(role) {
	return [ROLES.LIDER_EMPRESA, ROLES.AGENTE_AUTORIZADO].includes(role);
}

function getInitialUserRole({ initialEmpresa, allowedRoles }) {
	if (initialEmpresa?.agenteAutorizado) return ROLES.AGENTE_AUTORIZADO;
	if (initialEmpresa) return ROLES.LIDER_EMPRESA;
	if (allowedRoles.includes(ROLES.BACKOFFICE_RETIRADA))
		return ROLES.BACKOFFICE_RETIRADA;
	return allowedRoles[0];
}

function buildInitialUserForm({
	initialEmpresa,
	allowedRoles,
	isSupervisor,
	currentUser,
}) {
	return {
		nome: "",
		email: "",
		role: getInitialUserRole({ initialEmpresa, allowedRoles }),
		regional:
			initialEmpresa?.regional ||
			(isSupervisor ? currentUser?.regional || "" : ""),
		empresaId: initialEmpresa?.id || "",
		empresaNome: initialEmpresa?.nome || "",
		insumosBaseId: "",
		insumosBaseNome: "",
		insumosCategoriasVer: [],
		insumosCategoriasSolicitar: [],
		temporaryPassword: "",
		avatarUrl: "",
	};
}

function filterModalOptionsByRole({
	data,
	empresasData,
	currentUser,
	isSupervisor,
	isSupervisorAdministrativo,
}) {
	const regionalKey = String(currentUser?.regional || "").toLowerCase();
	const regionais = isSupervisor
		? data.filter(
				(item) => String(item.nome || "").toLowerCase() === regionalKey,
			)
		: data;
	const empresas =
		isSupervisor || isSupervisorAdministrativo
			? empresasData.filter(
					(item) => String(item.regional || "").toLowerCase() === regionalKey,
				)
			: empresasData;
	return { regionais, empresas };
}

const NovoUsuarioModal = ({
	currentUser,
	onClose,
	onCriado,
	initialEmpresa = null,
	cargosOptions = CARGOS_RETIRADAS,
}) => {
	const [regionais, setRegionais] = useState([]);
	const [empresas, setEmpresas] = useState([]);
	const [insumosConfig, setInsumosConfig] = useState({
		bases: [],
		categorias: [],
	});
	const [loadingRegionais, setLoadingRegionais] = useState(true);
	const allowedRoles = buildAllowedRoles(currentUser, cargosOptions);
	const isSupervisor =
		String(currentUser?.role || "").toLowerCase() === ROLES.SUPERVISOR;
	const isSupervisorAdministrativo =
		String(currentUser?.role || "").toLowerCase() ===
		ROLES.SUPERVISOR_ADMINISTRATIVO;
	const [form, setForm] = useState(() =>
		buildInitialUserForm({
			initialEmpresa,
			allowedRoles,
			isSupervisor,
			currentUser,
		}),
	);
	const [saving, setSaving] = useState(false);
	const [erro, setErro] = useState("");
	const [resultadoCriacao, setResultadoCriacao] = useState(null);
	const [copiado, setCopiado] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	const handleAvatarUpload = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setSaving(true);
		setErro("");
		try {
			validateImageFile(file);
			const avatarUrl = await enviarAvatarAdmin(file);
			set("avatarUrl", avatarUrl);
		} catch (error) {
			setErro(error?.message || "Não foi possível enviar o avatar.");
		} finally {
			setSaving(false);
		}
	};

	useEffect(() => {
		let active = true;

		const carregarRegionais = async () => {
			setLoadingRegionais(true);
			try {
				const [data, empresasData, insumosData] = await Promise.all([
					listarRegionaisAdmin(),
					listarEmpresasAdmin().catch(() => []),
					listarInsumosAdministrativos().catch(() => ({
						config: { bases: [], categorias: [] },
					})),
				]);
				if (active) {
					const options = filterModalOptionsByRole({
						data,
						empresasData,
						currentUser,
						isSupervisor,
						isSupervisorAdministrativo,
					});
					setRegionais(options.regionais);
					setEmpresas(options.empresas);
					setInsumosConfig(
						insumosData?.config || { bases: [], categorias: [] },
					);
				}
			} catch {
				if (active) {
					setErro("Nao foi possivel carregar as regionais.");
				}
			} finally {
				if (active) {
					setLoadingRegionais(false);
				}
			}
		};

		carregarRegionais();
		return () => {
			active = false;
		};
	}, [
		currentUser,
		currentUser?.regional,
		isSupervisor,
		isSupervisorAdministrativo,
	]);

	const set = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));

	const handleCriar = async () => {
		if (!form.nome.trim() || !form.email.trim()) {
			setErro("Preencha nome e e-mail.");
			return;
		}
		if (requiresEmpresa(form.role) && !form.empresaId) {
			setErro("Selecione a empresa vinculada ao usuário.");
			return;
		}

		setSaving(true);
		setErro("");
		setCopiado(false);

		try {
			const response = await criarUsuarioAdmin({
				email: form.email.trim().toLowerCase(),
				nome: form.nome.trim(),
				role: form.role,
				regional: form.regional,
				empresaId: form.empresaId,
				empresaNome: form.empresaNome,
				...(form.insumosBaseId || form.insumosBaseNome
					? {
							insumosBaseId: form.insumosBaseId,
							insumosBaseNome: form.insumosBaseNome,
						}
					: {}),
				...(form.insumosCategoriasVer?.length
					? { insumosCategoriasVer: form.insumosCategoriasVer }
					: {}),
				...(form.insumosCategoriasSolicitar?.length
					? { insumosCategoriasSolicitar: form.insumosCategoriasSolicitar }
					: {}),
				avatarUrl: form.avatarUrl,
				temporaryPassword: form.temporaryPassword,
			});
			const result = response || {};

			invalidateCache(
				`usuarios:lista:${currentUser?.role || ""}:${currentUser?.regional || ""}`,
			);
			onCriado();
			setResultadoCriacao({
				email: form.email.trim().toLowerCase(),
				passwordResetLink: result.passwordResetLink || "",
				temporaryPassword: result.temporaryPassword || "",
			});
		} catch (error) {
			setErro(getCallableErrorMessage(error, "Erro ao criar usuario."));
		} finally {
			setSaving(false);
		}
	};

	const handleCopiarLink = async () => {
		if (!resultadoCriacao?.temporaryPassword || !navigator?.clipboard) return;

		await navigator.clipboard.writeText(resultadoCriacao.temporaryPassword);
		setCopiado(true);
	};

	const handleCopiarAcesso = async () => {
		if (!navigator?.clipboard) return;

		const lines = [
			`E-mail: ${resultadoCriacao?.email || ""}`,
			`Senha temporaria: ${resultadoCriacao?.temporaryPassword || ""}`,
			resultadoCriacao?.passwordResetLink
				? `Link para redefinir senha: ${resultadoCriacao.passwordResetLink}`
				: "",
		].filter(Boolean);

		await navigator.clipboard.writeText(lines.join("\n"));
		setCopiado(true);
	};

	const handleRoleChange = (value) => {
		setForm((current) => ({
			...current,
			role: value,
			...(requiresEmpresa(value) ? {} : { empresaId: "", empresaNome: "" }),
		}));
	};

	const handleEmpresaChange = (value) => {
		const empresa = empresas.find((item) => item.id === value);
		setForm((current) => ({
			...current,
			empresaId: empresa?.id || "",
			empresaNome: empresa?.nome || "",
			regional: empresa?.regional || current.regional,
		}));
	};

	if (resultadoCriacao) {
		return (
			<ModalShell
				onClose={onClose}
				showClose={false}
				size="md"
				bodyClassName="p-0"
			>
				<div className="space-y-4 p-6">
					<div className="flex justify-center">
						<div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
							<KeyRound size={22} />
						</div>
					</div>

					<div className="text-center space-y-2">
						<h2 className="font-bold text-gray-900">Primeiro acesso gerado</h2>
						<p className="text-sm text-gray-600">
							Compartilhe os dados abaixo com{" "}
							<strong>{resultadoCriacao.email}</strong> por um canal seguro.
						</p>
					</div>

					<div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
						<p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
							Senha temporaria
						</p>
						<p className="mt-1 font-mono text-sm font-bold text-blue-900">
							{resultadoCriacao.temporaryPassword || "-"}
						</p>
					</div>

					<textarea
						readOnly
						value={`E-mail: ${resultadoCriacao.email}\nSenha temporaria: ${resultadoCriacao.temporaryPassword || "-"}`}
						className="w-full h-28 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700"
					/>

					{!resultadoCriacao.temporaryPassword ? (
						<p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
							Nao foi possivel exibir a senha temporaria. Gere uma nova
							redefinicao no cadastro do usuario.
						</p>
					) : null}

					{copiado ? (
						<p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
							Acesso copiado com sucesso.
						</p>
					) : null}

					<div className="flex gap-3 pt-1">
						<button
							onClick={onClose}
							className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm"
						>
							Fechar
						</button>
						<button
							onClick={handleCopiarAcesso}
							className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60 text-sm"
						>
							Copiar acesso
						</button>
						<button
							onClick={handleCopiarLink}
							disabled={!resultadoCriacao.temporaryPassword}
							className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold disabled:opacity-60 text-sm"
						>
							Copiar senha
						</button>
					</div>
				</div>
			</ModalShell>
		);
	}

	return (
		<ModalShell
			onClose={onClose}
			showClose={false}
			size="3xl"
			bodyClassName="p-0"
		>
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
						<div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#061d38] shadow-lg shadow-slate-200">
							<img
								src="/cluster-mg.png"
								alt="Cluster MG"
								className="h-full w-full object-cover"
							/>
						</div>

						<div>
							<h2 className="text-2xl font-black tracking-tight text-slate-950">
								Criar novo usuário
							</h2>
							<p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
								Preencha as informações abaixo para adicionar um novo usuário ao
								sistema.
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
							alt="Avatar do usuário"
							className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-lg font-black text-white"
						/>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-black text-slate-950">
								Avatar do usuário
							</p>
							<p className="mt-1 text-xs font-semibold text-slate-500">
								Opcional. Aceita apenas JPG ou PNG até 600 KB.
							</p>
						</div>
						<label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-50">
							<Camera size={15} /> Enviar
							<input
								type="file"
								accept={AVATAR_ACCEPT}
								disabled={saving}
								onChange={handleAvatarUpload}
								className="hidden"
							/>
						</label>
					</div>

					<div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
						<div className="grid gap-4 lg:grid-cols-2">
							<div>
								<label className={labelClass}>
									<span className={labelIconClass}>
										<User size={20} />
									</span>
									<span>
										Nome completo <span className="text-red-500">*</span>
									</span>
								</label>
								<input
									type="text"
									value={form.nome}
									onChange={(event) => set("nome", event.target.value)}
									placeholder="Digite o nome completo"
									className={fieldClass}
								/>
							</div>

							<div>
								<label className={labelClass}>
									<span className={labelIconClass}>
										<Mail size={20} />
									</span>
									<span>
										E-mail <span className="text-red-500">*</span>
									</span>
								</label>
								<input
									type="email"
									value={form.email}
									onChange={(event) => set("email", event.target.value)}
									placeholder="exemplo@email.com"
									className={fieldClass}
								/>
							</div>
						</div>

						<div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950">
							<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
								<LockKeyhole size={22} />
							</div>
							<div>
								<h3 className="text-base font-black text-amber-600">
									Primeiro acesso
								</h3>
								<p className="mt-1 text-sm leading-relaxed text-amber-900">
									O backend cria uma senha temporária local. No primeiro login,
									o usuário troca pela senha pessoal.
								</p>
							</div>
						</div>

						<div className="mt-5">
							<label className="mb-3 flex items-center gap-3 text-sm font-extrabold text-violet-700">
								<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
									<ShieldCheck size={18} />
								</span>
								<span>Senha temporária</span>
							</label>
							<div className="relative">
								<input
									type={showPassword ? "text" : "password"}
									value={form.temporaryPassword}
									onChange={(event) =>
										set("temporaryPassword", event.target.value)
									}
									placeholder="Opcional. Se vazio, o sistema gera uma senha."
									className={`${fieldClass} pr-14`}
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
							<p className="mt-2 text-xs leading-relaxed text-slate-500">
								Se informar aqui, essa será a senha do primeiro login. Caso
								deixe vazio, uma senha temporária será gerada e exibida após o
								cadastro.
							</p>
						</div>

						<div className="mt-5 grid gap-4 lg:grid-cols-2">
							<div>
								<label className={labelClass}>
									<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
										<ShieldCheck size={18} />
									</span>
									<span>
										Role <span className="text-red-500">*</span>
									</span>
								</label>
								<select
									value={form.role}
									onChange={(event) => handleRoleChange(event.target.value)}
									className={fieldClass}
								>
									{allowedRoles.map((role) => (
										<option key={role} value={role}>
											{cargosOptions.find((cargo) => cargo.value === role)
												?.label || getRoleLabel(role)}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className={labelClass}>
									<span className={labelIconClass}>
										<MapPin size={18} />
									</span>
									<span>Regional</span>
								</label>
								<select
									value={form.regional}
									onChange={(event) => set("regional", event.target.value)}
									className={fieldClass}
									disabled={loadingRegionais || isSupervisor}
								>
									<option value="">- Nenhuma -</option>
									{regionais.map((regional) => (
										<option key={regional.id} value={regional.nome}>
											{regional.nome}
										</option>
									))}
								</select>
								<p className="mt-2 text-xs text-slate-500">
									{loadingRegionais
										? "Carregando regionais..."
										: `${regionais.length} regional(is) disponível(is).`}
								</p>
							</div>
						</div>

						<UserInsumosScopeFields
							form={form}
							setForm={setForm}
							insumosConfig={insumosConfig}
							fieldClass={fieldClass}
							labelClass={labelClass}
							datalistId="novo-usuario-insumos-bases"
						/>

						{requiresEmpresa(form.role) ? (
							<div className="mt-5">
								<label className={labelClass}>
									<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
										<Users size={18} />
									</span>
									<span>
										Empresa vinculada <span className="text-red-500">*</span>
									</span>
								</label>
								<select
									value={form.empresaId}
									onChange={(event) => handleEmpresaChange(event.target.value)}
									className={fieldClass}
								>
									<option value="">Selecione a empresa</option>
									{empresas.map((empresa) => (
										<option key={empresa.id} value={empresa.id}>
											{empresa.nome}
										</option>
									))}
								</select>
								<p className="mt-2 text-xs text-slate-500">
									Este perfil só enxerga o perfil e os documentos da empresa
									selecionada.
								</p>
							</div>
						) : null}
					</div>

					<div className="mt-5 flex flex-col justify-end gap-3 sm:flex-row">
						<button
							onClick={onClose}
							className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 text-sm font-extrabold text-slate-700 transition hover:bg-slate-200"
						>
							<X size={18} />
							Cancelar
						</button>
						<button
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
};

const UsuariosPage = () => {
	const { currentUser } = useAuthContext();
	const isAdmin = String(currentUser?.role || "").toLowerCase() === ROLES.ADMIN;
	const isFinanScope =
		currentUser?.appScope === "finan" || currentUser?.sourceSystem === "finan";
	const canManage =
		hasPermission(currentUser, "configuracao.usuarios.manage") ||
		hasPermission(currentUser, "manage_users");
	const [usuarios, setUsuarios] = useState([]);
	const [usuariosStats, setUsuariosStats] = useState({});
	const [cargosOptions, setCargosOptions] = useState(() =>
		isFinanScope ? [] : CARGOS_RETIRADAS,
	);
	const [defaultAvatarUrl, setDefaultAvatarUrl] = useState("");
	const [loading, setLoading] = useState(true);
	const [modalNovo, setModalNovo] = useState(false);
	const [editando, setEditando] = useState(null);
	const [erroPagina, setErroPagina] = useState("");
	const [busca, setBusca] = useState("");
	const [cargoFiltro, setCargoFiltro] = useState("");
	const [regionalFiltro, setRegionalFiltro] = useState("");
	const [pagina, setPagina] = useState(1);
	const [itensPorPagina, setItensPorPagina] = useState(20);

	const carregar = useCallback(async () => {
		setLoading(true);
		setErroPagina("");

		try {
			const { data } = await getOrLoadCachedValue(
				`usuarios:lista:${currentUser?.role || ""}:${currentUser?.regional || ""}`,
				async () => {
					return listarUsuariosAdmin();
				},
				{ ttlMs: CACHE_TTL },
			);

			setUsuarios(Array.isArray(data) ? data : data?.items || []);
			setUsuariosStats(Array.isArray(data) ? {} : data?.stats || {});
		} finally {
			setLoading(false);
		}
	}, [currentUser?.regional, currentUser?.role]);

	useEffect(() => {
		carregar();
		listarCargosAdmin()
			.then((items) => {
				if (items?.length) {
					const baseOptions = isAdmin && !isFinanScope ? CARGOS_RETIRADAS : [];
					const merged = new Map(
						baseOptions.map((cargo) => [cargo.value, cargo]),
					);
					items.forEach((cargo) => {
						if (cargo?.value) merged.set(cargo.value, cargo);
					});
					setCargosOptions([...merged.values()]);
				} else if (!isAdmin || isFinanScope) {
					setCargosOptions([]);
				}
			})
			.catch(() => setCargosOptions(isFinanScope ? [] : CARGOS_RETIRADAS));
		obterPreferenciasNotificacoes()
			.then((preferences) =>
				setDefaultAvatarUrl(
					preferences?.defaultAvatarUrl ||
						preferences?.defaultAvatarDataUrl ||
						"",
				),
			)
			.catch(() => {});
	}, [carregar, isAdmin, isFinanScope]);

	const deletar = async (uid) => {
		if (!canManage || !isAdmin) return;
		if (!confirm("Deseja remover este usuario do sistema?")) return;

		setErroPagina("");

		try {
			await deletarUsuarioAdmin(uid);
			invalidateCache(
				`usuarios:lista:${currentUser?.role || ""}:${currentUser?.regional || ""}`,
			);
			setUsuarios((current) => current.filter((item) => item.id !== uid));
		} catch (error) {
			setErroPagina(getCallableErrorMessage(error, "Erro ao remover usuario."));
		}
	};
	const invalidateUsuariosCache = () =>
		invalidateCache(
			`usuarios:lista:${currentUser?.role || ""}:${currentUser?.regional || ""}`,
		);
	const atualizarLista = () => {
		invalidateUsuariosCache();
		carregar();
	};

	const regionaisDisponiveis = [
		...new Set(usuarios.map((usuario) => usuario.regional).filter(Boolean)),
	].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
	const cargosDisponiveis = [
		...new Set(usuarios.map((usuario) => usuario.role).filter(Boolean)),
	].sort((a, b) => getRoleLabel(a).localeCompare(getRoleLabel(b), "pt-BR"));
	const usuariosFiltrados = usuarios.filter((usuario) => {
		const query = busca.trim().toLowerCase();
		const matchesBusca =
			!query ||
			[
				usuario.nome,
				usuario.email,
				usuario.regional,
				getRoleLabel(usuario.role),
			].some((value) =>
				String(value || "")
					.toLowerCase()
					.includes(query),
			);
		const matchesCargo = !cargoFiltro || usuario.role === cargoFiltro;
		const matchesRegional =
			!regionalFiltro || usuario.regional === regionalFiltro;
		return matchesBusca && matchesCargo && matchesRegional;
	});
	const totalPaginas = Math.max(
		1,
		Math.ceil(usuariosFiltrados.length / itensPorPagina),
	);
	const paginaAtual = Math.min(pagina, totalPaginas);
	const usuariosPaginados = usuariosFiltrados.slice(
		(paginaAtual - 1) * itensPorPagina,
		paginaAtual * itensPorPagina,
	);
	const totalNuncaAcessou = usuarios.filter(
		(usuario) => !(usuario.ultimo_login || usuario.last_login_at),
	).length;
	const totalAdministrativos = usuarios.filter((usuario) =>
		[ROLES.SUPERVISOR_ADMINISTRATIVO, ROLES.ANALISTA_ADMINISTRATIVO].includes(
			String(usuario.role || "").toLowerCase(),
		),
	).length;
	const totalEmpresas = usuarios.filter((usuario) =>
		[ROLES.LIDER_EMPRESA, ROLES.AGENTE_AUTORIZADO].includes(
			String(usuario.role || "").toLowerCase(),
		),
	).length;
	const totalOAuth = Number(
		usuariosStats.totalOAuth ??
			usuarios.filter(
				(usuario) =>
					usuario.criado_por_oauth || usuario.login_provider === "google",
			).length,
	);
	const usuariosColumns = [
		{
			key: "usuario",
			header: "Usuário",
			render: (usuario) => (
				<div className="flex min-w-0 items-center gap-3">
					<UserAvatar
						src={usuario.avatarUrl || usuario.avatarDataUrl || defaultAvatarUrl}
						name={usuario.nome}
						email={usuario.email}
						alt={usuario.nome || "Avatar"}
						className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-sm font-black text-blue-700"
					/>
					<div className="min-w-0">
						<p className="break-anywhere font-black text-slate-900">
							{usuario.nome || "-"}
						</p>
						<p className="break-anywhere text-xs font-semibold text-slate-500">
							{usuario.email || "-"}
						</p>
					</div>
				</div>
			),
		},
		{
			key: "regional",
			header: "Regional",
			render: (usuario) => usuario.regional || "-",
			className: "text-sm font-semibold text-slate-600",
		},
		{
			key: "cargo",
			header: "Cargo",
			render: (usuario) => (
				<span
					className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ROLE_STYLES[usuario.role] ?? "bg-slate-100 text-slate-700"}`}
				>
					{getRoleLabel(usuario.role)}
				</span>
			),
		},
		{
			key: "ultimoLogin",
			header: "Último login",
			render: (usuario) => (
				<div>
					<div className="font-bold text-slate-800">
						{formatUltimoLogin(usuario.ultimo_login || usuario.last_login_at)}
					</div>
					{usuario.ultimo_login_ip ? (
						<div className="mt-0.5 break-anywhere text-xs text-slate-400">
							{usuario.ultimo_login_ip}
						</div>
					) : null}
				</div>
			),
		},
		{
			key: "acoes",
			header: "Ações",
			headerClassName: "text-right",
			className: "md:text-right",
			render: (usuario) => (
				<div className="flex justify-end gap-1">
					{canManage ? (
						<button
							onClick={() => setEditando(usuario)}
							className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
							title="Editar"
							type="button"
						>
							<Pencil size={16} />
						</button>
					) : (
						<span className="text-xs font-bold text-slate-400">
							Somente leitura
						</span>
					)}
					{isAdmin ? (
						<button
							onClick={() => deletar(usuario.id)}
							disabled={!canManage}
							className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
							title="Excluir"
							type="button"
						>
							<Trash2 size={16} />
						</button>
					) : null}
				</div>
			),
		},
	];

	useEffect(() => {
		setPagina(1);
	}, [busca, cargoFiltro, regionalFiltro, itensPorPagina]);

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<div className="flex items-center gap-3">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Users size={24} />
						</div>
						<div>
							<h2 className="text-2xl font-black text-slate-950">Usuários</h2>
							<p className="text-sm text-slate-500">
								Gerencie acessos, perfis, regionais e vínculos de empresa.
							</p>
						</div>
					</div>
				</div>

				<div className="flex gap-2">
					<button
						onClick={atualizarLista}
						className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
					>
						<RefreshCw size={17} /> Atualizar
					</button>
					<button
						onClick={() => setModalNovo(true)}
						disabled={!canManage}
						className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
					>
						<Plus size={17} /> Novo usuário
					</button>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
				<div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Total
						</span>
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
							<Users size={20} />
						</span>
					</div>
					<p className="mt-3 text-3xl font-black text-slate-950">
						{usuarios.length}
					</p>
					<p className="mt-1 text-sm text-slate-500">usuários cadastrados</p>
				</div>
				<div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Com acesso
						</span>
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
							<UserCheck size={20} />
						</span>
					</div>
					<p className="mt-3 text-3xl font-black text-slate-950">
						{usuarios.length - totalNuncaAcessou}
					</p>
					<p className="mt-1 text-sm text-slate-500">já fizeram login</p>
				</div>
				<div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Administrativo
						</span>
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
							<ShieldCheck size={20} />
						</span>
					</div>
					<p className="mt-3 text-3xl font-black text-slate-950">
						{totalAdministrativos}
					</p>
					<p className="mt-1 text-sm text-slate-500">
						supervisores e analistas
					</p>
				</div>
				<div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Empresas
						</span>
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
							<UserPlus size={20} />
						</span>
					</div>
					<p className="mt-3 text-3xl font-black text-slate-950">
						{totalEmpresas}
					</p>
					<p className="mt-1 text-sm text-slate-500">líderes e agentes</p>
				</div>
				<div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							OAuth
						</span>
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
							<KeyRound size={20} />
						</span>
					</div>
					<p className="mt-3 text-3xl font-black text-slate-950">
						{totalOAuth}
					</p>
					<p className="mt-1 text-sm text-slate-500">criados pelo Google</p>
				</div>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800">
					<SlidersHorizontal size={18} className="text-blue-600" />
					Filtros
				</div>
				<div className="grid gap-3 lg:grid-cols-[1.4fr_.9fr_.9fr_auto]">
					<label className="relative">
						<Search
							className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
							size={18}
						/>
						<input
							value={busca}
							onChange={(event) => setBusca(event.target.value)}
							placeholder="Buscar por nome, e-mail, cargo ou regional"
							className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<select
						value={cargoFiltro}
						onChange={(event) => setCargoFiltro(event.target.value)}
						className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Todos os cargos</option>
						{cargosDisponiveis.map((role) => (
							<option key={role} value={role}>
								{getRoleLabel(role)}
							</option>
						))}
					</select>
					<select
						value={regionalFiltro}
						onChange={(event) => setRegionalFiltro(event.target.value)}
						className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Todas as regionais</option>
						{regionaisDisponiveis.map((regional) => (
							<option key={regional} value={regional}>
								{regional}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={() => {
							setBusca("");
							setCargoFiltro("");
							setRegionalFiltro("");
							setPagina(1);
						}}
						className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 transition hover:bg-slate-50"
					>
						Limpar
					</button>
				</div>
			</div>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 className="text-base font-black text-slate-950">
							Usuários cadastrados
						</h3>
						<p className="text-sm text-slate-500">
							Mostrando {usuariosPaginados.length} de {usuariosFiltrados.length}{" "}
							usuário(s) filtrado(s)
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-500">
							Total carregado: {usuarios.length}
						</p>
						<select
							value={itensPorPagina}
							onChange={(event) =>
								setItensPorPagina(Number(event.target.value) || 20)
							}
							className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						>
							{USUARIOS_PAGE_SIZE_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{option} por página
								</option>
							))}
						</select>
					</div>
				</div>

				{erroPagina ? (
					<div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{erroPagina}
					</div>
				) : null}

				<div className="p-5 pt-4">
					<ResponsiveDataView
						items={usuariosPaginados}
						columns={usuariosColumns}
						getRowKey={(usuario) => usuario.id}
						emptyMessage="Nenhum usuário encontrado. Ajuste os filtros para ampliar a busca."
						strategy="cards"
						minTableWidth="min-w-[860px]"
					/>
				</div>
				{usuariosFiltrados.length ? (
					<div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-sm font-semibold text-slate-500">
							Página {paginaAtual} de {totalPaginas}
						</p>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setPagina(1)}
								disabled={paginaAtual <= 1}
								className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
							>
								«
							</button>
							<button
								type="button"
								onClick={() => setPagina((current) => Math.max(1, current - 1))}
								disabled={paginaAtual <= 1}
								className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Anterior
							</button>
							<button
								type="button"
								onClick={() =>
									setPagina((current) => Math.min(totalPaginas, current + 1))
								}
								disabled={paginaAtual >= totalPaginas}
								className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Próxima
							</button>
							<button
								type="button"
								onClick={() => setPagina(totalPaginas)}
								disabled={paginaAtual >= totalPaginas}
								className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
							>
								»
							</button>
						</div>
					</div>
				) : null}
			</div>

			{modalNovo && canManage ? (
				<NovoUsuarioModal
					currentUser={currentUser}
					cargosOptions={cargosOptions}
					onClose={() => setModalNovo(false)}
					onCriado={() => {
						invalidateUsuariosCache();
						carregar();
					}}
				/>
			) : null}

			{editando && canManage ? (
				<EditarUsuarioModal
					usuario={editando}
					currentUser={currentUser}
					cargosOptions={cargosOptions}
					onClose={() => setEditando(null)}
					onSalvo={() => {
						invalidateUsuariosCache();
						carregar();
					}}
				/>
			) : null}
		</div>
	);
};

export default UsuariosPage;
