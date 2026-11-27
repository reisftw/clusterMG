import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	confirmPwaUpdate,
	consumePwaUpdateConfirmation,
	PWA_UPDATE_AVAILABLE_EVENT,
	watchForServiceWorkerUpdate,
} from "./appServiceWorker";

describe("appServiceWorker update flow", () => {
	beforeEach(() => {
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: { controller: {} },
		});
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
	});

	it("announces a waiting version without activating it automatically", () => {
		const registration = {
			waiting: { postMessage: vi.fn() },
			addEventListener: vi.fn(),
		};
		const listener = vi.fn();
		window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, listener, { once: true });

		watchForServiceWorkerUpdate(registration);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(registration.waiting.postMessage).not.toHaveBeenCalled();
	});

	it("announces an update only after the installing worker is ready", () => {
		let onUpdateFound;
		let onStateChange;
		const installing = {
			state: "installing",
			addEventListener: vi.fn((event, callback) => {
				if (event === "statechange") onStateChange = callback;
			}),
		};
		const registration = {
			waiting: null,
			installing,
			addEventListener: vi.fn((event, callback) => {
				if (event === "updatefound") onUpdateFound = callback;
			}),
		};
		const listener = vi.fn();
		window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, listener, { once: true });

		watchForServiceWorkerUpdate(registration);
		onUpdateFound();
		registration.waiting = { postMessage: vi.fn() };
		installing.state = "installed";
		onStateChange();

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("activates the waiting version only after explicit confirmation", () => {
		const waiting = { postMessage: vi.fn() };
		const storage = { getItem: vi.fn(() => "1"), setItem: vi.fn(), removeItem: vi.fn() };
		confirmPwaUpdate({ waiting }, storage);

		expect(storage.setItem).toHaveBeenCalledWith("retiradas-pwa-update-confirmed", "1");
		expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
		expect(consumePwaUpdateConfirmation(storage)).toBe(true);
		expect(storage.removeItem).toHaveBeenCalledWith("retiradas-pwa-update-confirmed");
	});

	it("does not reload when a controller changes without user confirmation", () => {
		const storage = { getItem: vi.fn(() => null), removeItem: vi.fn() };
		expect(consumePwaUpdateConfirmation(storage)).toBe(false);
		expect(storage.removeItem).not.toHaveBeenCalled();
	});
});

describe("service worker cache boundaries", () => {
	const source = readFileSync(
		resolve(process.cwd(), "apps/retiradas/frontend/public/sw.js"),
		"utf8",
	);

	it("intercepts only REVO static assets outside navigations", () => {
		expect(source).toContain('url.pathname.startsWith("/assets/") || APP_SHELL.includes(url.pathname)');
		expect(source).toContain('const EXCLUDED_APP_PREFIXES = ["/adm", "/liliane"]');
		expect(source).not.toContain("else if (isSameOrigin) {");
	});

	it("keeps installing when one optional shell asset fails", () => {
		expect(source).toContain("Promise.allSettled(");
		expect(source).not.toContain("cache.addAll(APP_SHELL)");
	});
});
