import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import PublicMaintenancePage from "./PublicMaintenancePage";
import { getPublicMaintenanceStatus } from "../services/maintenanceService";

export default function MaintenanceBoundary({ children }) {
	const location = useLocation();
	const [status, setStatus] = useState(null);
	const [ready, setReady] = useState(false);

	const loadStatus = useCallback(async () => {
		try {
			const next = await getPublicMaintenanceStatus();
			setStatus(next);
			return next;
		} catch {
			return null;
		} finally {
			setReady(true);
		}
	}, []);

	useEffect(() => {
		loadStatus();
	}, [loadStatus, location.pathname]);

	useEffect(() => {
		const intervalMs = status?.active ? 10_000 : 30_000;
		const timer = window.setInterval(loadStatus, intervalMs);
		return () => window.clearInterval(timer);
	}, [loadStatus, status?.active]);

	useEffect(() => {
		if (
			status?.active &&
			status.redirectEnabled &&
			status.redirectUrl &&
			location.pathname !== "/maintenance"
		) {
			window.location.replace(status.redirectUrl);
		}
	}, [location.pathname, status]);

	if (!ready) {
		return <div className="min-h-screen bg-white" aria-busy="true" />;
	}
	if (status?.active && location.pathname !== "/maintenance") {
		return <PublicMaintenancePage status={status} onStatusChange={setStatus} />;
	}
	return children;
}
