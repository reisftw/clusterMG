import { useState } from "react";

function getInitials(name, email) {
	const source = String(name || email || "U").trim();
	if (!source) return "U";
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

export default function UserAvatar({
	src,
	name,
	email,
	alt = "Avatar",
	className = "",
	initialsClassName = "",
}) {
	const [failedSrc, setFailedSrc] = useState("");
	const rawSrc = String(src || "").trim();
	const normalizedSrc = rawSrc.startsWith("/api/uploads/")
		? `https://retiradas.tech${rawSrc}`
		: rawSrc;
	const showImage = normalizedSrc && failedSrc !== normalizedSrc;

	return (
		<span className={className}>
			{showImage ? (
				<img
					src={normalizedSrc}
					alt={alt}
					onError={() => setFailedSrc(normalizedSrc)}
				/>
			) : (
				<span className={initialsClassName}>{getInitials(name, email)}</span>
			)}
		</span>
	);
}
