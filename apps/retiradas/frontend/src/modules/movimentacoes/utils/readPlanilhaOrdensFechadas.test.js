import { describe, expect, it } from "vitest";
import { reduzirLinhasPlanilha } from "./readPlanilhaOrdensFechadas";

describe("reduzirLinhasPlanilha", () => {
	it("mantem so os campos usados na conciliacao (planilha real)", () => {
		const rows = [
			{
				nome_razaosocial: "ZIRLENE APARECIDA SILVA DE PAULA",
				codigo_cliente: "414007",
				cidade: "Sarzedo",
				data_termino_executado: "23/02/2026",
				tipo_os: "Instalação",
				tecnico: "João da Silva",
				coluna_extra_que_nao_importa: "lixo",
			},
		];

		expect(reduzirLinhasPlanilha(rows)).toEqual([
			{
				nome: "ZIRLENE APARECIDA SILVA DE PAULA",
				codigo_cliente: "414007",
				cidade: "Sarzedo",
				data_termino_executado: "23/02/2026",
				tipo_os: "Instalação",
				tecnico: "João da Silva",
			},
		]);
	});

	it("reconhece aliases alternativos de nome/cidade/codigo/tipo/tecnico", () => {
		const rows = [
			{
				Nome: "Cliente X",
				Cidade: "BH",
				Codigo: "1",
				Tipo: "Manutenção",
				Tecnico: "Maria Souza",
			},
		];

		expect(reduzirLinhasPlanilha(rows)).toEqual([
			{
				nome: "Cliente X",
				codigo_cliente: "1",
				cidade: "BH",
				data_termino_executado: null,
				tipo_os: "Manutenção",
				tecnico: "Maria Souza",
			},
		]);
	});

	it("linha sem nenhuma coluna reconhecida vira tudo null", () => {
		expect(reduzirLinhasPlanilha([{ coluna_qualquer: "valor" }])).toEqual([
			{
				nome: null,
				codigo_cliente: null,
				cidade: null,
				data_termino_executado: null,
				tipo_os: null,
				tecnico: null,
			},
		]);
	});
});
