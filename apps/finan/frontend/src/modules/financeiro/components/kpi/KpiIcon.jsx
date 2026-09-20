import {
	AlertTriangle,
	BadgeDollarSign,
	CalendarClock,
	CheckCircle2,
	CircleDollarSign,
	ClipboardCheck,
	FileText,
	Landmark,
	ReceiptText,
	Repeat2,
	Users,
	Wallet,
} from "lucide-react";

const KPI_ICONS = {
	AlertTriangle,
	BadgeDollarSign,
	CalendarClock,
	CheckCircle2,
	CircleDollarSign,
	ClipboardCheck,
	FileText,
	Landmark,
	ReceiptText,
	Repeat2,
	Users,
	Wallet,
};

export default function KpiIcon({ name, compact = false, colorVariant }) {
	const Icon = KPI_ICONS[name] || BadgeDollarSign;

	return (
		<span
			className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ${compact ? "h-11 w-11" : "h-14 w-14"} ${colorVariant.icon}`}
		>
			<Icon size={compact ? 20 : 25} strokeWidth={2.4} />
		</span>
	);
}
