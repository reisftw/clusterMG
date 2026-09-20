import { useEffect, useState } from "react";
import { ThemeContext } from "./themeContextObject";

export const ThemeProvider = ({ children }) => {
	const [isDark, setIsDark] = useState(
		() => localStorage.getItem("theme") === "dark",
	);

	useEffect(() => {
		const root = document.documentElement;
		isDark ? root.classList.add("dark") : root.classList.remove("dark");
		localStorage.setItem("theme", isDark ? "dark" : "light");
	}, [isDark]);

	const toggleTheme = () => setIsDark((prev) => !prev);

	return (
		<ThemeContext.Provider value={{ isDark, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
};
