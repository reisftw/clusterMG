import { useRef } from "react";

// Campo de PIN que NUNCA renderiza o digito de verdade — nem por um
// instante. O <input> real fica invisivel (opacity 0, mas clicavel/
// focavel, sobre as caixinhas); o que aparece na tela e sempre uma bolinha
// preenchida, nunca o numero. Isso evita o comportamento padrao do
// teclado mobile (Android/iOS) de "piscar" o ultimo digito antes de
// mascarar, que um <input type="password"> comum nao consegue desligar —
// aqui a mascara e 100% controlada pelo proprio componente, nao pelo
// navegador/SO.
const VARIANT_CLASSES = {
	light: {
		empty: "border-slate-200 bg-white",
		filled: "border-blue-400 bg-blue-50 text-blue-700",
	},
	dark: {
		empty: "border-slate-600 bg-slate-900/60",
		filled: "border-orange-400 bg-slate-800 text-orange-300",
	},
};

export default function FinanPinDigitsInput({
	value,
	onChange,
	length = 6,
	autoFocus = false,
	disabled = false,
	label = "PIN",
	variant = "light",
}) {
	const inputRef = useRef(null);
	const colors = VARIANT_CLASSES[variant] || VARIANT_CLASSES.light;

	return (
		<div className="relative mx-auto flex w-fit justify-center gap-2">
			{/* O <input> invisivel cobre a div inteira (absolute inset-0) e ja
			recebe clique/foco/teclado nativamente — nao precisa de onClick no
			wrapper (evitava jsx-a11y/click-events-have-key-events). */}
			<input
				ref={inputRef}
				type="tel"
				inputMode="numeric"
				autoComplete="one-time-code"
				maxLength={length}
				value={value}
				// Opt-in via prop (default false), usado soh na tela de PIN pra
				// focar o campo assim que ele aparece — comportamento intencional
				// desse fluxo especifico, nao um autofocus generico de formulario.
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus={autoFocus}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
				aria-label={label}
				className="absolute inset-0 h-full w-full cursor-text opacity-0"
			/>
			{Array.from({ length }).map((_, index) => (
				<span
					key={index}
					className={`flex h-12 w-10 items-center justify-center rounded-xl border text-2xl font-black transition ${
						index < value.length ? colors.filled : colors.empty
					}`}
				>
					{index < value.length ? "•" : ""}
				</span>
			))}
		</div>
	);
}
