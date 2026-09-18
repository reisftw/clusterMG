// Expoe metricas em formato Prometheus (texto, /metrics) pro Grafana via
// Prometheus scrape — separado do painel tecnico interno (metricsCollector.js,
// que persiste em Postgres pro overview autenticado do proprio Finan). Este
// endpoint NAO tem autenticacao (Prometheus nao manda header de sessao do
// Finan) e por isso NUNCA deve ganhar location publica no nginx — so e
// alcancavel via 127.0.0.1:<porta interna>, o mesmo endereco que o
// Prometheus da VPS ja usa pra fazer scrape (ver /etc/prometheus/prometheus.yml
// na VPS, job "finan-api").
const client = require("prom-client");

const register = new client.Registry();
register.setDefaultLabels({ app: "finan-api" });
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
	name: "http_request_duration_seconds",
	help: "Duracao das requisicoes HTTP do Finan, em segundos",
	labelNames: ["method", "route", "status_code"],
	buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
	registers: [register],
});

const httpRequestsTotal = new client.Counter({
	name: "http_requests_total",
	help: "Total de requisicoes HTTP do Finan",
	labelNames: ["method", "route", "status_code"],
	registers: [register],
});

function normalizeRoute(req) {
	if (req.baseUrl && req.route?.path) {
		const path = req.route.path === "/" ? "" : req.route.path;
		return `${req.baseUrl}${path}` || "/";
	}
	return req.originalUrl?.split("?")[0] || req.path || "unknown";
}

// Middleware leve — so mede e roda em toda requisicao (equivalente ao
// requestTimingLogger que ja existe, mas em formato que o Prometheus
// entende). Colocar ANTES de requireFinanAuth em app.js, senao a rota
// /metrics fica atras do login e o Prometheus nunca consegue rasgar.
function prometheusMiddleware(req, res, next) {
	if (req.path === "/metrics") {
		next();
		return;
	}
	const endTimer = httpRequestDuration.startTimer();
	res.on("finish", () => {
		const labels = {
			method: req.method,
			route: normalizeRoute(req),
			status_code: res.statusCode,
		};
		endTimer(labels);
		httpRequestsTotal.inc(labels);
	});
	next();
}

async function metricsRoute(_req, res) {
	res.set("Content-Type", register.contentType);
	res.end(await register.metrics());
}

module.exports = { register, prometheusMiddleware, metricsRoute };
