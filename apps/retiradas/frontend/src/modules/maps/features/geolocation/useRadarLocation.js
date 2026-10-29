import { useEffect, useRef, useState } from "react";

const STALE_AFTER_MS = 60_000;

export function useRadarLocation(enabled) {
	const [state, setState] = useState({
		status: "starting",
		position: null,
		error: "",
	});
	const lastUpdateRef = useRef(0);
	const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

	useEffect(() => {
		if (!enabled || !supported) return undefined;
		const watchId = navigator.geolocation.watchPosition(
			(position) => {
				lastUpdateRef.current = Date.now();
				const accuracy = Number(position.coords.accuracy || 0);
				setState({
					status: accuracy > 500 ? "imprecise" : "active",
					position: {
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
						accuracy,
						heading: position.coords.heading,
						speed: position.coords.speed,
						timestamp: position.timestamp,
					},
					error: "",
				});
			},
			(error) => {
				const denied = error.code === error.PERMISSION_DENIED;
				setState({
					status: denied ? "denied" : "unavailable",
					position: null,
					error: denied ? "Permissao de localizacao negada." : "Nao foi possivel atualizar a localizacao.",
				});
			},
			{ enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
		);
		const staleTimer = window.setInterval(() => {
			if (lastUpdateRef.current && Date.now() - lastUpdateRef.current > STALE_AFTER_MS) {
				setState((current) => ({ ...current, status: "stale" }));
			}
		}, 10_000);

		return () => {
			navigator.geolocation.clearWatch(watchId);
			window.clearInterval(staleTimer);
		};
	}, [enabled, supported]);

	if (!enabled) return { status: "disabled", position: null, error: "" };
	if (!supported) return { status: "unsupported", position: null, error: "GPS indisponivel neste dispositivo." };
	return state;
}

export const WEB_LOCATION_PROVIDER_LIMITATIONS = Object.freeze({
	background: "O Android pode suspender o PWA quando ele esta minimizado.",
	locked: "O navegador pode interromper o GPS com a tela bloqueada.",
	closed: "O Service Worker nao monitora GPS com o aplicativo fechado.",
});
