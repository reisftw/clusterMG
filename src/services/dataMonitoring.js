const globalMetrics = globalThis.__dataMetrics ?? {
  totalReads: 0,
  totalEvents: 0,
  bySource: {},
  byOperation: {},
  byPath: {},
  events: [],
};

globalThis.__dataMetrics = globalMetrics;

function sortEntriesDescending(record = {}) {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

function buildSummary() {
  return {
    totalReads: globalMetrics.totalReads,
    totalEvents: globalMetrics.totalEvents,
    bySource: sortEntriesDescending(globalMetrics.bySource),
    byOperation: sortEntriesDescending(globalMetrics.byOperation),
    byPath: sortEntriesDescending(globalMetrics.byPath),
    recentEvents: [...globalMetrics.events].slice(-20).reverse(),
  };
}

export function resetDataMetrics() {
  globalMetrics.totalReads = 0;
  globalMetrics.totalEvents = 0;
  globalMetrics.bySource = {};
  globalMetrics.byOperation = {};
  globalMetrics.byPath = {};
  globalMetrics.events = [];
  return buildSummary();
}

export function getDataMetricsSummary() {
  return buildSummary();
}

export function printDataMetricsSummary() {
  const summary = buildSummary();

  if (typeof console !== "undefined") {
    console.groupCollapsed(
      `[DATA] summary | reads=${summary.totalReads} | events=${summary.totalEvents}`,
    );

    if (summary.bySource.length) {
      console.table(
        summary.bySource.map(([source, reads]) => ({ source, reads })),
      );
    }

    if (summary.byPath.length) {
      console.table(
        summary.byPath.map(([path, reads]) => ({ path, reads })),
      );
    }

    console.groupEnd();
  }

  return summary;
}

globalThis.__getDataMetricsSummary = getDataMetricsSummary;
globalThis.__printDataMetricsSummary = printDataMetricsSummary;
globalThis.__resetDataMetrics = resetDataMetrics;

export function logDataRead({
  source,
  operation = "read",
  type,
  path = "unknown",
  count = 0,
  cacheHit = false,
  details = "",
}) {
  const normalizedOperation = type || operation;
  const normalizedPath = path || "unknown";
  const counterId = `${source}::${normalizedOperation}::${normalizedPath}`;

  globalMetrics.totalEvents += 1;

  if (!cacheHit && count > 0) {
    globalMetrics.totalReads += count;
    globalMetrics.bySource[source] =
      (globalMetrics.bySource[source] || 0) + count;
    globalMetrics.byOperation[normalizedOperation] =
      (globalMetrics.byOperation[normalizedOperation] || 0) + count;
    globalMetrics.byPath[normalizedPath] =
      (globalMetrics.byPath[normalizedPath] || 0) + count;
  }

  globalMetrics.events.push({
    at: new Date().toISOString(),
    source,
    operation: normalizedOperation,
    path: normalizedPath,
    count,
    cacheHit,
    details,
  });

  if (globalMetrics.events.length > 300) {
    globalMetrics.events = globalMetrics.events.slice(-300);
  }

  if (!import.meta.env.DEV) return;

  const prefix = cacheHit ? "CACHE" : "DATA";
  const suffix = details ? ` | ${details}` : "";

  if (typeof console !== "undefined" && typeof console.count === "function") {
    console.count(`[QUERY] ${counterId}`);
  }

  console.info(
    `[${prefix}] ${source} | op=${normalizedOperation} | path=${normalizedPath} | docs=${count} | total=${globalMetrics.totalReads}${suffix}`,
  );
}


