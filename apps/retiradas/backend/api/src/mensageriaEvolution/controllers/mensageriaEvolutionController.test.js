const assert = require("node:assert/strict");
const test = require("node:test");
const {
	createMensageriaEvolutionController,
} = require("./mensageriaEvolutionController");

function responseRecorder() {
	return {
		statusCode: 200,
		payload: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.payload = payload;
			return this;
		},
	};
}

test("inicia, consulta e interrompe o modo Turbo", async () => {
	const calls = [];
	const turbo = {
		status: "running",
		running: true,
		target: 300,
		intervalSeconds: 2,
	};
	const evolutionMessaging = {
		startTurboQueue: async () => {
			calls.push("start");
			return { ok: true, started: true, turbo };
		},
		getTurboStatus: () => {
			calls.push("status");
			return turbo;
		},
		stopTurboQueue: () => {
			calls.push("stop");
			return { ok: true, turbo: { ...turbo, status: "stopping" } };
		},
	};
	const controller = createMensageriaEvolutionController({ evolutionMessaging });
	const next = (error) => {
		throw error;
	};

	const startResponse = responseRecorder();
	await controller.startTurboQueue({}, startResponse, next);
	assert.equal(startResponse.statusCode, 202);
	assert.equal(startResponse.payload.turbo.target, 300);

	const statusResponse = responseRecorder();
	await controller.getTurboStatus({}, statusResponse, next);
	assert.equal(statusResponse.payload.turbo.intervalSeconds, 2);

	const stopResponse = responseRecorder();
	await controller.stopTurboQueue({}, stopResponse, next);
	assert.equal(stopResponse.payload.turbo.status, "stopping");
	assert.deepEqual(calls, ["start", "status", "stop"]);
});
