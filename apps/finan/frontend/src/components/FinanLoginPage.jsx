import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	BarChart3,
	DollarSign,
	Eye,
	EyeOff,
	Headphones,
	Lock,
	Mail,
	ShieldCheck,
	TrendingUp,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	requestFinanPasswordReset,
	resetFinanPassword,
} from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";

const trustItems = [
	{ label: "Acesso seguro", icon: ShieldCheck },
	{ label: "Dados protegidos", icon: Lock },
	{ label: "Suporte dedicado", icon: Headphones },
];

const floatingCards = [
	{ label: "Planejamento para crescer", icon: BarChart3, className: "is-plan" },
	{ label: "Resultados que importam", icon: TrendingUp, className: "is-result" },
	{ label: "Controle inteligente", icon: DollarSign, className: "is-control" },
];

const benefitCards = [
	{ title: "Controle", subtitle: "em tempo real", icon: BarChart3 },
	{ title: "Dados", subtitle: "seguros", icon: ShieldCheck },
	{ title: "Decisões", subtitle: "mais inteligentes", icon: Zap },
];

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
		<div className="finan-login-screen">
			<BrandPanel />

			<main className="finan-login-main">
				<section className="finan-login-card" aria-label="Acesso ao Finan">
					<div className="finan-login-mobile-logo">
						<img src="/sempre-logo-branca-crop.png" alt="Sempre Internet" />
					</div>

					<div className="finan-login-product">
						<div className="finan-login-product-icon" aria-hidden="true">
							<TrendingUp size={28} />
						</div>
						<div>
							<strong>FINAN</strong>
							<span>Gestão Financeira</span>
							<small>Sempre Internet</small>
						</div>
					</div>

					<header className="finan-login-title">
						<h2>
							{isResetMode
								? "Redefinir senha"
								: mfaChallenge
									? "Confirme seu acesso"
									: "Bem-vindo de volta!"}
						</h2>
						<p>
							{isResetMode
								? "Crie uma nova senha para acessar o Finan."
								: mfaChallenge
									? `Digite o código enviado para ${mfaChallenge.maskedEmail || "seu e-mail"}.`
									: "Entre com suas credenciais para acessar o sistema."}
						</p>
					</header>

					{isResetMode ? (
						<form className="finan-login-form" onSubmit={submitReset}>
							<Field id="finan-reset-password" label="Nova senha">
								<input
									id="finan-reset-password"
									type="password"
									minLength={8}
									autoComplete="new-password"
									value={resetForm.password}
									onChange={(event) =>
										setResetForm((current) => ({
											...current,
											password: event.target.value,
										}))
									}
									required
								/>
							</Field>
							<Field id="finan-reset-confirm" label="Confirmar senha">
								<input
									id="finan-reset-confirm"
									type="password"
									minLength={8}
									autoComplete="new-password"
									value={resetForm.confirm}
									onChange={(event) =>
										setResetForm((current) => ({
											...current,
											confirm: event.target.value,
										}))
									}
									required
								/>
							</Field>
							<Feedback error={visibleError} message={message} />
							<button type="submit" className="finan-login-submit" disabled={loading}>
								{loading ? "Salvando..." : "Salvar nova senha"}
							</button>
						</form>
					) : mfaChallenge ? (
						<form className="finan-login-form" onSubmit={submitMfa}>
							<div className="finan-mfa-panel">
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
									onChange={(event) =>
										setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
									}
									placeholder="000000"
									aria-label="Código MFA"
									required
								/>
							</div>
							<Feedback error={visibleError} message={message} />
							<button
								type="submit"
								className="finan-login-submit"
								disabled={loading || mfaCode.length !== 6}
							>
								{loading ? "Validando..." : "Validar código"}
							</button>
							<button
								type="button"
								className="finan-login-secondary"
								onClick={() => {
									setMfaChallenge(null);
									setMfaCode("");
									setMessage("");
								}}
							>
								<ArrowLeft size={16} />
								Voltar para login
							</button>
						</form>
					) : (
						<form className="finan-login-form" onSubmit={submit}>
							<Field id="finan-login-email" label="E-mail">
								<div className="finan-login-input-icon">
									<Mail size={21} />
									<input
										id="finan-login-email"
										type="email"
										value={form.email}
										onChange={(event) =>
											setForm((current) => ({
												...current,
												email: event.target.value,
											}))
										}
										placeholder="seu@email.com"
										autoComplete="email"
										required
									/>
								</div>
							</Field>
							<Field id="finan-login-password" label="Senha">
								<div className="finan-login-input-icon">
									<Lock size={21} />
									<input
										id="finan-login-password"
										type={showPassword ? "text" : "password"}
										value={form.password}
										onChange={(event) =>
											setForm((current) => ({
												...current,
												password: event.target.value,
											}))
										}
										placeholder="Sua senha"
										autoComplete="current-password"
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
							<div className="finan-login-row">
								<label htmlFor="finan-login-remember">
									<input
										id="finan-login-remember"
										type="checkbox"
										checked={rememberMe}
										onChange={(event) => setRememberMe(event.target.checked)}
									/>
									<span>Lembrar de mim</span>
								</label>
								<button type="button" onClick={requestReset}>
									Esqueceu sua senha?
								</button>
							</div>
							<Feedback error={visibleError} message={message} />
							<button type="submit" className="finan-login-submit" disabled={loading}>
								{loading ? (
									<span className="finan-login-spinner" aria-hidden="true" />
								) : (
									<ArrowRight size={24} />
								)}
								{loading ? "Entrando..." : "Entrar no sistema"}
							</button>
						</form>
					)}

					<div className="finan-login-trust">
						{trustItems.map(({ label, icon: Icon }) => (
							<div key={label}>
								<Icon size={18} />
								{label}
							</div>
						))}
					</div>
				</section>
			</main>
		</div>
	);
}

function BrandPanel() {
	return (
		<aside className="finan-login-showcase" aria-label="FINAN Gestão Financeira">
			<div className="finan-login-bg-line is-one" />
			<div className="finan-login-bg-line is-two" />
			<div className="finan-login-bg-dot is-a" />
			<div className="finan-login-bg-dot is-b" />
			<div className="finan-login-brand">
				<img src="/sempre-logo-branca-crop.png" alt="Sempre Internet" />
			</div>
			<div className="finan-login-copy">
				<span className="finan-login-eyebrow">FINAN</span>
				<div className="finan-login-eyebrow-line" />
				<h1>
					Gestão
					<span>Financeira</span>
					sem complicação.
				</h1>
				<p>
					Mais controle, mais resultado e uma Sempre Internet ainda mais forte.
				</p>
			</div>

			<div className="finan-login-character-wrap">
				{floatingCards.map(({ label, icon: Icon, className }) => (
					<div key={label} className={`finan-login-floating-card ${className}`}>
						<Icon size={18} />
						<span>{label}</span>
					</div>
				))}
				<img
					src="/retorninho-financeiro.png"
					alt="Retorninho com calculadora"
					className="finan-login-character"
				/>
			</div>

			<div className="finan-login-benefits" aria-label="Benefícios do Finan">
				{benefitCards.map(({ title, subtitle, icon: Icon }) => (
					<div key={title}>
						<Icon size={24} />
						<strong>{title}</strong>
						<span>{subtitle}</span>
					</div>
				))}
			</div>

			<div className="finan-login-institutional">
				<span />
				<p>
					Conectando pessoas a
					<br />
					um futuro melhor
				</p>
			</div>
		</aside>
	);
}

function Field({ id, label, children }) {
	return (
		<label className="finan-login-field" htmlFor={id}>
			<span>{label}</span>
			{children}
		</label>
	);
}

function Feedback({ error, message }) {
	return (
		<>
			{error ? (
				<div className="finan-error" role="alert">
					<AlertTriangle size={17} />
					<span>{error}</span>
				</div>
			) : null}
			{message ? (
				<div className="finan-success" role="status">
					<ShieldCheck size={17} />
					<span>{message}</span>
				</div>
			) : null}
		</>
	);
}
