const { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { StorageProvider } = require("../StorageProvider");

class S3CompatibleStorageProvider extends StorageProvider {
	constructor({ name, region, endpoint, bucket, accessKeyId, secretAccessKey, forcePathStyle = false }) {
		super(name);
		if (!bucket) throw new Error(`Bucket não configurado para provider ${name}.`);
		this.bucket = bucket;
		this.client = new S3Client({
			region: region || "auto",
			endpoint: endpoint || undefined,
			forcePathStyle,
			credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
		});
	}

	async createUploadUrl({ key, mimeType, expiresIn = 300 }) {
		const command = new PutObjectCommand({
			Bucket: this.bucket,
			Key: key,
			ContentType: mimeType,
		});
		return getSignedUrl(this.client, command, { expiresIn });
	}

	async createReadUrl({ key, expiresIn = 300 }) {
		const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
		return getSignedUrl(this.client, command, { expiresIn });
	}

	async deleteObject(key) {
		await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
	}

	async headObject(key) {
		const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
		return {
			contentLength: Number(response.ContentLength || 0),
			contentType: response.ContentType || "",
			etag: response.ETag || "",
			lastModified: response.LastModified || null,
		};
	}
}

module.exports = { S3CompatibleStorageProvider };
