const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");

test("multer handles an in-memory avatar upload", async () => {
	const app = express();
	const upload = multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: 1024 },
		fileFilter: (_req, file, callback) => {
			callback(null, file.mimetype === "image/png");
		},
	});

	app.post("/upload", upload.single("avatar"), (req, res) => {
		res.json({
			ok: true,
			mimetype: req.file?.mimetype,
			size: req.file?.size,
		});
	});

	const server = http.createServer(app);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const { port } = server.address();
		const form = new FormData();
		form.append("avatar", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "avatar.png");

		const response = await fetch(`http://127.0.0.1:${port}/upload`, {
			method: "POST",
			body: form,
		});
		const data = await response.json();

		assert.equal(response.status, 200);
		assert.equal(data.ok, true);
		assert.equal(data.mimetype, "image/png");
		assert.equal(data.size, 4);
	} finally {
		await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
});

test("nodemailer json transport sends without network access", async () => {
	const transport = nodemailer.createTransport({ jsonTransport: true });
	const result = await transport.sendMail({
		from: "naoresponda@retiradas.tech",
		to: "seguranca@example.invalid",
		subject: "Smoke test",
		text: "Dependencia nodemailer carregada com sucesso.",
	});

	assert.ok(result.messageId);
	assert.match(result.message.toString(), /Smoke test/);
});
