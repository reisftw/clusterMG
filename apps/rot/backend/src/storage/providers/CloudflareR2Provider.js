const { S3CompatibleStorageProvider } = require("./S3CompatibleStorageProvider");

class CloudflareR2Provider extends S3CompatibleStorageProvider {
	constructor(env = process.env) {
		super({
			name: "r2",
			region: "auto",
			endpoint: env.R2_ENDPOINT,
			bucket: env.R2_BUCKET,
			accessKeyId: env.R2_ACCESS_KEY_ID,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY,
			forcePathStyle: true,
		});
	}
}

module.exports = { CloudflareR2Provider };
