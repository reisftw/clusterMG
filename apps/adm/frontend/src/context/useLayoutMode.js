// Extraído de LayoutModeContext.jsx (react-refresh/only-export-components
// não permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { LayoutModeContext } from "./layoutModeContextObject";

export const useLayoutMode = () => {
	const context = useContext(LayoutModeContext);
	if (!context) {
		throw new Error("useLayoutMode must be used within LayoutModeProvider");
	}
	return context;
};
