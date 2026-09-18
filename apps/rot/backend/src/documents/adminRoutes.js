const express = require("express");
const crypto = require("crypto");
const { requireRotAuth, userHasRotPermission } = require("../auth/middleware");
const documents = require("../tecnicosBolsaAuditoria/documents");

const router = express.Router();
router.use(requireRotAuth);

const WRITE_PERMISSIONS = {
	integracoes_api: ["rot.settings.manage"],
	acerto_estoque_agendas: ["rot.stock_adjustments.manage"],
	acerto_estoque_produtos: ["rot.stock_adjustments.manage"],
	acerto_estoque_acertos: ["rot.stock_adjustments.manage"],
};

function randomDocumentId() {
	if (crypto.randomUUID) return crypto.randomUUID();
	return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function collectionFromPath(path) {
	return String(path || "").split("/").slice(0, -1).join("/") || String(path || "");
}

function ensure(req, collection) {
	const permissions = WRITE_PERMISSIONS[collection];
	if (!permissions?.length) {
		const error = new Error("Coleção não permitida para gravação na Operação.");
		error.status = 403;
		throw error;
	}
	if (!permissions.some((permission) => userHasRotPermission(req.rotUser, permission))) {
		const error = new Error("Você não tem permissão para alterar esta coleção.");
		error.status = 403;
		throw error;
	}
}

function responseFromDoc(doc) {
	return { ok: true, path: doc.path, collectionPath: doc.collectionPath, documentId: doc.documentId, data: doc.data || {} };
}

router.post("/", async (req, res, next) => {
	try {
		const collectionPath = String(req.body?.collectionPath || "");
		ensure(req, collectionPath);
		const documentId = String(req.body?.documentId || randomDocumentId());
		const doc = await documents.upsertDocument({
			path: `${collectionPath}/${documentId}`,
			collectionPath,
			documentId,
			data: req.body?.data || {},
		});
		res.status(201).json(responseFromDoc(doc));
	} catch (error) {
		next(error);
	}
});

router.put("/*", async (req, res, next) => {
	try {
		const path = req.params[0] || "";
		const collectionPath = collectionFromPath(path);
		ensure(req, collectionPath);
		const doc = await documents.upsertDocument({
			path,
			collectionPath,
			documentId: String(path).split("/").pop(),
			data: req.body || {},
		});
		res.json(responseFromDoc(doc));
	} catch (error) {
		next(error);
	}
});

router.delete("/*", async (req, res, next) => {
	try {
		const path = req.params[0] || "";
		ensure(req, collectionFromPath(path));
		await documents.deleteDocument(path);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
