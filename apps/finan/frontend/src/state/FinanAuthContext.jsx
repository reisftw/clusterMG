import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchFinanMe, getFinanToken, loginFinan, logoutFinan } from "../api/finanApi";

const FinanAuthContext = createContext(null);

export function FinanAuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		if (!getFinanToken()) {
			setLoading(false);
			return () => {
				active = false;
			};
		}
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
			const profile = await loginFinan(email, password);
			setUser(profile);
		} catch (err) {
			setError(err?.message || "Não foi possível entrar no Finan.");
			throw err;
		} finally {
			setLoading(false);
		}
	};

	const logout = async () => {
		await logoutFinan();
		setUser(null);
	};

	const value = useMemo(
		() => ({ user, loading, error, login, logout }),
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
