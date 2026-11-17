import { getApiBaseUrl, requestVpsApi } from "../../../services/vpsApiClient";
import { getVpsAuthToken } from "../../../services/vpsAuthSession";

const query = (params={}) => new URLSearchParams(Object.entries(params).filter(([,value])=>value!==undefined&&value!==null&&value!=="")).toString();
export const buscarClientesLoja = (q) => requestVpsApi(`/store-deliveries/clients/search?${query({q})}`);
export const listarEntregasLoja = (params={}) => requestVpsApi(`/store-deliveries/${params.mine?"mine":"history"}?${query(params)}`);
export const listarLojas = () => requestVpsApi("/store-deliveries/stores");
export const salvarLoja = (payload) => requestVpsApi("/store-deliveries/stores",{method:"POST",body:JSON.stringify(payload)});
export const listarUsuariosLoja = () => requestVpsApi("/store-deliveries/stores/users");
export const vincularUsuarioLoja = (storeId,uid) => requestVpsApi(`/store-deliveries/stores/${encodeURIComponent(storeId)}/users`,{method:"POST",body:JSON.stringify({uid})});
export const confirmarEntregaLoja = (payload) => requestVpsApi("/store-deliveries",{method:"POST",body:JSON.stringify(payload)});
export async function baixarEntregaLoja(item) {
	const token=getVpsAuthToken();
	const response=await fetch(`${getApiBaseUrl()}/store-deliveries/${encodeURIComponent(item.id)}/download`,{credentials:"include",headers:token?{Authorization:`Bearer ${token}`}:{}});
	if(!response.ok) throw new Error("Não foi possível baixar o comprovante.");
	const url=URL.createObjectURL(await response.blob()); const anchor=document.createElement("a"); anchor.href=url; anchor.download=`${item.protocol}.pdf`; anchor.click(); window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
