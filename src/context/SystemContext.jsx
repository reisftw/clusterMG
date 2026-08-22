import { createContext, useContext } from "react";

const SystemContext = createContext({
  sistema: "retiradas",
  trocarSistema: () => {},
});

export const SystemProvider = ({ children }) => (
  <SystemContext.Provider
    value={{
      sistema: "retiradas",
      trocarSistema: () => {},
    }}
  >
    {children}
  </SystemContext.Provider>
);

export const useSystem = () => useContext(SystemContext);

