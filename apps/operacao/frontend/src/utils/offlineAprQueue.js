const DB_NAME = "rot-offline";
const DB_VERSION = 2;
const APR_STORE = "aprQueue";
const ROT_ACTION_STORE = "rotActionQueue";
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
				const transaction = db.transaction(APR_STORE, storeMode);
				const store = transaction.objectStore(APR_STORE);
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

export async function enqueueAprOffline(payload, photos = []) {
	const item = {
		id: `apr-offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		payload,
		photos: photos.map((photo) => ({
			name: photo.name,
			type: photo.type,
			lastModified: photo.lastModified,
			blob: photo,
		})),
		createdAt: new Date().toISOString(),
		attempts: 0,
		lastError: "",
	};
	await tx("readwrite", (store) => store.put(item));
	window.dispatchEvent(new CustomEvent("rot-apr-offline-queue-changed"));
	return item;
}

export function listQueuedAprs() {
	return pruneQueuedAprs().then(() => tx("readonly", (store) => store.getAll()));
}

export function queuedAprCount() {
	return listQueuedAprs().then((items) => items.length).catch(() => 0);
}

function removeQueuedApr(id) {
	return tx("readwrite", (store) => store.delete(id));
}

function pruneQueuedAprs() {
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

function updateQueuedApr(item) {
	return tx("readwrite", (store) => store.put(item));
}

export async function flushQueuedAprs(sendApr) {
	if (!navigator.onLine) return { sent: 0, pending: await queuedAprCount() };
	const queued = await listQueuedAprs();
	let sent = 0;
	for (const item of queued) {
		try {
			const photos = item.photos.map(
				(photo) => new File([photo.blob], photo.name || "apr-foto.png", {
					type: photo.type || photo.blob?.type || "image/png",
					lastModified: photo.lastModified || Date.now(),
				}),
			);
			await sendApr(item.payload, photos);
			await removeQueuedApr(item.id);
			sent += 1;
		} catch (error) {
			await updateQueuedApr({
				...item,
				attempts: Number(item.attempts || 0) + 1,
				lastError: error?.message || "Falha ao sincronizar.",
			});
			break;
		}
	}
	window.dispatchEvent(new CustomEvent("rot-apr-offline-queue-changed"));
	return { sent, pending: await queuedAprCount() };
}

export function isNetworkFailure(error) {
	return !navigator.onLine || error?.name === "TypeError" || /fetch|network|internet|conex/i.test(error?.message || "");
}
