function createAttemptTracker({
	ttlMs = 15 * 60 * 1000,
	maxEntries = 10000,
	now = () => Date.now(),
} = {}) {
	const entries = new Map();
	const safeTtlMs = Math.max(Number(ttlMs) || 0, 1000);
	const safeMaxEntries = Math.max(Number(maxEntries) || 0, 100);
	let lastPruneAt = 0;

	function prune(timestamp = now()) {
		if (timestamp - lastPruneAt < Math.min(safeTtlMs, 60 * 1000)) return;
		lastPruneAt = timestamp;
		for (const [key, entry] of entries) {
			if (entry.expiresAt <= timestamp) entries.delete(key);
		}
	}

	function get(key) {
		const timestamp = now();
		const entry = entries.get(key);
		if (!entry || entry.expiresAt <= timestamp) {
			entries.delete(key);
			return 0;
		}
		return entry.count;
	}

	function increment(key) {
		const timestamp = now();
		prune(timestamp);
		const count = get(key) + 1;
		entries.delete(key);
		while (entries.size >= safeMaxEntries) {
			entries.delete(entries.keys().next().value);
		}
		entries.set(key, { count, expiresAt: timestamp + safeTtlMs });
		return count;
	}

	return {
		delete: (key) => entries.delete(key),
		get,
		increment,
		size: () => entries.size,
	};
}

module.exports = { createAttemptTracker };
