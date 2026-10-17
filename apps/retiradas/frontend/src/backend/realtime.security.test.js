import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(
	path.join(process.cwd(), "apps/retiradas/backend/package.json"),
);
const realtime = require("./api/src/realtime");

function createClient() {
	const req = new EventEmitter();
	const writes = [];
	const res = {
		flushHeaders() {},
		setHeader() {},
		write(value) {
			writes.push(value);
		},
	};
	return { req, res, writes };
}

describe("realtime public stream", () => {
	it("exposes only invalidation metadata for public topics", () => {
		const client = createClient();
		realtime.attachRealtimeClient(client.req, client.res, { publicStream: true });

		realtime.broadcastRealtime("estoque", { customerPhone: "+5531999999999" });
		realtime.broadcastRealtime("dashboard", {
			customerPhone: "+5531999999999",
			internalResult: { id: "private" },
		});

		const payloads = client.writes
			.filter((entry) => entry.startsWith("data: "))
			.map((entry) => JSON.parse(entry.slice("data: ".length)));
		expect(payloads).toContainEqual(
			expect.objectContaining({ topic: "dashboard", emittedAt: expect.any(String) }),
		);
		expect(JSON.stringify(payloads)).not.toContain("customerPhone");
		expect(JSON.stringify(payloads)).not.toContain("internalResult");
		expect(payloads.some((payload) => payload.topic === "estoque")).toBe(false);

		client.req.emit("close");
	});
});
