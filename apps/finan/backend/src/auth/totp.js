const crypto = require("node:crypto");
const QRCode = require("qrcode");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function base32Encode(buffer) {
	let bits = "";
	for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
	let output = "";
	for (let index = 0; index < bits.length; index += 5) {
		const chunk = bits.slice(index, index + 5).padEnd(5, "0");
		output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
	}
	return output;
}

function base32Decode(secret) {
	const normalized = String(secret || "").replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
	let bits = "";
	for (const char of normalized) {
		const value = BASE32_ALPHABET.indexOf(char);
		if (value === -1) throw new Error("Segredo TOTP inválido.");
		bits += value.toString(2).padStart(5, "0");
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

function counterBuffer(counter) {
	const buffer = Buffer.alloc(8);
	buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
	buffer.writeUInt32BE(counter >>> 0, 4);
	return buffer;
}

function generateTotpCode(secret, counter) {
	const key = base32Decode(secret);
	const hmac = crypto.createHmac("sha1", key).update(counterBuffer(counter)).digest();
	const offset = hmac[hmac.length - 1] & 0x0f;
	const binary =
		((hmac[offset] & 0x7f) << 24) |
		((hmac[offset + 1] & 0xff) << 16) |
		((hmac[offset + 2] & 0xff) << 8) |
		(hmac[offset + 3] & 0xff);
	return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function timingSafeCodeEqual(left, right) {
	const a = Buffer.from(String(left || ""));
	const b = Buffer.from(String(right || ""));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyTotpCode(secret, code, { window = 1 } = {}) {
	const normalizedCode = String(code || "").replace(/\D/g, "");
	if (normalizedCode.length !== TOTP_DIGITS) return false;
	const currentCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
	for (let drift = -window; drift <= window; drift += 1) {
		if (timingSafeCodeEqual(generateTotpCode(secret, currentCounter + drift), normalizedCode)) {
			return true;
		}
	}
	return false;
}

function buildOtpAuthUrl({ issuer, account, secret }) {
	const safeIssuer = String(issuer || "Cluster MG");
	const safeAccount = String(account || "usuario");
	const label = `${safeIssuer}:${safeAccount}`;
	const params = new URLSearchParams({
		secret,
		issuer: safeIssuer,
		algorithm: "SHA1",
		digits: String(TOTP_DIGITS),
		period: String(TOTP_STEP_SECONDS),
	});
	return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

async function buildQrDataUrl(otpauthUrl) {
	return QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
}

function setupTokenSecret() {
	return (
		process.env.TOTP_SETUP_TOKEN_SECRET ||
		process.env.ROT_JWT_SECRET ||
		process.env.JWT_SECRET ||
		process.env.SESSION_SECRET ||
		"totp-setup-local-dev-secret"
	);
}

function signSetupToken({ userId, secret, ttlMinutes = 10 }) {
	const payload = {
		userId: String(userId),
		secret,
		exp: Date.now() + Math.max(3, Math.min(30, Number(ttlMinutes || 10))) * 60 * 1000,
	};
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = crypto.createHmac("sha256", setupTokenSecret()).update(encoded).digest("base64url");
	return `${encoded}.${signature}`;
}

function verifySetupToken(token, expectedUserId) {
	const [encoded, signature] = String(token || "").split(".");
	if (!encoded || !signature) throw new Error("Configuração do autenticador expirada.");
	const expected = crypto.createHmac("sha256", setupTokenSecret()).update(encoded).digest("base64url");
	if (!timingSafeCodeEqual(signature, expected)) throw new Error("Configuração do autenticador inválida.");
	const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	if (String(payload.userId) !== String(expectedUserId)) throw new Error("Configuração do autenticador inválida.");
	if (Number(payload.exp || 0) < Date.now()) throw new Error("Configuração do autenticador expirada.");
	return payload;
}

module.exports = {
	buildOtpAuthUrl,
	buildQrDataUrl,
	generateTotpSecret,
	signSetupToken,
	verifySetupToken,
	verifyTotpCode,
};
