import { useEffect } from "react";
import { createApr } from "../api/aprApi";
import { createRotRainAlert, createRotRompimento } from "../api/rotApi";
import { flushQueuedAprs } from "../utils/offlineAprQueue";
import { flushQueuedRotActions } from "../utils/offlineRotQueue";

export default function AprOfflineSync() {
	useEffect(() => {
		let active = true;
		const sync = () => {
			flushQueuedAprs(createApr)
				.then(({ sent }) => {
					if (active && sent) window.dispatchEvent(new CustomEvent("rot-apr-offline-synced", { detail: { sent } }));
				})
				.catch(() => {});
			flushQueuedRotActions({ createRompimento: createRotRompimento, createRain: createRotRainAlert }).catch(() => {});
		};
		sync();
		window.addEventListener("online", sync);
		return () => {
			active = false;
			window.removeEventListener("online", sync);
		};
	}, []);
	return null;
}
