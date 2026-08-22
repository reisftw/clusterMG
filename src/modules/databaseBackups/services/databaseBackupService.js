import { requestVpsApi } from "../../../services/vpsApiClient";

let statusCache = null;
let statusCacheAt = 0;
let pendingStatusRequest = null;

export async function buscarStatusBancoDados() {
  const now = Date.now();
  if (statusCache && now - statusCacheAt < 5000) {
    return statusCache;
  }

  if (!pendingStatusRequest) {
    pendingStatusRequest = requestVpsApi("/admin/database/backups")
      .then((data) => {
        statusCache = data;
        statusCacheAt = Date.now();
        return data;
      })
      .finally(() => {
        pendingStatusRequest = null;
      });
  }

  return pendingStatusRequest;
}

export async function criarBackupBancoDados() {
  const result = await requestVpsApi("/admin/database/backups", {
    method: "POST",
  });
  statusCache = result?.status || result;
  statusCacheAt = Date.now();
  return result;
}

export async function restaurarBackupBancoDados(fileName, confirmation) {
  const result = await requestVpsApi(
    `/admin/database/backups/${encodeURIComponent(fileName)}/restore`,
    {
      method: "POST",
      body: JSON.stringify({ confirmation }),
    },
  );
  statusCache = result?.status || result;
  statusCacheAt = Date.now();
  return result;
}
