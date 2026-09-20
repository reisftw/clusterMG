// Objeto de contexto puro, sem componente nem hook — compartilhado entre
// AuthContext.jsx (Provider) e useAuthContext.js (hook), pra nenhum dos
// dois arquivos misturar exports de componente com exports não-componente
// (react-refresh/only-export-components).
import { createContext } from "react";

export const AuthContext = createContext(null);
