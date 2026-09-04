import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	requestFinanPasswordReset,
	resetFinanPassword,
} from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";

export default function FinanLoginPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { login, error, loading } = useFinanAuth();
	const [form, setForm] = useState({ email: "", password: "" });
	const [resetForm, setResetForm] = useState({ password: "", confirm: "" });
	const [message, setMessage] = useState("");
	const [localError, setLocalError] = useState("");
	const [mode, setMode] = useState(searchParams.get("reset") ? "reset" : "login");
	const resetToken = searchParams.get("reset") || "";

	const submit = async (event) => {
		event.preventDefault();
		await login(form);
		navigate(FINAN_ROUTES.DASHBOARD, { replace: true });
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

	if (mode === "reset") {
		return (
			<main className="finan-login-page">
				<form className="finan-login-card" onSubmit={submitReset}>
					<div className="finan-login-icon">
						<LockKeyhole size={24} />
					</div>
					<h1>Redefinir senha</h1>
					<p>Crie uma nova senha para acessar o Finan.</p>
					<label>
						Nova senha
						<input
							type="password"
							minLength={8}
							value={resetForm.password}
							onChange={(event) =>
								setResetForm((current) => ({
									...current,
									password: event.target.value,
								}))
							}
							required
						/>
					</label>
					<label>
						Confirmar senha
						<input
							type="password"
							minLength={8}
							value={resetForm.confirm}
							onChange={(event) =>
								setResetForm((current) => ({
									...current,
									confirm: event.target.value,
								}))
							}
							required
						/>
					</label>
					{localError ? <div className="finan-error">{localError}</div> : null}
					{message ? <div className="finan-success">{message}</div> : null}
					<button type="submit">Salvar nova senha</button>
				</form>
			</main>
		);
	}

	return (
		<main className="finan-login-page">
			<form className="finan-login-card" onSubmit={submit}>
				<div className="finan-login-icon">
					<LockKeyhole size={24} />
				</div>
				<h1>Entrar no Finan</h1>
				<p>Ambiente financeiro apartado com usuários e MFA próprios.</p>
				<label>
					E-mail
					<input
						type="email"
						value={form.email}
						onChange={(event) =>
							setForm((current) => ({ ...current, email: event.target.value }))
						}
						required
					/>
				</label>
				<label>
					Senha
					<input
						type="password"
						value={form.password}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								password: event.target.value,
							}))
						}
						required
					/>
				</label>
				{error || localError ? (
					<div className="finan-error">{error || localError}</div>
				) : null}
				{message ? <div className="finan-success">{message}</div> : null}
				<button type="submit" disabled={loading}>
					{loading ? "Entrando..." : "Entrar"}
				</button>
				<button
					type="button"
					className="finan-link-button"
					onClick={requestReset}
				>
					Esqueci minha senha
				</button>
			</form>
		</main>
	);
}
