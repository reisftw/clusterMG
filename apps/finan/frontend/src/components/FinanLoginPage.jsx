import {
	AlertTriangle,
	ArrowLeft,
	Eye,
	EyeOff,
	Headphones,
	Lock,
	LogIn,
	Mail,
	ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { requestFinanPasswordReset, resetFinanPassword } from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";

const trustItems = [
	{ label: "Acesso seguro", icon: ShieldCheck },
	{ label: "Dados protegidos", icon: Lock },
	{ label: "Suporte dedicado", icon: Headphones },
];

// Mesmo padrao visual/estrutural do LoginForm.jsx do Administrativo
// (apps/adm/frontend/src/modules/auth/components/LoginForm.jsx) e do
// LoginScreen.jsx do Operação, ja migrado: Tailwind puro, sem CSS
// customizado com clamp()/vw. O card antigo (.finan-login-* em
// styles.css) usava o mesmo padrao de grid de duas colunas com unidades
// viewport que vazou em celular real no Operação (nao reproduzia em
// nenhum emulador/devtools) — padronizando aqui evita o mesmo risco no
// Finan, alem de manter os 3 apps com a mesma linguagem visual de login.
// So a logica de autenticacao muda (login por e-mail, MFA por e-mail e
// recuperacao de senha — fluxo original do Finan, preservado integralmente).
export default function FinanLoginPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { login, verifyEmailMfa, error, loading } = useFinanAuth();
	const [form, setForm] = useState({ email: "", password: "" });
	const [resetForm, setResetForm] = useState({ password: "", confirm: "" });
	const [mfaChallenge, setMfaChallenge] = useState(null);
	const [mfaCode, setMfaCode] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [rememberMe, setRememberMe] = useState(false);
	const [message, setMessage] = useState("");
	const [localError, setLocalError] = useState("");
	const [mode, setMode] = useState(searchParams.get("reset") ? "reset" : "login");
	const resetToken = searchParams.get("reset") || "";

	const submit = async (event) => {
		event.preventDefault();
		setLocalError("");
		setMessage("");
		try {
			const result = await login(form);
			if (result?.mfaRequired) {
				setMfaChallenge(result);
				setMfaCode("");
				setMessage(`Enviamos um código para ${result.maskedEmail || "seu e-mail"}.`);
				return;
			}
			navigate(FINAN_ROUTES.DASHBOARD, { replace: true });
		} catch (err) {
			setLocalError(err?.message || "Não foi possível entrar no Finan.");
		}
	};

	const submitMfa = async (event) => {
		event.preventDefault();
		setLocalError("");
		try {
			await verifyEmailMfa({ challengeId: mfaChallenge.challengeId, code: mfaCode });
			navigate(FINAN_ROUTES.DASHBOARD, { replace: true });
		} catch (err) {
			setLocalError(err?.message || "Código MFA inválido.");
		}
	};

	const requestReset = async () => {
		setLocalError("");
		setMessage("");
		if (!form.email.trim()) {
			setLocalError("Informe o e-mail para recuperar a senha.");
			return;
		}
		try {
			const data = await requestFinanPasswordReset(form.email.trim());
			setMessage(data.message || "Confira seu e-mail para redefinir a senha.");
		} catch (err) {
			setLocalError(err?.message || "Não foi possível solicitar recuperação.");
		}
	};

	const submitReset = async (event) => {
		event.preventDefault();
		setLocalError("");
		setMessage("");
		if (resetForm.password !== resetForm.confirm) {
			setLocalError("As senhas não conferem.");
			return;
		}
		try {
			await resetFinanPassword(resetToken, resetForm.password);
			setMessage("Senha redefinida. Entre novamente com sua nova senha.");
			setMode("login");
		} catch (err) {
			setLocalError(err?.message || "Não foi possível redefinir a senha.");
		}
	};

	const visibleError = localError || error;
	const isResetMode = mode === "reset";

	return (
		<div className="min-h-screen overflow-hidden bg-[#061b38] text-slate-950">
			<div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
				<aside
					aria-hidden="true"
					className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_78%_22%,rgba(255,255,255,0.18),transparent_24%),linear-gradient(135deg,#061a3a_0%,#082653_42%,#063a85_72%,#065fe8_100%)] px-10 py-9 text-white lg:flex lg:flex-col xl:px-16"
				>
					<div className="absolute inset-y-0 -right-24 w-48 rotate-[7deg] bg-gradient-to-b from-[#082b55] via-[#07305f] to-[#061b38] shadow-[-26px_0_70px_rgba(4,22,44,0.18)]" />
					<div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-white/10" />
					<div className="absolute right-10 top-24 h-72 w-72 rounded-full border border-white/10 bg-white/10" />
					<div className="absolute bottom-20 left-24 h-80 w-80 rounded-full border border-white/15" />
					<div className="absolute bottom-0 right-16 h-64 w-64 rounded-full bg-orange-400/20 blur-3xl" />

					<div className="relative z-10">
						<img src="/sempre-logo-branca-crop.png" alt="Sempre Internet" className="h-16 w-auto object-contain drop-shadow-lg xl:h-20" />
					</div>

					<div className="relative z-20 mt-28 max-w-xl xl:mt-32">
						<h1 className="text-5xl font-black leading-[1.03] tracking-normal xl:text-6xl">
							Gestão
							<br />
							<span className="text-orange-200">Financeira sem complicação.</span>
						</h1>
						<p className="mt-6 max-w-lg text-xl leading-relaxed text-white/92">
							Mais controle, mais resultado e uma Sempre Internet ainda mais forte.
						</p>
					</div>

					<img
						src="/retorninho-financeiro.webp"
						alt=""
						className="pointer-events-none absolute bottom-14 right-10 z-10 w-[38vw] max-w-[520px] object-contain drop-shadow-[0_34px_58px_rgba(0,37,118,0.38)] xl:right-20"
						onError={(event) => {
							event.currentTarget.style.display = "none";
						}}
					/>
				</aside>

				<main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_82%_20%,rgba(19,94,168,0.42),transparent_28%),radial-gradient(circle_at_12%_84%,rgba(255,122,0,0.09),transparent_28%),linear-gradient(135deg,#082b55_0%,#061f3f_48%,#04162c_100%)] px-5 pb-16 pt-10 sm:px-8">
					<div className="absolute left-0 top-0 h-full w-28 bg-gradient-to-r from-[#061b38]/75 to-transparent" />
					<div className="absolute right-[-18%] top-[-20%] h-[520px] w-[520px] rounded-full border border-white/10 bg-white/5 blur-sm" />

					<div className="relative z-10 w-full max-w-[610px]">
						<section
							aria-label="Acesso ao Finan"
							className="rounded-[34px] border border-white/80 bg-white/90 px-6 py-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:px-12 sm:py-10"
						>
							<div className="mb-8 flex justify-center lg:hidden">
								<img src="/sempre-logo-branca-crop.png" alt="Sempre Internet" className="h-14 w-auto object-contain" />
							</div>

							<div className="text-center">
								<div className="mb-7 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-5 py-2 text-sm font-extrabold text-orange-600">
									<Lock size={16} />
									Acesso Finan
								</div>
								<h2 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
									{isResetMode ? "Redefinir senha" : mfaChallenge ? "Confirme seu acesso" : "Bem-vindo de volta!"}
								</h2>
								<p className="mt-3 text-base font-medium text-slate-500 sm:text-lg">
									{isResetMode
										? "Crie uma nova senha para acessar o Finan."
										: mfaChallenge
											? `Digite o código enviado para ${mfaChallenge.maskedEmail || "seu e-mail"}.`
											: "Entre com suas credenciais para acessar o sistema."}
								</p>
							</div>

							{isResetMode ? (
								<form onSubmit={submitReset} className="mt-9 space-y-5">
									<PasswordField
										id="finan-reset-password"
										label="Nova senha"
										value={resetForm.password}
										onChange={(value) => setResetForm((current) => ({ ...current, password: value }))}
										autoComplete="new-password"
									/>
									<PasswordField
										id="finan-reset-confirm"
										label="Confirmar senha"
										value={resetForm.confirm}
										onChange={(value) => setResetForm((current) => ({ ...current, confirm: value }))}
										autoComplete="new-password"
									/>

									<Feedback error={visibleError} message={message} />

									<button
										type="submit"
										disabled={loading}
										className="mt-2 inline-flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(90deg,#ff9800_0%,#ff4b00_100%)] text-lg font-black text-white shadow-[0_18px_34px_rgba(255,95,0,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(255,95,0,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
									>
										<LogIn size={24} />
										{loading ? "Salvando..." : "Salvar nova senha"}
									</button>
								</form>
							) : mfaChallenge ? (
								<form onSubmit={submitMfa} className="mt-9 space-y-5">
									<div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
										<div className="flex items-start gap-3">
											<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
												<ShieldCheck size={22} />
											</span>
											<div>
												<h3 className="text-base font-black text-slate-950">Confirme o código enviado</h3>
												<p className="mt-1 text-sm font-semibold leading-relaxed text-blue-800">
													O código expira em {mfaChallenge.ttlMinutes || 10} minutos.
												</p>
											</div>
										</div>
										<input
											value={mfaCode}
											onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
											inputMode="numeric"
											autoComplete="one-time-code"
											maxLength={6}
											required
											placeholder="000000"
											aria-label="Código MFA"
											className="mt-5 h-16 w-full rounded-2xl border border-blue-200 bg-white px-5 text-center text-3xl font-black tracking-[0.35em] text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</div>

									<Feedback error={visibleError} message={message} />

									<button
										type="submit"
										disabled={loading || mfaCode.length !== 6}
										className="mt-2 inline-flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(90deg,#ff9800_0%,#ff4b00_100%)] text-lg font-black text-white shadow-[0_18px_34px_rgba(255,95,0,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(255,95,0,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
									>
										<LogIn size={24} />
										{loading ? "Validando..." : "Validar código"}
									</button>
									<button
										type="button"
										onClick={() => {
											setMfaChallenge(null);
											setMfaCode("");
											setMessage("");
										}}
										className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition hover:bg-slate-50"
									>
										<ArrowLeft size={16} />
										Voltar para login
									</button>
								</form>
							) : (
								<form onSubmit={submit} className="mt-9 space-y-5">
									<div>
										<label htmlFor="finan-login-email" className="mb-2 block text-sm font-extrabold text-slate-900">
											E-mail
										</label>
										<div className="relative">
											<Mail size={21} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
											<input
												id="finan-login-email"
												type="email"
												value={form.email}
												onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
												placeholder="seu@email.com"
												autoComplete="email"
												required
												className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-16 pr-5 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
											/>
										</div>
									</div>

									<div>
										<label htmlFor="finan-login-password" className="mb-2 block text-sm font-extrabold text-slate-900">
											Senha
										</label>
										<div className="relative">
											<Lock size={21} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
											<input
												id="finan-login-password"
												type={showPassword ? "text" : "password"}
												value={form.password}
												onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
												placeholder="Sua senha"
												autoComplete="current-password"
												required
												className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-16 pr-14 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
											/>
											<button
												type="button"
												onClick={() => setShowPassword((current) => !current)}
												aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
												className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-blue-600"
											>
												{showPassword ? <EyeOff size={21} /> : <Eye size={21} />}
											</button>
										</div>
									</div>

									<div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold">
										<label htmlFor="finan-login-remember" className="inline-flex items-center gap-2 text-slate-500">
											<input
												id="finan-login-remember"
												type="checkbox"
												checked={rememberMe}
												onChange={(event) => setRememberMe(event.target.checked)}
												className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
											/>
											<span>Lembrar de mim</span>
										</label>
										<button type="button" onClick={requestReset} className="font-extrabold text-blue-600 transition hover:text-blue-700">
											Esqueceu sua senha?
										</button>
									</div>

									<Feedback error={visibleError} message={message} />

									<button
										type="submit"
										disabled={loading}
										className="mt-2 inline-flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(90deg,#ff9800_0%,#ff4b00_100%)] text-lg font-black text-white shadow-[0_18px_34px_rgba(255,95,0,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(255,95,0,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
									>
										<LogIn size={24} />
										{loading ? "Entrando..." : "Entrar no sistema"}
									</button>
								</form>
							)}

							<div className="mt-8 grid gap-3 border-t border-slate-200 pt-6 text-sm font-bold text-slate-500 sm:grid-cols-3">
								{trustItems.map(({ label, icon: Icon }) => (
									<div key={label} className="flex items-center justify-center gap-2">
										<Icon size={18} className="text-blue-500" />
										{label}
									</div>
								))}
							</div>
						</section>
					</div>
				</main>
			</div>
		</div>
	);
}

function PasswordField({ id, label, value, onChange, autoComplete }) {
	return (
		<div>
			<label htmlFor={id} className="mb-2 block text-sm font-extrabold text-slate-900">
				{label}
			</label>
			<input
				id={id}
				type="password"
				minLength={8}
				autoComplete={autoComplete}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				required
				className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-5 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
			/>
		</div>
	);
}

function Feedback({ error, message }) {
	if (error) {
		return (
			<div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600" role="alert">
				<AlertTriangle size={17} className="mt-0.5 shrink-0" />
				<span>{error}</span>
			</div>
		);
	}
	if (message) {
		return (
			<div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">
				<ShieldCheck size={17} className="mt-0.5 shrink-0" />
				<span>{message}</span>
			</div>
		);
	}
	return null;
}
