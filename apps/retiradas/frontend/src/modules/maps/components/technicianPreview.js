const STATUS_LABELS = {
	active: "Ao vivo",
	recent: "Sinal recente",
	stale: "Sem sinal recente",
	never: "Nunca localizado",
};

export function technicianPreviewContent(item) {
	const status = ["active", "recent", "stale"].includes(item?.status) ? item.status : "stale";
	const container = document.createElement("div");
	container.className = `maps-admin-technician-preview is-${status}`;
	const header = document.createElement("div");
	header.className = "maps-admin-technician-preview-head";
	const dot = document.createElement("span");
	dot.className = "maps-admin-technician-preview-dot";
	const name = document.createElement("strong");
	name.textContent = item.displayName || item.technicianName || "Tecnico";
	const statusLabel = document.createElement("small");
	statusLabel.textContent = STATUS_LABELS[status];
	header.append(dot, name, statusLabel);

	const identity = document.createElement("span");
	identity.className = "maps-admin-technician-preview-identity";
	const sameName = item.technicianName === item.displayName;
	identity.textContent = item.regional || (sameName ? "Tecnico de retiradas" : `HubSoft: ${item.technicianName || "nao associado"}`);

	const stats = document.createElement("div");
	stats.className = "maps-admin-technician-preview-stats";
	const statItems = [
		[Number(item.completedToday || 0), "hoje"],
		[Number(item.openOrders || 0), "abertas"],
		[Number(item.plannedStops || item.routeStops || 0), "na rota"],
	];
	for (const [value, label] of statItems) {
		const stat = document.createElement("span");
		const number = document.createElement("strong");
		const caption = document.createElement("small");
		number.textContent = String(value);
		caption.textContent = label;
		stat.append(number, caption);
		stats.append(stat);
	}

	const accuracy = document.createElement("small");
	accuracy.className = "maps-admin-technician-preview-accuracy";
	accuracy.textContent = `GPS ${Math.round(Number(item.accuracyMeters || 0))} m`;
	container.append(header, identity, stats, accuracy);
	return container;
}
