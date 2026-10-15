import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const meshUrl = "https://servicodados.ibge.gov.br/api/v3/malhas/estados/31?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio";
const municipalitiesUrl = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/31/municipios";
const output = resolve("apps/retiradas/frontend/public/geodata/ibge/mg-municipios.geojson");

const [meshResponse, municipalityResponse] = await Promise.all([fetch(meshUrl), fetch(municipalitiesUrl)]);
if (!meshResponse.ok || !municipalityResponse.ok) throw new Error(`IBGE indisponível: malha=${meshResponse.status}; municipios=${municipalityResponse.status}`);
const mesh = await meshResponse.json();
const names = new Map((await municipalityResponse.json()).map((item) => [String(item.id), item.nome]));
if (!Array.isArray(mesh.features) || mesh.features.length !== 853) throw new Error(`Quantidade inesperada de municípios de MG: ${mesh.features?.length}`);
for (const feature of mesh.features) {
	const code = String(feature.properties?.codarea || "");
	if (!names.has(code)) throw new Error(`Município IBGE sem nome: ${code}`);
	feature.properties = { codigo_ibge: code, nome: names.get(code), uf: "MG" };
}
const content = `${JSON.stringify(mesh)}\n`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, content);
console.log(JSON.stringify({ output, features: mesh.features.length, sha256: createHash("sha256").update(content).digest("hex"), meshUrl, municipalitiesUrl }, null, 2));
