import { useEffect, useMemo, useState } from "react";
import { Cable, Database, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { requestFinanApi } from "../api/finanApi";

const cards = [
	{
		title: "Usuários e MFA",
		description: "Login, sessões, MFA e permissões próprios do Finan.",
		icon: ShieldCheck,
	},
	{
		title: "E-mail",
		description:
			"Usa a configuração atual temporariamente; preparado para SMTP próprio.",
		icon: Mail,
	},
	{
		title: "Banco e backups",
		description: "Banco separado e rotina de backup dedicada.",
		icon: Database,
	},
	{
		title: "Integrações",
		description: "Hubsoft, Cvortex, Senior e Playground no contexto financeiro.",
		icon: Cable,
	},
];

export default function FinanSettingsPage() {
	const [migrationState, setMigrationState] = useState({
		loading: true,
		error: "",
		users: [],
		roles: [],
		snapshots: [],
	});

	useEffect(() => {
		let active = true;
		Promise.all([
			requestFinanApi("/usuarios"),
			requestFinanApi("/usuarios/roles"),
			requestFinanApi("/usuarios/migration-snapshots"),
		])
			.then(([usersData, rolesData, snapshotsData]) => {
				if (!active) return;
				setMigrationState({
					loading: false,
					error: "",
					users: usersData.users || [],
					roles: rolesData.roles || [],
					snapshots: snapshotsData.snapshots || [],
				});
			})
			.catch((error) => {
				if (!active) return;
				setMigrationState({
					loading: false,
					error: error.message || "Não foi possível ler os dados migrados.",
					users: [],
					roles: [],
					snapshots: [],
				});
			});
		return () => {
			active = false;
		};
	}, []);

	const migrationSummary = useMemo(() => {
		const financialUsers = migrationState.users.filter(
			(user) => !user.source_role || user.source_role !== "admin",
		);
		const admins = migrationState.users.filter(
			(user) => user.source_role === "admin" || user.role_id === "admin",
		);
		const financialTables = migrationState.snapshots.filter((snapshot) =>
			String(snapshot.source_table || "").startsWith("financeiro_"),
		);
		const financialRows = financialTables.reduce(
			(total, snapshot) => total + Number(snapshot.rows || 0),
			0,
		);

		return {
			totalUsers: migrationState.users.length,
			financialUsers: financialUsers.length,
			admins: admins.length,
			roles: migrationState.roles.length,
			financialTables: financialTables.length,
			financialRows,
			lastImport: migrationState.snapshots.reduce((latest, snapshot) => {
				const value = snapshot.imported_at
					? new Date(snapshot.imported_at).getTime()
					: 0;
				return Math.max(latest, value || 0);
			}, 0),
		};
	}, [migrationState]);

	return (
		<section>
			<div className="finan-page-title">
				<div>
					<h1>Configuração Geral</h1>
					<p>Parâmetros globais do Finan dedicado.</p>
				</div>
				<span>Próprio do Finan</span>
			</div>
			<div className="finan-settings-grid">
				{cards.map((card) => {
					const Icon = card.icon;
					return (
						<article key={card.title} className="finan-setting-card">
							<div>
								<Icon size={20} />
							</div>
							<h2>{card.title}</h2>
							<p>{card.description}</p>
						</article>
					);
				})}
			</div>
			<div className="finan-work-card">
				<div className="finan-card-heading">
					<div>
						<UsersRound size={20} />
					</div>
					<div>
						<h2>Base reaproveitada do Retiradas</h2>
						<p>
							Usuários financeiros, admins e dados financeiros copiados para o
							banco dedicado do Finan.
						</p>
					</div>
				</div>
				{migrationState.loading ? (
					<p>Carregando leitura do banco dedicado...</p>
				) : migrationState.error ? (
					<p className="finan-muted-warning">{migrationState.error}</p>
				) : (
					<>
						<div className="finan-snapshot-grid">
							<Metric label="Usuários migrados" value={migrationSummary.totalUsers} />
							<Metric
								label="Usuários financeiros"
								value={migrationSummary.financialUsers}
							/>
							<Metric label="Admins reaproveitados" value={migrationSummary.admins} />
							<Metric label="Perfis Finan" value={migrationSummary.roles} />
							<Metric
								label="Tabelas financeiras"
								value={migrationSummary.financialTables}
							/>
							<Metric
								label="Linhas financeiras"
								value={migrationSummary.financialRows.toLocaleString("pt-BR")}
							/>
						</div>
						<p>
							Última carga:{" "}
							<strong>
								{migrationSummary.lastImport
									? new Date(migrationSummary.lastImport).toLocaleString("pt-BR")
									: "aguardando migração"}
							</strong>
						</p>
					</>
				)}
			</div>
		</section>
	);
}

function Metric({ label, value }) {
	return (
		<div className="finan-snapshot-metric">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}
