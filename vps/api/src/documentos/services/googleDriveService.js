const { Readable } = require("node:stream");
const { google } = require("googleapis");
const documents = require("../../documents");

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const OAUTH_CONFIG_PATH = "system_google_drive/oauth_config";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

let driveClient = null;

function getDefaultOAuthRedirectUri() {
	return `${String(process.env.PUBLIC_APP_URL || "https://retiradas.tech").replace(/\/+$/, "")}/api/documentos/google/callback`;
}

async function getDriveClient() {
	if (driveClient) return driveClient;

	const oauthClient = await getOAuthClientWithCredentials();
	if (oauthClient) {
		driveClient = google.drive({ version: "v3", auth: oauthClient });
		return driveClient;
	}

	const keyFile = String(
		process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
	).trim();
	if (!keyFile)
		throw new Error("GOOGLE_APPLICATION_CREDENTIALS nao configurado.");
	const auth = new google.auth.GoogleAuth({
		keyFile,
		scopes: DRIVE_SCOPES,
	});
	driveClient = google.drive({ version: "v3", auth });
	return driveClient;
}

function resetDriveClient() {
	driveClient = null;
}

async function getStoredOAuthConfig() {
	const doc = await documents.getDocument(OAUTH_CONFIG_PATH).catch(() => null);
	return doc?.data || {};
}

async function saveStoredOAuthConfig(data = {}) {
	await documents.upsertDocument({
		path: OAUTH_CONFIG_PATH,
		collectionPath: "system_google_drive",
		documentId: "oauth_config",
		parentPath: null,
		data: {
			...(await getStoredOAuthConfig()),
			...data,
			updatedAt: new Date().toISOString(),
		},
	});
}

function cleanText(value) {
	return String(value || "").trim();
}

function normalizeDriveFolderId(value) {
	const text = cleanText(value);
	if (!text) return "";
	const folderMatch = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
	if (folderMatch?.[1]) return folderMatch[1];
	const idQueryMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
	if (idQueryMatch?.[1]) return idQueryMatch[1];
	return text;
}

async function getGoogleDriveConfig() {
	const stored = await getStoredOAuthConfig();
	return {
		folderId: normalizeDriveFolderId(
			stored.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID,
		),
		oauthClientId: cleanText(
			stored.oauthClientId || process.env.GOOGLE_OAUTH_CLIENT_ID,
		),
		oauthClientSecret: cleanText(
			stored.oauthClientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET,
		),
		oauthRedirectUri: cleanText(
			stored.oauthRedirectUri ||
				process.env.GOOGLE_OAUTH_REDIRECT_URI ||
				getDefaultOAuthRedirectUri(),
		),
		refreshToken: cleanText(
			stored.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
		),
		connectedAt: stored.connectedAt || null,
		connectedByName: stored.connectedByName || null,
		updatedConfigAt: stored.updatedConfigAt || null,
		updatedConfigByName: stored.updatedConfigByName || null,
	};
}

async function getRootFolderId() {
	const config = await getGoogleDriveConfig();
	if (!config.folderId)
		throw new Error("GOOGLE_DRIVE_FOLDER_ID nao configurado.");
	return config.folderId;
}

async function createOAuthClient() {
	const config = await getGoogleDriveConfig();
	if (!config.oauthClientId || !config.oauthClientSecret) return null;
	return new google.auth.OAuth2(
		config.oauthClientId,
		config.oauthClientSecret,
		config.oauthRedirectUri,
	);
}

async function getRefreshToken() {
	const config = await getGoogleDriveConfig();
	return config.refreshToken;
}

async function getOAuthClientWithCredentials() {
	const client = await createOAuthClient();
	if (!client) return null;
	const refreshToken = await getRefreshToken();
	if (!refreshToken) return null;
	client.setCredentials({ refresh_token: refreshToken });
	return client;
}

async function getOAuthAuthUrl() {
	const client = await createOAuthClient();
	if (!client) {
		const error = new Error(
			"Configure GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET.",
		);
		error.statusCode = 503;
		throw error;
	}
	return client.generateAuthUrl({
		access_type: "offline",
		prompt: "consent",
		scope: DRIVE_SCOPES,
	});
}

async function connectOAuth(code, user = {}) {
	const client = await createOAuthClient();
	if (!client) {
		const error = new Error("OAuth Google Drive nao configurado.");
		error.statusCode = 503;
		throw error;
	}
	const { tokens } = await client.getToken(code);
	if (!tokens.refresh_token) {
		const error = new Error(
			"Google nao retornou refresh_token. Revogue o acesso do app na conta Google e conecte novamente.",
		);
		error.statusCode = 400;
		throw error;
	}
	await saveStoredOAuthConfig({
		refreshToken: tokens.refresh_token,
		connectedAt: new Date().toISOString(),
		connectedBy: user?.uid || user?.email || null,
		connectedByName: user?.profile?.nome || user?.nome || user?.email || null,
	});
	resetDriveClient();
	return getDriveStatus();
}

async function saveDriveConfig(config = {}, user = {}) {
	const current = await getStoredOAuthConfig();
	const next = {};
	if (Object.hasOwn(config, "folderId")) {
		next.folderId = normalizeDriveFolderId(config.folderId);
	}
	if (Object.hasOwn(config, "oauthClientId")) {
		next.oauthClientId = cleanText(config.oauthClientId);
	}
	if (Object.hasOwn(config, "oauthRedirectUri")) {
		next.oauthRedirectUri =
			cleanText(config.oauthRedirectUri) || getDefaultOAuthRedirectUri();
	}
	if (Object.hasOwn(config, "oauthClientSecret")) {
		const secret = cleanText(config.oauthClientSecret);
		if (secret) next.oauthClientSecret = secret;
	}

	await saveStoredOAuthConfig({
		...current,
		...next,
		updatedConfigAt: new Date().toISOString(),
		updatedConfigBy: user?.uid || user?.email || null,
		updatedConfigByName:
			user?.profile?.nome || user?.nome || user?.email || null,
	});
	resetDriveClient();
	return getDriveStatus();
}

async function getDriveStatus() {
	const config = await getGoogleDriveConfig();
	const hasOAuthCredentials = Boolean(config.refreshToken);
	const oauthConfigured = Boolean(
		config.oauthClientId && config.oauthClientSecret,
	);
	return {
		mode: hasOAuthCredentials ? "oauth" : "service_account",
		oauthConfigured,
		oauthConnected: hasOAuthCredentials,
		connectedAt: config.connectedAt,
		connectedByName: config.connectedByName,
		folderId: config.folderId,
		folderIdConfigured: Boolean(config.folderId),
		oauthClientId: config.oauthClientId,
		oauthClientSecretConfigured: Boolean(config.oauthClientSecret),
		oauthRedirectUri: config.oauthRedirectUri,
		updatedConfigAt: config.updatedConfigAt,
		updatedConfigByName: config.updatedConfigByName,
		serviceAccountConfigured: Boolean(
			process.env.GOOGLE_APPLICATION_CREDENTIALS,
		),
	};
}

function escapeDriveQuery(value) {
	return String(value || "")
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'");
}

async function findFolderByName(name, parentFolderId = null) {
	const drive = await getDriveClient();
	const resolvedParentFolderId = parentFolderId || (await getRootFolderId());
	const response = await drive.files.list({
		q: [
			`name = '${escapeDriveQuery(name)}'`,
			`mimeType = '${FOLDER_MIME_TYPE}'`,
			`'${escapeDriveQuery(resolvedParentFolderId)}' in parents`,
			"trashed = false",
		].join(" and "),
		fields: "files(id,name)",
		pageSize: 1,
		supportsAllDrives: true,
		includeItemsFromAllDrives: true,
	});
	return response.data.files?.[0] || null;
}

async function getFileMetadata(
	fileId,
	fields = "id,name,mimeType,size,createdTime,modifiedTime,parents",
) {
	const drive = await getDriveClient();
	const response = await drive.files.get({
		fileId,
		fields,
		supportsAllDrives: true,
	});
	return response.data;
}

async function listFolder(folderId) {
	const drive = await getDriveClient();
	const files = [];
	let pageToken = null;
	do {
		const response = await drive.files.list({
			q: [`'${escapeDriveQuery(folderId)}' in parents`, "trashed = false"].join(
				" and ",
			),
			fields:
				"nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents)",
			orderBy: "folder,name",
			pageSize: 100,
			pageToken,
			supportsAllDrives: true,
			includeItemsFromAllDrives: true,
		});
		files.push(...(response.data.files || []));
		pageToken = response.data.nextPageToken || null;
	} while (pageToken);
	return files;
}

async function createFolder(name, parentFolderId = null) {
	const drive = await getDriveClient();
	const resolvedParentFolderId = parentFolderId || (await getRootFolderId());
	const existing = await findFolderByName(name, resolvedParentFolderId);
	if (existing?.id) return existing;
	const response = await drive.files.create({
		requestBody: {
			name,
			mimeType: FOLDER_MIME_TYPE,
			parents: [resolvedParentFolderId],
		},
		fields: "id,name",
		supportsAllDrives: true,
	});
	return response.data;
}

async function uploadFile({ file, folderId, name }) {
	const drive = await getDriveClient();
	const response = await drive.files.create({
		requestBody: {
			name: name || file.originalname,
			parents: [folderId],
		},
		media: {
			mimeType: file.mimetype || "application/octet-stream",
			body: Readable.from(file.buffer),
		},
		fields: "id,name,mimeType,size,createdTime,modifiedTime",
		supportsAllDrives: true,
	});
	return response.data;
}

async function downloadFile(fileId) {
	const drive = await getDriveClient();
	return drive.files.get(
		{ fileId, alt: "media", supportsAllDrives: true },
		{ responseType: "stream" },
	);
}

async function renameFile(fileId, name) {
	const drive = await getDriveClient();
	const response = await drive.files.update({
		fileId,
		requestBody: { name },
		fields: "id,name,mimeType,size,modifiedTime",
		supportsAllDrives: true,
	});
	return response.data;
}

async function deleteFile(fileId) {
	const drive = await getDriveClient();
	await drive.files.delete({ fileId, supportsAllDrives: true });
}

module.exports = {
	connectOAuth,
	createFolder,
	deleteFile,
	downloadFile,
	getFileMetadata,
	getDriveStatus,
	getOAuthAuthUrl,
	getRootFolderId,
	listFolder,
	renameFile,
	saveDriveConfig,
	uploadFile,
};
