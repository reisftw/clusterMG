import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { ROUTES } from "../../../router/routes";

export default function AuthRecoveryCard({
	icon,
	iconClassName = "bg-blue-50 text-blue-700",
	title,
	description,
	children,
}) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#082b55,#061f3f_48%,#04162c)] px-5 py-10">
			<section className="w-full max-w-lg rounded-[28px] border border-white/80 bg-white/95 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
				<Link
					to={ROUTES.LOGIN}
					className="inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:text-blue-800"
				>
					<ArrowLeft size={17} />
					Voltar para login
				</Link>
				<div className="mt-8 text-center">
					<span
						className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${iconClassName}`}
					>
						{icon}
					</span>
					<h1 className="mt-5 text-3xl font-black text-slate-950">
						{title}
					</h1>
					<p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
						{description}
					</p>
				</div>
				{children}
			</section>
		</div>
	);
}
