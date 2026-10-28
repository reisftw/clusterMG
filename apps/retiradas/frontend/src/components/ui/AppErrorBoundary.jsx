import { Component } from "react";
import ErrorPage from "./ErrorPage";
import {
	isStaleAssetError,
	reloadOnceForFreshAssets,
} from "../../utils/staleAssetRecovery";

class AppErrorBoundary extends Component {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error, info) {
		if (isStaleAssetError(error) && reloadOnceForFreshAssets()) return;
		console.error("[AppErrorBoundary]", error, info);
	}

	render() {
		if (this.state.hasError) {
			return <ErrorPage code="500" />;
		}

		return this.props.children;
	}
}

export default AppErrorBoundary;
