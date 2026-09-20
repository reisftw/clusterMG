import { requestRotApi } from "./rotApi";
export const getAprMetadata = () => requestRotApi("/admin/apr/metadata");
export const listAprs = (page, regionalId) => requestRotApi("/admin/apr?" + new URLSearchParams({page, regionalId}));
export const getApr = id => requestRotApi("/admin/apr/" + encodeURIComponent(id));
export const getAprAlerts = () => requestRotApi("/admin/apr/alerts");
export const acknowledgeApr = id => requestRotApi("/admin/apr/" + encodeURIComponent(id) + "/acknowledge", {method:"POST"});
export function createApr(payload, photos) {
 const body = new FormData();
 body.append("payload", JSON.stringify(payload));
 photos.forEach(photo => body.append("photos", photo));
 return requestRotApi("/admin/apr", {method:"POST",body});
}
export async function getAprPhoto(aprId, photoId) {
 const response = await fetch("/api/admin/apr/" + encodeURIComponent(aprId) + "/photos/" + encodeURIComponent(photoId), {
  credentials:"include", headers:{"X-Requested-With":"XMLHttpRequest"}, cache:"no-store",
 });
 if (!response.ok) throw new Error("Não foi possível carregar a foto.");
 return response.blob();
}
