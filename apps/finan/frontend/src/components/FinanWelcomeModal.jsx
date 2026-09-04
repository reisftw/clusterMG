import { X } from "lucide-react";
import {
	FINAN_WELCOME_MODAL_IMAGE,
	markFinanWelcomeModalSeen,
} from "../utils/finanWelcomeModalStorage";

export default function FinanWelcomeModal({ open, user, onClose }) {
	const handleClose = () => {
		markFinanWelcomeModalSeen(user);
		onClose?.();
	};

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-layout-modal flex items-center justify-center p-3 sm:p-4"
			role="presentation"
		>
			<button
				type="button"
				className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
				onClick={handleClose}
				aria-label="Fundo do modal"
			/>
			<section
				role="dialog"
				aria-modal="true"
				aria-label="Boas-vindas ao Finan"
				className="relative w-[min(92vw,calc(90dvh-4.25rem),860px)] overflow-hidden rounded-2xl bg-slate-950 shadow-2xl sm:rounded-3xl"
			>
				<button
					type="button"
					onClick={handleClose}
					className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
					aria-label="Fechar boas-vindas"
				>
					<X size={21} />
				</button>
				<img
					src={FINAN_WELCOME_MODAL_IMAGE}
					alt="Seja muito bem-vindo ao Finan"
					className="block aspect-square w-full object-contain"
				/>
				<div className="flex justify-end border-t border-white/10 bg-slate-950 px-4 py-3">
					<button
						type="button"
						onClick={handleClose}
						className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-200"
					>
						Começar
					</button>
				</div>
			</section>
		</div>
	);
}
