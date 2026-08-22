import { requestVpsApi } from "../../../services/vpsApiClient";

export async function buscarStatusApis() {
  return requestVpsApi("/admin/api-status");
}
