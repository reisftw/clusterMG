import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
	fetchFinanMe,
	loginFinan,
	logoutFinan,
	verifyFinanEmailMfa,
} from "../api/finanApi";

const FinanAuthContext = createContext(null);

export function FinanAuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// SEC-004: o cookie de sessao e HttpOnly, entao o frontend nao tem como
	// saber se existe sessao sem perguntar pro backend — sempre chama /me
	// no boot e trata 401 (sem cookie ou expirado) como "deslogado".
	useEffect(() => {
		let active = true;
		fetchFinanMe()
			.then((profile) => {
				if (active) setUser(profile);
			})
			.catch(() => {
				if (active) setUser(null);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const login = async ({ email, password }) => {
		setError("");
		setLoading(true);
		try {
			const result = await loginFinan(email, password);
			if (result?.mfaRequired) return result;
			setUser(result.user);
			return result;
		} catch (err) {
			setError(err?.message || "Não foi possível entrar no Finan.");
			throw err;
		} finally {
			setLoading(false);
		}
	};

	const verifyEmailMfa = async ({ challengeId, code }) => {
		setError("");
		setLoading(true);
		try {
			const result = await verifyFinanEmailMfa(challengeId, code);
			setUser(result.user);
			return result;
		} catch (err) {
			setError(err?.message || "Não foi possível validar o MFA.");
			throw err;
		} finally {
			setLoading(false);
		}
	};

	const logout = async () => {
		await logoutFinan();
		setUser(null);
	};

	// Reconsulta /auth/me e atualiza o usuario em memoria — usado depois de
	// trocar o proprio avatar/senha, por exemplo, sem precisar de F5.
	const refresh = async () => {
		try {
			const profile = await fetchFinanMe();
			setUser(profile);
			return profile;
		} catch {
			return null;
		}
	};

	const value = useMemo(
		() => ({ user, loading, error, login, verifyEmailMfa, logout, refresh }),
		[user, loading, error],
	);

	return (
		<FinanAuthContext.Provider value={value}>
			{children}
		</FinanAuthContext.Provider>
	);
}

export function useFinanAuth() {
	const context = useContext(FinanAuthContext);
	if (!context) throw new Error("useFinanAuth deve ser usado no FinanAuthProvider.");
	return context;
}
