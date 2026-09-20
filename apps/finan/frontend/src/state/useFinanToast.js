// Extraído de FinanToastContext.jsx (react-refresh/only-export-components
// não permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { FinanToastContext } from "./finanToastContextObject";

export function useFinanToast() {
	const context = useContext(FinanToastContext);
	if (!context) {
		// Fallback seguro fora do provider (ex.: em testes isolados) — nunca
		// deve quebrar a tela por causa de um aviso.
		return { success() {}, error() {}, info() {}, dismiss() {} };
	}
	return context;
}
