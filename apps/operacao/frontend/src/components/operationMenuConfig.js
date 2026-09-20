// Extraído de Shell.jsx (react-refresh/only-export-components não permite
// misturar componente com exports não-componente no mesmo arquivo).
// Comportamento idêntico ao que estava lá — só mudou de arquivo.
import {
	BarChart3,
	CalendarClock,
	CalendarDays,
	Car,
	ClipboardCheck,
	Clock,
	CloudLightning,
	FileClock,
	Key,
	MessageSquare,
	PackageCheck,
	ShieldCheck,
	Ticket,
	Trophy,
	Umbrella,
	Zap,
} from "lucide-react";

export const OPERATION_MENU_ITEMS = {
	comando: { label: "Centro de Comando", path: "/comando-operacional", icon: BarChart3, permission: "command_center.view" },
	agenda: { label: "Agenda", path: "/atividades", icon: CalendarClock, permission: ["rot.activities.view","rot.activities.manage"] },
	escala: { label: "Escala", path: "/turnos", icon: Clock, permission: ["rot.shifts.view","rot.shifts.manage"] },
	tickets: { label: "Tickets", path: "/chamados", icon: Ticket, permission: ["rot.tickets.view","rot.tickets.manage"] },
	ausencias: { label: "Ausências", path: "/ausencias", icon: Umbrella, permission: ["rot.absences.view","rot.absences.manage","rot.timeoff.view","rot.timeoff.approve","rot.vacations.view","rot.vacations.approve"] },
	rompimentos: { label: "Rompimentos", path: "/rompimentos", icon: Zap, permission: null },
	apr: { label: "APR", path: "/apr", icon: FileClock, permission: null },
	chuva: { label: "Chuva", path: "/chuva", icon: CloudLightning, permission: null },
	feriados: { label: "Feriados", path: "/feriados", icon: CalendarDays, permission: null },
	avisos: { label: "Avisos", path: "/avisos", icon: MessageSquare, permission: null },
	equipamentos: { label: "Meus Ativos", path: "/equipamentos", icon: PackageCheck, permission: null },
	chaves: { label: "Chaves", path: "/chaves", icon: Key, permission: null },
	frotas: { label: "Frotas", path: "/frota", icon: Car, permission: null },
	ranking: { label: "Ranking", path: "/ranking", icon: Trophy, permission: ["rot.ranking.view"] },
	historico: { label: "Histórico", path: "/admin/logs", icon: FileClock, permission: "rot.logs.view" },
	"acerto-estoque": { label: "Acerto de Estoque", path: "/acerto-estoque", icon: ClipboardCheck, permission: ["rot.stock_adjustments.view", "rot.stock_adjustments.manage"] },
	"entrega-tecnicos": { label: "Entrega Técnicos", path: "/entrega-tecnicos", icon: PackageCheck, permission: ["rot.tech_deliveries.view", "rot.tech_deliveries.manage"] },
	"auditoria-bolsa": { label: "Auditoria Bolsa", path: "/auditoria-bolsa", icon: ShieldCheck, permission: ["rot.bag_audit.view", "rot.bag_audit.manage"] },
	"relatorios-auditoria": { label: "Relatórios Auditoria", path: "/relatorios-auditoria", icon: BarChart3, permission: "rot.audit_reports.view" },
};

export const DEFAULT_OPERATION_MENU_CONFIG = {
	ROT: { enabledItems: ["comando", "agenda", "escala", "tickets", "ausencias", "rompimentos", "apr", "chuva", "feriados", "avisos", "equipamentos", "chaves", "frotas", "ranking", "historico"] },
	DELIVERY: { enabledItems: ["comando", "agenda", "escala", "ausencias", "apr", "feriados", "avisos", "acerto-estoque", "entrega-tecnicos", "auditoria-bolsa", "frotas", "relatorios-auditoria"] },
	FIELD: { enabledItems: ["comando", "agenda", "escala", "ausencias", "apr", "feriados", "avisos", "acerto-estoque", "entrega-tecnicos", "auditoria-bolsa", "frotas", "relatorios-auditoria"] },
};
