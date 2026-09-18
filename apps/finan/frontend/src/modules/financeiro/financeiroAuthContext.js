import { createContext, useContext } from "react";

// Context local pro modulo financeiro (portado de src/context/AuthContext.jsx
// do Retiradas em 2026-09-07 pra separar o Finan de verdade — ver
// apps/finan/frontend/src/components/FinanFinanceiroPage.jsx, que provê o
// value via <AuthContext.Provider> traduzindo o usuario do Finan pro
// formato que FinanceiroPage.jsx espera). Mesmo formato do original: um
// Context simples, sem provider proprio aqui.
export const AuthContext = createContext(null);

export const useAuthContext = () => {
	const context = useContext(AuthContext);
	if (!context)
		throw new Error("useAuthContext must be used within AuthContext.Provider");
	return context;
};
