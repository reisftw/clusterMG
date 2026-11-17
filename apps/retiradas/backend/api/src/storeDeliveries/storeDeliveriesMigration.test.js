const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sql = fs.readFileSync(path.resolve(__dirname, "../../../sql/129_store_deliveries.sql"), "utf8");

test("migration de entrega em loja é aditiva e idempotente", () => {
	assert.doesNotMatch(sql, /\bdrop\s+(table|schema|column)\b/i);
	assert.match(sql, /create table if not exists store_deliveries/i);
	assert.match(sql, /alter table app_users add column if not exists store_location_id/i);
	assert.match(sql, /on conflict\s*\(id\)/i);
});

test("recebimento físico permanece separado da conciliação", () => {
	assert.match(sql, /physical_status text not null default 'RECEIVED_AT_STORE'/i);
	assert.match(sql, /reconciliation_status text not null default 'PENDING'/i);
});
