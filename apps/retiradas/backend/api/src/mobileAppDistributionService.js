const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const db = require("./db");
const mapsV2Service = require("./mapsV2/mapsV2Service");

const releasesRoot = path.resolve(
	process.env.APP_RELEASES_DIR ||
		path.join(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"), "app-releases"),
);
const temporaryRoot = path.join(releasesRoot, ".tmp");
const MAX_APK_BYTES = Number(process.env.APP_RELEASE_MAX_BYTES || 120 * 1024 * 1024);

function text(value, max = 300) {
	return String(value ?? "").trim().slice(0, max);
}

function actor(user = {}) {
	const profile = user.profile || user;
	return {
		id: text(profile.uid || profile.id || profile.email, 160),
		name: text(profile.nome || profile.name || profile.displayName || profile.email, 200),
	};
}

function normalizeVersionName(value) {
	const version = text(value, 80);
	if (!version || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(version)) {
		const error = new Error("Informe uma versao valida, como 1.0.0.");
		error.statusCode = 400;
		throw error;
	}
	return version;
}

function normalizeVersionCode(value) {
	if (value === "" || value === null || value === undefined) return null;
	const code = Number(value);
	if (!Number.isSafeInteger(code) || code < 1) {
		const error = new Error("O codigo da versao deve ser um inteiro positivo.");
		error.statusCode = 400;
		throw error;
	}
	return code;
}

function sha256(value) {
	return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function secureToken(bytes = 32) {
	return crypto.randomBytes(bytes).toString("base64url");
}

function normalizedRole(user = {}) {
	const profile = user.profile || user;
	return text(user.role || profile.role, 80).toLowerCase();
}

function requireTechnician(user = {}) {
	if (normalizedRole(user) !== "tecnico") {
		const error = new Error("O rastreamento nativo e exclusivo para tecnicos.");
		error.statusCode = 403;
		throw error;
	}
}

async function ensureDirectories() {
	await Promise.all([
		fsp.mkdir(releasesRoot, { recursive: true }),
		fsp.mkdir(temporaryRoot, { recursive: true }),
	]);
}

async function assertApkFile(filePath) {
	const handle = await fsp.open(filePath, "r");
	try {
		const header = Buffer.alloc(4);
		const { bytesRead } = await handle.read(header, 0, 4, 0);
		if (bytesRead !== 4 || !header.subarray(0, 2).equals(Buffer.from("PK"))) {
			const error = new Error("O arquivo enviado nao e um APK valido.");
			error.statusCode = 400;
			throw error;
		}
	} finally {
		await handle.close();
	}
}

function sha256File(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash("sha256");
		const stream = fs.createReadStream(filePath);
		stream.on("error", reject);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

function publicRelease(row = {}) {
	if (!row?.id) return null;
	return {
		id: row.id,
		versionName: row.version_name,
		versionCode: row.version_code,
		minimumSupportedCode: row.minimum_supported_code ?? row.version_code,
		fileName: row.file_name,
		fileSize: Number(row.file_size || 0),
		sha256: row.sha256,
		active: Boolean(row.active),
		notes: row.notes || "",
		uploadedByName: row.uploaded_by_name || "Sistema",
		uploadedAt: row.uploaded_at,
		downloadCount: Number(row.download_count || 0),
		lastDownloadAt: row.last_download_at,
	};
}

async function publishApk({ filePath, originalName, versionName, versionCode, notes, user }) {
	await ensureDirectories();
	const version = normalizeVersionName(versionName);
	const code = normalizeVersionCode(versionCode);
	if (!code) {
		const error = new Error("Informe o codigo numerico da versao para controlar as atualizacoes.");
		error.statusCode = 400;
		throw error;
	}
	const stats = await fsp.stat(filePath);
	if (!stats.isFile() || stats.size < 1024 || stats.size > MAX_APK_BYTES) {
		const error = new Error(`O APK deve ter entre 1 KB e ${Math.round(MAX_APK_BYTES / 1024 / 1024)} MB.`);
		error.statusCode = 400;
		throw error;
	}
	await assertApkFile(filePath);
	const sha256 = await sha256File(filePath);
	const safeVersion = version.replace(/[^A-Za-z0-9._-]/g, "-");
	const finalName = `retiradas-${safeVersion}-${sha256.slice(0, 12)}.apk`;
	const finalPath = path.join(releasesRoot, finalName);
	const uploadedBy = actor(user);
	await fsp.copyFile(filePath, finalPath);

	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("update mobile_app_releases set active=false where active=true");
		const inserted = await client.query(
			`insert into mobile_app_releases
			 (version_name,version_code,minimum_supported_code,file_name,storage_path,file_size,sha256,active,notes,uploaded_by_id,uploaded_by_name)
			 values ($1,$2,$2,$3,$4,$5,$6,true,$7,$8,$9) returning *`,
			[
				version,
				code,
				text(originalName, 260) || finalName,
				finalPath,
				stats.size,
				sha256,
				text(notes, 1000) || null,
				uploadedBy.id || null,
				uploadedBy.name || null,
			],
		);
		await client.query("commit");
		return publicRelease(inserted.rows[0]);
	} catch (error) {
		await client.query("rollback").catch(() => {});
		await fsp.unlink(finalPath).catch(() => {});
		throw error;
	} finally {
		client.release();
		await fsp.unlink(filePath).catch(() => {});
	}
}

async function getActiveReleaseRow() {
	const result = await db.query(
		`select * from mobile_app_releases where active=true order by uploaded_at desc limit 1`,
	);
	return result.rows[0] || null;
}

async function recordDownload(releaseId) {
	await db.query(
		`with updated as (
		   update mobile_app_releases
		      set download_count=download_count+1,last_download_at=now()
		    where id=$1 returning id
		 )
		 insert into mobile_app_downloads_daily (release_id,download_date,downloads)
		 select id,(now() at time zone 'America/Sao_Paulo')::date,1 from updated
		 on conflict (release_id,download_date) do update
		 set downloads=mobile_app_downloads_daily.downloads+1`,
		[releaseId],
	);
}

async function getDashboard() {
	const [active, releases, totals, timeline, presence, devices] = await Promise.all([
		getActiveReleaseRow(),
		db.query(`select * from mobile_app_releases order by uploaded_at desc limit 20`),
		db.query(
			`select coalesce(sum(download_count),0)::bigint total_downloads,
			 coalesce(sum(download_count) filter(where uploaded_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),0)::bigint downloads_from_today_releases
			 from mobile_app_releases`,
		),
		db.query(
			`select to_char(day::date,'YYYY-MM-DD') as day,coalesce(sum(d.downloads),0)::bigint downloads
			 from generate_series((current_date-interval '13 days')::date,current_date,interval '1 day') as series(day)
			 left join mobile_app_downloads_daily d on d.download_date=day::date
			 group by day order by day`,
		),
		db.query(
			`select
			 count(distinct user_id) filter(where client_type='android' and last_seen_at>=now()-interval '5 minutes')::integer online_android_users,
			 count(distinct session_id) filter(where client_type='android' and last_seen_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')::integer android_sessions_today,
			 count(distinct user_id) filter(where client_type='android' and last_seen_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')::integer android_users_today,
			 max(last_seen_at) filter(where client_type='android') last_android_seen_at
			 from maintenance_active_sessions`,
		),
		db.query(
			`select
			 count(*) filter(where active)::integer enrolled_devices,
			 count(distinct user_id) filter(where active and last_location_at>=now()-interval '5 minutes')::integer live_tracking_users,
			 count(distinct user_id) filter(where active and last_seen_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')::integer native_users_today,
			 max(last_location_at) filter(where active) last_native_location_at
			 from mobile_app_devices`,
		),
	]);
	const todayDownloads = timeline.rows.at(-1)?.downloads || 0;
	return {
		active: publicRelease(active),
		releases: releases.rows.map(publicRelease),
		metrics: {
			totalDownloads: Number(totals.rows[0]?.total_downloads || 0),
			todayDownloads: Number(todayDownloads || 0),
			...(presence.rows[0] || {}),
			...(devices.rows[0] || {}),
		},
		timeline: timeline.rows.map((item) => ({ day: item.day, downloads: Number(item.downloads || 0) })),
		downloadUrl: "/api/maintenance/app/download",
	};
}

async function getPublicVersion(currentCodeValue) {
	const active = await getActiveReleaseRow();
	if (!active) return { available: false, updateRequired: false, downloadUrl: "/api/maintenance/app/download" };
	const currentCode = normalizeVersionCode(currentCodeValue) || 0;
	const activeCode = Number(active.version_code || 0);
	const minimumCode = Number(active.minimum_supported_code || activeCode || 0);
	return {
		available: true,
		updateRequired: Boolean(activeCode && currentCode < minimumCode),
		currentCode,
		minimumSupportedCode: minimumCode,
		release: publicRelease(active),
		downloadUrl: "/api/maintenance/app/download",
	};
}

async function createEnrollment(user = {}) {
	requireTechnician(user);
	const profile = user.profile || user;
	const userId = text(user.uid || profile.uid || profile.id || user.email || profile.email, 180);
	if (!userId) {
		const error = new Error("Nao foi possivel identificar o tecnico.");
		error.statusCode = 400;
		throw error;
	}
	const code = secureToken(32);
	await db.query(
		"delete from mobile_app_enrollment_codes where expires_at<now()-interval '1 day' or consumed_at<now()-interval '1 day'",
	);
	await db.query(
		`insert into mobile_app_enrollment_codes (code_hash,user_id,expires_at)
		 values ($1,$2,now()+interval '5 minutes')`,
		[sha256(code), userId],
	);
	return { code, expiresInSeconds: 300 };
}

function validateInstallationId(value) {
	const installationId = text(value, 180);
	if (!/^[A-Za-z0-9._:-]{16,180}$/.test(installationId)) {
		const error = new Error("Identificador do aplicativo invalido.");
		error.statusCode = 400;
		throw error;
	}
	return installationId;
}

async function exchangeEnrollment(payload = {}) {
	const code = text(payload.code, 200);
	const installationId = validateInstallationId(payload.installationId);
	if (!code) {
		const error = new Error("Codigo de ativacao ausente.");
		error.statusCode = 400;
		throw error;
	}
	const token = secureToken(48);
	const client = await db.connect();
	try {
		await client.query("begin");
		const enrollment = await client.query(
			`update mobile_app_enrollment_codes enrollment
			    set consumed_at=now()
			  where enrollment.code_hash=$1 and enrollment.consumed_at is null and enrollment.expires_at>now()
			 returning enrollment.user_id`,
			[sha256(code)],
		);
		const userId = enrollment.rows[0]?.user_id;
		if (!userId) {
			const error = new Error("Codigo de ativacao invalido ou expirado.");
			error.statusCode = 401;
			throw error;
		}
		const account = await client.query(
			`select uid,email,display_name,role,disabled from app_users where uid=$1 for update`,
			[userId],
		);
		const user = account.rows[0];
		if (!user || user.disabled || text(user.role).toLowerCase() !== "tecnico") {
			const error = new Error("Conta de tecnico indisponivel.");
			error.statusCode = 403;
			throw error;
		}
		await client.query(
			`insert into mobile_app_devices
			 (user_id,installation_id,token_hash,app_version,device_name,platform_version,active,token_expires_at,last_seen_at)
			 values ($1,$2,$3,$4,$5,$6,true,now()+interval '180 days',now())
			 on conflict (user_id,installation_id) do update set
			 token_hash=excluded.token_hash,app_version=excluded.app_version,
			 device_name=excluded.device_name,platform_version=excluded.platform_version,
			 active=true,token_expires_at=excluded.token_expires_at,last_seen_at=now(),updated_at=now()`,
			[
				userId,
				installationId,
				sha256(token),
				text(payload.appVersion, 80) || null,
				text(payload.deviceName, 160) || null,
				text(payload.platformVersion, 80) || null,
			],
		);
		await client.query("commit");
		return { token, expiresInSeconds: 180 * 24 * 60 * 60, user: { id: user.uid, name: user.display_name } };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function authenticateDevice(deviceToken) {
	const token = text(deviceToken, 300);
	if (!token) {
		const error = new Error("Token do dispositivo ausente.");
		error.statusCode = 401;
		throw error;
	}
	const result = await db.query(
		`select device.id as device_id,device.user_id,account.email,account.display_name,
		        account.role,account.imported_profile
		   from mobile_app_devices device
		   join app_users account on account.uid=device.user_id
		  where device.token_hash=$1 and device.active=true and device.token_expires_at>now()
		    and account.disabled=false and lower(account.role)='tecnico'
		  limit 1`,
		[sha256(token)],
	);
	const row = result.rows[0];
	if (!row) {
		const error = new Error("Token do dispositivo invalido ou expirado.");
		error.statusCode = 401;
		throw error;
	}
	return {
		deviceId: row.device_id,
		user: {
			uid: row.user_id,
			email: row.email,
			role: row.role,
			displayName: row.display_name,
			profile: { ...(row.imported_profile || {}), uid: row.user_id, email: row.email, role: row.role, nome: row.display_name },
		},
	};
}

async function saveNativeLocation(deviceToken, payload = {}) {
	const authenticated = await authenticateDevice(deviceToken);
	const saved = await mapsV2Service.saveTechnicianPresence(payload, authenticated.user, {
		consentSource: "ANDROID_FOREGROUND_SERVICE",
	});
	await db.query(
		`update mobile_app_devices set last_seen_at=now(),last_location_at=now(),updated_at=now(),
		 app_version=coalesce(nullif($2,''),app_version) where id=$1`,
		[authenticated.deviceId, text(payload.appVersion, 80)],
	);
	return saved;
}

module.exports = {
	MAX_APK_BYTES,
	ensureDirectories,
	getActiveReleaseRow,
	getDashboard,
	getPublicVersion,
	createEnrollment,
	exchangeEnrollment,
	saveNativeLocation,
	normalizeVersionCode,
	normalizeVersionName,
	publishApk,
	recordDownload,
	releasesRoot,
	temporaryRoot,
};
