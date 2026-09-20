// Objeto de contexto puro, sem componente nem hook — compartilhado entre
// SystemContext.jsx (Provider) e useSystem.js (hook), pra nenhum dos dois
// arquivos misturar exports de componente com exports não-componente
// (react-refresh/only-export-components).
import { createContext } from "react";

export const SystemContext = createContext({
	sistema: "retiradas",
	trocarSistema: () => {},
});
