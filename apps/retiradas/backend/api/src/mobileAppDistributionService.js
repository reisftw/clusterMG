const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const db = require("./db");

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
			 (version_name,version_code,file_name,storage_path,file_size,sha256,active,notes,uploaded_by_id,uploaded_by_name)
			 values ($1,$2,$3,$4,$5,$6,true,$7,$8,$9) returning *`,
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
	const [active, releases, totals, timeline, presence] = await Promise.all([
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
	]);
	const todayDownloads = timeline.rows.at(-1)?.downloads || 0;
	return {
		active: publicRelease(active),
		releases: releases.rows.map(publicRelease),
		metrics: {
			totalDownloads: Number(totals.rows[0]?.total_downloads || 0),
			todayDownloads: Number(todayDownloads || 0),
			...(presence.rows[0] || {}),
		},
		timeline: timeline.rows.map((item) => ({ day: item.day, downloads: Number(item.downloads || 0) })),
		downloadUrl: "/api/maintenance/app/download",
	};
}

module.exports = {
	MAX_APK_BYTES,
	ensureDirectories,
	getActiveReleaseRow,
	getDashboard,
	normalizeVersionCode,
	normalizeVersionName,
	publishApk,
	recordDownload,
	releasesRoot,
	temporaryRoot,
};
