import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const mobileApp = require(
	path.join(process.cwd(), "apps/retiradas/backend/api/src/mobileAppDistributionService.js"),
);
const mobileAppDb = require(
	path.join(process.cwd(), "apps/retiradas/backend/api/src/db.js"),
);

describe("Distribuicao do aplicativo Android", () => {
	it("aceita versoes rastreaveis e bloqueia nomes inseguros", () => {
		expect(mobileApp.normalizeVersionName("1.2.0-prod")).toBe("1.2.0-prod");
		expect(() => mobileApp.normalizeVersionName("../../app")).toThrow(/versao valida/);
	});

	it("valida o codigo numerico da versao", () => {
		expect(mobileApp.normalizeVersionCode("3")).toBe(3);
		expect(mobileApp.normalizeVersionCode("")).toBeNull();
		expect(() => mobileApp.normalizeVersionCode("3.2")).toThrow(/inteiro positivo/);
	});

	it("aceita codigo zero para abrir as novidades pelo rodape", async () => {
		const originalQuery = mobileAppDb.query;
		mobileAppDb.query = async () => ({
			rows: [{ id: "release-108", version_name: "1.0.8", version_code: 108, active: true }],
		});
		try {
			const result = await mobileApp.getPublicVersion("0");
			expect(result.currentCode).toBe(0);
			expect(result.release.versionName).toBe("1.0.8");
		} finally {
			mobileAppDb.query = originalQuery;
		}
	});

	it("mantem pacote e certificado iguais no TWA e no Digital Asset Links", () => {
		const manifest = JSON.parse(
			fs.readFileSync("apps/retiradas/android-twa/twa-manifest.json", "utf8"),
		);
		const assetLinks = JSON.parse(
			fs.readFileSync(
				"apps/retiradas/frontend/public/.well-known/assetlinks.json",
				"utf8",
			),
		);
		expect(assetLinks[0].target.package_name).toBe(manifest.packageId);
		expect(assetLinks[0].target.sha256_cert_fingerprints).toContain(
			manifest.fingerprints[0].value,
		);
		expect(manifest.appVersionName).toBe("1.0.8");
		expect(manifest.appVersionCode).toBe(108);
		expect(manifest.startUrl).toBe("/?source=android&appVersion=1.0.8&appCode=108");
		const gradle = fs.readFileSync("apps/retiradas/android-twa/app/build.gradle", "utf8");
		const webManifest = JSON.parse(fs.readFileSync("apps/retiradas/android-twa/app/src/main/res/raw/web_app_manifest.json", "utf8"));
		expect(gradle).toContain('versionCode 108');
		expect(gradle).toContain('versionName "1.0.8"');
		expect(gradle).toContain('appVersion=1.0.8&appCode=108');
		expect(webManifest.start_url).toBe(manifest.startUrl);
	});

	it("inclui rastreamento nativo seguro e atualizacao obrigatoria", () => {
		const migration = fs.readFileSync(
			"apps/retiradas/backend/sql/108_mobile_app_native_tracking.sql",
			"utf8",
		);
		const androidManifest = fs.readFileSync(
			"apps/retiradas/android-twa/app/src/main/AndroidManifest.xml",
			"utf8",
		);
		expect(migration).toContain("mobile_app_devices");
		expect(migration).toContain("minimum_supported_code");
		expect(androidManifest).toContain("android.permission.FOREGROUND_SERVICE_LOCATION");
		expect(androidManifest).toContain(".LocationTrackingService");
		expect(androidManifest).toContain("android:scheme=\"retiradas\"");
		expect(androidManifest).toContain(".NotificationSettingsActivity");
		const notificationSettingsActivity = fs.readFileSync(
			"apps/retiradas/android-twa/app/src/main/java/br/com/brasiltecpar/retiradas/NotificationSettingsActivity.java",
			"utf8",
		);
		expect(notificationSettingsActivity).toContain("ManageDataLauncherActivity");
		expect(notificationSettingsActivity).toContain("ACTION_APP_NOTIFICATION_SETTINGS");
		const trackingService = fs.readFileSync(
			"apps/retiradas/android-twa/app/src/main/java/br/com/brasiltecpar/retiradas/LocationTrackingService.java",
			"utf8",
		);
		expect(trackingService).toContain("retiradas_nearby_orders");
		expect(trackingService).toContain("showNativeRadarNotification");
		expect(trackingService).toContain('optJSONObject("nativeNotification")');
	});

	it("exibe somente o endereco publico limpo para baixar o aplicativo", () => {
		const distributionService = fs.readFileSync(
			"apps/retiradas/backend/api/src/mobileAppDistributionService.js",
			"utf8",
		);
		expect(distributionService).toContain('downloadUrl: "/app/download"');
		expect(distributionService).not.toContain(
			'downloadUrl: "/api/maintenance/app/download"',
		);
	});

	it("permite ao administrador atualizar as novidades da versao ativa", () => {
		const routes = fs.readFileSync("apps/retiradas/backend/api/src/maintenance/routes/maintenanceRoutes.js", "utf8");
		const distributionService = fs.readFileSync("apps/retiradas/backend/api/src/mobileAppDistributionService.js", "utf8");
		expect(routes).toContain('"/app/releases/:releaseId/notes"');
		expect(routes).toContain("requireCsrfToken");
		expect(distributionService).toContain("async function updateReleaseNotes");
	});
});
