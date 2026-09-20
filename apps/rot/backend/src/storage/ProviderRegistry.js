const { AwsS3Provider } = require("./providers/AwsS3Provider");
const { CloudflareR2Provider } = require("./providers/CloudflareR2Provider");

class ProviderRegistry {
	constructor(env = process.env) {
		this.env = env;
		this.instances = new Map();
	}

	defaultProviderName() {
		return String(this.env.STORAGE_DEFAULT_PROVIDER || this.env.STORAGE_PROVIDER || "r2").trim().toLowerCase();
	}

	getDefaultProvider() {
		return this.getProvider(this.defaultProviderName());
	}

	getProvider(name) {
		const providerName = String(name || "").trim().toLowerCase();
		if (!providerName) throw new Error("Provider de storage não informado.");
		if (this.instances.has(providerName)) return this.instances.get(providerName);

		let provider;
		if (providerName === "r2") provider = new CloudflareR2Provider(this.env);
		else if (providerName === "s3") provider = new AwsS3Provider(this.env);
		else throw new Error(`Provider de storage não suportado: ${providerName}`);

		this.instances.set(providerName, provider);
		return provider;
	}
}

const registry = new ProviderRegistry();

module.exports = { ProviderRegistry, registry };
