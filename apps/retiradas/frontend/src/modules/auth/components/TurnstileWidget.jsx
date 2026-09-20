import { useEffect, useRef, useState } from "react";

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_SRC =
	"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstileScript() {
	if (typeof window === "undefined") return Promise.resolve(null);
	if (window.turnstile) return Promise.resolve(window.turnstile);

	return new Promise((resolve, reject) => {
		let script = document.getElementById(SCRIPT_ID);
		if (!script) {
			script = document.createElement("script");
			script.id = SCRIPT_ID;
			script.src = SCRIPT_SRC;
			script.async = true;
			script.defer = true;
			document.head.appendChild(script);
		}
		script.addEventListener("load", () => resolve(window.turnstile), {
			once: true,
		});
		script.addEventListener(
			"error",
			() => reject(new Error("Falha ao carregar a verificação anti-bot.")),
			{ once: true },
		);
	});
}

export default function TurnstileWidget({
	config,
	onTokenChange,
	resetKey = 0,
}) {
	const containerRef = useRef(null);
	const widgetIdRef = useRef(null);
	const [error, setError] = useState("");
	const enabled = Boolean(config?.enabled && config?.siteKey);

	useEffect(() => {
		if (!enabled) {
			onTokenChange?.("");
			return undefined;
		}

		let cancelled = false;
		onTokenChange?.("");

		loadTurnstileScript()
			.then((turnstile) => {
				if (cancelled || !turnstile || !containerRef.current) return;
				if (widgetIdRef.current) {
					turnstile.remove(widgetIdRef.current);
					widgetIdRef.current = null;
				}
				widgetIdRef.current = turnstile.render(containerRef.current, {
					sitekey: config.siteKey,
					callback: (token) => onTokenChange?.(token || ""),
					"expired-callback": () => onTokenChange?.(""),
					"error-callback": () => {
						onTokenChange?.("");
						setError("Nao foi possivel validar a verificacao anti-bot.");
					},
				});
			})
			.catch((loadError) => {
				if (!cancelled)
					setError(
						loadError?.message || "Falha ao carregar a verificacao anti-bot.",
					);
			});

		return () => {
			cancelled = true;
			if (window.turnstile && widgetIdRef.current) {
				window.turnstile.remove(widgetIdRef.current);
				widgetIdRef.current = null;
			}
		};
	}, [config?.siteKey, enabled, onTokenChange, resetKey]);

	if (!enabled) return null;

	return (
		<div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
			<div ref={containerRef} className="min-h-[65px]" />
			{error ? (
				<p className="mt-2 text-xs font-bold text-red-600">{error}</p>
			) : null}
		</div>
	);
}
