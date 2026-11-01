import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TechnicianPushPermissionPrompt from "./TechnicianPushPermissionPrompt";

const pushMocks = vi.hoisted(() => ({
	bind: vi.fn(),
	enable: vi.fn(),
	isAndroid: vi.fn(),
	openSettings: vi.fn(),
	sync: vi.fn(),
	support: vi.fn(),
}));

vi.mock("../../services/pushNotificationsService", () => ({
	bindForegroundPushNotifications: pushMocks.bind,
	enablePushNotifications: pushMocks.enable,
	getPushSupportState: pushMocks.support,
	isAndroidAppClient: pushMocks.isAndroid,
	openAndroidNotificationSettings: pushMocks.openSettings,
	syncSavedPushSubscription: pushMocks.sync,
}));

describe("TechnicianPushPermissionPrompt", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pushMocks.support.mockResolvedValue({
			supported: true,
			hasNotificationApi: true,
			hasVapidKey: true,
			subscribed: false,
		});
		pushMocks.bind.mockResolvedValue(undefined);
		pushMocks.enable.mockResolvedValue(undefined);
		pushMocks.isAndroid.mockReturnValue(false);
		pushMocks.openSettings.mockReturnValue(true);
		pushMocks.sync.mockResolvedValue(undefined);
	});

	it("abre as configurações nativas quando a permissão foi bloqueada no APK", async () => {
		pushMocks.isAndroid.mockReturnValue(true);
		pushMocks.support.mockResolvedValue({
			supported: true,
			hasNotificationApi: true,
			hasVapidKey: true,
			subscribed: false,
			permission: "denied",
		});

		render(<TechnicianPushPermissionPrompt />);
		fireEvent.click(await screen.findByRole("button", { name: "Abrir configurações" }));

		expect(pushMocks.openSettings).toHaveBeenCalledTimes(1);
		expect(pushMocks.enable).not.toHaveBeenCalled();
	});

	it("exibe apenas a ação de autorizar e não oferece Agora não", async () => {
		render(<TechnicianPushPermissionPrompt />);

		expect(await screen.findByRole("button", { name: "Autorizar notificações" })).toBeInTheDocument();
		expect(screen.queryByText(/agora não/i)).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Fechar aviso de notificações" })).toBeInTheDocument();
	});

	it("inscreve o aparelho e fecha o aviso após autorizar", async () => {
		render(<TechnicianPushPermissionPrompt />);

		fireEvent.click(await screen.findByRole("button", { name: "Autorizar notificações" }));

		await waitFor(() => expect(pushMocks.enable).toHaveBeenCalledTimes(1));
		expect(pushMocks.bind).toHaveBeenCalledTimes(1);
		await waitFor(() => {
			expect(screen.queryByRole("button", { name: "Autorizar notificações" })).not.toBeInTheDocument();
		});
	});

	it("não aparece quando o aparelho já está inscrito", async () => {
		pushMocks.support.mockResolvedValue({
			supported: true,
			hasNotificationApi: true,
			hasVapidKey: true,
			subscribed: true,
		});

		render(<TechnicianPushPermissionPrompt />);

		await waitFor(() => expect(pushMocks.support).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(pushMocks.sync).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole("button", { name: "Autorizar notificações" })).not.toBeInTheDocument();
	});
});
