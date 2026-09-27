const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const db = require("../api/src/db");
const auth = require("../api/src/auth");
const email = "map-automation-check@homolog.invalid";

async function main() {
	assert.match((await db.query("select current_database() as name")).rows[0].name, /homolog/i);
	if (process.argv.includes("--cleanup")) {
		const user = await auth.getLocalUserByEmail(email);
		if (user) await auth.deleteLocalUser(user.uid);
		console.log("Temporary test account removed");
		return;
	}
	assert.equal(await auth.getLocalUserByEmail(email), null, "Test account already exists");
	const password = crypto.randomBytes(24).toString("base64url");
	await auth.createLocalUser({ email, nome: "Validacao Homolog", role: "admin", password, mustChangePassword: false });
	console.log(JSON.stringify({ email, password }));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
