import {
	Eye,
	EyeOff,
	Headphones,
	Lock,
	LogIn,
	Mail,
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
						Confirme o código enviado
					</h3>
					<p className="mt-1 text-sm font-semibold leading-relaxed text-blue-800">
						Enviamos um código de 6 dígitos para{" "}
						{challenge.maskedEmail || "seu e-mail"}.
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
						value={email}
						onChange={(event) => onEmailChange(event.target.value)}
						required
						placeholder="seu@email.com"
						className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-16 pr-5 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
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
						value={password}
						onChange={(event) => onPasswordChange(event.target.value)}
						required
						placeholder="••••••••"
						className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-16 pr-14 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
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

const LoginForm = () => {
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
			navigate(ROUTES.DASHBOARD);
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
			navigate(ROUTES.DASHBOARD);
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
				navigate(ROUTES.DASHBOARD);
			} catch {
				// Erro tratado no useAuth.
			} finally {
				setIsSubmitting(false);
			}
		},
		[loginWithGoogle, navigate],
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
			.then(() => navigate(ROUTES.DASHBOARD))
			.catch(() => null)
			.finally(() => setIsSubmitting(false));
	}, [loginWithOkta, navigate]);

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
		<div className="min-h-screen overflow-hidden bg-[#061b38] text-slate-950">
			<div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
				<aside className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_78%_22%,rgba(255,255,255,0.18),transparent_24%),linear-gradient(135deg,#0048df_0%,#0068ff_48%,#ff8a00_100%)] px-10 py-9 text-white lg:flex lg:flex-col xl:px-16">
					<div className="absolute inset-y-0 -right-24 w-48 rotate-[7deg] bg-gradient-to-b from-[#082b55] via-[#07305f] to-[#061b38] shadow-[-26px_0_70px_rgba(4,22,44,0.18)]" />
					<div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-white/10" />
					<div className="absolute right-10 top-24 h-72 w-72 rounded-full border border-white/10 bg-white/10" />
					<div className="absolute bottom-20 left-24 h-80 w-80 rounded-full border border-white/15" />
					<div className="absolute bottom-0 right-16 h-64 w-64 rounded-full bg-orange-400/20 blur-3xl" />

					<div className="relative z-10">
						<img
							src="/logo-adm.png"
							alt="Administrativo Sempre Internet"
							className="h-24 w-auto object-contain drop-shadow-lg xl:h-28"
						/>
					</div>

					<div className="relative z-20 mt-28 max-w-xl xl:mt-32">
						<h1 className="text-5xl font-black leading-[1.03] tracking-normal xl:text-6xl">
							Controle total
							<br />
							<span className="text-orange-200">na palma da mão.</span>
						</h1>
						<p className="mt-6 max-w-lg text-xl leading-relaxed text-white/92">
							Gerencie documentos, empresas, imóveis e insumos em um único lugar.
						</p>
					</div>

					<img
						src="/retorninho-adm.png"
						alt="Retorninho administrativo"
						className="pointer-events-none absolute bottom-14 right-10 z-10 w-[38vw] max-w-[520px] object-contain drop-shadow-[0_34px_58px_rgba(0,37,118,0.38)] xl:right-20"
					/>
				</aside>

				<main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_82%_20%,rgba(19,94,168,0.42),transparent_28%),radial-gradient(circle_at_12%_84%,rgba(255,122,0,0.09),transparent_28%),linear-gradient(135deg,#082b55_0%,#061f3f_48%,#04162c_100%)] px-5 pb-16 pt-10 sm:px-8">
					<div className="absolute left-0 top-0 h-full w-28 bg-gradient-to-r from-[#061b38]/75 to-transparent" />
					<div className="absolute right-[-18%] top-[-20%] h-[520px] w-[520px] rounded-full border border-white/10 bg-white/5 blur-sm" />

					<div className="relative z-10 w-full max-w-[610px]">
						<section className="rounded-[34px] border border-white/80 bg-white/90 px-6 py-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:px-12 sm:py-10">
							<div className="mb-8 flex justify-center lg:hidden">
								<img
									src="/logo-adm.png"
									alt="Administrativo Sempre Internet"
									className="h-20 w-auto object-contain"
								/>
							</div>

							<div className="text-center">
								<div className="mb-7 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-5 py-2 text-sm font-extrabold text-orange-600">
									<Lock size={16} />
									Acesso Interno
								</div>
								<h2 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
									Bem-vindo de volta
								</h2>
								<p className="mt-3 text-base font-medium text-slate-500 sm:text-lg">
									Entre com suas credenciais para continuar.
								</p>
							</div>

							<form
								onSubmit={mfaChallenge ? handleMfaSubmit : handleSubmit}
								className="mt-9 space-y-5"
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
									<div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
										{error}
									</div>
								) : null}
								{captchaMessage ? (
									<div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
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
									className="mt-2 inline-flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(90deg,#ff9800_0%,#ff4b00_100%)] text-lg font-black text-white shadow-[0_18px_34px_rgba(255,95,0,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(255,95,0,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
								>
									<LogIn size={24} />
									{isSubmitting
										? "Entrando..."
										: mfaChallenge
											? "Validar código"
											: "Entrar no sistema"}
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

							<div className="mt-8 grid gap-3 border-t border-slate-200 pt-6 text-sm font-bold text-slate-500 sm:grid-cols-3">
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
						className="absolute bottom-0 left-0 right-0 z-20 bg-transparent"
					/>
				</main>
			</div>
		</div>
	);
};

export default LoginForm;
