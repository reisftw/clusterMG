import {
	Camera,
	KeyRound,
	Mail,
	MapPin,
	ShieldCheck,
	User,
	UserCheck,
	X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import UserAvatar from "../../../components/ui/UserAvatar";
import {
	CARGOS_ADM,
	getRoleLabel,
	ROLES,
} from "../../../constants/roles";
import { AVATAR_ACCEPT, validateImageFile } from "../../../utils/imageUpload";
import { listarInsumosAdministrativos } from "../../insumosAdministrativos/services/insumosAdministrativosService";
import {
	atualizarUsuarioAdmin,
	enviarAvatarAdmin,
	gerarLinkPrimeiroAcessoAdmin,
	listarEmpresasAdmin,
	listarRegionaisAdmin,
} from "../services/authService";
import UserInsumosScopeFields from "./UserInsumosScopeFields";

const fieldClass =
	"w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400";
const labelClass =
	"mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-700";
const labelIconClass =
	"flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600";

function buildAllowedRoles(currentUser, cargosOptions = CARGOS_ADM) {
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
	if (normalizedRole !== ROLES.ADMIN) return [];
	return cargosOptions.map((cargo) => cargo.value).filter(Boolean);
}

function requiresEmpresa(role) {
	return [ROLES.LIDER_EMPRESA, ROLES.AGENTE_AUTORIZADO].includes(role);
}

const EditarUsuarioModal = ({
	usuario,
	currentUser,
	onClose,
	onSalvo,
	cargosOptions = CARGOS_ADM,
}) => {
	const allowedRoles = buildAllowedRoles(currentUser, cargosOptions);
	const isSupervisor =
		String(currentUser?.role || "").toLowerCase() === ROLES.SUPERVISOR;
	const [regionais, setRegionais] = useState([]);
	const [empresas, setEmpresas] = useState([]);
	const [insumosConfig, setInsumosConfig] = useState({
		bases: [],
		categorias: [],
	});
	const [loadingRegionais, setLoadingRegionais] = useState(true);
	const [form, setForm] = useState({
		nome: usuario.nome || "",
		email: usuario.email || "",
		role:
			usuario.role && allowedRoles.includes(usuario.role)
				? usuario.role
				: allowedRoles[0] || "",
		regional:
			usuario.regional || (isSupervisor ? currentUser?.regional || "" : ""),
		empresaId: usuario.empresaId || usuario.empresa_id || "",
		empresaNome: usuario.empresaNome || usuario.empresa_nome || "",
		insumosBaseId:
			usuario.insumosBaseId ||
			usuario.baseInsumosId ||
			usuario.insumos_base_id ||
			"",
		insumosBaseNome:
			usuario.insumosBaseNome ||
			usuario.baseInsumosNome ||
			usuario.insumos_base_nome ||
			"",
		insumosCategoriasVer: Array.isArray(usuario.insumosCategoriasVer)
			? usuario.insumosCategoriasVer
			: [],
		insumosCategoriasSolicitar: Array.isArray(
			usuario.insumosCategoriasSolicitar,
		)
			? usuario.insumosCategoriasSolicitar
			: [],
		avatarUrl: usuario.avatarUrl || "",
	});
	const [saving, setSaving] = useState(false);
	const [erro, setErro] = useState("");
	const [loadingLink, setLoadingLink] = useState(false);
	const [senhaPrimeiroAcesso, setSenhaPrimeiroAcesso] = useState("");
	const nomeInputId = useId();
	const emailInputId = useId();
	const roleInputId = useId();
	const regionalInputId = useId();
	const empresaInputId = useId();

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

	const set = (field, val) =>
		setForm((current) => ({ ...current, [field]: val }));

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
					const regionalKey = String(currentUser?.regional || "").toLowerCase();
					setRegionais(
						isSupervisor
							? data.filter(
									(item) =>
										String(item.nome || "").toLowerCase() === regionalKey,
								)
							: data,
					);
					setEmpresas(
						isSupervisor
							? empresasData.filter(
									(item) =>
										String(item.regional || "").toLowerCase() === regionalKey,
								)
							: empresasData,
					);
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
	}, [currentUser?.regional, isSupervisor]);

	const handleSalvar = async () => {
		if (!form.nome.trim()) {
			setErro("Nome e obrigatorio.");
			return;
		}
		if (requiresEmpresa(form.role) && !form.empresaId) {
			setErro("Selecione a empresa vinculada ao usuário.");
			return;
		}

		setSaving(true);
		setErro("");

		try {
			await atualizarUsuarioAdmin(usuario.id, {
				nome: form.nome.trim(),
				email: form.email.trim().toLowerCase(),
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
			});
			onSalvo();
			onClose();
		} catch (error) {
			setErro("Erro ao salvar: " + error.message);
		} finally {
			setSaving(false);
		}
	};

	const handleGerarLink = async () => {
		setLoadingLink(true);
		setErro("");

		try {
			const response = await gerarLinkPrimeiroAcessoAdmin(usuario.id);
			setSenhaPrimeiroAcesso(response?.temporaryPassword || "");
		} catch (error) {
			setErro("Erro ao gerar senha temporaria: " + error.message);
		} finally {
			setLoadingLink(false);
		}
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
								Editar usuário
							</h2>
							<p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
								Atualize o perfil, permissões e regional vinculada ao usuário.
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
							src={form.avatarUrl || usuario.avatarDataUrl}
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
								Aceita apenas JPG ou PNG até 600 KB.
							</p>
						</div>
						<label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-50">
							<Camera size={15} /> Trocar
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
								<label htmlFor={nomeInputId} className={labelClass}>
									<span className={labelIconClass}>
										<User size={18} />
									</span>
									<span>
										Nome completo <span className="text-red-500">*</span>
									</span>
								</label>
								<input
									id={nomeInputId}
									type="text"
									value={form.nome}
									onChange={(event) => set("nome", event.target.value)}
									className={fieldClass}
									placeholder="Digite o nome completo"
								/>
							</div>

							<div>
								<label htmlFor={emailInputId} className={labelClass}>
									<span className={labelIconClass}>
										<Mail size={18} />
									</span>
									<span>E-mail</span>
								</label>
								<input
									id={emailInputId}
									type="email"
									value={form.email}
									onChange={(event) => set("email", event.target.value)}
									className={fieldClass}
									placeholder="exemplo@email.com"
								/>
								<p className="mt-2 text-xs text-slate-500">
									Alterar e-mail atualiza o login local e o perfil na VPS.
								</p>
							</div>
						</div>

						<div className="mt-5 grid gap-4 lg:grid-cols-2">
							<div>
								<label htmlFor={roleInputId} className={labelClass}>
									<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
										<ShieldCheck size={18} />
									</span>
									<span>
										Role <span className="text-red-500">*</span>
									</span>
								</label>
								<select
									id={roleInputId}
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
								<label htmlFor={regionalInputId} className={labelClass}>
									<span className={labelIconClass}>
										<MapPin size={18} />
									</span>
									<span>Regional</span>
								</label>
								<select
									id={regionalInputId}
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
							datalistId="insumos-bases-options"
						/>

						{requiresEmpresa(form.role) ? (
							<div className="mt-5">
								<label htmlFor={empresaInputId} className={labelClass}>
									<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
										<UserCheck size={18} />
									</span>
									<span>
										Empresa vinculada <span className="text-red-500">*</span>
									</span>
								</label>
								<select
									id={empresaInputId}
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

						<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex gap-5">
									<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
										<KeyRound size={22} />
									</div>
									<div>
										<p className="text-base font-black text-amber-600">
											Primeiro acesso / redefinição
										</p>
										<p className="mt-1 text-sm leading-relaxed text-amber-900">
											Gere uma senha temporária para o usuário entrar e trocar a
											senha.
										</p>
									</div>
								</div>
								<button
									type="button"
									onClick={handleGerarLink}
									disabled={loadingLink}
									className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-sm font-extrabold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:opacity-60"
								>
									<KeyRound size={14} />
									{loadingLink ? "Gerando..." : "Gerar senha"}
								</button>
							</div>

							{senhaPrimeiroAcesso ? (
								<textarea
									readOnly
									value={`E-mail: ${form.email}\nSenha temporária: ${senhaPrimeiroAcesso}`}
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
};

export default EditarUsuarioModal;
