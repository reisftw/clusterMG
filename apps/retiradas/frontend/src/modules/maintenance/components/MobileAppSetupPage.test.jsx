import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileAppSetupPage from "./MobileAppSetupPage";

const mocks = vi.hoisted(() => ({
	user: { role: "tecnico" },
	getSupport: vi.fn(),
	bind: vi.fn(),
	enable: vi.fn(),
	sync: vi.fn(),
	request: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({
	useAuthContext: () => ({ currentUser: mocks.user, realUser: mocks.user }),
}));

vi.mock("../../../services/pushNotificationsService", () => ({
	getPushSupportState: mocks.getSupport,
	bindForegroundPushNotifications: mocks.bind,
	enablePushNotifications: mocks.enable,
	syncSavedPushSubscription: mocks.sync,
}));

vi.mock("../../../services/vpsApiClient", () => ({
	getAppClientContext: () => ({ mode: "android", version: "1.0.2", code: 102 }),
	requestVpsApi: mocks.request,
}));

describe("MobileAppSetupPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.user.role = "tecnico";
		mocks.getSupport.mockResolvedValue({
			supported: true,
			hasNotificationApi: true,
			hasVapidKey: true,
			subscribed: false,
			permission: "default",
		});
		mocks.bind.mockResolvedValue(undefined);
		mocks.enable.mockResolvedValue(undefined);
	mocks.sync.mockResolvedValue(undefined);
	});

	it("mostra as duas autorizacoes para tecnico no aplicativo", async () => {
		render(<MemoryRouter><MobileAppSetupPage /></MemoryRouter>);

		expect(await screen.findByRole("button", { name: "Autorizar notificacoes" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Autorizar localizacao|Configurar novamente/ })).toBeInTheDocument();
		expect(screen.getByText("Versao instalada:")).toBeInTheDocument();
	});

	it("ativa push e atualiza o estado mostrado", async () => {
		mocks.getSupport
			.mockResolvedValueOnce({ supported: true, subscribed: false, permission: "default" })
			.mockResolvedValueOnce({ supported: true, subscribed: true, permission: "granted" });
		render(<MemoryRouter><MobileAppSetupPage /></MemoryRouter>);

		fireEvent.click(await screen.findByRole("button", { name: "Autorizar notificacoes" }));

		await waitFor(() => expect(mocks.enable).toHaveBeenCalledTimes(1));
		expect(mocks.bind).toHaveBeenCalledTimes(1);
		expect(mocks.sync).toHaveBeenCalledTimes(1);
		expect(await screen.findByRole("button", { name: "Notificacoes ativadas" })).toBeDisabled();
	});

	it("explica que conta administrativa nao envia localizacao", async () => {
		mocks.user.role = "admin";
		render(<MemoryRouter><MobileAppSetupPage /></MemoryRouter>);

		expect(await screen.findByText(/A localizacao operacional e enviada somente por contas com cargo Tecnico/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Autorizar localizacao/ })).not.toBeInTheDocument();
	});
});
