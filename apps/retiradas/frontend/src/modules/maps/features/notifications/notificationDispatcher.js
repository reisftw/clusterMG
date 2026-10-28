const TITLES = {
	assigned: "Voce esta proximo de uma retirada!",
	opportunity: "Oportunidade de retirada proxima!",
	multiple: "Existem varias retiradas proximas!",
};

export async function requestMapsNotificationPermission() {
	if (!("Notification" in window)) return "unsupported";
	if (Notification.permission !== "default") return Notification.permission;
	return Notification.requestPermission();
}

export function dispatchRadarNotification(alert, onOpen) {
	if (!("Notification" in window) || Notification.permission !== "granted") return false;
	const distance = Number(alert.distanceMeters || 0);
	const body = alert.category === "multiple"
		? `Encontramos ${alert.groupedCount} retiradas elegiveis nesta regiao.`
		: `Uma retirada esta a aproximadamente ${distance} metros de voce.`;
	const notification = new Notification(TITLES[alert.category] || "Radar de Retiradas", {
		body,
		icon: "/pwa-192x192.png",
		tag: `maps-radar-${alert.id}`,
		renotify: false,
	});
	notification.onclick = () => {
		window.focus();
		onOpen?.(alert);
		notification.close();
	};
	if (navigator.vibrate) navigator.vibrate([120, 70, 120]);
	return true;
}
