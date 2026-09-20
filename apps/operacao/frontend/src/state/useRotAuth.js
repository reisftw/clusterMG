// Extraído de RotAuthContext.jsx (react-refresh/only-export-components não
// permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { RotAuthContext } from "./rotAuthContextObject";

export function useRotAuth() {
	const context = useContext(RotAuthContext);
	if (!context) throw new Error("useRotAuth must be used within a RotAuthProvider");
	return context;
}
