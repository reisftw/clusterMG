import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileAppUpdateGate from "./MobileAppUpdateGate";

vi.mock("../../services/vpsApiClient", () => ({
	getApiBaseUrl: () => "https://retiradas.tech/api",
	getAppClientContext: () => ({ mode: "android", version: "1.0.7", code: 107 }),
}));

const release = {
	id: "release-107",
	versionCode: 107,
	versionName: "1.0.7",
	notes: "Agora o aplicativo abre no Dashboard.\nVeja as novidades pelo indicador de versao.",
};

describe("MobileAppUpdateGate", () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ updateRequired: false, release }),
		}));
	});

	it("mostra as novidades uma vez depois da atualizacao", async () => {
		const view = render(<MobileAppUpdateGate />);
		expect(await screen.findByText("Versão 1.0.7")).toBeInTheDocument();
		expect(screen.getByText("Agora o aplicativo abre no Dashboard.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
		expect(window.localStorage.getItem("retiradas-seen-app-release")).toBe("107");

		view.unmount();
		render(<MobileAppUpdateGate />);
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		expect(screen.queryByText("Versão 1.0.7")).not.toBeInTheDocument();
	});
});
