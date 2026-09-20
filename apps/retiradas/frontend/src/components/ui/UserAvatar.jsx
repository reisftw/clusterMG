import { useState } from "react";

function getInitials(name, email) {
	const source = String(name || email || "U").trim();
	if (!source) return "U";

	const parts = source
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);

	if (parts.length >= 2) {
		return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
	}

	return source.slice(0, 2).toUpperCase();
}

const UserAvatar = ({
	src,
	name,
	email,
	alt = "Avatar",
	className = "",
	initialsClassName = "",
	children,
}) => {
	const [failedSrc, setFailedSrc] = useState("");
	const normalizedSrc = String(src || "").trim();
	const showImage = normalizedSrc && failedSrc !== normalizedSrc;

	return (
		<span className={className}>
			{showImage ? (
				<img
					src={normalizedSrc}
					alt={alt}
					className="h-full w-full object-cover"
					onError={() => setFailedSrc(normalizedSrc)}
				/>
			) : (
				<span className={initialsClassName}>{getInitials(name, email)}</span>
			)}
			{children}
		</span>
	);
};

export default UserAvatar;
