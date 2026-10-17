function createHealthRealtimeController({ db, attachRealtimeClient }) {
	async function health(req, res, next) {
		try {
			const database = await db.healthcheck();
			res.json({
				ok: true,
				service: "retiradas-vps-api",
				databaseTime: database.now,
			});
		} catch (error) {
			next(error);
		}
	}

	function events(req, res) {
		attachRealtimeClient(req, res);
	}

	function publicEvents(req, res) {
		attachRealtimeClient(req, res, { publicStream: true });
	}

	return {
		events,
		publicEvents,
		health,
	};
}

module.exports = {
	createHealthRealtimeController,
};
