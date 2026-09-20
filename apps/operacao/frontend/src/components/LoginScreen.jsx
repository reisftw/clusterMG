import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, LogIn, ShieldCheck, User } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchRotGoogleAuthConfig, forgotRotPassword, resetRotPassword } from "../api/rotApi";
import { useRotAuth } from "../state/useRotAuth";

const trustItems = [
	{ label: "Acesso seguro", icon: ShieldCheck },
	{ label: "Dados protegidos", icon: Lock },
];

// Mesmo padrao visual/estrutural do LoginForm.jsx do Administrativo
// (apps/adm/frontend/src/modules/auth/components/LoginForm.jsx): Tailwind
// puro, sem CSS customizado com clamp()/vw. O card antigo (.rot-login-*
// em styles.css) usava um grid de duas colunas com unidades viewport que
// vazava em celulares reais (nao reproduzia em nenhum emulador/devtools) —
// o ADM nunca teve esse problema porque so usa utilitarios Tailwind
// responsivos testados. Login aceita usuario OU e-mail no mesmo campo
// (a maioria dos usuarios da Operação ainda nao tem e-mail cadastrado,
// entao exigir e-mail travaria a maioria pra fora).
export default function LoginScreen() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user, login, loginGoogle, verifyMfa, error: authError } = useRotAuth();
	const googleButtonRef = useRef(null);

	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [mfaChallenge, setMfaChallenge] = useState(null);
	const [mfaCode, setMfaCode] = useState("");
	const [message, setMessage] = useState("");
	const [mode, setMode] = useState(searchParams.get("reset") ? "reset" : "login");
	const [resetForm, setResetForm] = useState({ password: "", confirm: "" });
	const resetToken = searchParams.get("reset") || "";
	const [googleConfig, setGoogleConfig] = useState({ enabled: false, clientId: "" });

	// Config do login com Google vem de runtime (tela Integrações), nao de
	// env var de build — assim ativar/desativar ou trocar o clientId nao
	// exige rebuild do frontend.
	useEffect(() => {
		let cancelled = false;
		fetchRotGoogleAuthConfig()
			.then((config) => {
				if (!cancelled) setGoogleConfig(config);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	// Assim que o contexto ganha usuario (login direto, pos-MFA ou Google),
	// sai da tela de login — sem isso o /login ficava "preso" mesmo com
	// sessao valida, porque essa rota nao redireciona sozinha.
	useEffect(() => {
		if (user) navigate("/", { replace: true });
	}, [user, navigate]);

	const handleLogin = async (event) => {
		event.preventDefault();
		if (loading) return;
		setLoading(true);
		setError("");
		setMessage("");
		try {
			const result = await login(username.trim().toLowerCase(), password);
			if (result?.mfaRequired) {
				setMfaChallenge(result);
				setMfaCode("");
				setMessage(`Enviamos um código para ${result.maskedEmail || "seu e-mail"}.`);
			}
		} catch (err) {
			setError(err?.message || "Não foi possível entrar.");
		} finally {
			setLoading(false);
		}
	};

	const handleVerifyMfa = async (event) => {
		event.preventDefault();
		if (loading) return;
		setLoading(true);
		setError("");
		try {
			await verifyMfa(mfaChallenge.challengeId, mfaCode);
		} catch (err) {
			setError(err?.message || "Código inválido.");
		} finally {
			setLoading(false);
		}
	};

	const handleForgotPassword = async () => {
		if (loading) return;
		setError("");
		setMessage("");
		if (!username.trim()) {
			setError("Informe seu usuário ou e-mail para recuperar a senha.");
			return;
		}
		setLoading(true);
		try {
			const data = await forgotRotPassword(username.trim().toLowerCase());
			setMessage(data.message || "Se a conta existir, enviamos um link de redefinição para o e-mail cadastrado.");
		} catch (err) {
			setError(err?.message || "Não foi possível solicitar a recuperação de senha.");
		} finally {
			setLoading(false);
		}
	};

	const handleSubmitReset = async (event) => {
		event.preventDefault();
		if (loading) return;
		setError("");
		setMessage("");
		if (resetForm.password !== resetForm.confirm) {
			setError("As senhas não conferem.");
			return;
		}
		setLoading(true);
		try {
			await resetRotPassword(resetToken, resetForm.password);
			setMessage("Senha redefinida. Entre novamente com sua nova senha.");
			setMode("login");
		} catch (err) {
			setError(err?.message || "Não foi possível redefinir a senha.");
		} finally {
			setLoading(false);
		}
	};

	const handleGoogleCredential = useCallback(
		async (response) => {
			if (!response?.credential) return;
			setLoading(true);
			setError("");
			setMessage("");
			try {
				const result = await loginGoogle(response.credential);
				if (result?.mfaRequired) {
					setMfaChallenge(result);
					setMfaCode("");
					setMessage(`Enviamos um código para ${result.maskedEmail || "seu e-mail"}.`);
				}
			} catch (err) {
				setError(err?.message || "Não foi possível entrar com Google.");
			} finally {
				setLoading(false);
			}
		},
		[loginGoogle],
	);

	// Botao "Entrar com Google" (Google Identity Services) — mesmo fluxo
	// de ID token verificado no backend que o ADM ja usa.
	useEffect(() => {
		if (!googleConfig.enabled || !googleConfig.clientId || !googleButtonRef.current || mode !== "login") {
			return undefined;
		}
		let cancelled = false;

		const renderGoogleButton = () => {
			if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
			googleButtonRef.current.innerHTML = "";
			window.google.accounts.id.initialize({
				client_id: googleConfig.clientId,
				callback: handleGoogleCredential,
			});
			window.google.accounts.id.renderButton(googleButtonRef.current, {
				theme: "outline",
				size: "large",
				text: "signin_with",
				shape: "pill",
				width: Math.min(420, googleButtonRef.current.offsetWidth || 420),
			});
		};

		if (window.google?.accounts?.id) {
			renderGoogleButton();
			return () => {
				cancelled = true;
			};
		}

		const scriptId = "google-identity-services";
		let script = document.getElementById(scriptId);
		if (!script) {
			script = document.createElement("script");
			script.id = scriptId;
			script.src = "https://accounts.google.com/gsi/client";
			script.async = true;
			script.defer = true;
			document.head.appendChild(script);
		}
		script.addEventListener("load", renderGoogleButton);

		return () => {
			cancelled = true;
			script.removeEventListener("load", renderGoogleButton);
		};
	}, [googleConfig, handleGoogleCredential, mode]);

	const visibleError = error || authError;
	const isResetMode = mode === "reset";
	const showGoogleButton = !isResetMode && !mfaChallenge && googleConfig.enabled && googleConfig.clientId;

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
						<img src="/operacao-logo.webp" alt="Operação Cluster MG" className="h-24 w-auto object-contain drop-shadow-lg xl:h-28" />
					</div>

					<div className="relative z-20 mt-28 max-w-xl xl:mt-32">
						<h1 className="text-5xl font-black leading-[1.03] tracking-normal xl:text-6xl">
							Gestão
							<br />
							<span className="text-orange-200">Operacional de campo.</span>
						</h1>
						<p className="mt-6 max-w-lg text-xl leading-relaxed text-white/92">
							Frota, turnos, chamados e equipe — tudo num só lugar, em campo.
						</p>
					</div>

					<img
						src="/operacao-boneco.webp"
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
							aria-label="Acesso à Operação"
							className="rounded-[34px] border border-white/80 bg-white/90 px-6 py-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:px-12 sm:py-10"
						>
							<div className="mb-8 flex justify-center lg:hidden">
								<img src="/rot-logo.png" alt="Operação Cluster MG" className="h-20 w-auto object-contain" />
							</div>

							<div className="text-center">
								<div className="mb-7 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-5 py-2 text-sm font-extrabold text-orange-600">
									<Lock size={16} />
									Acesso Operação
								</div>
								<h2 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
									{isResetMode ? "Redefinir senha" : mfaChallenge ? "Confirme seu acesso" : "Bem-vindo de volta!"}
								</h2>
								<p className="mt-3 text-base font-medium text-slate-500 sm:text-lg">
									{isResetMode
										? "Crie uma nova senha para acessar a Operação."
										: mfaChallenge
											? `Digite o código enviado para ${mfaChallenge.maskedEmail || "seu e-mail"}.`
											: "Entre com suas credenciais para acessar o sistema."}
								</p>
							</div>

							{isResetMode ? (
								<form onSubmit={handleSubmitReset} className="mt-9 space-y-5">
									<PasswordField
										id="rot-reset-password"
										label="Nova senha"
										value={resetForm.password}
										onChange={(value) => setResetForm((current) => ({ ...current, password: value }))}
										disabled={loading}
										autoComplete="new-password"
									/>
									<PasswordField
										id="rot-reset-confirm"
										label="Confirmar senha"
										value={resetForm.confirm}
										onChange={(value) => setResetForm((current) => ({ ...current, confirm: value }))}
										disabled={loading}
										autoComplete="new-password"
									/>

									<StatusMessage error={visibleError} message={message} />

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
								<form onSubmit={handleVerifyMfa} className="mt-9 space-y-5">
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
											disabled={loading}
											placeholder="000000"
											aria-label="Código de verificação"
											className="mt-5 h-16 w-full rounded-2xl border border-blue-200 bg-white px-5 text-center text-3xl font-black tracking-[0.35em] text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</div>

									<StatusMessage error={visibleError} message={message} />

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
										disabled={loading}
										onClick={() => {
											setMfaChallenge(null);
											setMfaCode("");
											setMessage("");
											setError("");
										}}
										className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
									>
										<ArrowLeft size={16} />
										Voltar para login
									</button>
								</form>
							) : (
								<form onSubmit={handleLogin} className="mt-9 space-y-5">
									<div>
										<label htmlFor="rot-login-username" className="mb-2 block text-sm font-extrabold text-slate-900">
											Usuário ou e-mail
										</label>
										<div className="relative">
											<User size={21} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
											<input
												id="rot-login-username"
												type="text"
												value={username}
												onChange={(event) => setUsername(event.target.value)}
												placeholder="seu.usuario ou seu@email.com"
												autoComplete="username"
												disabled={loading}
												required
												className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-16 pr-5 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
											/>
										</div>
									</div>

									<div>
										<label htmlFor="rot-login-password" className="mb-2 block text-sm font-extrabold text-slate-900">
											Senha
										</label>
										<div className="relative">
											<Lock size={21} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
											<input
												id="rot-login-password"
												type={showPassword ? "text" : "password"}
												value={password}
												onChange={(event) => setPassword(event.target.value)}
												placeholder="Sua senha"
												autoComplete="current-password"
												disabled={loading}
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

									<div className="flex flex-wrap items-center justify-end gap-3 text-sm font-semibold">
										<button
											type="button"
											onClick={handleForgotPassword}
											disabled={loading}
											className="font-extrabold text-blue-600 transition hover:text-blue-700 disabled:opacity-60"
										>
											Esqueceu sua senha?
										</button>
									</div>

									<StatusMessage error={visibleError} message={message} />

									<button
										type="submit"
										disabled={loading}
										className="mt-2 inline-flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(90deg,#ff9800_0%,#ff4b00_100%)] text-lg font-black text-white shadow-[0_18px_34px_rgba(255,95,0,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(255,95,0,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
									>
										<LogIn size={24} />
										{loading ? "Entrando..." : "Entrar no sistema"}
									</button>

									{showGoogleButton ? (
										<div className="space-y-4">
											<div className="flex items-center gap-3">
												<div className="h-px flex-1 bg-slate-200" />
												<span className="text-xs font-black uppercase tracking-wide text-slate-400">ou</span>
												<div className="h-px flex-1 bg-slate-200" />
											</div>
											<div className="flex min-h-11 justify-center" ref={googleButtonRef} />
										</div>
									) : null}
								</form>
							)}

							<div className="mt-8 grid gap-3 border-t border-slate-200 pt-6 text-sm font-bold text-slate-500 sm:grid-cols-2">
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

function PasswordField({ id, label, value, onChange, disabled, autoComplete }) {
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
				disabled={disabled}
				required
				className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-5 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
			/>
		</div>
	);
}

function StatusMessage({ error, message }) {
	if (error) {
		return (
			<div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600" role="alert">
				{error}
			</div>
		);
	}
	if (message) {
		return (
			<div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">
				{message}
			</div>
		);
	}
	return null;
}
