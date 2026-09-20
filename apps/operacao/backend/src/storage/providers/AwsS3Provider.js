const { S3CompatibleStorageProvider } = require("./S3CompatibleStorageProvider");

class AwsS3Provider extends S3CompatibleStorageProvider {
	constructor(env = process.env) {
		super({
			name: "s3",
			region: env.AWS_S3_REGION,
			endpoint: env.AWS_S3_ENDPOINT || undefined,
			bucket: env.AWS_S3_BUCKET,
			accessKeyId: env.AWS_ACCESS_KEY_ID,
			secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
			forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE === "true",
		});
	}
}

module.exports = { AwsS3Provider };
