export function TabUploadDropzone({
	inputRef,
	onChange,
	status,
	fileName,
	rowCount,
	icon,
	expectedFields,
	activeTone = "orange",
	loadingContent = "Carregando...",
}) {
	const isReady = status === "ok" || status === "generating" || status === "gerando";
	const toneClasses = {
		orange: "hover:border-orange-400",
		blue: "hover:border-blue-400",
		purple: "hover:border-purple-400",
	};

	return (
		<div
			className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
				isReady
					? "border-green-400 bg-green-50"
					: status === "err"
						? "border-red-400 bg-red-50"
						: `border-gray-200 bg-white ${toneClasses[activeTone] || toneClasses.orange}`
			}`}
			onClick={() => inputRef.current?.click()}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					inputRef.current?.click();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<input
				ref={inputRef}
				type="file"
				accept=".xlsx,.xls"
				className="hidden"
				onChange={onChange}
			/>
			<span className="mb-3 block text-4xl">{icon}</span>
			{isReady ? (
				<>
					<p className="font-semibold text-green-700">{fileName}</p>
					<p className="text-sm text-green-600">
						{rowCount} linhas · clique para trocar
					</p>
				</>
			) : status === "loading" ? (
				typeof loadingContent === "string" ? (
					<p className="text-sm text-gray-500">{loadingContent}</p>
				) : (
					loadingContent
				)
			) : (
				<>
					<p className="font-semibold text-gray-700">
						Clique ou arraste o arquivo .xlsx
					</p>
					{expectedFields ? (
						<p className="mt-1 text-xs text-gray-400">
							Campos esperados: <code>{expectedFields}</code>
						</p>
					) : null}
				</>
			)}
		</div>
	);
}
