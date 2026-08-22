import { createContext, useContext, useEffect, useMemo } from "react";

const STORAGE_KEY = "dashboard-layout-mode";
const MODERN_LAYOUT = "modern";

const LayoutModeContext = createContext(null);

export const LayoutModeProvider = ({ children }) => {
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, MODERN_LAYOUT);
    document.documentElement.dataset.layoutMode = MODERN_LAYOUT;
  }, []);

  const value = useMemo(
    () => ({
      layoutMode: MODERN_LAYOUT,
      isModernLayout: true,
      setLayoutMode: () => {},
      toggleLayoutMode: () => {},
    }),
    [],
  );

  return (
    <LayoutModeContext.Provider value={value}>
      {children}
    </LayoutModeContext.Provider>
  );
};

export const useLayoutMode = () => {
  const context = useContext(LayoutModeContext);
  if (!context) {
    throw new Error("useLayoutMode must be used within LayoutModeProvider");
  }
  return context;
};
