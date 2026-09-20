const assert = require("node:assert/strict");
const test = require("node:test");
const {
	APR_PHOTO_UPLOAD_LIMITS,
	AVATAR_UPLOAD_LIMITS,
	NOTICE_IMAGE_UPLOAD_LIMITS,
	imageFileFilter,
} = require("./uploadFilters.js");

function runFilter(mimetype) {
	let callArgs = null;
	imageFileFilter({}, { mimetype }, (...args) => {
		callArgs = args;
	});
	return callArgs;
}

test("accepts only expected image mimetypes", () => {
	for (const mimetype of ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]) {
		assert.deepEqual(runFilter(mimetype), [null, true]);
	}
});

test("rejects non-image files before memory processing", () => {
	const [error] = runFilter("application/pdf");

	assert.ok(error instanceof Error);
	assert.equal(error.status, 400);
	assert.match(error.message, /PNG, JPEG, WEBP ou GIF/);
});

test("keeps upload limits explicit by route type", () => {
	assert.equal(AVATAR_UPLOAD_LIMITS.fileSize, 700 * 1024);
	assert.equal(NOTICE_IMAGE_UPLOAD_LIMITS.fileSize, 2 * 1024 * 1024);
	assert.equal(APR_PHOTO_UPLOAD_LIMITS.files, 10);
	assert.equal(APR_PHOTO_UPLOAD_LIMITS.fileSize, 4 * 1024 * 1024);
	assert.equal(APR_PHOTO_UPLOAD_LIMITS.fields, 1);
	assert.equal(APR_PHOTO_UPLOAD_LIMITS.fieldSize, 50000);
});
