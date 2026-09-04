const compression = require("compression");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { requireFinanAuth } = require("./auth/middleware");
const authRoutes = require("./auth/routes");
const healthRoutes = require("./health/routes");
const integrationsRoutes = require("./integrations/routes");
const budgetRoutes = require("./orcamento/routes");
const settingsRoutes = require("./settings/routes");
const usersRoutes = require("./users/routes");

function createApp() {
	const app = express();

	app.disable("x-powered-by");
	app.use(helmet());
	app.use(compression());
	app.use(
		cors({
			origin: process.env.FINAN_CORS_ORIGIN || true,
			credentials: true,
		}),
	);
	app.use(express.json({ limit: "10mb" }));
	app.use(
		rateLimit({
			windowMs: 60 * 1000,
			limit: Number(process.env.FINAN_RATE_LIMIT_PER_MINUTE || 600),
			standardHeaders: true,
			legacyHeaders: false,
		}),
	);

	app.use("/api/finan/health", healthRoutes);
	app.use("/api/finan/auth", authRoutes);
	app.use(requireFinanAuth);
	app.use("/api/finan/orcamento", budgetRoutes);
	app.use("/api/finan/integracoes", integrationsRoutes);
	app.use("/api/finan/configuracoes", settingsRoutes);
	app.use("/api/finan/usuarios", usersRoutes);

	app.use((req, res) => {
		res.status(404).json({ ok: false, error: "Rota do Finan não encontrada." });
	});

	app.use((error, _req, res, _next) => {
		console.error("[finan-api]", error);
		res.status(error.status || 500).json({
			ok: false,
			error: error.message || "Erro interno do Finan.",
		});
	});

	return app;
}

module.exports = { createApp };
