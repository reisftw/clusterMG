import { X } from "lucide-react";
import { useEffect, useRef } from "react";

const SIZE_CLASSES = {
	sm: "max-w-sm",
	md: "max-w-md",
	lg: "max-w-lg",
	xl: "max-w-xl",
	"2xl": "max-w-2xl",
	"3xl": "max-w-3xl",
	"4xl": "max-w-4xl",
	"5xl": "max-w-5xl",
	"6xl": "max-w-6xl",
	full: "max-w-[min(96rem,calc(100vw-1rem))]",
};

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"textarea:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusableElement(element) {
	if (!(element instanceof HTMLElement)) return false;
	if (
		element.hasAttribute("disabled") ||
		element.getAttribute("aria-hidden") === "true"
	)
		return false;
	const style = window.getComputedStyle(element);
	return style.display !== "none" && style.visibility !== "hidden";
}

export default function ModalShell({
	open = true,
	title,
	description,
	icon,
	children,
	footer,
	onClose,
	closeLabel = "Fechar",
	showClose = true,
	closeOnBackdrop = true,
	size = "3xl",
	className = "",
	contentClassName = "",
	bodyClassName = "",
	headerClassName = "",
	footerClassName = "",
}) {
	const dialogRef = useRef(null);
	const previousFocusRef = useRef(null);

	useEffect(() => {
		if (!open) return undefined;

		previousFocusRef.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;

		window.setTimeout(() => {
			const dialog = dialogRef.current;
			if (!dialog) return;
			const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
				isFocusableElement,
			);
			const firstTarget = focusable[0] || dialog;
			firstTarget.focus({ preventScroll: true });
		}, 0);

		return () => {
			const previousFocus = previousFocusRef.current;
			if (previousFocus && document.contains(previousFocus)) {
				window.setTimeout(
					() => previousFocus.focus({ preventScroll: true }),
					0,
				);
			}
		};
	}, [open]);

	useEffect(() => {
		if (!open || !onClose) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}

			if (event.key !== "Tab") return;

			const dialog = dialogRef.current;
			if (!dialog) return;

			const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
				isFocusableElement,
			);

			if (!focusable.length) {
				event.preventDefault();
				dialog.focus({ preventScroll: true });
				return;
			}

			const firstElement = focusable[0];
			const lastElement = focusable.at(-1);
			const activeElement = document.activeElement;

			if (event.shiftKey && activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus({ preventScroll: true });
				return;
			}

			if (!event.shiftKey && activeElement === lastElement) {
				event.preventDefault();
				firstElement.focus({ preventScroll: true });
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose, open]);

	if (!open) return null;

	const handleBackdropClick = () => {
		if (closeOnBackdrop && onClose) {
			onClose();
		}
	};

	return (
		<div
			className={`fixed inset-0 z-layout-modal flex items-center justify-center p-3 sm:p-4 ${className}`}
			role="presentation"
		>
			<button
				type="button"
				className="rot-modal-backdrop absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
				onClick={handleBackdropClick}
				aria-label="Fundo do modal"
			/>
			<section
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={title || closeLabel}
				tabIndex={-1}
				className={`rot-modal-panel relative flex max-h-[90dvh] w-full ${SIZE_CLASSES[size] || SIZE_CLASSES["3xl"]} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl ${contentClassName}`}
			>
				{title || description || icon || showClose ? (
					<header
						className={`flex shrink-0 items-start gap-4 border-b border-slate-100 px-4 py-4 pr-16 sm:px-6 ${headerClassName}`}
					>
						{icon ? <div className="shrink-0">{icon}</div> : null}
						<div className="min-w-0 flex-1">
							{title ? (
								<h2 className="break-anywhere text-xl font-black text-slate-950 sm:text-2xl">
									{title}
								</h2>
							) : null}
							{description ? (
								<p className="mt-1 break-anywhere text-sm leading-relaxed text-slate-500">
									{description}
								</p>
							) : null}
						</div>
						{showClose && onClose ? (
							<button
								type="button"
								onClick={onClose}
								className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
								aria-label={closeLabel}
							>
								<X size={22} />
							</button>
						) : null}
					</header>
				) : null}

				<div
					className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 ${bodyClassName}`}
				>
					{children}
				</div>

				{footer ? (
					<footer
						className={`shrink-0 border-t border-slate-100 px-4 py-4 sm:px-6 ${footerClassName}`}
					>
						{footer}
					</footer>
				) : null}
			</section>
		</div>
	);
}
