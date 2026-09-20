import { useRotAuth } from "../state/RotAuthContext";

export function useAuthContext() {
	const { user, ...rest } = useRotAuth();
	return { currentUser: user, user, ...rest };
}
