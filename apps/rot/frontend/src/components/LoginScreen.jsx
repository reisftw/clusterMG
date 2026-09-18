import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { forgotRotPassword, resetRotPassword } from "../api/rotApi";
import { useRotAuth } from "../state/RotAuthContext";

// Mesmo padrao visual de FinanLoginPage.jsx (Retiradas/Finan): painel
// com gradiente azul/laranja + mascote a direita, card branco com o
// formulario. So a logica de autenticacao muda (login por "usuario",
// nao e-mail, preservando o fluxo original da Operação). Login com MFA por
// e-mail e recuperacao de senha seguem o mesmo fluxo de dois passos do
// Finan (link "Esqueceu sua senha?" -> e-mail com link -> ?reset=token,
// mesma rota /login, nao uma rota separada).
export default function LoginScreen() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user, login, loginGoogle, verifyMfa, error: authError } = useRotAuth();
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
	const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || "";

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
			setError("Informe seu usuário para recuperar a senha.");
			return;
		}
		setLoading(true);
		try {
			const data = await forgotRotPassword(username.trim().toLowerCase());
			setMessage(data.message || "Se o usuário existir, enviamos um link de redefinição para o e-mail cadastrado.");
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

	// Botao "Entrar com Google" (Google Identity Services) — mesmo fluxo
	// de ID token verificado no backend que o app principal ja usa.
	useEffect(() => {
		if (!googleClientId || mode !== "login") return undefined;
		const script = document.createElement("script");
		script.src = "https://accounts.google.com/gsi/client";
		script.async = true;
		script.defer = true;
		script.onload = () => {
			if (!window.google?.accounts?.id) return;
			window.google.accounts.id.initialize({
				client_id: googleClientId,
				callback: async (response) => {
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
			});
			const target = document.getElementById("google-signin-button");
			if (target) {
				const targetWidth = Math.round(
					Math.min(320, target.getBoundingClientRect().width || 320),
				);
				window.google.accounts.id.renderButton(target, {
					theme: "outline",
					size: "large",
					width: targetWidth,
					text: "signin_with",
				});
			}
		};
		document.body.appendChild(script);
		return () => {
			document.body.removeChild(script);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [googleClientId, mode]);

	const visibleError = error || authError;
	const isResetMode = mode === "reset";

	return (
		<div className="rot-login-screen">
			<BrandPanel />

			<main className="rot-login-main">
				<section className="rot-login-card" aria-label="Acesso à Operação">
					<div className="rot-login-mobile-logo">
						<img src="/rot-logo.png" alt="OPERAÇÃO | Cluster MG" />
					</div>

					<div className="rot-login-product">
						<img src="/rot-logo.png" alt="OPERAÇÃO | Cluster MG" />
					</div>

					<header className="rot-login-title">
						<h2>
							{isResetMode
								? "Redefinir senha"
								: mfaChallenge
									? "Confirme seu acesso"
									: "Bem-vindo de volta!"}
						</h2>
						<p>
							{isResetMode
								? "Crie uma nova senha para acessar a Operação."
								: mfaChallenge
									? `Digite o código enviado para ${mfaChallenge.maskedEmail || "seu e-mail"}.`
									: "Entre com suas credenciais para acessar o sistema."}
						</p>
					</header>

					{isResetMode ? (
						<form className="rot-login-form" onSubmit={handleSubmitReset}>
							<Field id="rot-reset-password" label="Nova senha">
								<input
									id="rot-reset-password"
									type="password"
									minLength={8}
									autoComplete="new-password"
									value={resetForm.password}
									onChange={(event) =>
										setResetForm((current) => ({ ...current, password: event.target.value }))
									}
									disabled={loading}
									required
								/>
							</Field>
							<Field id="rot-reset-confirm" label="Confirmar senha">
								<input
									id="rot-reset-confirm"
									type="password"
									minLength={8}
									autoComplete="new-password"
									value={resetForm.confirm}
									onChange={(event) =>
										setResetForm((current) => ({ ...current, confirm: event.target.value }))
									}
									disabled={loading}
									required
								/>
							</Field>

							{visibleError ? (
								<div className="rot-error" role="alert">
									<Mail size={17} />
									<span>{visibleError}</span>
								</div>
							) : message ? (
								<div className="rot-success" role="status">
									<ShieldCheck size={17} />
									<span>{message}</span>
								</div>
							) : null}

							<button type="submit" className="rot-login-submit" disabled={loading}>
								{loading ? <span className="rot-login-spinner" aria-hidden="true" /> : null}
								{loading ? "Salvando..." : "Salvar nova senha"}
							</button>
						</form>
					) : mfaChallenge ? (
						<form className="rot-login-form" onSubmit={handleVerifyMfa}>
							<div className="rot-mfa-panel">
								<span>
									<ShieldCheck size={22} />
								</span>
								<strong>Confirme o código enviado</strong>
								<p>O código expira em {mfaChallenge.ttlMinutes || 10} minutos.</p>
								<input
									inputMode="numeric"
									autoComplete="one-time-code"
									maxLength={6}
									value={mfaCode}
									onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
									placeholder="000000"
									aria-label="Código de verificação"
									disabled={loading}
									required
								/>
							</div>

							{visibleError ? (
								<div className="rot-error" role="alert">
									<Mail size={17} />
									<span>{visibleError}</span>
								</div>
							) : message ? (
								<div className="rot-success" role="status">
									<ShieldCheck size={17} />
									<span>{message}</span>
								</div>
							) : null}

							<button type="submit" className="rot-login-submit" disabled={loading || mfaCode.length !== 6}>
								{loading ? <span className="rot-login-spinner" aria-hidden="true" /> : null}
								{loading ? "Validando..." : "Validar código"}
							</button>
							<button
								type="button"
								className="rot-login-secondary"
								disabled={loading}
								onClick={() => {
									setMfaChallenge(null);
									setMfaCode("");
									setMessage("");
									setError("");
								}}
							>
								<ArrowLeft size={16} />
								Voltar para login
							</button>
						</form>
					) : (
						<form className="rot-login-form" onSubmit={handleLogin}>
							<Field id="rot-login-username" label="Usuário">
								<div className="rot-login-input-icon">
									<User size={21} />
									<input
										id="rot-login-username"
										type="text"
										value={username}
										onChange={(event) => setUsername(event.target.value)}
										placeholder="seu.usuario"
										autoComplete="username"
										disabled={loading}
										required
									/>
								</div>
							</Field>
							<Field id="rot-login-password" label="Senha">
								<div className="rot-login-input-icon">
									<Lock size={21} />
									<input
										id="rot-login-password"
										type={showPassword ? "text" : "password"}
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										placeholder="Sua senha"
										autoComplete="current-password"
										disabled={loading}
										required
									/>
									<button
										type="button"
										onClick={() => setShowPassword((current) => !current)}
										aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
									>
										{showPassword ? <EyeOff size={21} /> : <Eye size={21} />}
									</button>
								</div>
							</Field>

							<div className="rot-login-row">
								<button type="button" onClick={handleForgotPassword} disabled={loading}>
									Esqueceu sua senha?
								</button>
							</div>

							{visibleError ? (
								<div className="rot-error" role="alert">
									<Mail size={17} />
									<span>{visibleError}</span>
								</div>
							) : message ? (
								<div className="rot-success" role="status">
									<ShieldCheck size={17} />
									<span>{message}</span>
								</div>
							) : null}

							<button type="submit" className="rot-login-submit" disabled={loading}>
								{loading ? <span className="rot-login-spinner" aria-hidden="true" /> : null}
								{loading ? "Entrando..." : "Entrar no sistema"}
							</button>
						</form>
					)}

					{!isResetMode && !mfaChallenge && googleClientId ? (
						<div className="rot-login-google">
							<div className="rot-login-divider">
								<span />
								ou
								<span />
							</div>
							<div id="google-signin-button" />
						</div>
					) : null}

					<div className="rot-login-trust">
						<div>
							<ShieldCheck size={18} />
							Acesso seguro
						</div>
						<div>
							<Lock size={18} />
							Dados protegidos
						</div>
					</div>
				</section>
			</main>
		</div>
	);
}

function BrandPanel() {
	// Painel decorativo/institucional — marcado aria-hidden (mesmo motivo
	// de FinanLoginPage.jsx: nada aqui e focavel, e um leitor de tela em
	// modo "ler tudo" nao deveria ter que ouvir texto de marketing antes
	// do formulario de login de verdade). Mesmo padrao do Finan: o
	// simbolo isolado no canto e a marca Sempre Internet, nao o logo do
	// app (o logo da Operação ja aparece no card, com o mascote centralizando
	// a cena aqui do lado).
	return (
		<aside className="rot-login-showcase" aria-hidden="true">
			<div className="rot-login-bg-line is-one" />
			<div className="rot-login-bg-line is-two" />
			<div className="rot-login-bg-dot is-a" />
			<div className="rot-login-bg-dot is-b" />
			<div className="rot-login-brand rot-login-brand-operation">
				<img src="/operacao-banner.png" alt="Operação Sempre Internet" />
			</div>
			<div className="rot-login-copy">
				<span className="rot-login-eyebrow">Operação</span>
				<div className="rot-login-eyebrow-line" />
				<h1>
					Gestão
					<span>Operacional</span>
					de campo.
				</h1>
				<p>Frota, turnos, chamados e equipe — tudo num só lugar, em campo.</p>
			</div>

			<div className="rot-login-character-wrap">
				<img
					src="/operacao-boneco.png"
					alt=""
					className="rot-login-character"
					onError={(event) => {
						event.currentTarget.style.display = "none";
					}}
				/>
			</div>

			<div className="rot-login-institutional">
				<span />
				<p>
					Conectando pessoas a<br />
					um futuro melhor
				</p>
			</div>
		</aside>
	);
}

function Field({ id, label, children }) {
	return (
		<label className="rot-login-field" htmlFor={id}>
			<span>{label}</span>
			{children}
		</label>
	);
}
