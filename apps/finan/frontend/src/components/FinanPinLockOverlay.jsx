import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import FinanPinDigitsInput from "./FinanPinDigitsInput";
import { useFinanPinLock } from "../state/FinanPinLockContext";
import { FINAN_ROUTES } from "../routes";

const overlayStyle = {
	position: "fixed",
	inset: 0,
	zIndex: 9999,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	background: "#07152f",
	color: "#f8fafc",
};

export default function FinanPinLockOverlay() {
	const { verifyPin } = useFinanPinLock();
	const navigate = useNavigate();
	const [pin, setPin] = useState("");
	const [error, setError] = useState("");
	const [attemptsRemaining, setAttemptsRemaining] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const [blocked, setBlocked] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		if (!/^\d{6}$/.test(pin)) {
			setError("Informe os 6 dígitos do PIN.");
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			const result = await verifyPin(pin);
			if (result.ok) return;
			setPin("");
			if (result.locked) {
				setBlocked(true);
				setError(result.message || "Conta bloqueada por tentativas de PIN inválidas.");
				return;
			}
			setError(result.message || "PIN inválido.");
			setAttemptsRemaining(
				typeof result.attemptsRemaining === "number" ? result.attemptsRemaining : null,
			);
		} finally {
			setSubmitting(false);
		}
	};

	if (blocked) {
		return (
			<div style={overlayStyle} role="alertdialog" aria-modal="true">
				<div style={{ maxWidth: 380, textAlign: "center", padding: 24 }}>
					<Lock size={40} style={{ marginBottom: 16 }} />
					<h2 style={{ marginBottom: 12 }}>Conta bloqueada</h2>
					<p style={{ marginBottom: 20, color: "#94a3b8" }}>{error}</p>
					<button
						type="button"
						onClick={() => navigate(FINAN_ROUTES.PIN_RECOVERY)}
						style={{
							borderRadius: 14,
							background: "linear-gradient(90deg,#ff9700,#ff5000)",
							padding: "14px 22px",
							color: "#fff",
							border: "none",
							fontWeight: 800,
							cursor: "pointer",
						}}
					>
						Recuperar acesso
					</button>
				</div>
			</div>
		);
	}

	return (
		<div style={overlayStyle} role="alertdialog" aria-modal="true" aria-label="Digite o PIN do Finan">
			<form
				onSubmit={submit}
				style={{
					maxWidth: 340,
					width: "100%",
					padding: 24,
					textAlign: "center",
				}}
			>
				<Lock size={40} style={{ marginBottom: 16 }} />
				<h2 style={{ marginBottom: 8 }}>Finan bloqueado</h2>
				<p style={{ marginBottom: 20, color: "#94a3b8" }}>
					Digite seu PIN de 6 dígitos para continuar.
				</p>
				<div style={{ marginBottom: 12 }}>
					<FinanPinDigitsInput
						autoFocus
						variant="dark"
						value={pin}
						onChange={setPin}
						label="PIN de bloqueio"
					/>
				</div>
				{error ? <p style={{ color: "#fca5a5", marginBottom: 12 }}>{error}</p> : null}
				{attemptsRemaining !== null ? (
					<p style={{ color: "#fbbf24", marginBottom: 12 }}>
						{attemptsRemaining} tentativa(s) restante(s) antes do bloqueio.
					</p>
				) : null}
				<button
					type="submit"
					disabled={submitting}
					style={{
						width: "100%",
						borderRadius: 14,
						background: "linear-gradient(90deg,#ff9700,#ff5000)",
						padding: "14px 22px",
						color: "#fff",
						border: "none",
						fontWeight: 800,
						cursor: submitting ? "default" : "pointer",
						opacity: submitting ? 0.7 : 1,
					}}
				>
					{submitting ? "Verificando..." : "Desbloquear"}
				</button>
			</form>
		</div>
	);
}
