import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ModalShell from "./ModalShell";

function ModalHarness() {
	const [open, setOpen] = useState(false);

	return (
		<div>
			<button type="button" onClick={() => setOpen(true)}>
				Abrir modal
			</button>
			<ModalShell
				title="Modal de teste"
				open={open}
				onClose={() => setOpen(false)}
			>
				<button type="button">Primeiro</button>
				<button type="button">Segundo</button>
			</ModalShell>
		</div>
	);
}

describe("ModalShell", () => {
	it("prende o foco, fecha com Escape e devolve o foco ao gatilho", async () => {
		const user = userEvent.setup();
		render(<ModalHarness />);

		const trigger = screen.getByRole("button", { name: /abrir modal/i });
		await user.click(trigger);

		const firstButton = await screen.findByRole("button", {
			name: /primeiro/i,
		});
		const secondButton = screen.getByRole("button", { name: /segundo/i });
		const closeButton = screen.getByRole("button", { name: /fechar/i });

		await waitFor(() => expect(closeButton).toHaveFocus());
		await user.tab();
		expect(firstButton).toHaveFocus();
		await user.tab();
		expect(secondButton).toHaveFocus();
		await user.tab();
		expect(closeButton).toHaveFocus();

		await user.keyboard("{Escape}");

		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		await waitFor(() => expect(trigger).toHaveFocus());
	});

	it("fecha ao clicar no backdrop", async () => {
		const user = userEvent.setup();
		render(<ModalHarness />);

		await user.click(screen.getByRole("button", { name: /abrir modal/i }));
		await screen.findByRole("dialog", { name: /modal de teste/i });

		await user.click(screen.getByRole("button", { name: /fundo do modal/i }));

		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});
});
