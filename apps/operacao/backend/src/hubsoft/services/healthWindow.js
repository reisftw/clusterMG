function daysSinceActivation(executedEndAt, now = new Date()) {
	if (!executedEndAt) return null;
	const executed = new Date(executedEndAt);
	if (Number.isNaN(executed.getTime())) return null;
	return Math.floor((now.getTime() - executed.getTime()) / 86400000);
}

function isWithinActivationHealthWindow(executedEndAt, now = new Date(), windowDays = 30) {
	const days = daysSinceActivation(executedEndAt, now);
	return days !== null && days >= 0 && days <= windowDays;
}

module.exports = { daysSinceActivation, isWithinActivationHealthWindow };
