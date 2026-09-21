import { fireEvent, render, screen } from "@testing-library/react";
import { KpiCard } from "./FacilitiesPrimitives";
import { OperationBadge, OperationTable } from "./OperationTable";

function TestIcon(props) {
	return <svg aria-label="icone de teste" {...props} />;
}

describe("Facilities shared primitives", () => {
	it("renderiza KPI com valor longo em uma linha", () => {
		render(
			<KpiCard
				label="Custo mensal"
				value="R$ 32.706.030,00"
				detail="Aluguéis ativos"
				tone="orange"
				icon={TestIcon}
			/>,
		);

		expect(screen.getByText("Custo mensal")).toBeInTheDocument();
		expect(screen.getByText("R$ 32.706.030,00")).toHaveClass("whitespace-nowrap");
		expect(screen.getByText("Aluguéis ativos")).toBeInTheDocument();
	});

	it("renderiza tabela operacional vazia com mensagem amigável", () => {
		render(
			<OperationTable
				columns={[{ key: "nome", label: "Nome" }]}
				rows={[]}
				emptyTitle="Nenhum item"
				emptyDescription="Cadastre um item para começar."
			/>,
		);

		expect(screen.getByText("Nenhum item")).toBeInTheDocument();
		expect(screen.getByText("Cadastre um item para começar.")).toBeInTheDocument();
	});

	it("mantém linha clicável e badge de status", () => {
		const onRowClick = vi.fn();
		render(
			<OperationTable
				columns={[
					{ key: "nome", label: "Nome" },
					{
						key: "status",
						label: "Status",
						render: () => <OperationBadge tone="emerald">Ativo</OperationBadge>,
					},
				]}
				rows={[{ id: "1", nome: "Fornecedor teste" }]}
				onRowClick={onRowClick}
			/>,
		);

		fireEvent.click(screen.getByText("Fornecedor teste"));

		expect(onRowClick).toHaveBeenCalledWith({ id: "1", nome: "Fornecedor teste" });
		expect(screen.getByText("Ativo")).toBeInTheDocument();
	});
});
