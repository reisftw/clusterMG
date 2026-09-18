const IMAGE_MIME_PATTERN = /^image\/(png|jpe?g|webp|gif)$/i;
const IMAGE_UPLOAD_MESSAGE = "Envie apenas imagens PNG, JPEG, WEBP ou GIF.";

const AVATAR_UPLOAD_LIMITS = Object.freeze({ fileSize: 700 * 1024 });
const NOTICE_IMAGE_UPLOAD_LIMITS = Object.freeze({ fileSize: 2 * 1024 * 1024 });
const APR_PHOTO_UPLOAD_LIMITS = Object.freeze({
	files: 10,
	fileSize: 4 * 1024 * 1024,
	fields: 1,
	fieldSize: 50000,
});

function imageFileFilter(_req, file, callback) {
	if (IMAGE_MIME_PATTERN.test(file?.mimetype || "")) {
		callback(null, true);
		return;
	}
	const error = new Error(IMAGE_UPLOAD_MESSAGE);
	error.status = 400;
	callback(error);
}

function detectImageMime(buffer) {
	if (!Buffer.isBuffer(buffer)) return "";
	if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
		return "image/png";
	}
	if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
		return "image/jpeg";
	}
	if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
		return "image/webp";
	}
	if (buffer.length >= 6) {
		const header = buffer.subarray(0, 6).toString("ascii");
		if (header === "GIF87a" || header === "GIF89a") return "image/gif";
	}
	return "";
}

function assertUploadedImage(file, { allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"] } = {}) {
	const detected = detectImageMime(file?.buffer);
	const reported = String(file?.mimetype || "").toLowerCase();
	if (!detected || !allowed.includes(detected) || reported !== detected) {
		const error = new Error(IMAGE_UPLOAD_MESSAGE);
		error.status = 400;
		throw error;
	}
	return detected;
}

module.exports = {
	APR_PHOTO_UPLOAD_LIMITS,
	AVATAR_UPLOAD_LIMITS,
	IMAGE_UPLOAD_MESSAGE,
	NOTICE_IMAGE_UPLOAD_LIMITS,
	assertUploadedImage,
	detectImageMime,
	imageFileFilter,
};
