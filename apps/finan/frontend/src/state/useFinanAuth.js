// Extraído de FinanAuthContext.jsx (react-refresh/only-export-components
// não permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { FinanAuthContext } from "./finanAuthContextObject";

export function useFinanAuth() {
	const context = useContext(FinanAuthContext);
	if (!context) throw new Error("useFinanAuth deve ser usado no FinanAuthProvider.");
	return context;
}
