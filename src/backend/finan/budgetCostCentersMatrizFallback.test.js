// Correção reportada pelo usuário (2026-09-10): a tela de Configurações
// > Centros de Custo mostrava "Orçamento Mensal/Anual" e o "Mensal" de
// cada centro sempre zerados, mesmo com a Matriz importada cheia — o
// campo lido (valorMensal) é digitado à mão e a importação de planilha
// nunca o preenche. financeiroBudgetConfigRepository.getBudgetCostCenters
// agora calcula valorMensal/orcamentoMensal a partir da Matriz
// (finan_orcamento_matriz) quando o usuário nunca digitou nada
// manualmente, sem sobrescrever quem já preencheu à mão.
//
// Teste direto na função do repositório (não via HTTP) — a camada
// financeiro.js:getBudgetCostCenters chama normalizeCostCentersConfig
// por cima, que mescla com um plano de contas padrão e foge do escopo
// desta correção (que vive inteiramente dentro do repositório).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";

const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
process.env.FINAN_PGHOST = process.env.FINAN_PGHOST || "localhost";
process.env.FINAN_PGUSER = process.env.FINAN_PGUSER || "test";
process.env.FINAN_PGDATABASE = process.env.FINAN_PGDATABASE || "test";

const dbPath = finanRequire.resolve("./src/db.js");

function mockDbFor(centerSourcePayload, matrizRows, breakdownRows = []) {
	const query = vi.fn(async (text) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/^select data, source_payload from finan_config_meta/i.test(sql)) return { rows: [] };
		if (/^select \* from finan_contas/i.test(sql)) return { rows: [] };
		if (/^select \* from finan_diretorias/i.test(sql)) return { rows: [] };
		if (/^select \* from finan_centros_custo/i.test(sql)) {
			return {
				rows: [
					{ id: "cc1", codigo: "110101", nome: "Marketing", tipo_centro: "sintetico", status: "ativo", source_payload: centerSourcePayload },
				],
			};
		}
		if (/^select \* from finan_fornecedores/i.test(sql)) return { rows: [] };
		if (/^select \* from finan_matrizes/i.test(sql)) return { rows: [] };
		if (/^select \* from finan_filiais/i.test(sql)) return { rows: [] };
		if (/^select \* from finan_orcamento_matriz/i.test(sql)) return { rows: matrizRows };
		// A query real agrupa (group by) e soma orcado/realizado/linhas — o
		// mock ja recebe as linhas pre-agregadas por (centro, ano, mes) pra
		// simplificar, ja que os testes abaixo nao testam o SQL em si.
		if (/from finan_orcamento_lancamentos/i.test(sql)) return { rows: breakdownRows };
		return { rows: [] };
	});
	return { query, connect: vi.fn(async () => ({ query, release: vi.fn() })), closePool: vi.fn(async () => {}) };
}

function loadRepositoryWith(centerSourcePayload, matrizRows, breakdownRows = []) {
	for (const key of Object.keys(finanRequire.cache)) {
		if (key.includes(`${path.sep}apps${path.sep}finan${path.sep}backend${path.sep}`)) delete finanRequire.cache[key];
	}
	finanRequire.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: mockDbFor(centerSourcePayload, matrizRows, breakdownRows),
	};
	return finanRequire("./src/financeiroBudgetConfigRepository.js");
}

describe("financeiroBudgetConfigRepository.getBudgetCostCenters — orçado a partir da Matriz", () => {
	it("centro sem valorMensal manual: valorMensal vira o orçado do ano mais recente da Matriz / 12", async () => {
		const repo = loadRepositoryWith({}, [
			{ ano: 2026, mes: 1, centro_custo_id: "cc1", conta_id: "c1", versao_id: "budget", orcado: 1000, source_payload: {} },
			{ ano: 2026, mes: 2, centro_custo_id: "cc1", conta_id: "c1", versao_id: "budget", orcado: 1000, source_payload: {} },
			{ ano: 2026, mes: 3, centro_custo_id: "cc1", conta_id: "c1", versao_id: "budget", orcado: 10000, source_payload: {} },
		]);
		const result = await repo.getBudgetCostCenters();
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(centro.orcadoAnualMatriz).toBe(12000);
		expect(centro.valorMensal).toBe(1000); // 12000 / 12
	});

	it("centro com valorMensal digitado à mão: NUNCA sobrescreve o valor manual", async () => {
		const repo = loadRepositoryWith({ valorMensal: 5000 }, [
			{ ano: 2026, mes: 1, centro_custo_id: "cc1", conta_id: "c1", versao_id: "budget", orcado: 999999, source_payload: {} },
		]);
		const result = await repo.getBudgetCostCenters();
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(centro.valorMensal).toBe(5000);
	});

	it("vários anos na Matriz: usa o ano MAIS RECENTE com orçado, não soma todos juntos", async () => {
		const repo = loadRepositoryWith({}, [
			{ ano: 2026, mes: 1, centro_custo_id: "cc1", conta_id: "c1", versao_id: "budget", orcado: 1000, source_payload: {} },
			{ ano: 2027, mes: 1, centro_custo_id: "cc1", conta_id: "c1", versao_id: "budget", orcado: 24000, source_payload: {} },
		]);
		const result = await repo.getBudgetCostCenters();
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(centro.orcadoAnualMatriz).toBe(24000);
	});

	it("centro sem nenhum orçado na Matriz: não quebra, e Number(valorMensal || 0) continua 0 (mesma leitura que o frontend já faz em todo lugar)", async () => {
		const repo = loadRepositoryWith({}, []);
		const result = await repo.getBudgetCostCenters();
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(Number(centro.valorMensal || 0)).toBe(0);
		expect(centro.orcadoAnualMatriz).toBe(0);
	});
});

// Correção reportada pelo usuário logo em seguida (2026-09-10, mesma
// sessão): depois do fix acima, "apareceu só o mensal, o realizado de
// todos está zerado". Causa: `realizadoImportado` é um campo que o
// frontend (CostCentersTreeConfigSection.jsx, budgetInsights.js,
// FinanceiroPage.jsx) já lia há tempos — inclusive normalizeCostCenters
// Config em financeiro.js já tinha
// `currency(center.realizadoImportado || center.totalRealizadoImportado)`
// pronto — mas nada no repositório jamais preenchia esse campo na
// leitura: ele sempre vinha `undefined`, e toda essa cadeia virava 0.
// getBudgetCostCenters agora calcula `realizadoImportado`/`orcadoImportado`
// a partir de finan_orcamento_lancamentos (mesma agregação que já
// alimenta `realizedByCompanyBranch`), usando o MÊS MAIS RECENTE com
// lançamento pra ficar na mesma grandeza mensal do `valorMensal` (a tela
// usa os dois juntos pra calcular "% usado").
describe("financeiroBudgetConfigRepository.getBudgetCostCenters — realizadoImportado a partir dos lançamentos", () => {
	it("centro com lançamentos em vários meses: usa o MÊS MAIS RECENTE, não soma tudo", async () => {
		// A query real agora traz 1 linha por lançamento (nao mais agregada
		// em SQL) — 3 linhas em janeiro (soma 900) e 5 linhas em marco (soma
		// 1100), pra bater com o "linhas" que antes vinha pronto do SQL.
		const repo = loadRepositoryWith({}, [], [
			{ id: "l1", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 1, orcado: 1000, realizado: 900 },
			{ id: "l2", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 1, orcado: 0, realizado: 0 },
			{ id: "l3", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 1, orcado: 0, realizado: 0 },
			{ id: "l4", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 3, orcado: 1200, realizado: 1100 },
			{ id: "l5", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 3, orcado: 0, realizado: 0 },
			{ id: "l6", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 3, orcado: 0, realizado: 0 },
			{ id: "l7", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 3, orcado: 0, realizado: 0 },
			{ id: "l8", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 3, orcado: 0, realizado: 0 },
		]);
		// `incluirMovimentacoes: "1"` pede o caminho pesado (linha a linha) —
		// o padrão agora é o agregado em SQL, ver descrição do describe abaixo.
		const result = await repo.getBudgetCostCenters({ incluirMovimentacoes: "1" });
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(centro.realizadoImportado).toBe(1100);
		expect(centro.orcadoImportado).toBe(1200);
		expect(centro.linhasImportadas).toBe(5);
	});

	it("centro com mais de uma quebra (empresa/filial) no mesmo mês: soma as quebras do mês mais recente", async () => {
		const repo = loadRepositoryWith({}, [], [
			{ id: "l1", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 2, orcado: 500, realizado: 400 },
			{ id: "l2", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e1", filial_id: "f1", ano: 2026, mes: 2, orcado: 0, realizado: 0 },
			{ id: "l3", centro_custo_id: "cc1", conta_id: "c1", empresa_id: "e2", filial_id: "f2", ano: 2026, mes: 2, orcado: 300, realizado: 250 },
		]);
		const result = await repo.getBudgetCostCenters({ incluirMovimentacoes: "1" });
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(centro.realizadoImportado).toBe(650);
		expect(centro.linhasImportadas).toBe(3);
	});

	it("agora traz o detalhe por fornecedor (movements), em vez de um total só misturando todos", async () => {
		const repo = loadRepositoryWith({}, [], [
			{
				id: "l1",
				centro_custo_id: "cc1",
				conta_id: "c1",
				empresa_id: "e1",
				filial_id: "f1",
				ano: 2026,
				mes: 1,
				data: "2026-01-05",
				orcado: 0,
				realizado: 100214.42,
				fornecedor: "9253- DATA INFO COMERCIO E SERVICOS LTDA",
				titulo: "NF 123",
			},
			{
				id: "l2",
				centro_custo_id: "cc1",
				conta_id: "c1",
				empresa_id: "e1",
				filial_id: "f1",
				ano: 2026,
				mes: 1,
				data: "2026-01-10",
				orcado: 0,
				realizado: 6000,
				fornecedor: "6139- MATEUS AUGUSTO VIEIRA DE OLIVEIRA",
				titulo: "NF 456",
			},
		]);
		const result = await repo.getBudgetCostCenters({ incluirMovimentacoes: "1" });
		const centro = result.centers.find((c) => c.id === "cc1");
		const breakdown = centro.realizedByCompanyBranch[0];
		expect(breakdown.realizado).toBe(106214.42);
		expect(breakdown.suppliers).toEqual([
			"9253- DATA INFO COMERCIO E SERVICOS LTDA",
			"6139- MATEUS AUGUSTO VIEIRA DE OLIVEIRA",
		]);
		expect(breakdown.movements).toHaveLength(2);
		expect(breakdown.movements[0]).toMatchObject({
			supplier: "9253- DATA INFO COMERCIO E SERVICOS LTDA",
			value: 100214.42,
			document: "NF 123",
			date: "05/01/2026",
		});
		expect(breakdown.movements[1]).toMatchObject({
			supplier: "6139- MATEUS AUGUSTO VIEIRA DE OLIVEIRA",
			value: 6000,
			document: "NF 456",
			date: "10/01/2026",
		});
	});

	it("centro sem nenhum lançamento: realizadoImportado fica 0, não quebra", async () => {
		const repo = loadRepositoryWith({}, [], []);
		const result = await repo.getBudgetCostCenters();
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(centro.realizadoImportado).toBe(0);
		expect(centro.orcadoImportado).toBe(0);
		expect(centro.linhasImportadas).toBe(0);
	});
});

// Achado via teste de carga k6 (2026-09-10): a query linha-a-linha (usada
// pelos testes acima, via `incluirMovimentacoes: "1"`) escaneava TODOS os
// lançamentos em TODA carga da lista de Centros de Custo — ~8,6MB/~5s por
// requisição, o suficiente pra travar o event loop single-thread do Node e
// derrubar a taxa de sucesso pra <70% com pouco mais de 70 usuários
// simultâneos. O caminho PADRÃO (sem o parâmetro) agora usa a mesma
// agregação em SQL (GROUP BY) que existia antes da correção "todos
// misturados" — mais barata, sem `movements` — e só quem pede
// explicitamente (o modal "Ver detalhes" de um centro, sob demanda) paga o
// custo da query pesada.
describe("financeiroBudgetConfigRepository.getBudgetCostCenters — caminho padrão (leve, sem movements)", () => {
	it("sem incluirMovimentacoes: usa a linha JÁ AGREGADA (SQL GROUP BY) e não preenche `movements`", async () => {
		// Simula o que o Postgres real devolveria pra query agregada: uma
		// linha por (centro,conta,empresa,filial,ano,mes), já com
		// orcado/realizado/linhas somados e fornecedores como array —
		// diferente das linhas cruas (uma por lançamento) usadas nos testes
		// acima com `incluirMovimentacoes: "1"`.
		const repo = loadRepositoryWith({}, [], [
			{
				centro_custo_id: "cc1",
				conta_id: "c1",
				empresa_id: "e1",
				filial_id: "f1",
				ano: 2026,
				mes: 1,
				orcado: 1200,
				realizado: 1100,
				linhas: 5,
				fornecedores: ["9253- DATA INFO COMERCIO E SERVICOS LTDA", "6139- MATEUS AUGUSTO VIEIRA DE OLIVEIRA"],
			},
		]);
		const result = await repo.getBudgetCostCenters();
		const centro = result.centers.find((c) => c.id === "cc1");
		expect(centro.realizadoImportado).toBe(1100);
		expect(centro.orcadoImportado).toBe(1200);
		expect(centro.linhasImportadas).toBe(5);
		const breakdown = centro.realizedByCompanyBranch[0];
		expect(breakdown.suppliers).toEqual([
			"9253- DATA INFO COMERCIO E SERVICOS LTDA",
			"6139- MATEUS AUGUSTO VIEIRA DE OLIVEIRA",
		]);
		expect(breakdown.movements).toEqual([]);
	});
});
