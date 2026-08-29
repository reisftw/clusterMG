import {
	CheckCircle2,
	Loader2,
	RefreshCw,
	Save,
	ShieldCheck,
	ShieldOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	buscarConfigVpn,
	buscarLogsVpn,
	salvarConfigVpn,
	testarAcessoVpn,
} from "../services/vpnConfigService";

const DEFAULT_CONFIG = {
	enabled: false,
	protectedRoutes: [
		"/financeiro/gestao-orcamento*",
		"/api/financeiro/orcamento*",
	],
	allowedCidrs: [],
};

function linesToArray(value) {
	return String(value || "")
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
}

function normalizeConfig(config = {}) {
	return {
		...DEFAULT_CONFIG,
		...config,
		protectedRoutes: Array.isArray(config.protectedRoutes)
			? config.protectedRoutes
			: [],
		allowedCidrs: Array.isArray(config.allowedCidrs) ? config.allowedCidrs : [],
	};
}

export default function ConfiguracoesVpnPage() {
	const { currentUser } = useAuthContext();
	const canManage =
		hasPermission(currentUser, "configuracao.vpn.manage") ||
		hasPermission(currentUser, "*");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [checking, setChecking] = useState(false);
	const [config, setConfig] = useState(DEFAULT_CONFIG);
	const [routesText, setRoutesText] = useState("");
	const [cidrsText, setCidrsText] = useState("");
	const [logs, setLogs] = useState([]);
	const [testRoute, setTestRoute] = useState("/financeiro/gestao-orcamento");
	const [message, setMessage] = useState("");
	const [checkResult, setCheckResult] = useState(null);

	const routeCount = useMemo(
		() => linesToArray(routesText).length,
		[routesText],
	);
	const cidrCount = useMemo(() => linesToArray(cidrsText).length, [cidrsText]);

	const loadData = async () => {
		setLoading(true);
		setMessage("");
		try {
			const [configResponse, logsResponse] = await Promise.all([
				buscarConfigVpn(),
				buscarLogsVpn(100),
			]);
			const nextConfig = normalizeConfig(configResponse?.config);
			setConfig(nextConfig);
			setRoutesText(nextConfig.protectedRoutes.join("\n"));
			setCidrsText(nextConfig.allowedCidrs.join("\n"));
			setLogs(logsResponse?.items || []);
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível carregar as configurações de VPN.",
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const handleSave = async () => {
		if (!canManage) return;
		setSaving(true);
		setMessage("");
		setCheckResult(null);
		try {
			const payload = {
				...config,
				protectedRoutes: linesToArray(routesText),
				allowedCidrs: linesToArray(cidrsText),
			};
			const response = await salvarConfigVpn(payload);
			const nextConfig = normalizeConfig(response?.config);
			setConfig(nextConfig);
			setRoutesText(nextConfig.protectedRoutes.join("\n"));
			setCidrsText(nextConfig.allowedCidrs.join("\n"));
			const logsResponse = await buscarLogsVpn(100);
			setLogs(logsResponse?.items || []);
			setMessage("Configuração de VPN salva.");
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível salvar a configuração de VPN.",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleCheck = async () => {
		setChecking(true);
		setMessage("");
		try {
			const result = await testarAcessoVpn(testRoute);
			setCheckResult(result);
		} catch (error) {
			setMessage(error?.message || "Não foi possível testar o acesso atual.");
		} finally {
			setChecking(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
							<ShieldCheck size={24} />
						</div>
						<div>
							<h1 className="text-2xl font-black text-slate-950">VPN</h1>
							<p className="text-sm font-semibold text-slate-500">
								Restrinja módulos sensíveis por rota e por faixa de IP da VPN
								corporativa.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={loadData}
							className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
						>
							<RefreshCw size={16} /> Atualizar
						</button>
						<button
							type="button"
							onClick={handleSave}
							disabled={!canManage || saving}
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
						>
							{saving ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<Save size={16} />
							)}
							Salvar
						</button>
					</div>
				</div>
			</section>

			{!canManage ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Você está em modo somente leitura. Alterações de VPN exigem permissão
					de gerenciamento.
				</div>
			) : null}

			{message ? (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-black text-blue-800">
					{message}
				</div>
			) : null}

			<section className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-xs font-black uppercase text-slate-500">
								Proteção
							</p>
							<h2 className="mt-1 text-xl font-black text-slate-950">
								{config.enabled ? "Ativa" : "Desativada"}
							</h2>
						</div>
						<div
							className={`flex h-11 w-11 items-center justify-center rounded-2xl ${config.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
						>
							{config.enabled ? (
								<ShieldCheck size={22} />
							) : (
								<ShieldOff size={22} />
							)}
						</div>
					</div>
					<label className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
						<span>
							<span className="block text-sm font-black text-slate-950">
								Ativar bloqueio por VPN
							</span>
							<span className="text-xs font-semibold text-slate-500">
								Quando ativo, as rotas cadastradas exigem IP permitido.
							</span>
						</span>
						<input
							type="checkbox"
							checked={Boolean(config.enabled)}
							disabled={!canManage}
							onChange={(event) =>
								setConfig((current) => ({
									...current,
									enabled: event.target.checked,
								}))
							}
							className="h-5 w-5 accent-blue-600"
						/>
					</label>
				</div>

				<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<p className="text-xs font-black uppercase text-slate-500">
						Rotas protegidas
					</p>
					<p className="mt-2 text-3xl font-black text-slate-950">
						{routeCount}
					</p>
					<p className="mt-2 text-sm font-semibold text-slate-500">
						Aceita rota exata ou prefixo com{" "}
						<span className="font-black text-slate-700">*</span>.
					</p>
				</div>

				<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<p className="text-xs font-black uppercase text-slate-500">
						Faixas/IPs permitidos
					</p>
					<p className="mt-2 text-3xl font-black text-slate-950">{cidrCount}</p>
					<p className="mt-2 text-sm font-semibold text-slate-500">
						Use IP único ou CIDR, por exemplo 10.8.0.0/24.
					</p>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-2">
				<label className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<span className="text-sm font-black uppercase text-slate-500">
						Rotas que exigem VPN
					</span>
					<textarea
						value={routesText}
						onChange={(event) => setRoutesText(event.target.value)}
						disabled={!canManage}
						rows={9}
						placeholder={
							"/financeiro/gestao-orcamento\n/api/financeiro/orcamento*"
						}
						className="mt-3 w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50"
					/>
					<p className="mt-2 text-xs font-semibold text-slate-500">
						A trava forte acontece nas rotas de API. Rotas de tela devem apontar
						para APIs protegidas também.
					</p>
				</label>

				<label className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<span className="text-sm font-black uppercase text-slate-500">
						IPs ou faixas da VPN
					</span>
					<textarea
						value={cidrsText}
						onChange={(event) => setCidrsText(event.target.value)}
						disabled={!canManage}
						rows={9}
						placeholder={"10.8.0.0/24\n172.16.15.10\n200.200.200.10"}
						className="mt-3 w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50"
					/>
					<p className="mt-2 text-xs font-semibold text-slate-500">
						O sistema usa o IP encaminhado pelo Nginx/Cloudflare quando
						disponível.
					</p>
				</label>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end">
					<label className="flex-1">
						<span className="text-sm font-black uppercase text-slate-500">
							Testar acesso atual
						</span>
						<input
							value={testRoute}
							onChange={(event) => setTestRoute(event.target.value)}
							className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400"
							placeholder="/api/financeiro/orcamento"
						/>
					</label>
					<button
						type="button"
						onClick={handleCheck}
						disabled={checking}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
					>
						{checking ? (
							<Loader2 className="animate-spin" size={16} />
						) : (
							<CheckCircle2 size={16} />
						)}
						Testar
					</button>
				</div>
				{checkResult ? (
					<div
						className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${checkResult.allowed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
					>
						IP detectado: {checkResult.ip || "-"} · Rota{" "}
						{checkResult.protected ? "protegida" : "não protegida"} ·
						{checkResult.allowed ? " acesso permitido" : " acesso bloqueado"}
					</div>
				) : null}
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="text-lg font-black text-slate-950">Logs de VPN</h2>
						<p className="text-sm font-semibold text-slate-500">
							Últimas alterações e tentativas bloqueadas.
						</p>
					</div>
				</div>
				<div className="mt-4 overflow-x-auto">
					<table className="min-w-full divide-y divide-slate-100 text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-3 py-3">Data</th>
								<th className="px-3 py-3">Ação</th>
								<th className="px-3 py-3">Status</th>
								<th className="px-3 py-3">Rota</th>
								<th className="px-3 py-3">IP</th>
								<th className="px-3 py-3">Motivo</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{logs.length ? (
								logs.map((log) => (
									<tr key={log.id} className="align-top">
										<td className="px-3 py-3 font-bold text-slate-700">
											{formatDateTime(log.createdAt)}
										</td>
										<td className="px-3 py-3 font-black text-slate-900">
											{log.action || "-"}
										</td>
										<td className="px-3 py-3">
											<span
												className={`rounded-full px-2.5 py-1 text-xs font-black ${log.status === "blocked" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}
											>
												{log.status || "-"}
											</span>
										</td>
										<td className="px-3 py-3 font-mono text-xs font-semibold text-slate-600">
											{log.route || "-"}
										</td>
										<td className="px-3 py-3 font-mono text-xs font-semibold text-slate-600">
											{log.ip || "-"}
										</td>
										<td className="px-3 py-3 font-semibold text-slate-600">
											{log.reason || "-"}
										</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={6}
										className="px-3 py-6 text-center font-bold text-slate-500"
									>
										Nenhum log registrado ainda.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
