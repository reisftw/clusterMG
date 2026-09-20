import { useEffect, useMemo } from "react";
import { LayoutModeContext } from "./layoutModeContextObject";

const STORAGE_KEY = "dashboard-layout-mode";
const MODERN_LAYOUT = "modern";

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
