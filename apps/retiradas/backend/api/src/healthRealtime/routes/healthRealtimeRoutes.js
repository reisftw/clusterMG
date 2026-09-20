const express = require("express");
const {
	createHealthRealtimeController,
} = require("../controllers/healthRealtimeController");

function createHealthRealtimeRouter({
	db,
	attachRealtimeClient,
	realtimeLimiter,
}) {
	const router = express.Router();
	const controller = createHealthRealtimeController({
		db,
		attachRealtimeClient,
	});

	router.get("/health", controller.health);
	router.get("/events", realtimeLimiter, controller.events);

	return router;
}

module.exports = createHealthRealtimeRouter;
