const clients = new Set();

function writeEvent(res, event, payload) {
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
}

function attachRealtimeClient(req, res) {
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache, no-transform");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no");
	res.flushHeaders?.();

	const client = { req, res, heartbeat: null };
	clients.add(client);
	writeEvent(res, "connected", {
		ok: true,
		connectedAt: new Date().toISOString(),
	});

	const heartbeat = setInterval(() => {
		try {
			writeEvent(res, "ping", { now: new Date().toISOString() });
		} catch {
			clients.delete(client);
			clearInterval(heartbeat);
		}
	}, 25000);
	client.heartbeat = heartbeat;

	req.on("close", () => {
		clients.delete(client);
		clearInterval(heartbeat);
	});
}

function broadcastRealtime(topic, payload = {}) {
	const message = {
		topic,
		...payload,
		emittedAt: new Date().toISOString(),
	};

	for (const client of clients) {
		try {
			writeEvent(client.res, "retiradas-update", message);
		} catch {
			clients.delete(client);
		}
	}
}

function closeRealtimeClients() {
	for (const client of clients) {
		try {
			if (client.heartbeat) clearInterval(client.heartbeat);
			client.res.end();
		} catch {
			// Ignora conexoes ja encerradas.
		}
		clients.delete(client);
	}
}

module.exports = {
	attachRealtimeClient,
	broadcastRealtime,
	closeRealtimeClients,
};
