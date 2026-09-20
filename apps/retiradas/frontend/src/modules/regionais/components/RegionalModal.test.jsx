import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RegionalModal from "./RegionalModal";

describe("RegionalModal", () => {
	it("preserva campos legados da regional no grupo operacional Delivery ao salvar", async () => {
		const onClose = vi.fn();
		const onSalvar = vi.fn().mockResolvedValue();

		render(
			<RegionalModal
				regional={{
					id: "regional-1",
					nome: "Metropolitana",
					cidades: [{ nome: "Belo Horizonte", tipo: "Comum" }],
					lider: { nome: "Lider Antigo", telefone: "31999990000", email: "" },
					supervisor: {
						nome: "Supervisor Antigo",
						telefone: "31988880000",
						email: "",
					},
					backoffice: {
						nome: "Backoffice Antigo",
						telefone: "31977770000",
						email: "",
					},
				}}
				onClose={onClose}
				onSalvar={onSalvar}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /salvar alteracoes/i }));

		await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
		expect(onSalvar).toHaveBeenCalledWith(
			expect.objectContaining({
				nome: "METROPOLITANA",
				backoffice: expect.objectContaining({ nome: "Backoffice Antigo" }),
				backoffices: [
					expect.objectContaining({ nome: "Backoffice Antigo" }),
				],
				gruposOperacionais: expect.objectContaining({
					delivery: expect.objectContaining({
						lider: expect.objectContaining({ nome: "Lider Antigo" }),
						supervisor: expect.objectContaining({
							nome: "Supervisor Antigo",
						}),
						backoffices: [
							expect.objectContaining({ nome: "Backoffice Antigo" }),
						],
					}),
				}),
			}),
		);
		expect(onClose).toHaveBeenCalled();
	});
});
