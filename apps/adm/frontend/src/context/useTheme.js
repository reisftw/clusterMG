// Extraído de ThemeContext.jsx (react-refresh/only-export-components não
// permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { ThemeContext } from "./themeContextObject";

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used within ThemeProvider");
	return context;
};
