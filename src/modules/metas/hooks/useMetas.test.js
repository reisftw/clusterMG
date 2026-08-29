import { act, renderHook, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { diasUteis, isDiaUtil, parseMetasWorkbook, useMetas } from "./useMetas";

const metasMocks = vi.hoisted(() => ({
	buscarTodasMetas: vi.fn(),
	salvarMetaMes: vi.fn(),
	salvarUltimaAtualizacao: vi.fn(),
	buscarUltimaAtualizacao: vi.fn(),
	buscarFeriados: vi.fn(),
	buscarForcaTarefaConfig: vi.fn(),
	buscarMetasBaseConfig: vi.fn(),
	salvarMetasBaseConfig: vi.fn(),
	invalidateMetasCache: vi.fn(),
	invalidateForcaTarefaConfigCache: vi.fn(),
	invalidateMetasBaseConfigCache: vi.fn(),
	persistMetasImport: vi.fn(),
	saveMetasForceTaskConfig: vi.fn(),
	salvarAuditoriaAgentes: vi.fn(),
	parseAgentesWorkbook: vi.fn(),
	salvarDashboard: vi.fn(),
	salvarDashboardAgentes: vi.fn(),
	regenerateStaticData: vi.fn(),
	log: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}));

vi.mock("../services/metasService", () => ({
	buscarTodasMetas: metasMocks.buscarTodasMetas,
	salvarMetaMes: metasMocks.salvarMetaMes,
	salvarUltimaAtualizacao: metasMocks.salvarUltimaAtualizacao,
	buscarUltimaAtualizacao: metasMocks.buscarUltimaAtualizacao,
	buscarFeriados: metasMocks.buscarFeriados,
	buscarForcaTarefaConfig: metasMocks.buscarForcaTarefaConfig,
	buscarMetasBaseConfig: metasMocks.buscarMetasBaseConfig,
	salvarMetasBaseConfig: metasMocks.salvarMetasBaseConfig,
	invalidateMetasCache: metasMocks.invalidateMetasCache,
	invalidateForcaTarefaConfigCache: metasMocks.invalidateForcaTarefaConfigCache,
	invalidateMetasBaseConfigCache: metasMocks.invalidateMetasBaseConfigCache,
}));

vi.mock("../../../services/operationalImportService", () => ({
	persistMetasImport: metasMocks.persistMetasImport,
	saveMetasForceTaskConfig: metasMocks.saveMetasForceTaskConfig,
}));

vi.mock("../services/metasAuditoriaService", () => ({
	salvarAuditoriaAgentes: metasMocks.salvarAuditoriaAgentes,
}));

vi.mock("./useMetasAuditoriaParser", () => ({
	parseAgentesWorkbook: metasMocks.parseAgentesWorkbook,
}));

vi.mock("../services/dashboardService", () => ({
	salvarDashboard: metasMocks.salvarDashboard,
}));

vi.mock("../services/dashboardAgentesService", () => ({
	salvarDashboardAgentes: metasMocks.salvarDashboardAgentes,
}));

vi.mock("../../../services/staticDataService", () => ({
	regenerateStaticData: metasMocks.regenerateStaticData,
}));

vi.mock("../../../utils/logger", () => ({
	logger: {
		log: metasMocks.log,
		warn: metasMocks.warn,
		error: metasMocks.error,
	},
}));

const MONTH_ORDER = [
	"Janeiro",
	"Fevereiro",
	"Marco",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

const DASH_ROW = {
	Janeiro: 4,
	Fevereiro: 5,
	Marco: 6,
	Abril: 7,
	Maio: 8,
	Junho: 9,
	Julho: 10,
	Agosto: 11,
	Setembro: 12,
	Outubro: 13,
	Novembro: 14,
	Dezembro: 15,
};

function createSheet(cells = {}, ref = "A1:AH40") {
	const sheet = { "!ref": ref };
	Object.entries(cells).forEach(([address, value]) => {
		sheet[address] = {
			t: typeof value === "number" ? "n" : "s",
			v: value,
		};
	});
	return sheet;
}

function createWorkbookBuffer({
	dashboardCells = {},
	multasCells = {},
	monthSheets = {},
} = {}) {
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(
		workbook,
		createSheet(dashboardCells, "A1:F20"),
		"DASHBOARD",
	);
	XLSX.utils.book_append_sheet(
		workbook,
		createSheet(multasCells, "A1:U40"),
		"MULTAS",
	);

	Object.entries(monthSheets).forEach(([name, cells]) => {
		XLSX.utils.book_append_sheet(workbook, createSheet(cells), name);
	});

	return XLSX.write(workbook, {
		type: "array",
		bookType: "xlsx",
	});
}

describe("useMetas", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		metasMocks.buscarTodasMetas.mockResolvedValue({});
		metasMocks.salvarMetaMes.mockResolvedValue(undefined);
		metasMocks.salvarUltimaAtualizacao.mockResolvedValue(undefined);
		metasMocks.buscarUltimaAtualizacao.mockResolvedValue(null);
		metasMocks.buscarFeriados.mockResolvedValue(new Set());
		metasMocks.buscarForcaTarefaConfig.mockResolvedValue({
			ativa: false,
			inicio: "",
			fim: "",
			metas: { regionais: 600, agentes: 150, tecnicos: 400 },
		});
		metasMocks.buscarMetasBaseConfig.mockResolvedValue(null);
		metasMocks.salvarMetasBaseConfig.mockResolvedValue(null);
		metasMocks.persistMetasImport.mockResolvedValue({
			generatedAt: "2026-01-15T10:30:00.000Z",
		});
		metasMocks.saveMetasForceTaskConfig.mockResolvedValue({
			config: {
				ativa: false,
				inicio: "",
				fim: "",
				metas: { regionais: 600, agentes: 150, tecnicos: 400 },
			},
			generatedAt: "2026-01-15T10:30:00.000Z",
		});
		metasMocks.salvarAuditoriaAgentes.mockResolvedValue(undefined);
		metasMocks.parseAgentesWorkbook.mockReturnValue({});
		metasMocks.salvarDashboard.mockResolvedValue(undefined);
		metasMocks.salvarDashboardAgentes.mockResolvedValue(undefined);
		metasMocks.regenerateStaticData.mockResolvedValue({
			generatedAt: "2026-01-15T10:30:00.000Z",
		});
	});

	it("calcula dias uteis e respeita finais de semana e feriados", () => {
		expect(diasUteis("Mes inexistente")).toBe(22);
		expect(diasUteis("Janeiro", ["01-02"])).toBeLessThan(diasUteis("Janeiro"));
		expect(diasUteis("Maio", [])).toBe(20);
		expect(isDiaUtil("Janeiro", 1, ["01-01"])).toBe(false);
		expect(isDiaUtil("Maio", 1, [])).toBe(false);
		expect(isDiaUtil("Janeiro", 3)).toBe(false);
		expect(isDiaUtil("Janeiro", 5)).toBe(true);
		expect(isDiaUtil("Mes inexistente", 10)).toBe(true);
	});

	it("interpreta a planilha carregada do mes atual mesmo sem dados diarios", () => {
		const currentMonth = MONTH_ORDER[new Date().getMonth()];
		const currentRow = DASH_ROW[currentMonth];
		const workbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					[`B${currentRow}`]: 5,
					[`C${currentRow}`]: 100,
					[`D${currentRow}`]: 0,
					[`F${currentRow}`]: 0,
				},
				monthSheets: {
					[currentMonth]: {},
				},
			}),
			{ type: "array" },
		);

		const result = parseMetasWorkbook(workbook);

		expect(result[currentMonth].planilhaCarregada).toBe(true);
		expect(result[currentMonth].temLancamentos).toBe(true);
		expect(result[currentMonth].status).toBe("Faltam 100 O.S");
	});

	it("nao preenche saldo diario quando a planilha nao tem lancamentos diarios", () => {
		const workbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B9: 1000,
					C9: 911,
					D9: 1,
					F9: 0.001,
				},
				monthSheets: {
					Junho: {
						AH7: 1,
					},
				},
			}),
			{ type: "array" },
		);

		const result = parseMetasWorkbook(workbook);

		expect(result.Junho.totalOS).toBe(1);
		expect(result.Junho.saldoDiario).toEqual([]);
	});

	it("calcula saldo diario apenas para dias com movimento na planilha", () => {
		const workbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B9: 1000,
					C9: 911,
					D9: 1,
					F9: 0.001,
				},
				monthSheets: {
					Junho: {
						C7: 1,
					},
				},
			}),
			{ type: "array" },
		);

		const result = parseMetasWorkbook(workbook);

		expect(result.Junho.saldoDiario).toHaveLength(1);
		expect(result.Junho.saldoDiario[0]).toEqual(
			expect.objectContaining({
				dia: 1,
				totalDia: 1,
			}),
		);
	});

	it("mantem saldo diario mesmo quando os dias nao batem com o realizado do dashboard", () => {
		const workbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B9: 2927,
					C9: 2634.3,
					D9: 1,
					F9: 0.0003416467,
				},
				monthSheets: {
					Junho: {
						C7: 5,
						D7: 8,
					},
				},
			}),
			{ type: "array" },
		);

		const result = parseMetasWorkbook(workbook);

		expect(result.Junho.totalOS).toBe(1);
		expect(result.Junho.saldoDiario).toEqual([
			expect.objectContaining({ dia: 1, totalDia: 5 }),
			expect.objectContaining({ dia: 2, totalDia: 8 }),
		]);
	});

	it("detecta coluna total e linhas pela aba mensal", () => {
		const workbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B9: 2927,
					C9: 2634.3,
					D9: 1,
					F9: 0.0003416467,
				},
				monthSheets: {
					Junho: {
						C7: "1\nSeg",
						AF7: "30\nTer",
						AG7: "TOTAL",
						AH7: "META",
						B8: "PHILIPE SANTOS",
						C8: 1,
						AG8: 1,
						AH8: 110,
						B15: "TOTAL TECNICOS",
						C15: 1,
						AG15: 1,
						AH15: 770,
						B19: "Agente Autorizado",
						C19: 2,
						AG19: 2,
						AH19: 110,
						B23: "Entregue em Loja",
						C23: 3,
						AG23: 3,
						AH23: 110,
						B27: "Central Mineira",
						AG27: 0,
						AH27: 110,
						B28: "Metropolitana sub 1",
						AG28: 0,
						AH28: 110,
						B29: "Metropolitana sub 2",
						AG29: 0,
						AH29: 110,
						B30: "Metropolitana sub 3",
						AG30: 0,
						AH30: 110,
						B31: "Oeste de Minas",
						AG31: 0,
						AH31: 110,
						B32: "Sul de Minas",
						AG32: 0,
						AH32: 110,
						B33: "Centro Oeste",
						AG33: 0,
						AH33: 110,
						B34: "TOTAL REGIONAIS",
						AG34: 0,
						AH34: 770,
					},
				},
			}),
			{ type: "array" },
		);

		const result = parseMetasWorkbook(workbook);

		expect(result.Junho.technicians[0]).toEqual(
			expect.objectContaining({ name: "PHILIPE SANTOS", total: 1 }),
		);
		expect(result.Junho.regionais[0]).toEqual(
			expect.objectContaining({ name: "Central Mineira", total: 0 }),
		);
		expect(result.Junho.agenteTotal).toBe(2);
		expect(result.Junho.lojaTotal).toBe(3);
		expect(result.Junho.saldoDiario).toEqual([
			expect.objectContaining({
				dia: 1,
				equipe: 1,
				agente: 2,
				loja: 3,
				totalDia: 6,
			}),
		]);
	});

	it("inclui o tecnico na ultima linha antes de TOTAL TECNICOS com acento", () => {
		const workbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B10: 2812,
					C10: 2530.8,
					D10: 2163,
					F10: 0.8546704599,
				},
				monthSheets: {
					Julho: {
						C7: "1\nQua",
						AH7: "TOTAL",
						B8: "PHILIPE SANTOS",
						C8: 10,
						AH8: 10,
						B9: "ANTONIO CARVALHO",
						C9: 5,
						AH9: 5,
						B10: "JOSEVAL CAMPOS",
						C10: 11,
						AH10: 11,
						B11: "JOAO EZIQUIEL",
						C11: 3,
						AH11: 3,
						B12: "PAULO XAVIER",
						C12: 4,
						AH12: 4,
						B13: "CLAUDSON FARIA",
						C13: 5,
						AH13: 5,
						B14: "ANDRE PAULA",
						C14: 3,
						AH14: 3,
						B15: "TOTAL TÉCNICOS",
						C15: 41,
						AH15: 41,
					},
				},
			}),
			{ type: "array" },
		);

		const result = parseMetasWorkbook(workbook);

		expect(result.Julho.technicians).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "ANDRE PAULA",
					total: 3,
					daily: expect.arrayContaining([3]),
				}),
			]),
		);
		expect(result.Julho.saldoDiario[0]).toEqual(
			expect.objectContaining({ dia: 1, equipe: 41 }),
		);
	});

	it("interpreta abas onnet e monta a visao consolidada com sempre", () => {
		const workbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B10: 100,
					C10: 90,
					D10: 18,
					F10: 0.2,
				},
				monthSheets: {
					Julho: {
						C7: "1\nQua",
						Q7: "15\nQua",
						AH7: "TOTAL",
						B8: "PHILIPE SANTOS",
						C8: 4,
						Q8: 0,
						AH8: 4,
						B15: "TOTAL TÉCNICOS",
						C15: 4,
						Q15: 0,
						AH15: 4,
						B19: "Agente Autorizado",
						C19: 3,
						Q19: 2,
						AH19: 5,
						B23: "Entregue em Loja",
						C23: 3,
						Q23: 1,
						AH23: 4,
						B27: "Central Mineira",
						C27: 0,
						Q27: 5,
						AH27: 5,
						B28: "Metropolitana sub 1",
						C28: 0,
						Q28: 0,
						AH28: 0,
						B29: "Metropolitana sub 2",
						C29: 0,
						Q29: 0,
						AH29: 0,
						B30: "Metropolitana sub 3",
						C30: 0,
						Q30: 0,
						AH30: 0,
						B31: "Oeste de Minas",
						C31: 0,
						Q31: 0,
						AH31: 0,
						B32: "Sul de Minas",
						C32: 0,
						Q32: 0,
						AH32: 0,
						B33: "Centro Oeste",
						C33: 0,
						Q33: 0,
						AH33: 0,
						B34: "TOTAL REGIONAIS",
						C34: 0,
						Q34: 5,
						AH34: 5,
					},
					onnet_jul: {
						B4: 50,
						B5: 45,
						A8: "ENTREGUE EM LOJA",
						AH8: "TOTAL",
						B9: "Entregue em Loja",
						C9: 4,
						Q9: 0,
						AH9: 4,
						A12: "REGIONAIS",
						AH12: "TOTAL",
						B13: "Norte de Minas",
						C13: 6,
						Q13: 10,
						AH13: 16,
						B17: "TOTAL REGIONAIS",
						C17: 6,
						Q17: 10,
						AH17: 16,
						B21: 20,
					},
				},
			}),
			{ type: "array" },
		);

		const result = parseMetasWorkbook(workbook);

		expect(result.Julho.totalOS).toBe(18);
		expect(result.Julho.agenteTotal).toBe(5);
		expect(result.Julho.lojaTotal).toBe(4);
		expect(result.Julho.saldoDiario[0]).toEqual(
			expect.objectContaining({
				dia: 1,
				equipe: 4,
				agente: 3,
				loja: 3,
				totalDia: 10,
			}),
		);
		expect(result.Julho.saldoDiario.find((item) => item.dia === 15)).toEqual(
			expect.objectContaining({
				dia: 15,
				equipe: 0,
				agente: 2,
				loja: 1,
				regionais: 5,
				totalDia: 8,
			}),
		);
		expect(result.Julho.onnet).toEqual(
			expect.objectContaining({
				origem: "ONNET",
				totalOS: 20,
				meta: 45,
				lojaTotal: 4,
			}),
		);
		expect(result.Julho.onnet.regionais[0]).toEqual(
			expect.objectContaining({ name: "Norte de Minas", total: 16 }),
		);
		expect(result.Julho.onnetSempre).toEqual(
			expect.objectContaining({
				origem: "ONNET + SEMPRE",
				totalOS: 38,
				meta: 135,
				agenteTotal: 5,
				lojaTotal: 8,
			}),
		);
		expect(result.Julho.onnet.saldoDiario[0]).toEqual(
			expect.objectContaining({ dia: 1, loja: 4, regionais: 6, totalDia: 10 }),
		);
		expect(
			result.Julho.onnetSempre.rawDays.find((item) => item.dia === 15),
		).toEqual(
			expect.objectContaining({
				dia: 15,
				agente: 2,
				loja: 1,
				regionais: 15,
				totalDia: 18,
			}),
		);
		expect(
			result.Julho.onnetSempre.saldoDiario.find((item) => item.dia === 15),
		).toEqual(
			expect.objectContaining({
				dia: 15,
				agente: 2,
				loja: 1,
				regionais: 15,
				totalDia: 18,
			}),
		);
	});

	it("usa fallback de totais da aba mensal e reconhece meta atingida", () => {
		const fallbackWorkbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B4: 2,
					C4: 100,
					D4: 0,
					F4: 0.4,
				},
				monthSheets: {
					Janeiro: {
						AH7: 20,
						AH8: 10,
						AH26: 5,
						AH18: 3,
						AH22: 2,
					},
				},
			}),
			{ type: "array" },
		);

		const fallbackResult = parseMetasWorkbook(fallbackWorkbook);

		expect(fallbackResult.Janeiro.totalOS).toBe(40);
		expect(fallbackResult.Janeiro.status).toBe("Faltam 60 O.S");

		const atingidaWorkbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B4: 1,
					C4: 100,
					D4: 90,
					F4: 0.9,
				},
				multasCells: {
					I34: 10,
				},
			}),
			{ type: "array" },
		);

		const atingidaResult = parseMetasWorkbook(atingidaWorkbook);

		expect(atingidaResult.Janeiro.totalMultas).toBe(10);
		expect(atingidaResult.Janeiro.status).toBe("Meta atingida!");
		expect(atingidaResult.Janeiro.propMult).toBe("9.0");

		const percentRawWorkbook = XLSX.read(
			createWorkbookBuffer({
				dashboardCells: {
					B4: 1,
					C4: 100,
					D4: 70,
					F4: 90,
				},
			}),
			{ type: "array" },
		);

		const percentRawResult = parseMetasWorkbook(percentRawWorkbook);
		expect(percentRawResult.Janeiro.percentAchieved).toBe(90);
	});

	it("processa uma planilha valida e popula o estado com os dados parseados", async () => {
		const currentMonth = MONTH_ORDER[new Date().getMonth()];
		const currentRow = DASH_ROW[currentMonth];
		metasMocks.parseAgentesWorkbook.mockReturnValue({
			[currentMonth]: {
				"Belo Horizonte": [{ nome: "Agente 1" }],
			},
		});

		const file = {
			arrayBuffer: vi.fn().mockResolvedValue(
				createWorkbookBuffer({
					dashboardCells: {
						[`B${currentRow}`]: 3,
						[`C${currentRow}`]: 100,
						[`D${currentRow}`]: 90,
						[`F${currentRow}`]: 0.9,
					},
					monthSheets: {
						[currentMonth]: {},
					},
				}),
			),
		};

		const { result } = renderHook(() => useMetas());

		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.processarPlanilha(file);
		});

		expect(file.arrayBuffer).toHaveBeenCalled();
		expect(result.current.uploading).toBe(false);
		expect(result.current.allData[currentMonth].meta).toBe(3);
		expect(result.current.allData[currentMonth].totalOS).toBe(90);
		expect(metasMocks.persistMetasImport).toHaveBeenCalledWith(
			expect.objectContaining({
				parsed: expect.objectContaining({
					[currentMonth]: expect.objectContaining({
						meta: 3,
						totalOS: 90,
					}),
				}),
				agentesData: expect.any(Object),
				lastUpdate: expect.any(String),
			}),
		);
	});

	it("propaga erro quando a planilha e invalida e finaliza o upload", async () => {
		const expectedError = new Error("Arquivo invalido");
		const file = {
			arrayBuffer: vi.fn().mockRejectedValue(expectedError),
		};

		const { result } = renderHook(() => useMetas());

		await waitFor(() => expect(result.current.loading).toBe(false));

		let capturedError = null;
		await act(async () => {
			try {
				await result.current.processarPlanilha(file);
			} catch (error) {
				capturedError = error;
			}
		});

		expect(capturedError).toBe(expectedError);
		expect(result.current.uploading).toBe(false);
		expect(metasMocks.error).toHaveBeenCalled();
	});

	it("atualiza dadosMes quando o mes selecionado muda", async () => {
		const currentMonthIndex = new Date().getMonth();
		const currentMonth = MONTH_ORDER[currentMonthIndex];
		const nextMonth = MONTH_ORDER[(currentMonthIndex + 1) % MONTH_ORDER.length];
		metasMocks.buscarTodasMetas.mockResolvedValue({
			[currentMonth]: { totalOS: 90, meta: 100 },
			[nextMonth]: { totalOS: 80, meta: 120 },
		});
		metasMocks.buscarUltimaAtualizacao.mockResolvedValue("ontem");

		const { result } = renderHook(() => useMetas());

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.dadosMes).toEqual(
			expect.objectContaining({ totalOS: 90, meta: 100 }),
		);
		expect(result.current.lastUpdate).toBe("ontem");

		act(() => {
			result.current.setMesSelecionado(nextMonth);
		});

		expect(result.current.mesSelecionado).toBe(nextMonth);
		expect(result.current.dadosMes).toEqual(
			expect.objectContaining({ totalOS: 80, meta: 120 }),
		);
	});

	it("continua carregando com feriados vazios quando a consulta de feriados falha", async () => {
		metasMocks.buscarFeriados.mockRejectedValue(
			new Error("feriados indisponiveis"),
		);
		metasMocks.buscarTodasMetas.mockResolvedValue({
			Janeiro: { totalOS: 50, meta: 70 },
		});

		const { result } = renderHook(() => useMetas());

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.feriadosExtras).toEqual([]);
		expect(result.current.allData.Janeiro).toEqual(
			expect.objectContaining({ totalOS: 50, meta: 70 }),
		);
		expect(metasMocks.warn).toHaveBeenCalled();
	});

	it("pula a auditoria de agentes quando o parser nao retorna dados", async () => {
		const currentMonth = MONTH_ORDER[new Date().getMonth()];
		const currentRow = DASH_ROW[currentMonth];
		metasMocks.parseAgentesWorkbook.mockReturnValue({});

		const file = {
			arrayBuffer: vi.fn().mockResolvedValue(
				createWorkbookBuffer({
					dashboardCells: {
						[`B${currentRow}`]: 1,
						[`C${currentRow}`]: 20,
						[`D${currentRow}`]: 10,
						[`F${currentRow}`]: 0.5,
					},
					monthSheets: {
						[currentMonth]: {},
					},
				}),
			),
		};

		const { result } = renderHook(() => useMetas());

		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.processarPlanilha(file);
		});

		expect(metasMocks.persistMetasImport).toHaveBeenCalledWith(
			expect.objectContaining({ agentesData: {} }),
		);
	});

	it("encerra o carregamento mesmo quando a leitura inicial falha", async () => {
		metasMocks.buscarTodasMetas.mockRejectedValue(
			new Error("backend indisponivel"),
		);

		const { result } = renderHook(() => useMetas());

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.allData).toEqual({});
		expect(metasMocks.error).toHaveBeenCalled();
	});
});
