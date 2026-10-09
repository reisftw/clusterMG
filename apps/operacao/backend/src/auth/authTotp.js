const crypto = require("node:crypto");
const qrcode = require("qrcode");

const DEFAULT_ISSUER = "Operação Cluster MG";
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

function base32Encode(buffer) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
	let output = "";
	for (let index = 0; index < bits.length; index += 5) {
		const chunk = bits.slice(index, index + 5).padEnd(5, "0");
		output += alphabet[Number.parseInt(chunk, 2)];
	}
	return output;
}

function base32Decode(value) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	const clean = String(value || "")
		.toUpperCase()
		.replace(/[^A-Z2-7]/g, "");
	let bits = "";
	for (const char of clean) {
		const index = alphabet.indexOf(char);
		if (index >= 0) bits += index.toString(2).padStart(5, "0");
	}
	const bytes = [];
	for (let index = 0; index + 8 <= bits.length; index += 8) {
		bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
	}
	return Buffer.from(bytes);
}

function generateTotpSecret() {
	return base32Encode(crypto.randomBytes(20));
}

function buildOtpAuthUrl({ secret, accountName, issuer = DEFAULT_ISSUER }) {
	const label = `${issuer}:${accountName || "usuario"}`;
	const params = new URLSearchParams({
		secret,
		issuer,
		algorithm: "SHA1",
		digits: String(DEFAULT_DIGITS),
		period: String(DEFAULT_STEP_SECONDS),
	});
	return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

async function buildQrDataUrl(otpAuthUrl) {
	return qrcode.toDataURL(otpAuthUrl, {
		errorCorrectionLevel: "M",
		margin: 1,
		width: 220,
	});
}

function createTotp(secret, timestamp = Date.now()) {
	const counter = Math.floor(timestamp / 1000 / DEFAULT_STEP_SECONDS);
	const counterBuffer = Buffer.alloc(8);
	counterBuffer.writeBigUInt64BE(BigInt(counter));
	const hmac = crypto
		.createHmac("sha1", base32Decode(secret))
		.update(counterBuffer)
		.digest();
	const offset = hmac[hmac.length - 1] & 0x0f;
	const binary =
		((hmac[offset] & 0x7f) << 24) |
		((hmac[offset + 1] & 0xff) << 16) |
		((hmac[offset + 2] & 0xff) << 8) |
		(hmac[offset + 3] & 0xff);
	return String(binary % 10 ** DEFAULT_DIGITS).padStart(DEFAULT_DIGITS, "0");
}

function verifyTotpCode(secret, code, { window = 1 } = {}) {
	const clean = String(code || "").replace(/\D/g, "");
	if (clean.length !== DEFAULT_DIGITS || !secret) return false;
	const now = Date.now();
	for (let offset = -window; offset <= window; offset += 1) {
		const candidate = createTotp(secret, now + offset * DEFAULT_STEP_SECONDS * 1000);
		if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) {
			return true;
		}
	}
	return false;
}

function signSetupToken({ userId, secret }, secretKey) {
	const payload = Buffer.from(
		JSON.stringify({
			userId,
			secret,
			exp: Date.now() + 10 * 60 * 1000,
		}),
	).toString("base64url");
	const signature = crypto
		.createHmac("sha256", secretKey)
		.update(payload)
		.digest("base64url");
	return `${payload}.${signature}`;
}

function verifySetupToken(token, secretKey) {
	const [payload, signature] = String(token || "").split(".");
	if (!payload || !signature) throw new Error("Token de configuração inválido.");
	const expected = crypto
		.createHmac("sha256", secretKey)
		.update(payload)
		.digest("base64url");
	if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
		throw new Error("Token de configuração inválido.");
	}
	const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	if (!data?.secret || !data?.userId || Number(data.exp || 0) < Date.now()) {
		throw new Error("Token de configuração expirado.");
	}
	return data;
}

module.exports = {
	buildOtpAuthUrl,
	buildQrDataUrl,
	generateTotpSecret,
	signSetupToken,
	verifySetupToken,
	verifyTotpCode,
};
