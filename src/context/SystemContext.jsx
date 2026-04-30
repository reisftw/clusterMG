import { createContext, useContext, useState, useEffect } from "react";

const SystemContext = createContext(null);

export const SystemProvider = ({ children }) => {
  const [sistema, setSistema] = useState(
    () => localStorage.getItem("sistema_ativo") ?? "retiradas",
  );

  const trocarSistema = (novo) => {
    setSistema(novo);
    localStorage.setItem("sistema_ativo", novo);
  };

  return (
    <SystemContext.Provider value={{ sistema, trocarSistema }}>
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => useContext(SystemContext);
