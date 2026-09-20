import { useEffect, useState } from "react";
import { obterConfigAntiBot } from "../services/authService";

const DEFAULT_ANTI_BOT_CONFIG = {
	enabled: false,
	provider: "turnstile",
	siteKey: "",
};

export function useAntiBotChallenge() {
	const [antiBotConfig, setAntiBotConfig] = useState(DEFAULT_ANTI_BOT_CONFIG);
	const [turnstileToken, setTurnstileToken] = useState("");
	const [turnstileResetKey, setTurnstileResetKey] = useState(0);

	useEffect(() => {
		let active = true;
		obterConfigAntiBot()
			.then((config) => {
				if (active) setAntiBotConfig(config || DEFAULT_ANTI_BOT_CONFIG);
			})
			.catch(() => {
				if (active) setAntiBotConfig(DEFAULT_ANTI_BOT_CONFIG);
			});
		return () => {
			active = false;
		};
	}, []);

	const resetAntiBot = () => {
		if (!antiBotConfig.enabled) return;
		setTurnstileToken("");
		setTurnstileResetKey((current) => current + 1);
	};

	return {
		antiBotConfig,
		turnstileToken,
		turnstileResetKey,
		setTurnstileToken,
		resetAntiBot,
	};
}
