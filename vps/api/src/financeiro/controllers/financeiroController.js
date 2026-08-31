const financeiro = require("../../financeiro");

const FINANCEIRO_READ_CACHE_TTL_MS = Math.max(
	Number(process.env.FINANCEIRO_READ_CACHE_TTL_MS || 10000),
	0,
);
const financeiroReadCache = new Map();

function getCachedFinanceiroResponse(key) {
	if (!FINANCEIRO_READ_CACHE_TTL_MS || !key) return null;
	const cached = financeiroReadCache.get(key);
	if (!cached) return null;
	if (Date.now() - cached.createdAt > FINANCEIRO_READ_CACHE_TTL_MS) {
		financeiroReadCache.delete(key);
		return null;
	}
	return cached.value;
}

async function getOrSetFinanceiroCache(key, loader) {
	const cached = getCachedFinanceiroResponse(key);
	if (cached) return cached;

	const pendingKey = `${key}:pending`;
	const pending = getCachedFinanceiroResponse(pendingKey);
	if (pending) return pending;

	const promise = loader();
	if (FINANCEIRO_READ_CACHE_TTL_MS) {
		financeiroReadCache.set(pendingKey, {
			createdAt: Date.now(),
			value: promise,
		});
	}

	try {
		const value = await promise;
		if (FINANCEIRO_READ_CACHE_TTL_MS) {
			financeiroReadCache.set(key, { createdAt: Date.now(), value });
		}
		return value;
	} finally {
		financeiroReadCache.delete(pendingKey);
	}
}

function clearFinanceiroReadCache() {
	financeiroReadCache.clear();
}

function createFinanceiroController() {
	async function getDashboard(_req, res, next) {
		try {
			res.json(
				await getOrSetFinanceiroCache("dashboard", () =>
					financeiro.getDashboard(),
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function getBudgetCostCenters(_req, res, next) {
		try {
			res.json(
				await getOrSetFinanceiroCache("orcamento-centros-custo", () =>
					financeiro.getBudgetCostCenters(),
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function saveBudgetCostCenters(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.saveBudgetCostCenters(
				req.body || {},
				req.user,
			);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function updateBudgetApproval(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.updateBudgetApproval(
				req.params.approvalId,
				req.body || {},
				req.user,
			);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function getBudgetData(_req, res, next) {
		try {
			res.json(
				await getOrSetFinanceiroCache("orcamento-dados", () =>
					financeiro.getBudgetData(),
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function saveBudgetData(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.saveBudgetData(req.body || {}, req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function clearBudgetData(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.clearBudgetData(req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function getDreStatement(req, res, next) {
		try {
			res.json(
				await getOrSetFinanceiroCache(
					`dre:${req.query?.ano || ""}:${req.query?.mes || ""}:${req.query?.isFake || req.query?.fake || ""}`,
					() => financeiro.getDreStatement(req.query || {}),
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function saveDreStatement(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.saveDreStatement(req.body || {}, req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function createFakeDreData(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.createFakeDreData(req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function deleteFakeDreData(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.deleteFakeDreData(req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function getSheetsConfig(_req, res, next) {
		try {
			res.json(
				await getOrSetFinanceiroCache("sheets-config", () =>
					financeiro.getSheetsConfig(),
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function saveSheetsConfig(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.saveSheetsConfig(
				req.body || {},
				req.user,
			);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function testSheetSource(req, res, next) {
		try {
			res.json(await financeiro.testSheetSource(req.params.sourceId));
		} catch (error) {
			next(error);
		}
	}

	async function runSheetsImport(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.runSheetsImport(req.user, {
				manual: true,
				sourceId: req.body?.sourceId || req.query?.sourceId,
			});
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function listImportLogs(req, res, next) {
		try {
			res.json(await financeiro.listImportLogs(req.query.limit));
		} catch (error) {
			next(error);
		}
	}

	async function getSerasaReport(_req, res, next) {
		try {
			res.json(await financeiro.getSerasaReport());
		} catch (error) {
			next(error);
		}
	}

	async function getTariffsReport(_req, res, next) {
		try {
			res.json(await financeiro.getTariffsReport());
		} catch (error) {
			next(error);
		}
	}

	async function saveSerasaData(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.saveSerasaData(req.body || {}, req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function saveTariffsReport(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.saveTariffsReport(req.body || {}, req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function clearSerasaReport(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.clearSerasaReport(req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function clearTariffsReport(req, res, next) {
		try {
			clearFinanceiroReadCache();
			const result = await financeiro.clearTariffsReport(req.user);
			clearFinanceiroReadCache();
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	return {
		clearBudgetData,
		createFakeDreData,
		clearSerasaReport,
		clearTariffsReport,
		deleteFakeDreData,
		getBudgetCostCenters,
		getBudgetData,
		getDashboard,
		getDreStatement,
		getSerasaReport,
		getTariffsReport,
		getSheetsConfig,
		listImportLogs,
		runSheetsImport,
		saveBudgetData,
		saveBudgetCostCenters,
		saveDreStatement,
		saveSerasaData,
		saveTariffsReport,
		saveSheetsConfig,
		testSheetSource,
		updateBudgetApproval,
	};
}

module.exports = {
	createFinanceiroController,
};
