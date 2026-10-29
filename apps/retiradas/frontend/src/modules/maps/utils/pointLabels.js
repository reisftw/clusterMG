export function formatMapClientLabel(item = {}) {
	const code = String(item.clientCode || "").trim();
	const name = String(item.clientName || item.orderNumber || "Retirada").trim();
	return code ? `(${code}) ${name}` : name;
}
