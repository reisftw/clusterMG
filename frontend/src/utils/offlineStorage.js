const DB_NAME = "rot-offline";

export function clearRotOfflineStorage() {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = () => resolve(true);
		request.onerror = () => resolve(false);
		request.onblocked = () => resolve(false);
	});
}
