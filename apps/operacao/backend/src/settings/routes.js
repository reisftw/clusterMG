const express = require("express");
const multer = require("multer");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { getConfig, sanitizeConfig, saveConfig, sendTestEmail } = require("../email/service");
const { noStore } = require("../security/noStore");
const { AVATAR_UPLOAD_LIMITS, assertUploadedImage, imageFileFilter } = require("../security/uploadFilters");

// Mesmo padrao de auth/routes.js (avatarUpload): data URL base64 direto
// na coluna, sem storage externo.
const avatarUpload = multer({
	storage: multer.memoryStorage(),
	limits: AVATAR_UPLOAD_LIMITS,
	fileFilter: imageFileFilter,
});

// Configuracoes gerais do sistema — mesmo padrao de
// ConfiguracoesGeraisPage.jsx do Retiradas: hoje so o avatar padrao (que
// usuarios sem avatar proprio exibem). Guardado em rot_settings
// (key='appearance'), mesmo padrao de storage do e-mail/integracoes.
const router = express.Router();
router.use(requireRotAuth);

async function readAppearance() {
	const { rows } = await db
		.query("select value from rot_settings where key = 'appearance' limit 1")
		.catch(() => ({ rows: [] }));
	return { defaultAvatarUrl: "", ...(rows[0]?.value || {}) };
}

const DEFAULT_MENU_CONFIG = {
	ROT: {
		enabledItems: [
			"comando",
			"agenda",
			"escala",
			"tickets",
			"ausencias",
			"rompimentos",
			"apr",
			"chuva",
			"feriados",
			"avisos",
			"equipamentos",
			"chaves",
			"frotas",
			"ranking",
			"historico",
		],
	},
	DELIVERY: {
		enabledItems: [
			"comando",
			"agenda",
			"escala",
			"ausencias",
			"apr",
			"feriados",
			"avisos",
			"acerto-estoque",
			"entrega-tecnicos",
			"auditoria-bolsa",
			"frotas",
			"relatorios-auditoria",
		],
	},
	FIELD: {
		enabledItems: [
			"comando",
			"agenda",
			"escala",
			"ausencias",
			"apr",
			"feriados",
			"avisos",
			"acerto-estoque",
			"entrega-tecnicos",
			"auditoria-bolsa",
			"frotas",
			"relatorios-auditoria",
		],
	},
};

function normalizeMenuConfig(input = {}) {
	const next = {};
	for (const scope of Object.keys(DEFAULT_MENU_CONFIG)) {
		const allowed = new Set(DEFAULT_MENU_CONFIG[scope].enabledItems);
		const raw = Array.isArray(input?.[scope]?.enabledItems)
			? input[scope].enabledItems
			: DEFAULT_MENU_CONFIG[scope].enabledItems;
		next[scope] = {
			enabledItems: [...new Set(raw.map((item) => String(item || "").trim()).filter((item) => allowed.has(item)))],
		};
	}
	return next;
}

async function readMenuConfig() {
	const { rows } = await db
		.query("select value from rot_settings where key = 'menu_config' limit 1")
		.catch(() => ({ rows: [] }));
	return normalizeMenuConfig(rows[0]?.value || DEFAULT_MENU_CONFIG);
}

// GET aberto a qualquer usuario autenticado (precisa do avatar padrao pra
// exibir no lugar de quem nao tem avatar proprio) — so o PUT exige
// permissao de gerenciamento.
router.get("/appearance", noStore, async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await readAppearance()) });
	} catch (error) {
		next(error);
	}
});

router.put("/appearance", requireRotPermission("rot.settings.manage"), async (req, res, next) => {
	try {
		const current = await readAppearance();
		const next_ = { ...current, defaultAvatarUrl: String(req.body?.defaultAvatarUrl ?? current.defaultAvatarUrl ?? "") };
		await db.query(
			`insert into rot_settings (key, value, updated_at, updated_by)
			values ('appearance', $1::jsonb, now(), $2)
			on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
			[JSON.stringify(next_), req.rotUser.id],
		);
		res.json({ ok: true, ...next_ });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/appearance/avatar",
	requireRotPermission("rot.settings.manage"),
	avatarUpload.single("avatar"),
	async (req, res, next) => {
		try {
			if (!req.file) {
				res.status(400).json({ ok: false, error: "Nenhum arquivo enviado." });
				return;
			}
			const mime = assertUploadedImage(req.file);
			const dataUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
			const current = await readAppearance();
			const next_ = { ...current, defaultAvatarUrl: dataUrl };
			await db.query(
				`insert into rot_settings (key, value, updated_at, updated_by)
				values ('appearance', $1::jsonb, now(), $2)
				on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
				[JSON.stringify(next_), req.rotUser.id],
			);
			res.json({ ok: true, defaultAvatarUrl: dataUrl });
		} catch (error) {
			next(error);
		}
	},
);

router.get("/email", requireRotPermission("rot.settings.manage"), noStore, async (_req, res, next) => {
	try {
		res.json({ ok: true, email: sanitizeConfig(await getConfig()) });
	} catch (error) {
		next(error);
	}
});

router.get("/menu", noStore, async (_req, res, next) => {
	try {
		res.json({ ok: true, menu: await readMenuConfig(), defaults: DEFAULT_MENU_CONFIG });
	} catch (error) {
		next(error);
	}
});

router.put("/menu", requireRotPermission("rot.settings.manage"), async (req, res, next) => {
	try {
		const menu = normalizeMenuConfig(req.body?.menu || req.body || {});
		await db.query(
			`insert into rot_settings (key, value, updated_at, updated_by)
			values ('menu_config', $1::jsonb, now(), $2)
			on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
			[JSON.stringify(menu), req.rotUser.id],
		);
		res.json({ ok: true, menu, defaults: DEFAULT_MENU_CONFIG });
	} catch (error) {
		next(error);
	}
});

router.put("/email", requireRotPermission("rot.settings.manage"), async (req, res, next) => {
	try {
		const email = await saveConfig(req.body || {});
		res.json({ ok: true, email });
	} catch (error) {
		next(error);
	}
});

router.post("/email/test", requireRotPermission("rot.settings.manage"), async (req, res, next) => {
	try {
		const result = await sendTestEmail(req.body?.to);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

module.exports = router;
