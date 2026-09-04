import { Cable, Database, Mail, ShieldCheck } from "lucide-react";

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
		</section>
	);
}
