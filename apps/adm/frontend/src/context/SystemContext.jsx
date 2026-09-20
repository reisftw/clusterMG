import { SystemContext } from "./systemContextObject";

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
