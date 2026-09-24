import { fireEvent, render, screen } from "@testing-library/react";
import TabMatchOS from "./TabMatchOS";

function buildMatch(index) {
	return {
		id: `match-${index}`,
		principal: {
			tipo: `Instalacao ${index}`,
			nome_cliente: `Cliente ${index}`,
			codigo_cliente: `60${index}`,
			num_os: `OS-${index}`,
			tecnico: "Tecnico",
			endereco_resumo: "Rua Teste",
		},
		relacionadas: [
			{
				id: `retirada-${index}`,
				tipo: "Retirada",
				nome_cliente: `Retirada ${index}`,
				codigo_cliente: `70${index}`,
				num_os: `RET-${index}`,
				distanceMeters: 80,
			},
		],
		totalRelacionadas: 1,
	};
}

describe("TabMatchOS", () => {
	it("pagina matches da cidade a partir de 5 sem ocultar os demais", () => {
		const matches = Array.from({ length: 7 }, (_, index) =>
			buildMatch(index + 1),
		);
		const dataOverride = {
			regionais: [
				{
					regional: "Regional Teste",
					totalMatches: matches.length,
					totalCidades: 1,
					cidades: [
						{
							cidade: "Cidade Teste",
							totalMatches: matches.length,
							totalRetiradasRelacionadas: matches.length,
							matches,
						},
					],
				},
			],
			agentes: [],
			resumo: {
				totalRegionais: 1,
				totalAgentes: 0,
				totalCidades: 1,
				totalMatches: matches.length,
				totalRetiradasRelacionadas: matches.length,
			},
		};

		render(<TabMatchOS dataOverride={dataOverride} />);

		expect(screen.getAllByText("Instalacao 1").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Instalacao 5").length).toBeGreaterThan(0);
		expect(screen.queryByText("Instalacao 6")).not.toBeInTheDocument();
		expect(screen.getByText("1-5 de 7")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

		expect(screen.getByText("Instalacao 6")).toBeInTheDocument();
		expect(screen.getByText("Instalacao 7")).toBeInTheDocument();
		expect(screen.getByText("6-7 de 7")).toBeInTheDocument();
	});
});
