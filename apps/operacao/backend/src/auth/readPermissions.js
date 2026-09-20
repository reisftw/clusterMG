const { userHasRotPermission } = require('./middleware');

const READ_PERMISSIONS = {
	tickets: ['rot.tickets.view', 'rot.tickets.manage'],
	shifts: ['rot.shifts.view', 'rot.shifts.manage'],
	activities: ['rot.activities.view', 'rot.activities.manage'],
	ranking: ['rot.ranking.view'],
	absences: ['rot.absences.view', 'rot.absences.manage', 'rot.timeoff.view', 'rot.timeoff.approve', 'rot.vacations.view', 'rot.vacations.approve'],
};

function absenceReadTypes(user) {
	return [
		['atestado', ['rot.absences.view', 'rot.absences.manage']],
		['folga', ['rot.timeoff.view', 'rot.timeoff.approve', 'rot.absences.manage']],
		['ferias', ['rot.vacations.view', 'rot.vacations.approve', 'rot.absences.manage']],
	].filter(([, permissions]) => userHasRotPermission(user, permissions)).map(([type]) => type);
}

module.exports = { READ_PERMISSIONS, absenceReadTypes };
