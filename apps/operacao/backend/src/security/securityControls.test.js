process.env.ROT_JWT_SECRET = process.env.ROT_JWT_SECRET || "test-secret-with-enough-entropy";
process.env.ROT_CORS_ORIGINS = "https://operacao.retiradas.tech";
process.env.ROT_PGHOST = process.env.ROT_PGHOST || "127.0.0.1";
process.env.ROT_PGUSER = process.env.ROT_PGUSER || "test";
process.env.ROT_PGDATABASE = process.env.ROT_PGDATABASE || "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const { sameSiteOriginGuard } = require("./originGuard");
const { assertUploadedImage, detectImageMime } = require("./uploadFilters");
const { JWT_AUDIENCE, JWT_ISSUER, verifyToken } = require("../auth/middleware");

function runOriginGuard({ method = "POST", origin = "", referer = "" }) {
	let statusCode = 0;
	let body = null;
	let nextCalled = false;
	sameSiteOriginGuard(
		{
			method,
			get(name) {
				if (name === "origin") return origin;
				if (name === "referer") return referer;
				return "";
			},
		},
		{
			status(code) {
				statusCode = code;
				return this;
			},
			json(payload) {
				body = payload;
			},
		},
		() => {
			nextCalled = true;
		},
	);
	return { nextCalled, statusCode, body };
}

test("origin guard allows configured same-site mutating requests", () => {
	const result = runOriginGuard({ origin: "https://operacao.retiradas.tech" });
	assert.equal(result.nextCalled, true);
	assert.equal(result.statusCode, 0);
});

test("origin guard rejects untrusted browser origins", () => {
	const result = runOriginGuard({ origin: "https://evil.example" });
	assert.equal(result.nextCalled, false);
	assert.equal(result.statusCode, 403);
	assert.equal(result.body.ok, false);
});

test("jwt validation enforces issuer and audience while allowing legacy tokens during migration", () => {
	const modern = jwt.sign({ sub: "user-1", jti: "session-1" }, process.env.ROT_JWT_SECRET, {
		issuer: JWT_ISSUER,
		audience: JWT_AUDIENCE,
		expiresIn: "5m",
	});
	const wrongAudience = jwt.sign({ sub: "user-1", jti: "session-1" }, process.env.ROT_JWT_SECRET, {
		issuer: JWT_ISSUER,
		audience: "other-app",
		expiresIn: "5m",
	});
	const legacy = jwt.sign({ sub: "user-1", jti: "session-1" }, process.env.ROT_JWT_SECRET, { expiresIn: "5m" });
	assert.equal(verifyToken(modern).sub, "user-1");
	assert.equal(verifyToken(wrongAudience), null);
	assert.equal(verifyToken(legacy).sub, "user-1");
});

test("image validation detects real magic bytes and rejects spoofed mime", () => {
	const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
	const exe = Buffer.from("MZ fake executable");
	assert.equal(detectImageMime(png), "image/png");
	assert.equal(assertUploadedImage({ mimetype: "image/png", buffer: png }), "image/png");
	assert.throws(() => assertUploadedImage({ mimetype: "image/png", buffer: exe }), /Envie apenas imagens/);
});
