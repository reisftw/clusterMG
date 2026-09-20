// Extraído de SystemContext.jsx (react-refresh/only-export-components não
// permite misturar o hook com o componente Provider no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { useContext } from "react";
import { SystemContext } from "./systemContextObject";

export const useSystem = () => useContext(SystemContext);
