import { fireEvent, render, screen } from "@testing-library/react";
import { EmpresaForm } from "./EmpresasTecnicosPage";

const mocks = vi.hoisted(() => ({
	isInlineCompanyTechniciansEnabled: vi.fn(),
}));

vi.mock("../inlineTechniciansFlag", () => ({
	isInlineCompanyTechniciansEnabled: mocks.isInlineCompanyTechniciansEnabled,
}));

describe("EmpresaForm - feature flag de tecnicos inline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("oculta a secao de tecnicos quando a flag esta desativada", () => {
		mocks.isInlineCompanyTechniciansEnabled.mockReturnValue(false);

		render(
			<EmpresaForm regionais={[]} onCancel={() => {}} onSave={() => {}} saving={false} />,
		);

		expect(screen.queryByText("Técnicos")).not.toBeInTheDocument();
	});

	it("exibe a secao de tecnicos quando a flag esta ativada", () => {
		mocks.isInlineCompanyTechniciansEnabled.mockReturnValue(true);

		render(
			<EmpresaForm regionais={[]} onCancel={() => {}} onSave={() => {}} saving={false} />,
		);

		expect(screen.getByText("Técnicos")).toBeInTheDocument();
	});

	it("preserva form.tecnicos no submit mesmo com a flag desativada (UI oculta nao apaga dados)", () => {
		mocks.isInlineCompanyTechniciansEnabled.mockReturnValue(false);
		const onSave = vi.fn();
		const initialValue = {
			nome: "Empresa X",
			tecnicos: [{ id: "t1", nome: "João", email: "joao@example.com" }],
		};

		render(
			<EmpresaForm
				initialValue={initialValue}
				regionais={[]}
				onCancel={() => {}}
				onSave={onSave}
				saving={false}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /salvar empresa/i }));

		expect(onSave).toHaveBeenCalledTimes(1);
		const payload = onSave.mock.calls[0][0];
		expect(payload.tecnicos).toHaveLength(1);
		expect(payload.tecnicos[0]).toMatchObject({ id: "t1", nome: "João" });
	});
});
