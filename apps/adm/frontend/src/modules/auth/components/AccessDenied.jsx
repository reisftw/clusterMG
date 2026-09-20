import ErrorPage from "../../../components/ui/ErrorPage";
import { useAuthContext } from "../../../context/useAuthContext";
import { ROUTES } from "../../../router/routes";

const AccessDenied = () => {
	const { isViewingAsRole, realUser, setViewAsRole } = useAuthContext();
	const canLeaveViewAs =
		isViewingAsRole && String(realUser?.role || "").toLowerCase() === "admin";

	const leaveViewAs = () => {
		setViewAsRole("");
		window.location.assign(ROUTES.DASHBOARD);
	};

	return (
		<ErrorPage
			code="403"
			extraActions={
				canLeaveViewAs ? (
					<button
						type="button"
						onClick={leaveViewAs}
						className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-[0_18px_34px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-700 xl:min-h-14 xl:rounded-2xl xl:text-base"
					>
						Sair do Ver como
					</button>
				) : null
			}
		/>
	);
};

export default AccessDenied;
