const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("dashboard read services do not start HubSoft synchronizations", () => {
	for (const file of ["publicDashboard.js", "mapSyncUpdatesService.js"]) {
		const source = fs.readFileSync(path.join(__dirname, file), "utf8");
		assert.doesNotMatch(source, /hubsoftSyncProfiles|runProfileSafely|runMapMatchScheduler/);
	}
});

test("public dashboard snapshot is compact by default and keeps the legacy escape hatch", () => {
	const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
	assert.match(source, /domain === "dashboard"/);
	assert.match(source, /req\.query\.compact/);
	assert.match(source, /buildSnapshotDomain\(domain, \{ compact \}\)/);
});
