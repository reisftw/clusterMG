import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/rot/backend/package.json"));
const {
	APR_PHOTO_UPLOAD_LIMITS,
	AVATAR_UPLOAD_LIMITS,
	NOTICE_IMAGE_UPLOAD_LIMITS,
	imageFileFilter,
} = require("./src/security/uploadFilters.js");

function runFilter(mimetype) {
	const callback = vi.fn();
	imageFileFilter({}, { mimetype }, callback);
	return callback.mock.calls[0];
}

describe("Operacao upload filters", () => {
	it("accepts only expected image mimetypes", () => {
		for (const mimetype of ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]) {
			expect(runFilter(mimetype)).toEqual([null, true]);
		}
	});

	it("rejects non-image files before memory processing", () => {
		const [error] = runFilter("application/pdf");

		expect(error).toBeInstanceOf(Error);
		expect(error.status).toBe(400);
		expect(error.message).toMatch(/PNG, JPEG, WEBP ou GIF/);
	});

	it("keeps upload limits explicit by route type", () => {
		expect(AVATAR_UPLOAD_LIMITS.fileSize).toBe(700 * 1024);
		expect(NOTICE_IMAGE_UPLOAD_LIMITS.fileSize).toBe(2 * 1024 * 1024);
		expect(APR_PHOTO_UPLOAD_LIMITS).toMatchObject({
			files: 10,
			fileSize: 4 * 1024 * 1024,
			fields: 1,
			fieldSize: 50000,
		});
	});
});
