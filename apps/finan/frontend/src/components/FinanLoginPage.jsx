import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";

export default function FinanLoginPage() {
	const navigate = useNavigate();
	const { login, error, loading } = useFinanAuth();
	const [form, setForm] = useState({ email: "", password: "" });

	const submit = async (event) => {
		event.preventDefault();
		await login(form);
		navigate(FINAN_ROUTES.DASHBOARD, { replace: true });
	};

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
				{error ? <div className="finan-error">{error}</div> : null}
				<button type="submit" disabled={loading}>
					{loading ? "Entrando..." : "Entrar"}
				</button>
			</form>
		</main>
	);
}
