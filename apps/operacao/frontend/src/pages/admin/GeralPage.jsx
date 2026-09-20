import { useEffect, useState } from "react";
import { Camera, KeyRound, Loader2, Menu, Save, Settings, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchRotAppearance, fetchRotMenuSettings, saveRotAppearance, saveRotMenuSettings, uploadRotDefaultAvatar } from "../../api/rotApi";
import { DEFAULT_OPERATION_MENU_CONFIG, OPERATION_MENU_ITEMS } from "../../components/Shell";
import { useRotAuth } from "../../state/RotAuthContext";
import Spinner from "../../components/ui/Spinner";

// Mesmo padrao visual de ConfiguracoesGeraisPage.jsx do Retiradas:
// avatar padrao do sistema (admin) + atalho pra conta pessoal. O Operação
// ainda nao tem sininho/preferencias de som (ver NotificacoesPage.jsx
// pra isso), entao esta pagina foca no que existe de verdade.
export default function GeralPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.settings.manage");
	const [loading, setLoading] = useState(true);
	const [defaultAvatarUrl, setDefaultAvatarUrl] = useState("");
	const [menuConfig, setMenuConfig] = useState(DEFAULT_OPERATION_MENU_CONFIG);
	const [uploading, setUploading] = useState(false);
	const [savingMenu, setSavingMenu] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		Promise.all([
			fetchRotAppearance(),
			fetchRotMenuSettings().catch(() => ({ menu: DEFAULT_OPERATION_MENU_CONFIG })),
		])
			.then(([appearance, menuData]) => {
				if (!active) return;
				setDefaultAvatarUrl(appearance.defaultAvatarUrl || "");
				setMenuConfig(menuData.menu || DEFAULT_OPERATION_MENU_CONFIG);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar as configurações.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const handleUpload = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setUploading(true);
		setError("");
		setMessage("");
		try {
			const url = await uploadRotDefaultAvatar(file);
			setDefaultAvatarUrl(url);
			setMessage("Avatar padrão salvo.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o avatar padrão.");
		} finally {
			setUploading(false);
		}
	};

	const handleRemove = async () => {
		setUploading(true);
		setError("");
		setMessage("");
		try {
			await saveRotAppearance({ defaultAvatarUrl: "" });
			setDefaultAvatarUrl("");
			setMessage("Avatar padrão removido.");
		} catch (err) {
			setError(err?.message || "Não foi possível remover o avatar padrão.");
		} finally {
			setUploading(false);
		}
	};

	const toggleMenuItem = (scope, itemKey) => {
		setMenuConfig((current) => {
			const currentItems = current?.[scope]?.enabledItems || [];
			const enabled = currentItems.includes(itemKey)
				? currentItems.filter((item) => item !== itemKey)
				: [...currentItems, itemKey];
			return { ...current, [scope]: { enabledItems: enabled } };
		});
	};

	const saveMenu = async () => {
		setSavingMenu(true);
		setError("");
		setMessage("");
		try {
			const result = await saveRotMenuSettings(menuConfig);
			setMenuConfig(result.menu || menuConfig);
			setMessage("Menus operacionais salvos.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar os menus.");
		} finally {
			setSavingMenu(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
						<Settings size={24} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Configurações Gerais</h1>
						<p className="text-sm font-semibold text-slate-500">Aparência do sistema e atalhos da sua conta.</p>
					</div>
				</div>
			</section>

			{message ? <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-black text-blue-800">{message}</div> : null}
			{error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-700">{error}</div> : null}

			{!canManage ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Você está em modo somente leitura. Alterar o avatar padrão exige permissão de gerenciamento.
				</div>
			) : null}

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-blue-700">
							{defaultAvatarUrl ? (
								<img src={defaultAvatarUrl} alt="Avatar padrão" className="h-full w-full object-cover" />
							) : (
								<Camera size={24} />
							)}
						</div>
						<div>
							<h2 className="text-lg font-black text-slate-950">Avatar padrão do sistema</h2>
							<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
								Usuários sem avatar próprio exibirão esta imagem. Aceita PNG, JPEG, WEBP ou GIF até 700 KB.
							</p>
						</div>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row">
						<label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
							{uploading ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />} Enviar avatar
							<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading || !canManage} onChange={handleUpload} className="hidden" />
						</label>
						{defaultAvatarUrl ? (
							<button
								type="button"
								disabled={uploading || !canManage}
								onClick={handleRemove}
								className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60"
							>
								<Trash2 size={17} /> Remover
							</button>
						) : null}
					</div>
				</div>
			</section>

			{canManage ? (
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex items-start gap-4">
							<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
								<Menu size={22} />
							</div>
							<div>
								<h2 className="text-lg font-black text-slate-950">Menus por operação</h2>
								<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
									Escolha quais itens aparecem para usuários ROT, Delivery e Field Service. Dashboard, Gerar QR Code, Gestão e Configurações ficam fixos.
								</p>
							</div>
						</div>
						<button
							type="button"
							onClick={saveMenu}
							disabled={savingMenu}
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
						>
							{savingMenu ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Salvar menus
						</button>
					</div>
					<div className="mt-5 grid gap-4 xl:grid-cols-3">
						{Object.entries(DEFAULT_OPERATION_MENU_CONFIG).map(([scope, _defaults]) => (
							<div key={scope} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
								<h3 className="text-sm font-black text-slate-950">{scope === "FIELD" ? "Field Service" : scope === "DELIVERY" ? "Delivery" : "ROT"}</h3>
								<div className="mt-3 space-y-2">
									{Object.keys(OPERATION_MENU_ITEMS).map((itemKey) => {
										const item = OPERATION_MENU_ITEMS[itemKey];
										if (!item) return null;
										const checked = (menuConfig?.[scope]?.enabledItems || []).includes(itemKey);
										return (
											<label key={itemKey} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
												<span>{item.label}</span>
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleMenuItem(scope, itemKey)}
													className="h-4 w-4 accent-blue-600"
												/>
											</label>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</section>
			) : null}

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
							<KeyRound size={22} />
						</div>
						<div>
							<h2 className="text-lg font-black text-slate-950">Minha conta</h2>
							<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
								Avatar pessoal e senha ficam em "Meu perfil".
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() => navigate("/perfil")}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-600"
					>
						Ir para Meu perfil
					</button>
				</div>
			</section>
		</div>
	);
}
