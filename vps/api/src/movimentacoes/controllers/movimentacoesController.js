function createMovimentacoesController({
	movimentacoesRepository,
	movimentacoesEntregas,
}) {
	async function getDashboard(req, res, next) {
		try {
			const { dataInicio, dataFim } = req.query;
			const [resumoPorEmpresaDia, rankingTecnicos, rankingProdutos] =
				await Promise.all([
					movimentacoesRepository.getResumoPorEmpresaDia({
						dataInicio,
						dataFim,
					}),
					movimentacoesRepository.getRankingTecnicos({ dataInicio, dataFim }),
					movimentacoesRepository.getRankingProdutos({ dataInicio, dataFim }),
				]);
			res.json({ resumoPorEmpresaDia, rankingTecnicos, rankingProdutos });
		} catch (error) {
			next(error);
		}
	}

	async function listMovimentacoes(req, res, next) {
		try {
			res.json(
				await movimentacoesRepository.listMovimentacoes({
					page: req.query.page,
					limit: req.query.limit,
					dataInicio: req.query.dataInicio,
					dataFim: req.query.dataFim,
					empresa: req.query.empresa,
					tecnico: req.query.tecnico,
					produto: req.query.produto,
					status: req.query.status,
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function readConfig(_req, res, next) {
		try {
			res.json(await movimentacoesRepository.readConfig());
		} catch (error) {
			next(error);
		}
	}

	async function saveConfig(req, res, next) {
		try {
			res.json(
				await movimentacoesRepository.saveConfig(req.body || {}, req.user),
			);
		} catch (error) {
			next(error);
		}
	}

	async function startScan(req, res, next) {
		try {
			const job = await movimentacoesEntregas.runScan({
				user: req.user,
				manual: true,
			});
			res.status(202).json(job);
		} catch (error) {
			next(error);
		}
	}

	async function getScanJob(req, res, next) {
		try {
			const job = await movimentacoesEntregas.getScanJob(req.params.jobId);
			if (!job) {
				res.status(404).json({ error: "Job não encontrado." });
				return;
			}
			res.json(job);
		} catch (error) {
			next(error);
		}
	}

	return {
		getDashboard,
		getScanJob,
		listMovimentacoes,
		readConfig,
		saveConfig,
		startScan,
	};
}

module.exports = { createMovimentacoesController };
