const express = require("express");
const {
	createHealthRealtimeController,
} = require("../controllers/healthRealtimeController");

function createHealthRealtimeRouter({
	db,
	attachRealtimeClient,
	requireAuthenticated,
	realtimeLimiter,
}) {
	const router = express.Router();
	const controller = createHealthRealtimeController({
		db,
		attachRealtimeClient,
	});

	router.get("/health", controller.health);
	router.get("/events", realtimeLimiter, (req, res, next) => {
		if (String(req.query?.public || "") === "1") {
			controller.publicEvents(req, res);
			return;
		}
		requireAuthenticated(req, res, () => controller.events(req, res, next));
	});

	return router;
}

module.exports = createHealthRealtimeRouter;
