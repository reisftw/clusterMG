import { useRotAuth } from "../state/useRotAuth";

export function useAuthContext() {
	const { user, ...rest } = useRotAuth();
	return { currentUser: user, user, ...rest };
}
