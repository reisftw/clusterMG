import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ROUTES } from "../../../../router/routes";
import { obterRegistroPublicoQrFacilities } from "../../services/facilitiesService";

export default function FacilitiesAssetQrPage() {
	const { token = "" } = useParams();
	const [loading, setLoading] = useState(true);
	const [asset, setAsset] = useState(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		obterRegistroPublicoQrFacilities(token)
			.then((record) => {
				if (!active) return;
				setAsset(record || null);
				if (!record) setError("Registro não encontrado para este QR Code.");
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar o registro.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [token]);

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
				<div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-black text-slate-600 shadow-sm">
					Carregando QR Code...
				</div>
			</div>
		);
	}
	const isKeyRecord = asset?.kind === "key" || token.startsWith("key-");

	return (
		<div className="min-h-screen bg-slate-100 p-4 md:p-8">
			<div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
				<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
					ADM Facilities
				</p>
				<h1 className="mt-2 text-3xl font-black text-slate-950">
					{asset?.codigo || asset?.code || (isKeyRecord ? "QR Code de chave" : "QR Code de patrimônio")}
				</h1>
				{error ? (
					<div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
						{error}
					</div>
				) : (
					<div className="mt-6 grid gap-3 md:grid-cols-2">
						{[
							["Descrição", asset?.descricao || asset?.description || asset?.name],
							["Tipo/Categoria", asset?.categoria || asset?.type],
							["Local", asset?.imovel || asset?.locationDescription || asset?.address],
							["Ambiente", asset?.ambiente || asset?.environmentId],
							["Responsável/Portador", asset?.responsavel || asset?.currentHolderName || asset?.currentUser],
							["Status", asset?.statusLabel || asset?.status],
							["Marca", asset?.marca],
							["Modelo", asset?.modelo],
							["Número de série", asset?.numeroSerie],
							["Estado", asset?.estado],
						].map(([label, value]) => (
							<div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
								<p className="text-xs font-black uppercase text-slate-500">{label}</p>
								<p className="mt-1 text-sm font-black text-slate-950">{value || "-"}</p>
							</div>
						))}
					</div>
				)}
				<Link
					to={isKeyRecord ? ROUTES.FACILITIES_ACESSOS_CHAVES : ROUTES.FACILITIES_PATRIMONIO_INVENTARIO}
					className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white"
				>
					{isKeyRecord ? "Abrir Acessos & Chaves" : "Abrir Patrimônio"}
				</Link>
			</div>
		</div>
	);
}

