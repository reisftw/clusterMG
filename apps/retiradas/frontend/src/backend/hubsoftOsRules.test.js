import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
	MATCH_IGNORED_TYPE_IDS,
	classifyEquipmentByServiceSpeed,
	isIgnoredForMatch,
	isNewProductionOsType,
	isProductionOsType,
	parseServiceSpeedMbps,
	productionOsTypeIds,
} = require("../../../backend/api/src/hubsoftOsRules");

describe("hubsoftOsRules", () => {
	it("inclui Retirada - Outros e Cancelamento - Outros na regra de producao", () => {
		expect(isProductionOsType(1493)).toBe(true);
		expect(isProductionOsType(1496)).toBe(true);
		expect(isNewProductionOsType(1493)).toBe(true);
		expect(isNewProductionOsType(1496)).toBe(true);
		expect([...productionOsTypeIds()].sort((a, b) => a - b)).toEqual([
			5, 1487, 1488, 1493, 1495, 1496,
		]);
	});

	it("nao ignora mais Retirada - Outros e Cancelamento - Outros no match", () => {
		expect(isIgnoredForMatch(1493)).toBe(false);
		expect(isIgnoredForMatch(1496)).toBe(false);
		expect(MATCH_IGNORED_TYPE_IDS.has(1494)).toBe(true);
	});

	it("classifica equipamento estimado pela velocidade do servico", () => {
		expect(classifyEquipmentByServiceSpeed("Internet 100 mega").equipmentType).toBe("FAST");
		expect(classifyEquipmentByServiceSpeed("Plano 250MB").equipmentType).toBe("FAST");
		expect(classifyEquipmentByServiceSpeed("Plano 299 MB").equipmentType).toBe("FAST");
		expect(classifyEquipmentByServiceSpeed("Plano 500 Mbps").equipmentType).toBe("AC");
		expect(classifyEquipmentByServiceSpeed("Plano 600 Mbps").equipmentType).toBe("AX");
		expect(classifyEquipmentByServiceSpeed("1 Giga").equipmentType).toBe("AX");
		expect(classifyEquipmentByServiceSpeed("").equipmentType).toBe("UNKNOWN");
	});

	it("extrai Mbps de descricoes comuns do HubSoft", () => {
		expect(parseServiceSpeedMbps("Fibra 80M")).toBe(80);
		expect(parseServiceSpeedMbps("FAST100MB")).toBe(100);
		expect(parseServiceSpeedMbps("400 Mega")).toBe(400);
		expect(parseServiceSpeedMbps("1 Gbps")).toBe(1000);
		expect(parseServiceSpeedMbps("Fiber On 300 Internet")).toBe(300);
	});

	it("usa palavras-chave quando nao ha velocidade parseavel", () => {
		expect(classifyEquipmentByServiceSpeed("Plano AC corporativo").equipmentType).toBe("AC");
		expect(classifyEquipmentByServiceSpeed("Tecnologia AX premium").equipmentType).toBe("AX");
		expect(classifyEquipmentByServiceSpeed("Produto FAST residencial").equipmentType).toBe("FAST");
	});
});
