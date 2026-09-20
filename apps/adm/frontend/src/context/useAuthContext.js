// Extraído de AuthContext.jsx (react-refresh/only-export-components não
// permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { AuthContext } from "./authContextObject";

export const useAuthContext = () => {
	const context = useContext(AuthContext);
	if (!context)
		throw new Error("useAuthContext must be used within AuthProvider");
	return context;
};
