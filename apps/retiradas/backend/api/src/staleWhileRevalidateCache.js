function startRefresh(cache, load) {
	if (cache.pending) return cache.pending;
	const pending = Promise.resolve()
		.then(load)
		.then((data) => {
			cache.data = data;
			cache.cachedAt = Date.now();
			return data;
		})
		.finally(() => {
			if (cache.pending === pending) cache.pending = null;
		});
	cache.pending = pending;
	return pending;
}

async function readStaleWhileRevalidate(
	cache,
	load,
	ttlMs,
	{ backgroundRefresh = true } = {},
) {
	if (!(ttlMs > 0)) {
		return { data: await load(), cacheStatus: "BYPASS", cacheAgeMs: 0 };
	}

	const cacheAgeMs = Date.now() - Number(cache.cachedAt || 0);
	if (cache.data && cacheAgeMs < ttlMs) {
		return { data: cache.data, cacheStatus: "HIT", cacheAgeMs };
	}

	if (cache.data) {
		const alreadyRefreshing = Boolean(cache.pending);
		if (!backgroundRefresh) {
			try {
				const data = await startRefresh(cache, load);
				return {
					data,
					cacheStatus: alreadyRefreshing ? "JOIN" : "REFRESH",
					cacheAgeMs: 0,
				};
			} catch {
				return {
					data: cache.data,
					cacheStatus: "STALE",
					cacheAgeMs,
				};
			}
		}
		startRefresh(cache, load).catch(() => {});
		return {
			data: cache.data,
			cacheStatus: alreadyRefreshing ? "STALE_JOIN" : "STALE_REFRESH",
			cacheAgeMs,
		};
	}

	const alreadyRefreshing = Boolean(cache.pending);
	try {
		const data = await startRefresh(cache, load);
		return {
			data,
			cacheStatus: alreadyRefreshing ? "JOIN" : "MISS",
			cacheAgeMs: 0,
		};
	} catch (error) {
		if (!cache.data) throw error;
		return {
			data: cache.data,
			cacheStatus: "STALE",
			cacheAgeMs: Date.now() - Number(cache.cachedAt || 0),
		};
	}
}

module.exports = { readStaleWhileRevalidate };
