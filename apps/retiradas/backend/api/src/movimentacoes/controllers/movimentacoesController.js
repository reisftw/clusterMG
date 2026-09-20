function createMovimentacoesController({
	movimentacoesRepository,
	movimentacoesEntregas,
	movimentacoesOrdensFechadas,
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
					movimentacoesRepository.getRankingProdutosComConfig({
						dataInicio,
						dataFim,
						limit: 20,
					}),
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
					cidade: req.query.cidade,
					estoqueDestino: req.query.estoqueDestino,
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function getEquipamentos(req, res, next) {
		try {
			const { dataInicio, dataFim } = req.query;
			res.json({
				produtos: await movimentacoesRepository.getRankingProdutosComConfig({
					dataInicio,
					dataFim,
				}),
			});
		} catch (error) {
			next(error);
		}
	}

	async function getResumoCategoriaEquipamentos(req, res, next) {
		try {
			const { dataInicio, dataFim } = req.query;
			res.json({
				categorias: await movimentacoesRepository.getResumoCategoriaProdutos({
					dataInicio,
					dataFim,
				}),
			});
		} catch (error) {
			next(error);
		}
	}

	async function saveEquipamentoConfig(req, res, next) {
		try {
			res.json(
				await movimentacoesRepository.saveProdutoConfig(req.body || {}, req.user),
			);
		} catch (error) {
			next(error);
		}
	}

	async function startOrdensFechadasConciliacao(req, res, next) {
		try {
			const { rows, dataInicio, dataFim } = req.body || {};
			const job = await movimentacoesOrdensFechadas.runConciliacao({
				rows,
				dataInicio,
				dataFim,
				user: req.user,
			});
			res.status(202).json(job);
		} catch (error) {
			next(error);
		}
	}

	async function getOrdensFechadasJob(req, res, next) {
		try {
			const job = await movimentacoesOrdensFechadas.getJob(req.params.jobId);
			if (!job) {
				res.status(404).json({ error: "Job não encontrado." });
				return;
			}
			res.json(job);
		} catch (error) {
			next(error);
		}
	}

	// Permite a pagina se re-hidratar sozinha (aba aberta/recarregada) sem
	// depender do jobId ter sobrevivido no estado do React — mesmo problema
	// que motivou o pedido de "ficar igual o Mapa".
	async function getLatestOrdensFechadasJob(req, res, next) {
		try {
			const job = await movimentacoesOrdensFechadas.getLatestJob();
			if (!job) {
				res.status(404).json({ error: "Nenhuma conciliação encontrada." });
				return;
			}
			res.json(job);
		} catch (error) {
			next(error);
		}
	}

	async function getCidades(req, res, next) {
		try {
			const { dataInicio, dataFim, pageRetiradas, pageDevolvidas, pageEstoques } =
				req.query;
			const [rankingCidadesRetiradas, rankingCidadesDevolvidas, rankingEstoques] =
				await Promise.all([
					movimentacoesRepository.getRankingCidadesRetiradas({
						dataInicio,
						dataFim,
						page: pageRetiradas,
					}),
					movimentacoesRepository.getRankingCidadesDevolvidas({
						dataInicio,
						dataFim,
						page: pageDevolvidas,
					}),
					movimentacoesRepository.getRankingEstoquesRecebimento({
						dataInicio,
						dataFim,
						page: pageEstoques,
					}),
				]);
			res.json({
				rankingCidadesRetiradas,
				rankingCidadesDevolvidas,
				rankingEstoques,
			});
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
			const { dataInicio, dataFim, anoTodo } = req.body || {};
			const job = await movimentacoesEntregas.runScan({
				user: req.user,
				manual: true,
				dataInicio,
				dataFim,
				anoTodo: Boolean(anoTodo),
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
		getCidades,
		getDashboard,
		getEquipamentos,
		getOrdensFechadasJob,
		getLatestOrdensFechadasJob,
		getResumoCategoriaEquipamentos,
		getScanJob,
		saveEquipamentoConfig,
		startOrdensFechadasConciliacao,
		listMovimentacoes,
		readConfig,
		saveConfig,
		startScan,
	};
}

module.exports = { createMovimentacoesController };
