const assert = require('node:assert/strict');
const db = require('../api/src/db');
const documents = require('../api/src/documents');

async function main() {
  assert.match((await db.query('select current_database() as name')).rows[0].name, /homolog/i);
  const path = 'hubsoft_config/global';
  const data = (await documents.getDocument(path))?.data || {};
  if (process.argv.includes('--enable')) {
    const latest = (await db.query("select distinct on (profile) profile, status from hubsoft_sync_runs order by profile, started_at desc")).rows;
    const failed = (profile) => latest.some((run) => run.profile === profile && !['COMPLETE', 'VALID_EMPTY_RESULT', 'RUNNING'].includes(run.status));
    if (failed('META_D_MINUS_ONE')) data.autoMetaLastRunDate = null;
    if (failed('MAPA') || failed('MATCH')) data.autoMapMatchLastRunAt = null;
    await documents.upsertDocument({ path, collectionPath: 'hubsoft_config', documentId: 'global', parentPath: null,
      data: { ...data, autoSyncEnabled: true, autoDailyEnabled: true, autoMetaEnabled: true, autoMapMatchEnabled: true } });
  }
  const saved = (await documents.getDocument(path))?.data || {};
  console.log(JSON.stringify(Object.fromEntries(Object.entries(saved).filter(([key]) => key.startsWith('auto'))), null, 2));
  console.log(JSON.stringify((await db.query("select profile, status, started_at from hubsoft_sync_runs where status = 'RUNNING'")).rows));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
