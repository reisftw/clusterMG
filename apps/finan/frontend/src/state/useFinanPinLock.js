// Extraído de FinanPinLockContext.jsx (react-refresh/only-export-components
// não permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { FinanPinLockContext } from "./finanPinLockContextObject";

export function useFinanPinLock() {
	const context = useContext(FinanPinLockContext);
	if (!context) {
		throw new Error("useFinanPinLock deve ser usado no FinanPinLockProvider.");
	}
	return context;
}
