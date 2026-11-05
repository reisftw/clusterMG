import {
	BarChart3,
	CalendarDays,
	Eye,
	EyeOff,
	Headphones,
	Layers3,
	Lock,
	LogIn,
	Mail,
	MapPin,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MelzFooter from "../../../components/layout/MelzFooter";
import { useAuthContext } from "../../../context/AuthContext";
import { ROUTES } from "../../../router/routes";
import {
	obterConfigAntiBot,
	obterConfigGoogleLogin,
	obterConfigOktaLogin,
} from "../services/authService";
import TurnstileWidget from "./TurnstileWidget";

const trustItems = [
	{ label: "Acesso seguro", icon: ShieldCheck },
	{ label: "Dados protegidos", icon: Lock },
	{ label: "Suporte dedicado", icon: Headphones },
];

const platformFeatures = [
	{ label: "Operação em campo", icon: MapPin },
	{ label: "Agendamentos", icon: CalendarDays },
	{ label: "Metas e desempenho", icon: BarChart3 },
	{ label: "Gestão integrada", icon: Layers3 },
];

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveLoginSubmitLabel(isSubmitting, mfaChallenge) {
	if (isSubmitting) return "Entrando...";
	return mfaChallenge ? "Validar código" : "Entrar no sistema";
}

function MfaCodePanel({ challenge, code, onCodeChange, onReset }) {
	const codeInputId = useId();
	return (
		<div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
			<div className="flex items-start gap-3">
				<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
					<ShieldCheck size={22} />
				</span>
				<div>
					<h3 className="text-base font-black text-slate-950">
						{challenge.method === "totp"
							? "Confirme no autenticador"
							: "Confirme o código enviado"}
					</h3>
					<p className="mt-1 text-sm font-semibold leading-relaxed text-blue-800">
						{challenge.method === "totp"
							? "Use o código de 6 dígitos que aparece no app autenticador."
							: `Enviamos um código de 6 dígitos para ${challenge.maskedEmail || "seu e-mail"}.`}
					</p>
				</div>
			</div>
			<label
				htmlFor={codeInputId}
				className="mt-5 block text-sm font-extrabold text-slate-900"
			>
				Código de segurança
			</label>
			<input
				id={codeInputId}
				value={code}
				onChange={(event) =>
					onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))
				}
				inputMode="numeric"
				autoComplete="one-time-code"
				required
				placeholder="000000"
				className="mt-2 h-16 w-full rounded-2xl border border-blue-200 bg-white px-5 text-center text-3xl font-black tracking-[0.35em] text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
			/>
			<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-blue-700">
				<span>Expira em {challenge.ttlMinutes || 10} minutos.</span>
				<button
					type="button"
					onClick={onReset}
					className="text-blue-800 underline"
				>
					Voltar para login
				</button>
			</div>
		</div>
	);
}

function CredentialFields({
	email,
	password,
	showPassword,
	onEmailChange,
	onPasswordChange,
	onTogglePassword,
}) {
	const emailInputId = useId();
	const passwordInputId = useId();
	return (
		<>
			<div>
				<label
					htmlFor={emailInputId}
					className="mb-2 block text-sm font-extrabold text-slate-900"
				>
					E-mail
				</label>
				<div className="relative">
					<Mail
						size={21}
						className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
					/>
					<input
						id={emailInputId}
						type="email"
						name="email"
						autoComplete="email"
						value={email}
						onChange={(event) => onEmailChange(event.target.value)}
						required
						placeholder="seu@email.com"
						className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-16 pr-5 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
					/>
				</div>
			</div>

			<div>
				<label
					htmlFor={passwordInputId}
					className="mb-2 block text-sm font-extrabold text-slate-900"
				>
					Senha
				</label>
				<div className="relative">
					<Lock
						size={21}
						className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
					/>
					<input
						id={passwordInputId}
						type={showPassword ? "text" : "password"}
						name="password"
						autoComplete="current-password"
						value={password}
						onChange={(event) => onPasswordChange(event.target.value)}
						required
						placeholder="••••••••"
						className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-16 pr-14 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
					/>
					<button
						type="button"
						onClick={onTogglePassword}
						className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-blue-600"
						aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
					>
						{showPassword ? <EyeOff size={21} /> : <Eye size={21} />}
					</button>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold">
				<label className="inline-flex items-center gap-2 text-slate-500">
					<input
						type="checkbox"
						className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
					/>
					<span>Lembrar de mim</span>
				</label>
				<Link
					to={ROUTES.FORGOT_PASSWORD}
					className="font-extrabold text-blue-600 transition hover:text-blue-700"
				>
					Esqueceu sua senha?
				</Link>
			</div>
		</>
	);
}

const LoginForm = ({ redirectTo = ROUTES.DASHBOARD }) => {
	const { login, verifyEmailMfa, loginWithGoogle, loginWithOkta, error } =
		useAuthContext();
	const navigate = useNavigate();
	const googleButtonRef = useRef(null);

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [mfaCode, setMfaCode] = useState("");
	const [mfaChallenge, setMfaChallenge] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [googleConfig, setGoogleConfig] = useState({
		enabled: false,
		clientId: "",
	});
	const [oktaConfig, setOktaConfig] = useState({
		enabled: false,
		issuer: "",
		clientId: "",
		redirectUri: "",
	});
	const [antiBotConfig, setAntiBotConfig] = useState({
		enabled: false,
		provider: "turnstile",
		siteKey: "",
	});
	const [turnstileToken, setTurnstileToken] = useState("");
	const [turnstileResetKey, setTurnstileResetKey] = useState(0);
	const [captchaMessage, setCaptchaMessage] = useState("");

	const resetTurnstile = () => {
		setTurnstileToken("");
		setTurnstileResetKey((current) => current + 1);
	};

	const requireTurnstileToken = () => {
		if (!antiBotConfig.enabled || turnstileToken) return true;
		setCaptchaMessage("Conclua a verificacao anti-bot para continuar.");
		return false;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setCaptchaMessage("");
		if (!requireTurnstileToken()) return;
		setIsSubmitting(true);
		try {
			const result = await login(email, password, turnstileToken);
			if (result?.mfaRequired) {
				setMfaChallenge(result);
				setMfaCode("");
				resetTurnstile();
				return;
			}
			navigate(redirectTo);
		} catch {
			// Erro tratado no useAuth.
		} finally {
			setIsSubmitting(false);
			if (antiBotConfig.enabled) resetTurnstile();
		}
	};

	const handleMfaSubmit = async (e) => {
		e.preventDefault();
		if (!mfaChallenge?.challengeId) return;
		setCaptchaMessage("");
		if (!requireTurnstileToken()) return;
		setIsSubmitting(true);
		try {
			await verifyEmailMfa({
				challengeId: mfaChallenge.challengeId,
				code: mfaCode,
				turnstileToken,
			});
			navigate(redirectTo);
		} catch {
			// Erro tratado no useAuth.
		} finally {
			setIsSubmitting(false);
			if (antiBotConfig.enabled) resetTurnstile();
		}
	};

	const resetMfaFlow = () => {
		setMfaChallenge(null);
		setMfaCode("");
	};

	const handleGoogleCredential = useCallback(
		async (response) => {
			if (!response?.credential) return;
			setIsSubmitting(true);
			try {
				await loginWithGoogle(response.credential);
				navigate(redirectTo);
			} catch {
				// Erro tratado no useAuth.
			} finally {
				setIsSubmitting(false);
			}
		},
		[loginWithGoogle, navigate, redirectTo],
	);

	useEffect(() => {
		let active = true;
		Promise.allSettled([
			obterConfigGoogleLogin(),
			obterConfigOktaLogin(),
			obterConfigAntiBot(),
		])
			.then(([googleResult, oktaResult, antiBotResult]) => {
				if (!active) return;
				if (googleResult.status === "fulfilled") {
					setGoogleConfig(
						googleResult.value || { enabled: false, clientId: "" },
					);
				}
				if (oktaResult.status === "fulfilled") {
					setOktaConfig(
						oktaResult.value || {
							enabled: false,
							issuer: "",
							clientId: "",
							redirectUri: "",
						},
					);
				}
				if (antiBotResult.status === "fulfilled") {
					setAntiBotConfig(
						antiBotResult.value || {
							enabled: false,
							provider: "turnstile",
							siteKey: "",
						},
					);
				}
			})
			.catch(() => {
				if (active) {
					setGoogleConfig({ enabled: false, clientId: "" });
					setOktaConfig({
						enabled: false,
						issuer: "",
						clientId: "",
						redirectUri: "",
					});
					setAntiBotConfig({
						enabled: false,
						provider: "turnstile",
						siteKey: "",
					});
				}
			});
		return () => {
			active = false;
		};
	}, []);

	const handleOktaLogin = () => {
		if (!oktaConfig.enabled || !oktaConfig.issuer || !oktaConfig.clientId)
			return;
		const nonceBytes = new Uint8Array(16);
		window.crypto.getRandomValues(nonceBytes);
		const nonce = Array.from(nonceBytes, (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
		window.sessionStorage.setItem("retiradas_okta_nonce", nonce);
		const redirectUri =
			oktaConfig.redirectUri || `${window.location.origin}/login`;
		const params = new URLSearchParams({
			client_id: oktaConfig.clientId,
			redirect_uri: redirectUri,
			response_type: "id_token",
			response_mode: "fragment",
			scope: "openid email profile",
			nonce,
		});
		window.location.href = `${oktaConfig.issuer.replace(/\/+$/, "")}/v1/authorize?${params.toString()}`;
	};

	useEffect(() => {
		const hash = new URLSearchParams(
			String(window.location.hash || "").replace(/^#/, ""),
		);
		const idToken = hash.get("id_token");
		if (!idToken) return;

		const nonce = window.sessionStorage.getItem("retiradas_okta_nonce") || "";
		window.sessionStorage.removeItem("retiradas_okta_nonce");
		window.history.replaceState(
			null,
			document.title,
			window.location.pathname + window.location.search,
		);

		setIsSubmitting(true);
		loginWithOkta({ credential: idToken, nonce })
			.then(() => navigate(redirectTo))
			.catch(() => null)
			.finally(() => setIsSubmitting(false));
	}, [loginWithOkta, navigate, redirectTo]);

	useEffect(() => {
		if (
			!googleConfig.enabled ||
			!googleConfig.clientId ||
			!googleButtonRef.current
		)
			return undefined;
		let cancelled = false;

		const renderGoogleButton = () => {
			if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current)
				return;
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
	}, [googleConfig, handleGoogleCredential]);
	return (
		<div className="min-h-[100dvh] overflow-x-hidden bg-[#06152f] text-slate-950 lg:h-[100dvh] lg:overflow-hidden">
			<div className="grid min-h-[100dvh] lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1.04fr)_minmax(520px,0.96fr)]">
				<aside className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_82%_46%,rgba(31,107,255,0.3),transparent_33%),linear-gradient(145deg,#071a38_0%,#0a2b59_58%,#0a1b3d_100%)] px-10 py-8 text-white lg:flex lg:h-full lg:flex-col xl:px-16">
					<div className="absolute -right-8 top-[-16%] h-[76%] w-52 rotate-[29deg] bg-gradient-to-b from-[#00d4ff] via-[#1f6bff] to-transparent opacity-70 shadow-[0_0_65px_rgba(31,107,255,0.35)]" />
					<div className="absolute -bottom-44 -left-40 h-80 w-80 rotate-45 border border-cyan-300/20 bg-blue-600/20" />
					<div className="absolute bottom-[-12%] right-[-8%] h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
					<div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:72px_72px]" />

					<img
						src="/brand/revo/revo_logo_horizontal_light.svg"
						alt="REVO — Sistema de Retiradas"
						width="700"
						height="180"
						className="relative z-20 h-14 w-auto object-contain drop-shadow-lg xl:h-16"
					/>

					<div className="relative z-20 mt-8 max-w-[590px] xl:mt-10 2xl:mt-16">
						<h1 className="text-4xl font-black leading-[1.04] tracking-normal xl:text-5xl 2xl:text-6xl">
							Gestão completa da
							<br />
							operação de <span className="text-[#ff7a00]">retiradas.</span>
						</h1>
						<p className="mt-4 max-w-[520px] text-base font-medium leading-relaxed text-blue-50/90 xl:text-lg 2xl:text-xl">
							Mapas, agendamentos, ordens de serviço, acompanhamento em campo e
							muito mais, na palma da sua mão.
						</p>
					</div>

					<div className="relative z-30 mt-5 grid w-72 gap-2 xl:mt-6 2xl:mt-9 2xl:gap-3">
						{platformFeatures.map(({ label, icon: Icon }) => (
							<div key={label} className="flex items-center gap-3 text-sm font-extrabold text-white xl:text-base">
								<span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-300/15 bg-blue-500/20 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]">
									<Icon size={20} strokeWidth={2.2} />
								</span>
								{label}
							</div>
						))}
					</div>

					<img
						src="/brand/revo/login/retorninho-celular-revo.png"
						alt="Retorninho apresentando o REVO no celular"
						width="1254"
						height="1254"
						fetchPriority="high"
						className="pointer-events-none absolute bottom-4 right-[-4%] z-20 w-[48%] max-w-[560px] object-contain drop-shadow-[0_34px_54px_rgba(0,0,0,0.38)] xl:right-[1%]"
					/>

					<div className="relative z-20 mt-auto flex items-center gap-4 pt-5 text-[11px] font-bold uppercase tracking-[0.38em] text-blue-100/80">
						<span className="h-px flex-1 bg-gradient-to-r from-transparent to-blue-200/35" />
						Operações · Rastreamento · Recuperação
						<span className="h-px flex-1 bg-gradient-to-l from-transparent to-blue-200/35" />
					</div>
				</aside>

				<main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden bg-[radial-gradient(circle_at_86%_14%,rgba(31,107,255,0.3),transparent_28%),radial-gradient(circle_at_10%_88%,rgba(255,122,0,0.13),transparent_30%),linear-gradient(135deg,#0a2b59_0%,#071a38_46%,#06142b_100%)] px-4 py-6 sm:px-8 lg:h-full lg:min-h-0 lg:py-8">
					<div className="absolute right-[-15%] top-[-18%] h-[520px] w-[520px] rounded-full border border-cyan-200/10" />
					<div className="absolute bottom-[-18%] right-[-14%] h-72 w-96 rotate-[-24deg] bg-gradient-to-r from-transparent via-orange-500/25 to-orange-400/80 blur-sm" />

					<div className="relative z-10 w-full max-w-[680px]">
						<section className="rounded-[30px] border border-white/80 bg-[#f7f9fd]/95 px-6 py-5 shadow-[0_32px_90px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:px-10 xl:px-12">
							<div className="mb-6 flex justify-center lg:hidden">
								<img
									src="/brand/revo/revo_logo_horizontal_dark.svg"
									alt="REVO — Sistema de Retiradas"
									width="700"
									height="180"
									className="h-11 w-auto object-contain"
								/>
							</div>

							<div className="text-center">
								<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-5 py-1.5 text-sm font-extrabold text-orange-600">
									<Lock size={16} />
									Acesso Interno
								</div>
								<h2 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
									Bem-vindo de volta ao <span className="text-[#1f6bff]">REVO</span>
								</h2>
								<p className="mt-2 text-sm font-semibold text-slate-500 sm:text-base">
									Entre com suas credenciais para acessar o Sistema de Retiradas.
								</p>
							</div>

							<form
								onSubmit={mfaChallenge ? handleMfaSubmit : handleSubmit}
								className="mt-5 space-y-4"
							>
								{mfaChallenge ? (
									<MfaCodePanel
										challenge={mfaChallenge}
										code={mfaCode}
										onCodeChange={setMfaCode}
										onReset={resetMfaFlow}
									/>
								) : (
									<CredentialFields
										email={email}
										password={password}
										showPassword={showPassword}
										onEmailChange={setEmail}
										onPasswordChange={setPassword}
										onTogglePassword={() =>
											setShowPassword((current) => !current)
										}
									/>
								)}

								{error ? (
									<div aria-live="polite" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
										{error}
									</div>
								) : null}
								{captchaMessage ? (
									<div aria-live="polite" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
										{captchaMessage}
									</div>
								) : null}

								<TurnstileWidget
									config={antiBotConfig}
									resetKey={turnstileResetKey}
									onTokenChange={setTurnstileToken}
								/>

								<button
									type="submit"
									disabled={isSubmitting}
									className="mt-1 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(90deg,#ff9800_0%,#ff4b00_100%)] text-lg font-black text-white shadow-[0_18px_34px_rgba(255,95,0,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(255,95,0,0.32)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 motion-reduce:transform-none disabled:cursor-not-allowed disabled:opacity-60"
								>
									<LogIn size={24} />
									{resolveLoginSubmitLabel(isSubmitting, mfaChallenge)}
								</button>
								{!mfaChallenge &&
								googleConfig.enabled &&
								googleConfig.clientId ? (
									<div className="space-y-4">
										<div className="flex items-center gap-3">
											<div className="h-px flex-1 bg-slate-200" />
											<span className="text-xs font-black uppercase tracking-wide text-slate-400">
												ou
											</span>
											<div className="h-px flex-1 bg-slate-200" />
										</div>
										<div
											className="flex min-h-11 justify-center"
											ref={googleButtonRef}
										/>
									</div>
								) : null}
								{!mfaChallenge &&
								oktaConfig.enabled &&
								oktaConfig.issuer &&
								oktaConfig.clientId ? (
									<button
										type="button"
										onClick={handleOktaLogin}
										disabled={isSubmitting}
										className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 text-sm font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:opacity-60"
									>
										<ShieldCheck size={19} />
										Entrar com Okta Verify
									</button>
								) : null}
							</form>

							<div className="mt-4 grid gap-2 border-t border-slate-200 pt-3 text-xs font-bold text-slate-500 sm:grid-cols-3">
								{trustItems.map(({ label, icon: Icon }) => (
									<div
										key={label}
										className="flex items-center justify-center gap-2"
									>
										<Icon size={18} className="text-blue-500" />
										{label}
									</div>
								))}
							</div>
						</section>
					</div>
					<MelzFooter
						variant="dark"
						className="relative z-20 mt-4 w-full shrink-0 bg-transparent lg:absolute lg:bottom-0 lg:left-0 lg:right-0"
					/>
				</main>
			</div>
		</div>
	);
};

export default LoginForm;
