import { useState } from "react";

// Mesmo padrao de apps/finan/frontend/src/components/UserAvatar.jsx —
// simplificado porque o avatar da Operação e sempre um data: URL (base64),
// nunca um caminho relativo de upload.
function getInitials(name, email) {
	const source = String(name || email || "U").trim();
	if (!source) return "U";
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

export default function UserAvatar({ src, name, email, alt = "Avatar", className = "", initialsClassName = "" }) {
	const [failed, setFailed] = useState(false);
	const source = String(src || "").trim();
	const showImage = Boolean(source) && !failed;

	return (
		<span className={className}>
			{showImage ? (
				<img src={source} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" />
			) : (
				<span className={initialsClassName || "flex h-full w-full items-center justify-center"}>
					{getInitials(name, email)}
				</span>
			)}
		</span>
	);
}
