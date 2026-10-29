import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { ROLES } from "../../constants/roles";
import { useRadarLocation } from "../../modules/maps/features/geolocation/useRadarLocation";
import { updateTechnicianPresence } from "../../modules/maps/services/technicianPresence";

export default function TechnicianLocationPresence() {
	const { currentUser, realUser } = useAuthContext();
	const { pathname } = useLocation();
	const authenticatedUser = realUser || currentUser;
	const isTechnician = String(authenticatedUser?.role || "").trim().toLowerCase() === ROLES.TECNICO;
	const [enabled, setEnabled] = useState(false);
	const location = useRadarLocation(isTechnician && enabled && pathname !== "/maps");

	useEffect(() => {
		if (!isTechnician || !navigator.permissions?.query) return undefined;
		let active = true;
		let permission = null;
		navigator.permissions
			.query({ name: "geolocation" })
			.then((status) => {
				if (!active) return;
				permission = status;
				setEnabled(status.state === "granted");
				status.onchange = () => setEnabled(status.state === "granted");
			})
			.catch(() => setEnabled(false));
		return () => {
			active = false;
			if (permission) permission.onchange = null;
		};
	}, [isTechnician]);

	useEffect(() => {
		if (!isTechnician || !location.position) return;
		updateTechnicianPresence(location.position).catch(() => {});
	}, [isTechnician, location.position]);

	return null;
}
