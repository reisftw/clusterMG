const crypto = require("node:crypto");

const SECRET_SALT = "retiradas:retorninho:";

function text(value) {
	return String(value ?? "").trim();
}

function hash(value) {
	return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function phoneDigits(value) {
	let digits = text(value).replace(/\D/g, "");
	if (digits.startsWith("00")) digits = digits.slice(2);
	if (!digits.startsWith("55") && /^\d{10,11}$/.test(digits)) digits = `55${digits}`;
	return digits;
}

function normalizePhone(value) {
	const digits = phoneDigits(value);
	if (!/^\d{10,15}$/.test(digits)) {
		const error = new Error("Informe um telefone válido com DDD.");
		error.statusCode = 400;
		throw error;
	}
	return `+${digits}`;
}

function phoneCandidates(value) {
	const digits = phoneDigits(value);
	if (!digits) return [];
	const candidates = new Set([digits]);
	const withNinth = digits.match(/^55(\d{2})9(\d{8})$/);
	if (withNinth) candidates.add(`55${withNinth[1]}${withNinth[2]}`);
	const withoutNinth = digits.match(/^55(\d{2})([6-9]\d{7})$/);
	if (withoutNinth) candidates.add(`55${withoutNinth[1]}9${withoutNinth[2]}`);
	return [...candidates];
}

function phoneHashes(value) {
	return phoneCandidates(value).map(hash);
}

function maskPhone(value) {
	const digits = phoneDigits(value);
	if (!digits) return "-";
	return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} *****-${digits.slice(-4)}`;
}

function keyring() {
	const currentKeyId = text(process.env.APP_AUTH_SECRET_ID || "current") || "current";
	const currentSecret = text(process.env.APP_AUTH_SECRET);
	if (currentSecret.length < 24) {
		const error = new Error("Chave de criptografia do servidor indisponível.");
		error.statusCode = 503;
		throw error;
	}
	const keys = new Map([[currentKeyId, currentSecret]]);
	text(process.env.APP_AUTH_PREVIOUS_SECRETS)
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.forEach((entry) => {
			const [id, ...parts] = entry.split(":");
			const secret = parts.join(":");
			if (id && secret.length >= 24) keys.set(id, secret);
		});
	return { currentKeyId, keys };
}

function deriveKey(secret, keyId) {
	return crypto.scryptSync(secret, `${SECRET_SALT}${keyId}`, 32);
}

function encrypt(name, value) {
	const clean = text(value);
	if (!clean) return null;
	const { currentKeyId, keys } = keyring();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(keys.get(currentKeyId), currentKeyId), iv);
	cipher.setAAD(Buffer.from(name));
	const ciphertext = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
	return {
		ciphertext: ciphertext.toString("base64"),
		iv: iv.toString("base64"),
		authTag: cipher.getAuthTag().toString("base64"),
		keyId: currentKeyId,
	};
}

function decrypt(name, fields = {}) {
	if (!fields.ciphertext) return "";
	const { keys } = keyring();
	const secret = keys.get(text(fields.keyId));
	if (!secret) throw new Error("Chave anterior do segredo não está disponível.");
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		deriveKey(secret, text(fields.keyId)),
		Buffer.from(fields.iv, "base64"),
	);
	decipher.setAAD(Buffer.from(name));
	decipher.setAuthTag(Buffer.from(fields.authTag, "base64"));
	return Buffer.concat([
		decipher.update(Buffer.from(fields.ciphertext, "base64")),
		decipher.final(),
	]).toString("utf8");
}

module.exports = {
	decrypt,
	encrypt,
	hash,
	maskPhone,
	normalizePhone,
	phoneDigits,
	phoneHashes,
};
