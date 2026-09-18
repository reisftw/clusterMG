const express = require("express");
const { requireRotAuth, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const documents = require("../tecnicosBolsaAuditoria/documents");

const router = express.Router();
router.use(requireRotAuth);

const READ_PERMISSIONS = {
	integracoes_api: ["rot.settings.manage"],
	empresas_tecnicos: ["rot.stock_adjustments.view", "rot.stock_adjustments.manage", "rot.companies.view", "rot.companies.manage"],
	acerto_estoque_tecnicos: ["rot.stock_adjustments.view", "rot.stock_adjustments.manage"],
	acerto_estoque_agendas: ["rot.stock_adjustments.view", "rot.stock_adjustments.manage"],
	acerto_estoque_produtos: ["rot.stock_adjustments.view", "rot.stock_adjustments.manage"],
	acerto_estoque_acertos: ["rot.stock_adjustments.view", "rot.stock_adjustments.manage"],
};

const WRITE_PERMISSIONS = {
	integracoes_api: ["rot.settings.manage"],
	acerto_estoque_agendas: ["rot.stock_adjustments.manage"],
	acerto_estoque_produtos: ["rot.stock_adjustments.manage"],
	acerto_estoque_acertos: ["rot.stock_adjustments.manage"],
};

function collectionFromPath(path) {
	return String(path || "").split("/").slice(0, -1).join("/") || String(path || "");
}

function ensure(req, collection, mode) {
	const permissions = mode === "write" ? WRITE_PERMISSIONS[collection] : READ_PERMISSIONS[collection];
	if (!permissions?.length) {
		const error = new Error("Coleção não permitida na Operação.");
		error.status = 403;
		throw error;
	}
	if (!permissions.some((permission) => userHasRotPermission(req.rotUser, permission))) {
		const error = new Error("Você não tem permissão para acessar esta coleção.");
		error.status = 403;
		throw error;
	}
}

function publicDoc(doc) {
	return {
		path: doc.path,
		collectionPath: doc.collectionPath,
		documentId: doc.documentId,
		parentPath: doc.parentPath,
		data: doc.data || {},
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const collection = String(req.query.collection || "");
		ensure(req, collection, "read");
		const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 5000));
		const offset = Math.max(0, Number(req.query.offset || 0));
		const docs = await documents.listAllDocuments(collection);
		res.json({ ok: true, items: docs.slice(offset, offset + limit).map(publicDoc), total: docs.length });
	} catch (error) {
		next(error);
	}
});

router.get("/*", noStore, async (req, res, next) => {
	try {
		const path = req.params[0] || "";
		ensure(req, collectionFromPath(path), "read");
		const doc = await documents.getDocument(path);
		if (!doc) {
			res.status(404).json({ ok: false, error: "Documento não encontrado." });
			return;
		}
		res.json({ ok: true, ...publicDoc(doc) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
