import { useEffect, useState } from "react";
import {
	fetchRotMe,
	loginRot,
	loginRotGoogle,
	logoutRot,
	verifyRotMfa,
} from "../api/rotApi";
import { clearRotOfflineStorage } from "../utils/offlineStorage";
import { RotAuthContext } from "./rotAuthContextObject";

const CACHED_USER_KEY = "rot-auth-user";

function cacheUser(profile) {
	if (profile) window.localStorage.setItem(CACHED_USER_KEY, JSON.stringify(profile));
	else window.localStorage.removeItem(CACHED_USER_KEY);
}

function getCachedUser() {
	try {
		return JSON.parse(window.localStorage.getItem(CACHED_USER_KEY) || "null");
	} catch {
		return null;
	}
}

export function RotAuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		const cached = getCachedUser();
		if (cached) setUser(cached);
		fetchRotMe()
			.then((profile) => {
				if (active) {
					cacheUser(profile);
					setUser(profile);
				}
			})
			.catch(() => {
				if (!active) return;
				if (!navigator.onLine && cached) {
					setUser(cached);
					return;
				}
				cacheUser(null);
				setUser(null);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	// Login local pode voltar direto com usuário (sem MFA habilitado) ou com
	// um desafio MFA por e-mail — nesse segundo caso, quem chamou (a tela de
	// login) precisa mostrar o campo de código e chamar verifyMfa em seguida.
	const login = async (username, password) => {
		setError("");
		setLoading(true);
		try {
			const result = await loginRot(username, password);
			if (result.mfaRequired) return result;
			cacheUser(result.user);
			setUser(result.user);
			return result;
		} catch (err) {
			setError(err?.message || "Não foi possível entrar na Operação.");
			throw err;
		} finally {
			setLoading(false);
		}
	};

	const loginGoogle = async (idToken) => {
		setError("");
		setLoading(true);
		try {
			const result = await loginRotGoogle(idToken);
			if (result.mfaRequired) return result;
			cacheUser(result.user);
			setUser(result.user);
			return result;
		} catch (err) {
			setError(err?.message || "Não foi possível entrar com Google.");
			throw err;
		} finally {
			setLoading(false);
		}
	};

	const verifyMfa = async (challengeId, code) => {
		setError("");
		setLoading(true);
		try {
			const profile = await verifyRotMfa(challengeId, code);
			cacheUser(profile);
			setUser(profile);
			return profile;
		} catch (err) {
			setError(err?.message || "Código inválido.");
			throw err;
		} finally {
			setLoading(false);
		}
	};

	const logout = async () => {
		await logoutRot();
		await clearRotOfflineStorage().catch(() => null);
		cacheUser(null);
		setUser(null);
	};

	// Disparado por requestRotApi (rotApi.js) quando qualquer chamada volta
	// 401 com token invalido/expirado — sem isso o usuario ficava numa tela
	// aparentemente travada (nada respondia, so erros 401 silenciosos por
	// baixo) ate dar F5 na mao. Derruba a sessao na hora; PrivateRoute
	// reage sozinho (user vira null) e manda pro login.
	useEffect(() => {
		const onSessionExpired = () => {
			clearRotOfflineStorage().catch(() => null);
			setUser(null);
			setError("Sua sessão expirou. Faça login novamente.");
		};
		window.addEventListener("rot-session-expired", onSessionExpired);
		return () => window.removeEventListener("rot-session-expired", onSessionExpired);
	}, []);

	const refreshUser = async () => {
		const profile = await fetchRotMe();
		cacheUser(profile);
		setUser(profile);
		return profile;
	};

	const hasPermission = (permission) => {
		if (!user) return false;
		if (user.isAdmin || user.permissions?.includes("*")) return true;
		return user.permissions?.includes(permission) ?? false;
	};

	return (
		<RotAuthContext.Provider
			value={{ user, loading, error, login, loginGoogle, verifyMfa, logout, refreshUser, hasPermission }}
		>
			{children}
		</RotAuthContext.Provider>
	);
}
