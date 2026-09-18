const DB_NAME = "rot-offline";
const DB_VERSION = 2;
const ROT_ACTION_STORE = "rotActionQueue";
const APR_STORE = "aprQueue";
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function openDb() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(APR_STORE)) {
				db.createObjectStore(APR_STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(ROT_ACTION_STORE)) {
				db.createObjectStore(ROT_ACTION_STORE, { keyPath: "id" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error("Não foi possível abrir a fila offline."));
	});
}

function tx(storeMode, action) {
	return openDb().then(
		(db) =>
			new Promise((resolve, reject) => {
				const transaction = db.transaction(ROT_ACTION_STORE, storeMode);
				const store = transaction.objectStore(ROT_ACTION_STORE);
				let value;
				transaction.oncomplete = () => {
					db.close();
					resolve(value);
				};
				transaction.onerror = () => {
					db.close();
					reject(transaction.error || new Error("Falha na fila offline."));
				};
				value = action(store);
			}),
	);
}

export function isNetworkFailure(error) {
	return !navigator.onLine || error?.name === "TypeError" || /fetch|network|internet|conex/i.test(error?.message || "");
}

export async function enqueueRotAction(type, payload, preview = {}) {
	const item = {
		id: `rot-action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		type,
		payload,
		preview,
		createdAt: new Date().toISOString(),
		attempts: 0,
		lastError: "",
	};
	await tx("readwrite", (store) => store.put(item));
	window.dispatchEvent(new CustomEvent("rot-offline-action-queue-changed"));
	return item;
}

export function listQueuedRotActions() {
	return pruneQueuedRotActions().then(() => tx("readonly", (store) => store.getAll()));
}

export function queuedRotActionCount() {
	return listQueuedRotActions().then((items) => items.length).catch(() => 0);
}

function removeQueuedRotAction(id) {
	return tx("readwrite", (store) => store.delete(id));
}

function pruneQueuedRotActions() {
	const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
	return tx("readwrite", (store) => {
		const request = store.getAll();
		request.onsuccess = () => {
			for (const item of request.result || []) {
				const createdAt = Date.parse(item.createdAt || "");
				if (!Number.isFinite(createdAt) || createdAt < cutoff) store.delete(item.id);
			}
		};
		return request;
	}).catch(() => null);
}

function updateQueuedRotAction(item) {
	return tx("readwrite", (store) => store.put(item));
}

export async function flushQueuedRotActions(handlers) {
	if (!navigator.onLine) return { sent: 0, pending: await queuedRotActionCount() };
	const queued = await listQueuedRotActions();
	let sent = 0;
	for (const item of queued) {
		try {
			if (item.type === "rompimento:create") {
				await handlers.createRompimento(item.payload);
			} else if (item.type === "rain:create") {
				await handlers.createRain(item.payload);
			} else {
				await removeQueuedRotAction(item.id);
				continue;
			}
			await removeQueuedRotAction(item.id);
			sent += 1;
		} catch (error) {
			await updateQueuedRotAction({
				...item,
				attempts: Number(item.attempts || 0) + 1,
				lastError: error?.message || "Falha ao sincronizar.",
			});
			break;
		}
	}
	window.dispatchEvent(new CustomEvent("rot-offline-action-queue-changed"));
	if (sent) window.dispatchEvent(new CustomEvent("rot-offline-action-synced", { detail: { sent } }));
	return { sent, pending: await queuedRotActionCount() };
}
