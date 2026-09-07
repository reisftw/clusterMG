import {
	AlertCircle,
	CheckCircle2,
	KeyRound,
	Link,
	Loader2,
	Pencil,
	Plug,
	Plus,
	RefreshCw,
	ShieldCheck,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission, ROLES } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	obterConfigGoogleOAuthAdmin,
	obterConfigOktaOAuthAdmin,
	salvarConfigGoogleOAuthAdmin,
	salvarConfigOktaOAuthAdmin,
} from "../../auth/services/authService";
import { useIntegracoes } from "../hooks/useIntegracoes";
import {
	AUTH_LOCATIONS,
	AUTH_TYPES,
	DEFAULT_INTEGRATION_FORM,
	INTEGRATION_ENVIRONMENTS,
	SYNC_FREQUENCIES,
} from "../services/integracoesService";

const STATUS_CLASS = {
	ok: "border-green-200 bg-green-50 text-green-700",
	error: "border-red-200 bg-red-50 text-red-600",
	not_tested: "border-gray-200 bg-gray-50 text-gray-500",
};

const MODULE_OPTIONS = [
	"Hubsoft",
	"Playground",
	"Retiradas",
	"Equipamentos",
	"Estoque",
	"Dashboard",
	"PostgreSQL",
	"Backups",
	"Login",
	"Tempo Real",
];

function listToText(items, formatter) {
	return (items || []).map(formatter).join("\n");
}

function textToModules(value) {
	return String(value || "")
		.split(/[\n,;]/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function textToKeyValue(value) {
	return String(value || "")
		.split("\n")
		.map((line) => {
			const [key, ...rest] = line.split(":");
			return { key: key?.trim() || "", value: rest.join(":").trim() };
		})
		.filter((item) => item.key || item.value);
}

function textToMappings(value) {
	return String(value || "")
		.split("\n")
		.map((line) => {
			const [localField, ...rest] = line.split("=");
			return {
				localField: localField?.trim() || "",
				remotePath: rest.join("=").trim(),
			};
		})
		.filter((item) => item.localField || item.remotePath);
}

function integrationToForm(integracao) {
	if (!integracao) return { ...DEFAULT_INTEGRATION_FORM };
	return {
		...DEFAULT_INTEGRATION_FORM,
		...integracao,
	};
}

function IntegrationForm({ initialValue, onCancel, onSave, saving }) {
	const [form, setForm] = useState(() => integrationToForm(initialValue));
	const [modulesText, setModulesText] = useState(() =>
		(form.modules || []).join(", "),
	);
	const [headersText, setHeadersText] = useState(() =>
		listToText(form.headers, (item) => `${item.key}: ${item.value}`),
	);
	const [mappingsText, setMappingsText] = useState(() =>
		listToText(
			form.fieldMappings,
			(item) => `${item.localField} = ${item.remotePath}`,
		),
	);

	const handleChange = (field, value) => {
		setForm((current) => ({ ...current, [field]: value }));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		await onSave({
			...form,
			modules: textToModules(modulesText),
			headers: textToKeyValue(headersText),
			fieldMappings: textToMappings(mappingsText),
		});
	};

	return (
		<section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div>
					<h2 className="text-base font-bold text-gray-900">
						{initialValue?.id ? "Editar integração" : "Nova integração"}
					</h2>
					<p className="text-xs text-gray-500">
						Cadastre URLs, ambiente, referência de credencial e campos usados
						pelas sincronizações.
					</p>
				</div>
				<button
					type="button"
					onClick={onCancel}
					className="inline-flex items-center gap-1.5 self-start rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
				>
					<X size={14} /> Fechar
				</button>
			</div>

			<form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-6">
				<label className="block md:col-span-2">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Nome
					</span>
					<input
						value={form.name}
						onChange={(event) => handleChange("name", event.target.value)}
						className="input-field"
						placeholder="Hubsoft producao"
						required
					/>
				</label>

				<label className="block md:col-span-2">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Fornecedor
					</span>
					<input
						value={form.provider}
						onChange={(event) => handleChange("provider", event.target.value)}
						className="input-field"
						placeholder="Hubsoft, Playground..."
						required
					/>
				</label>

				<label className="block md:col-span-2">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Ambiente
					</span>
					<select
						value={form.environment}
						onChange={(event) =>
							handleChange("environment", event.target.value)
						}
						className="input-field"
					>
						{INTEGRATION_ENVIRONMENTS.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</label>

				<label className="block md:col-span-4">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						URL base
					</span>
					<input
						type="url"
						value={form.baseUrl}
						onChange={(event) => handleChange("baseUrl", event.target.value)}
						className="input-field"
						placeholder="https://api.exemplo.com.br"
						required
					/>
				</label>

				<label className="block md:col-span-2">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Healthcheck
					</span>
					<input
						value={form.healthcheckPath}
						onChange={(event) =>
							handleChange("healthcheckPath", event.target.value)
						}
						className="input-field"
						placeholder="/status ou /v1/ping"
					/>
				</label>

				<label className="block md:col-span-2">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Autenticação
					</span>
					<select
						value={form.authType}
						onChange={(event) => handleChange("authType", event.target.value)}
						className="input-field"
					>
						{AUTH_TYPES.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</label>

				<label className="block md:col-span-2">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Local da credencial
					</span>
					<select
						value={form.authLocation}
						onChange={(event) =>
							handleChange("authLocation", event.target.value)
						}
						className="input-field"
					>
						{AUTH_LOCATIONS.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</label>

				<label className="block md:col-span-2">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Frequência
					</span>
					<select
						value={form.syncFrequency}
						onChange={(event) =>
							handleChange("syncFrequency", event.target.value)
						}
						className="input-field"
					>
						{SYNC_FREQUENCIES.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</label>

				<label className="block md:col-span-3">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Referencia do segredo
					</span>
					<input
						value={form.credentialRef}
						onChange={(event) =>
							handleChange("credentialRef", event.target.value)
						}
						className="input-field"
						placeholder="hubsoft_prod_token"
					/>
				</label>

				<label className="block md:col-span-3">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Token / segredo
					</span>
					<input
						type="password"
						value={form.secretValue || ""}
						onChange={(event) =>
							handleChange("secretValue", event.target.value)
						}
						className="input-field"
						placeholder={
							initialValue?.secretConfigured
								? "Token já cadastrado. Preencha apenas para trocar."
								: "Cole o Bearer token aqui"
						}
						autoComplete="off"
					/>
					<span className="mt-1 block text-[11px] font-semibold text-gray-400">
						O valor não aparece na listagem. Ao editar, deixe em branco para
						manter o token atual.
					</span>
				</label>

				<label className="block md:col-span-3">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						E-mail de login automático
					</span>
					<input
						type="email"
						value={form.loginEmail || ""}
						onChange={(event) => handleChange("loginEmail", event.target.value)}
						className="input-field"
						placeholder="usuario@empresa.com.br"
						autoComplete="off"
					/>
				</label>

				<label className="block md:col-span-3">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Senha de login automático
					</span>
					<input
						type="password"
						value={form.loginPassword || ""}
						onChange={(event) =>
							handleChange("loginPassword", event.target.value)
						}
						className="input-field"
						placeholder={
							initialValue?.loginConfigured
								? "Senha já cadastrada. Preencha apenas para trocar."
								: "Senha da API externa"
						}
						autoComplete="new-password"
					/>
					<span className="mt-1 block text-[11px] font-semibold text-gray-400">
						Usada somente pelo servidor para renovar o Bearer automaticamente.
					</span>
				</label>

				<label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 md:col-span-6">
					<input
						type="checkbox"
						checked={form.active}
						onChange={(event) => handleChange("active", event.target.checked)}
					/>
					<span className="text-sm font-semibold text-gray-700">
						Integração ativa
					</span>
				</label>

				<label className="block md:col-span-3">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Módulos que usam
					</span>
					<input
						value={modulesText}
						onChange={(event) => setModulesText(event.target.value)}
						className="input-field"
						list="integration-modules"
						placeholder="Retiradas, Equipamentos"
					/>
					<datalist id="integration-modules">
						{MODULE_OPTIONS.map((item) => (
							<option key={item} value={item} />
						))}
					</datalist>
				</label>

				<label className="block md:col-span-3">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Headers não sensíveis
					</span>
					<textarea
						value={headersText}
						onChange={(event) => setHeadersText(event.target.value)}
						className="input-field min-h-[88px]"
						placeholder={"Accept: application/json\nX-Client: retiradas"}
					/>
				</label>

				<label className="block md:col-span-3">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Mapeamento de campos
					</span>
					<textarea
						value={mappingsText}
						onChange={(event) => setMappingsText(event.target.value)}
						className="input-field min-h-[88px]"
						placeholder={
							"tecnicoNome = data.tecnico.nome\nnumeroOs = data.ordem.id"
						}
					/>
				</label>

				<label className="block md:col-span-6">
					<span className="mb-1.5 block text-xs font-semibold text-gray-600">
						Observações
					</span>
					<textarea
						value={form.notes}
						onChange={(event) => handleChange("notes", event.target.value)}
						className="input-field min-h-[76px]"
						placeholder="Regras, endpoints importantes ou dependências da integração."
					/>
				</label>

				<button
					type="submit"
					disabled={saving}
					className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 md:col-span-6"
				>
					<CheckCircle2 size={16} />{" "}
					{saving ? "Salvando..." : "Salvar integração"}
				</button>
			</form>
		</section>
	);
}

function getLabel(options, value) {
	return options.find((item) => item.value === value)?.label || value || "-";
}

const DEFAULT_GOOGLE_OAUTH = {
	enabled: false,
	clientId: "",
	allowedDomains: "",
	autoProvision: false,
	defaultRole: "visitante",
};

const DEFAULT_OKTA_OAUTH = {
	enabled: false,
	issuer: "",
	clientId: "",
	redirectUri: "https://retiradas.tech/login",
	allowedDomains: "",
	autoProvision: false,
	defaultRole: "visitante",
};

function OAuthSettingsPanel({
	googleOAuth,
	setGoogleOAuth,
	googleSaving,
	googleMessage,
	onSaveGoogle,
	oktaOAuth,
	setOktaOAuth,
	oktaSaving,
	oktaMessage,
	onSaveOkta,
}) {
	const googleNeedsDomain =
		googleOAuth.autoProvision &&
		!String(googleOAuth.allowedDomains || "").trim();
	const oktaNeedsDomain =
		oktaOAuth.autoProvision && !String(oktaOAuth.allowedDomains || "").trim();

	return (
		<>
			<section className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex items-start gap-4">
						<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
							<KeyRound size={21} />
						</div>
						<div>
							<h2 className="text-base font-black text-gray-900">
								Login com Google
							</h2>
							<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-gray-500">
								Ative o botão de login Google. O sistema só libera acesso para
								e-mails já cadastrados e ativos.
							</p>
						</div>
					</div>
					<label className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-700">
						<input
							type="checkbox"
							checked={Boolean(googleOAuth.enabled)}
							onChange={(event) =>
								setGoogleOAuth((current) => ({
									...current,
									enabled: event.target.checked,
								}))
							}
							className="h-5 w-5 accent-emerald-600"
						/>
						Ativo
					</label>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-2">
					<label className="block">
						<span className="text-xs font-black uppercase tracking-wide text-gray-500">
							Google Client ID
						</span>
						<input
							value={googleOAuth.clientId || ""}
							onChange={(event) =>
								setGoogleOAuth((current) => ({
									...current,
									clientId: event.target.value,
								}))
							}
							placeholder="Cole o Client ID do OAuth Web"
							className="input-field mt-2"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase tracking-wide text-gray-500">
							Domínios permitidos
						</span>
						<input
							value={googleOAuth.allowedDomains || ""}
							onChange={(event) =>
								setGoogleOAuth((current) => ({
									...current,
									allowedDomains: event.target.value,
								}))
							}
							placeholder="Opcional. Ex: sempre.net.br, brasiltecpar.com.br"
							className="input-field mt-2"
						/>
					</label>
					<div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
						<label className="flex items-start gap-3 text-sm font-black text-blue-950">
							<input
								type="checkbox"
								checked={Boolean(googleOAuth.autoProvision)}
								onChange={(event) =>
									setGoogleOAuth((current) => ({
										...current,
										autoProvision: event.target.checked,
									}))
								}
								className="mt-0.5 h-5 w-5 accent-blue-600"
							/>
							<span>
								Criar conta visitante automaticamente
								<span className="mt-1 block text-xs font-semibold leading-relaxed text-blue-700">
									Se o e-mail Google for de um domínio permitido e ainda não
									existir no sistema, ele será criado como Visitante.
								</span>
							</span>
						</label>
					</div>
					<div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
						<p className="text-xs font-black uppercase tracking-wide text-gray-500">
							Cargo padrão automático
						</p>
						<p className="mt-1 text-sm font-black text-gray-900">Visitante</p>
						<p className="mt-1 text-xs font-semibold leading-relaxed text-gray-500">
							Depois do primeiro login, o admin pode alterar o cargo em
							Configurações &gt; Usuários.
						</p>
					</div>
				</div>

				<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold text-gray-500">
							No Google Cloud, use JavaScript origin{" "}
							<strong>https://retiradas.tech</strong>.
						</p>
						{googleNeedsDomain ? (
							<p className="mt-1 text-xs font-bold text-orange-700">
								Para criação automática, informe pelo menos um domínio
								permitido.
							</p>
						) : null}
						{googleMessage ? (
							<p className="mt-1 text-xs font-bold text-blue-700">
								{googleMessage}
							</p>
						) : null}
					</div>
					<button
						type="button"
						disabled={googleSaving}
						onClick={onSaveGoogle}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
					>
						{googleSaving ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<KeyRound size={17} />
						)}
						Salvar Google OAuth
					</button>
				</div>
			</section>

			<section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex items-start gap-4">
						<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
							<ShieldCheck size={21} />
						</div>
						<div>
							<h2 className="text-base font-black text-gray-900">
								Login com Okta Verify
							</h2>
							<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-gray-500">
								Ative o login corporativo com MFA pela Okta. O Okta Verify fica
								responsável pela segunda etapa.
							</p>
						</div>
					</div>
					<label className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-700">
						<input
							type="checkbox"
							checked={Boolean(oktaOAuth.enabled)}
							onChange={(event) =>
								setOktaOAuth((current) => ({
									...current,
									enabled: event.target.checked,
								}))
							}
							className="h-5 w-5 accent-blue-600"
						/>
						Ativo
					</label>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-2">
					<label className="block">
						<span className="text-xs font-black uppercase tracking-wide text-gray-500">
							Issuer Okta
						</span>
						<input
							value={oktaOAuth.issuer || ""}
							onChange={(event) =>
								setOktaOAuth((current) => ({
									...current,
									issuer: event.target.value,
								}))
							}
							placeholder="Ex: https://suaempresa.okta.com/oauth2/default"
							className="input-field mt-2"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase tracking-wide text-gray-500">
							Okta Client ID
						</span>
						<input
							value={oktaOAuth.clientId || ""}
							onChange={(event) =>
								setOktaOAuth((current) => ({
									...current,
									clientId: event.target.value,
								}))
							}
							placeholder="Client ID da aplicação OIDC SPA"
							className="input-field mt-2"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase tracking-wide text-gray-500">
							Redirect URI
						</span>
						<input
							value={oktaOAuth.redirectUri || ""}
							onChange={(event) =>
								setOktaOAuth((current) => ({
									...current,
									redirectUri: event.target.value,
								}))
							}
							placeholder="https://retiradas.tech/login"
							className="input-field mt-2"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase tracking-wide text-gray-500">
							Domínios permitidos
						</span>
						<input
							value={oktaOAuth.allowedDomains || ""}
							onChange={(event) =>
								setOktaOAuth((current) => ({
									...current,
									allowedDomains: event.target.value,
								}))
							}
							placeholder="Ex: sempre.net.br, brasiltecpar.com.br"
							className="input-field mt-2"
						/>
					</label>
					<div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
						<label className="flex items-start gap-3 text-sm font-black text-blue-950">
							<input
								type="checkbox"
								checked={Boolean(oktaOAuth.autoProvision)}
								onChange={(event) =>
									setOktaOAuth((current) => ({
										...current,
										autoProvision: event.target.checked,
									}))
								}
								className="mt-0.5 h-5 w-5 accent-blue-600"
							/>
							<span>
								Criar conta visitante automaticamente
								<span className="mt-1 block text-xs font-semibold leading-relaxed text-blue-700">
									Se o e-mail Okta for de um domínio permitido e ainda não
									existir no sistema, ele será criado como Visitante.
								</span>
							</span>
						</label>
					</div>
					<div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
						<p className="text-xs font-black uppercase tracking-wide text-gray-500">
							Configuração na Okta
						</p>
						<p className="mt-1 text-sm font-black text-gray-900">
							OIDC SPA + ID Token
						</p>
						<p className="mt-1 text-xs font-semibold leading-relaxed text-gray-500">
							Cadastre o Redirect URI acima em Login redirect URIs e exija Okta
							Verify na política do app.
						</p>
					</div>
				</div>

				<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold text-gray-500">
							Login Redirect URI sugerido:{" "}
							<strong>
								{oktaOAuth.redirectUri || "https://retiradas.tech/login"}
							</strong>
							.
						</p>
						{oktaNeedsDomain ? (
							<p className="mt-1 text-xs font-bold text-orange-700">
								Para criação automática, informe pelo menos um domínio
								permitido.
							</p>
						) : null}
						{oktaMessage ? (
							<p className="mt-1 text-xs font-bold text-blue-700">
								{oktaMessage}
							</p>
						) : null}
					</div>
					<button
						type="button"
						disabled={oktaSaving}
						onClick={onSaveOkta}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
					>
						{oktaSaving ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<ShieldCheck size={17} />
						)}
						Salvar Okta
					</button>
				</div>
			</section>
		</>
	);
}

// Extraido do componente (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// pra reduzir a complexidade cognitiva da funcao de render — mesmo
// estado e mesmas chamadas, sem mudanca de comportamento.
function useIntegracoesController() {
	const { currentUser } = useAuthContext();
	const { integracoes, loading, error, carregar, criar, atualizar, excluir } =
		useIntegracoes();
	const [editing, setEditing] = useState(null);
	const [showForm, setShowForm] = useState(false);
	const [saving, setSaving] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(null);
	const [googleOAuth, setGoogleOAuth] = useState(DEFAULT_GOOGLE_OAUTH);
	const [oktaOAuth, setOktaOAuth] = useState(DEFAULT_OKTA_OAUTH);
	const [googleSaving, setGoogleSaving] = useState(false);
	const [googleMessage, setGoogleMessage] = useState("");
	const [oktaSaving, setOktaSaving] = useState(false);
	const [oktaMessage, setOktaMessage] = useState("");

	const podeEditar = hasPermission(currentUser?.role, "manage_integracoes");
	const isAdmin = String(currentUser?.role || "").toLowerCase() === ROLES.ADMIN;
	const activeCount = useMemo(
		() => integracoes.filter((item) => item.active).length,
		[integracoes],
	);

	useEffect(() => {
		if (!isAdmin) return;
		let active = true;
		Promise.allSettled([
			obterConfigGoogleOAuthAdmin(),
			obterConfigOktaOAuthAdmin(),
		])
			.then(([googleResult, oktaResult]) => {
				if (!active) return;
				if (googleResult.status === "fulfilled") {
					setGoogleOAuth(googleResult.value || DEFAULT_GOOGLE_OAUTH);
				}
				if (oktaResult.status === "fulfilled") {
					setOktaOAuth(oktaResult.value || DEFAULT_OKTA_OAUTH);
				}
			})
			.catch(() => {
				if (active)
					setGoogleMessage("Não foi possível carregar as configurações OAuth.");
			});
		return () => {
			active = false;
		};
	}, [isAdmin]);

	const handleNew = () => {
		setEditing(null);
		setShowForm(true);
	};

	const handleEdit = (integracao) => {
		setEditing(integracao);
		setShowForm(true);
	};

	const handleSave = async (payload) => {
		setSaving(true);
		try {
			if (editing?.id) {
				await atualizar(editing.id, payload);
			} else {
				await criar(payload);
			}
			setShowForm(false);
			setEditing(null);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!confirmDelete?.id) return;
		await excluir(confirmDelete.id);
		setConfirmDelete(null);
	};

	const saveGoogleOAuth = async () => {
		setGoogleSaving(true);
		setGoogleMessage("");
		try {
			const saved = await salvarConfigGoogleOAuthAdmin(googleOAuth);
			setGoogleOAuth(saved);
			setGoogleMessage("Login com Google salvo.");
			window.setTimeout(() => setGoogleMessage(""), 2600);
		} catch (saveError) {
			setGoogleMessage(
				saveError?.message || "Não foi possível salvar o login com Google.",
			);
		} finally {
			setGoogleSaving(false);
		}
	};

	const saveOktaOAuth = async () => {
		setOktaSaving(true);
		setOktaMessage("");
		try {
			const saved = await salvarConfigOktaOAuthAdmin(oktaOAuth);
			setOktaOAuth(saved);
			setOktaMessage("Login com Okta salvo.");
			window.setTimeout(() => setOktaMessage(""), 2600);
		} catch (saveError) {
			setOktaMessage(
				saveError?.message || "Não foi possível salvar o login com Okta.",
			);
		} finally {
			setOktaSaving(false);
		}
	};

	return {
		integracoes,
		loading,
		error,
		carregar,
		editing,
		setEditing,
		showForm,
		setShowForm,
		saving,
		confirmDelete,
		setConfirmDelete,
		googleOAuth,
		setGoogleOAuth,
		oktaOAuth,
		setOktaOAuth,
		googleSaving,
		googleMessage,
		oktaSaving,
		oktaMessage,
		podeEditar,
		isAdmin,
		activeCount,
		handleNew,
		handleEdit,
		handleSave,
		handleDelete,
		saveGoogleOAuth,
		saveOktaOAuth,
	};
}

export default function IntegracoesPage() {
	const {
		integracoes,
		loading,
		error,
		carregar,
		editing,
		setEditing,
		showForm,
		setShowForm,
		saving,
		confirmDelete,
		setConfirmDelete,
		googleOAuth,
		setGoogleOAuth,
		oktaOAuth,
		setOktaOAuth,
		googleSaving,
		googleMessage,
		oktaSaving,
		oktaMessage,
		podeEditar,
		isAdmin,
		activeCount,
		handleNew,
		handleEdit,
		handleSave,
		handleDelete,
		saveGoogleOAuth,
		saveOktaOAuth,
	} = useIntegracoesController();

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
							<h1 className="text-xl font-black text-gray-900">
								Central de Integrações
							</h1>
							<p className="text-sm text-gray-500">
								Configure APIs externas para os módulos usarem sem URL fixa no
								código.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
							{activeCount}/{integracoes.length} ativas
						</span>
						<button
							type="button"
							onClick={carregar}
							className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
						>
							<RefreshCw size={14} /> Atualizar
						</button>
						{podeEditar ? (
							<button
								type="button"
								onClick={handleNew}
								className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
							>
								<Plus size={16} /> Nova integração
							</button>
						) : null}
					</div>
				</div>
			</section>

			{error ? (
				<div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
					{error}
				</div>
			) : null}

			{isAdmin ? (
				<OAuthSettingsPanel
					googleOAuth={googleOAuth}
					setGoogleOAuth={setGoogleOAuth}
					googleSaving={googleSaving}
					googleMessage={googleMessage}
					onSaveGoogle={saveGoogleOAuth}
					oktaOAuth={oktaOAuth}
					setOktaOAuth={setOktaOAuth}
					oktaSaving={oktaSaving}
					oktaMessage={oktaMessage}
					onSaveOkta={saveOktaOAuth}
				/>
			) : null}

			<section className="grid gap-3 md:grid-cols-3">
				<div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
						Integrações
					</p>
					<p className="mt-1 text-2xl font-black text-gray-900">
						{integracoes.length}
					</p>
				</div>
				<div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-green-600">
						Ativas
					</p>
					<p className="mt-1 text-2xl font-black text-green-800">
						{activeCount}
					</p>
				</div>
				<div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
						Com credencial
					</p>
					<p className="mt-1 text-2xl font-black text-blue-900">
						{integracoes.filter((item) => item.credentialRef).length}
					</p>
				</div>
			</section>

			{showForm && podeEditar ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
					<div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl shadow-2xl">
						<IntegrationForm
							initialValue={editing}
							onSave={handleSave}
							onCancel={() => {
								setShowForm(false);
								setEditing(null);
							}}
							saving={saving}
						/>
					</div>
				</div>
			) : null}

			<section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
				{integracoes.length === 0 ? (
					<div className="p-8 text-center">
						<Plug size={30} className="mx-auto text-gray-300" />
						<p className="mt-3 text-sm font-semibold text-gray-700">
							Nenhuma integração cadastrada ainda.
						</p>
						<p className="mt-1 text-xs text-gray-500">
							Comece por Hubsoft e Playground para preparar o match de O.S. com
							equipamentos.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-100 text-sm">
							<thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
								<tr>
									<th className="px-5 py-3">Integração</th>
									<th className="px-5 py-3">URL</th>
									<th className="px-5 py-3">Auth</th>
									<th className="px-5 py-3">Módulos</th>
									<th className="px-5 py-3">Status</th>
									{podeEditar ? <th className="px-5 py-3">Acoes</th> : null}
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 bg-white">
								{integracoes.map((item) => (
									<tr key={item.id} className="hover:bg-gray-50">
										<td className="px-5 py-4">
											<div className="flex items-start gap-3">
												<span
													className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${
														item.active
															? "bg-blue-50 text-blue-600"
															: "bg-gray-100 text-gray-400"
													}`}
												>
													<Plug size={16} />
												</span>
												<div>
													<p className="font-bold text-gray-900">{item.name}</p>
													<p className="text-xs text-gray-500">
														{item.provider} ·{" "}
														{getLabel(
															INTEGRATION_ENVIRONMENTS,
															item.environment,
														)}{" "}
														· {getLabel(SYNC_FREQUENCIES, item.syncFrequency)}
													</p>
													{item.systemManaged ? (
														<span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
															Sistema
														</span>
													) : null}
												</div>
											</div>
										</td>
										<td className="max-w-[300px] px-5 py-4">
											<div className="flex items-center gap-2 text-gray-700">
												<Link size={14} className="shrink-0 text-gray-400" />
												<span className="truncate font-mono text-xs">
													{item.baseUrl}
												</span>
											</div>
											{item.healthcheckPath ? (
												<p className="mt-1 text-xs text-gray-400">
													Healthcheck: {item.healthcheckPath}
												</p>
											) : null}
										</td>
										<td className="px-5 py-4">
											<div className="flex items-center gap-2">
												<KeyRound size={14} className="text-gray-400" />
												<span className="text-xs font-semibold text-gray-700">
													{getLabel(AUTH_TYPES, item.authType)}
												</span>
											</div>
											<p className="mt-1 text-xs text-gray-400">
												{item.secretConfigured
													? `${item.credentialRef || "Credencial"} configurada`
													: item.credentialRef || "Sem referência"}
											</p>
											{item.loginConfigured || item.tokenExpiresAt ? (
												<p className="mt-1 text-xs text-gray-400">
													{item.loginConfigured
														? "Login automático configurado"
														: ""}
													{item.loginConfigured && item.tokenExpiresAt
														? " · "
														: ""}
													{item.tokenExpiresAt
														? `Token expira em ${new Date(item.tokenExpiresAt).toLocaleString("pt-BR")}`
														: ""}
												</p>
											) : null}
										</td>
										<td className="px-5 py-4">
											<div className="flex max-w-[240px] flex-wrap gap-1">
												{(item.modules || []).length ? (
													item.modules.map((module) => (
														<span
															key={module}
															className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-600"
														>
															{module}
														</span>
													))
												) : (
													<span className="text-xs text-gray-400">
														Nenhum módulo
													</span>
												)}
											</div>
										</td>
										<td className="px-5 py-4">
											<span
												className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
													STATUS_CLASS[item.lastStatus] ||
													STATUS_CLASS.not_tested
												}`}
											>
												{item.lastStatus === "ok" ? (
													<CheckCircle2 size={13} />
												) : (
													<AlertCircle size={13} />
												)}
												{item.lastStatus === "ok"
													? "Ok"
													: item.lastStatus === "error"
														? "Erro"
														: "Não testada"}
											</span>
										</td>
										{podeEditar ? (
											<td className="px-5 py-4">
												<div className="flex gap-1">
													<button
														type="button"
														onClick={() => handleEdit(item)}
														className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
														aria-label="Editar integração"
														title="Editar integração"
													>
														<Pencil size={15} />
													</button>
													<button
														type="button"
														onClick={() => setConfirmDelete(item)}
														disabled={item.systemManaged}
														className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
														aria-label="Excluir integração"
														title={
															item.systemManaged
																? "Integração gerenciada pelo sistema"
																: "Excluir integração"
														}
													>
														<Trash2 size={15} />
													</button>
												</div>
											</td>
										) : null}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{confirmDelete ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
					<div className="w-full max-w-sm rounded-xl border border-gray-100 bg-white p-6 shadow-2xl">
						<div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
							<Trash2 size={18} className="text-red-500" />
						</div>
						<h3 className="text-center text-base font-bold text-gray-900">
							Excluir integração?
						</h3>
						<p className="mt-1 text-center text-sm text-gray-500">
							{confirmDelete.name} será removida da central.
						</p>
						<div className="mt-6 flex gap-3">
							<button
								type="button"
								onClick={() => setConfirmDelete(null)}
								className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={handleDelete}
								className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
							>
								Excluir
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
