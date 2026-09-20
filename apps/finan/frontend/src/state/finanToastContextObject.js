// Objeto de contexto puro, sem componente nem hook — compartilhado entre
// FinanToastContext.jsx (Provider) e useFinanToast.js (hook), pra nenhum
// dos dois arquivos misturar exports de componente com exports não-
// componente (react-refresh/only-export-components).
import { createContext } from "react";

export const FinanToastContext = createContext(null);
