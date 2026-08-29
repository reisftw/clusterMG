function getProfile(req) {
	return req.user?.profile || req.user || {};
}

function createNotificationsController({ notificationsService }) {
	async function listNotifications(req, res, next) {
		try {
			res.json(
				await notificationsService.listNotifications({
					user: getProfile(req),
					limit: req.query.limit,
					offset: req.query.offset,
					type: req.query.type,
					severity: req.query.severity,
					unread: req.query.unread,
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function getNotificationStats(req, res, next) {
		try {
			res.json(
				await notificationsService.getNotificationStats({
					user: getProfile(req),
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function getPreferences(req, res, next) {
		try {
			res.json(
				await notificationsService.getPreferences({
					user: getProfile(req),
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function savePreferences(req, res, next) {
		try {
			res.json(
				await notificationsService.savePreferences({
					user: getProfile(req),
					preferences: req.body || {},
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function getCounters(req, res, next) {
		try {
			res.json(
				await notificationsService.getCounters({
					user: getProfile(req),
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function markNotificationsRead(req, res, next) {
		try {
			res.json(
				await notificationsService.markNotificationsRead({
					user: getProfile(req),
					ids: req.body?.ids,
					all: req.body?.all === true,
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function createCriticalServiceAlerts(req, res, next) {
		try {
			res.json(
				await notificationsService.createCriticalServiceAlerts({
					user: getProfile(req),
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	return {
		createCriticalServiceAlerts,
		getCounters,
		getNotificationStats,
		getPreferences,
		listNotifications,
		markNotificationsRead,
		savePreferences,
	};
}

module.exports = {
	createNotificationsController,
};
