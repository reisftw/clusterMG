import ModalShell from "../../../components/ui/ModalShell";
import {
	markWelcomeModalSeen,
	WELCOME_MODAL_IMAGE,
} from "../utils/welcomeModalStorage";

export default function WelcomeModal({ open, user, onClose }) {
	const handleClose = () => {
		markWelcomeModalSeen(user);
		onClose?.();
	};

	return (
		<ModalShell
			open={open}
			onClose={handleClose}
			closeLabel="Fechar boas-vindas"
			showClose
			size="5xl"
			contentClassName="bg-slate-950 p-0"
			bodyClassName="p-0"
			headerClassName="hidden"
		>
			<div className="bg-slate-950">
				<img
					src={WELCOME_MODAL_IMAGE}
					alt="Seja muito bem-vindo"
					className="block max-h-[78dvh] w-full object-contain"
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
			</div>
		</ModalShell>
	);
}
