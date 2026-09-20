import { describe, expect, it } from "vitest";
import { buildMatchOSData } from "./matchOs";

function baseOrder(overrides = {}) {
	return {
		id: overrides.id,
		num_os: overrides.id,
		regional: "METROPOLITANA SUB1",
		cidade: "Contagem",
		tipo: "INSTALAÇÃO",
		nome_cliente: "Cliente",
		codigo_cliente: "1",
		endereco: "RUA C, 25",
		latitude: -19.932,
		longitude: -44.053,
		...overrides,
	};
}

describe("buildMatchOSData", () => {
	it("ignora coordenadas zeradas para nao criar match artificial de 0m", () => {
		const data = buildMatchOSData([
			baseOrder({ id: "servico-1", tipo: "INSTALAÇÃO" }),
			baseOrder({
				id: "retirada-zerada",
				tipo: "RETIRADA FTTH",
				latitude: 0,
				longitude: 0,
			}),
		]);

		expect(data.resumo.totalMatches).toBe(0);
		expect(data.resumo.totalRetiradasRelacionadas).toBe(0);
	});

	it("nao usa mesma rua para furar o limite maximo de distancia", () => {
		const data = buildMatchOSData([
			baseOrder({
				id: "servico-1",
				tipo: "INSTALAÇÃO",
				endereco: "RUA C, 25",
				latitude: -19.932,
				longitude: -44.053,
			}),
			baseOrder({
				id: "retirada-longe",
				tipo: "RETIRADA FTTH",
				endereco: "RUA C, 120",
				latitude: -23.55,
				longitude: -46.63,
			}),
		]);

		expect(data.resumo.totalMatches).toBe(0);
		expect(data.resumo.totalRetiradasRelacionadas).toBe(0);
	});

	it("mantem match valido quando a retirada esta dentro do limite", () => {
		const data = buildMatchOSData([
			baseOrder({ id: "servico-1", tipo: "INSTALAÇÃO" }),
			baseOrder({
				id: "retirada-perto",
				tipo: "RETIRADA FTTH",
				endereco: "RUA C, 30",
				latitude: -19.9323,
				longitude: -44.0532,
			}),
		]);

		expect(data.resumo.totalMatches).toBe(1);
		expect(data.resumo.totalRetiradasRelacionadas).toBe(1);
		expect(data.regionais[0].cidades[0].matches[0].relacionadas[0]).toMatchObject({
			id: "retirada-perto",
		});
	});
});
