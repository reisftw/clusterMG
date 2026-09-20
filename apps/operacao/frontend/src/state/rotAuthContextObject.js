// Objeto de contexto puro, sem componente nem hook — compartilhado entre
// RotAuthContext.jsx (Provider) e useRotAuth.js (hook), pra nenhum dos
// dois arquivos misturar exports de componente com exports não-componente
// (react-refresh/only-export-components).
import { createContext } from "react";

export const RotAuthContext = createContext(null);
