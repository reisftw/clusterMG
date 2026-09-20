const test = require("node:test");
const assert = require("node:assert/strict");
const { generateObjectKey } = require("./index");
const { ProviderRegistry } = require("./ProviderRegistry");

test("generateObjectKey creates sanitized scoped image keys", () => {
	const key = generateObjectKey({ entityType: "rompimento", entityId: "abc/../123", mimeType: "image/webp" });
	assert.match(key, /^rot\/rompimento\/\d{4}\/\d{2}\/abc123\/[0-9a-f-]+\.webp$/);
});

test("provider registry rejects unsupported providers", () => {
	const registry = new ProviderRegistry({ STORAGE_DEFAULT_PROVIDER: "unsupported" });
	assert.throws(() => registry.getDefaultProvider(), /não suportado/);
});

test("provider registry resolves r2 without exposing credentials", () => {
	const registry = new ProviderRegistry({
		STORAGE_DEFAULT_PROVIDER: "r2",
		R2_BUCKET: "bucket",
		R2_ENDPOINT: "https://example.invalid",
		R2_ACCESS_KEY_ID: "key",
		R2_SECRET_ACCESS_KEY: "secret",
	});
	const provider = registry.getDefaultProvider();
	assert.equal(provider.name, "r2");
	assert.equal(provider.bucket, "bucket");
	assert.equal(Object.prototype.hasOwnProperty.call(provider, "secretAccessKey"), false);
});
