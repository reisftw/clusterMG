const DEFAULT_VERSION = "local";
const DEFAULT_ENVIRONMENT = "Local";

export function getAppBuildInfo() {
	const version =
		import.meta.env.VITE_APP_VERSION ||
		import.meta.env.VITE_GIT_SHA ||
		DEFAULT_VERSION;
	const environment =
		import.meta.env.VITE_APP_ENV_LABEL ||
		import.meta.env.VITE_APP_ENV ||
		DEFAULT_ENVIRONMENT;

	return {
		environment,
		version,
	};
}
