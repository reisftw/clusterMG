import {
	ArrowLeft,
	Check,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	ClipboardCheck,
	Copy,
	Download,
	MapPin,
	Route,
	Search,
	ShieldCheck,
	Star,
} from "lucide-react";
import { useMemo, useState } from "react";
import { buildMatchOSData } from "../../Mapa/utils/matchOs";

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function normalizeCode(value) {
	return String(value || "").replace(/\D/g, "");
}

function formatNumber(value) {
	return Number(value || 0).toLocaleString("pt-BR");
}

function buildCopyText(grupo, cidade, match, isAgente) {
	const principal = match.principal || {};
	const linhas = [
		`${isAgente ? "Agente autorizado" : grupo} -> ${cidade}`,
		`Serviço base: ${principal.tipo || "-"}`,
		`Cliente: ${principal.nome_cliente || "-"} | Código: ${principal.codigo_cliente || "-"} | OS: ${principal.num_os || "-"}`,
		`Técnico: ${principal.tecnico || "Não informado"}`,
		`Endereço: ${principal.endereco_resumo || principal.endereco || "-"}`,
		"Retiradas proximas:",
	];

	(match.relacionadas || []).forEach((ordem) => {
		linhas.push(
			`- ${ordem.tipo || "-"} | ${ordem.nome_cliente || "-"} | Código ${ordem.codigo_cliente || "-"} | OS ${ordem.num_os || "-"} | ${ordem.distanceMeters ?? "-"}m${ordem.sameStreet ? " | mesma rua" : ""}`,
		);
	});

	return linhas.join("\n");
}

function sumRetiradasRelacionadas(section = []) {
	return section.reduce(
		(totalSection, item) =>
			totalSection +
			(item.cidades || []).reduce(
				(totalCidades, cidade) =>
					totalCidades + Number(cidade.totalRetiradasRelacionadas || 0),
				0,
			),
		0,
	);
}

function flattenMatches(sections = []) {
	return sections.flatMap((regional) =>
		(regional.cidades || []).flatMap((cidade) =>
			(cidade.matches || []).map((match) => ({
				id: `${regional.regional}::${cidade.cidade}::${match.id}`,
				regional: regional.regional,
				cidade: cidade.cidade,
				cidadeTotalMatches: cidade.totalMatches,
				cidadeTotalRetiradasRelacionadas: cidade.totalRetiradasRelacionadas,
				regionalTotalMatches: regional.totalMatches,
				regionalTotalCidades: regional.totalCidades,
				isAgente: Boolean(cidade.isAgente || regional.isAgente),
				match,
				copyText:
					match.copyText ||
					buildCopyText(
						regional.regional,
						cidade.cidade,
						match,
						regional.isAgente,
					),
			})),
		),
	);
}

function MatchSummaryCard({ label, value, helper, tone, icon: Icon }) {
	return (
		<div className={`match-kpi-card ${tone}`}>
			<div className="match-kpi-icon">{Icon ? <Icon size={22} /> : null}</div>
			<div>
				<span>{label}</span>
				<strong>{value}</strong>
				<p>{helper}</p>
			</div>
		</div>
	);
}

function CopyButton({
	text,
	children = "Copiar",
	className = "",
	tone = "default",
	disabled = false,
}) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		if (!text || disabled) return;
		await navigator.clipboard.writeText(text);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			disabled={disabled}
			className={`match-copy-btn ${tone} ${className}`.trim()}
		>
			{copied ? <Check size={16} /> : <Copy size={16} />}
			{copied ? "Copiado" : children}
		</button>
	);
}

function RegionList({
	sections = [],
	selectedId,
	onSelect,
	search,
	customerCode,
	activeRegional,
	activeCity,
	activeFilter,
}) {
	const [expandedState, setExpandedState] = useState(() => ({
		open: new Set(),
		closed: new Set(),
	}));
	const firstRegional = String(sections[0]?.regional || "");
	const expanded = useMemo(() => {
		const next = new Set(expandedState.open);
		if (firstRegional && !expandedState.closed.has(firstRegional)) {
			next.add(firstRegional);
		}
		return next;
	}, [expandedState, firstRegional]);

	function toggle(key) {
		setExpandedState((current) => {
			const open = new Set(current.open);
			const closed = new Set(current.closed);
			const isOpen =
				open.has(key) || (key === firstRegional && !closed.has(key));

			if (isOpen) {
				open.delete(key);
				closed.add(key);
			} else {
				open.add(key);
				closed.delete(key);
			}

			return { open, closed };
		});
	}

	const normalizedSearch = normalizeText(search);
	const normalizedCustomerCode = normalizeCode(customerCode);

	const filteredSections = sections
		.map((regional) => {
			const cidades = (regional.cidades || [])
				.map((cidade) => {
					const matches = (cidade.matches || []).filter((match) => {
						const text = normalizeText(
							[
								regional.regional,
								cidade.cidade,
								match.principal?.tipo,
								match.principal?.nome_cliente,
								match.principal?.codigo_cliente,
								match.principal?.num_os,
								match.principal?.tecnico,
								...(match.relacionadas || []).flatMap((ordem) => [
									ordem.tipo,
									ordem.nome_cliente,
									ordem.codigo_cliente,
									ordem.num_os,
									ordem.endereco_resumo,
									ordem.endereco,
								]),
							].join(" "),
						);
						const matchesSearch =
							!normalizedSearch || text.includes(normalizedSearch);
						const matchesType =
							activeFilter === "todos" ||
							(activeFilter === "com-retirada" &&
								match.totalRelacionadas > 0) ||
							(activeFilter === "mesma-rua" &&
								(match.relacionadas || []).some((ordem) => ordem.sameStreet)) ||
							(activeFilter === "agentes" && regional.isAgente);
						const matchesCustomerCode =
							!normalizedCustomerCode ||
							normalizeCode(match.principal?.codigo_cliente) ===
								normalizedCustomerCode;
						return matchesSearch && matchesType && matchesCustomerCode;
					});

					return { ...cidade, matches };
				})
				.filter((cidade) => {
					const cityMatches =
						activeCity === "todas" ||
						normalizeText(cidade.cidade) === activeCity;
					return cityMatches && cidade.matches.length > 0;
				});

			return { ...regional, cidades };
		})
		.filter((regional) => {
			const regionalMatches =
				activeRegional === "todas" ||
				normalizeText(regional.regional) === activeRegional;
			return regionalMatches && regional.cidades.length > 0;
		});

	if (!filteredSections.length) {
		return (
			<div className="match-empty-list">
				Nenhum match encontrado com os filtros atuais.
			</div>
		);
	}

	return (
		<div className="match-region-list">
			{filteredSections.map((regional) => {
				const isOpen = expanded.has(regional.regional);
				const visibleMatches = flattenMatches([regional]);

				return (
					<section className="match-region-item" key={regional.regional}>
						<button
							type="button"
							className="match-region-header"
							onClick={() => toggle(regional.regional)}
						>
							<span
								className={`match-region-icon ${regional.isAgente ? "agent" : ""}`}
							>
								{regional.isAgente ? <Star size={18} /> : <MapPin size={18} />}
							</span>
							<span className="match-region-text">
								<strong>{regional.regional}</strong>
								<small>
									{formatNumber(regional.cidades.length)} cidades •{" "}
									{formatNumber(visibleMatches.length)} matches
								</small>
							</span>
							{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
						</button>

						{isOpen ? (
							<div className="match-city-list">
								{regional.cidades.map((cidade) => (
									<div
										className="match-city-group"
										key={`${regional.regional}-${cidade.cidade}`}
									>
										<div className="match-city-heading">
											<div>
												<strong>{cidade.cidade}</strong>
												<small>
													{formatNumber(cidade.matches.length)} match(es) •{" "}
													{formatNumber(cidade.totalRetiradasRelacionadas)}{" "}
													retirada(s) relacionada(s)
												</small>
											</div>
										</div>
										<div className="match-mini-list">
											{cidade.matches.slice(0, 5).map((match) => {
												const id = `${regional.regional}::${cidade.cidade}::${match.id}`;
												const firstDistance =
													match.relacionadas?.[0]?.distanceMeters;
												return (
													<button
														type="button"
														key={id}
														onClick={() =>
															onSelect({
																id,
																regional: regional.regional,
																cidade: cidade.cidade,
																cidadeTotalMatches: cidade.totalMatches,
																cidadeTotalRetiradasRelacionadas:
																	cidade.totalRetiradasRelacionadas,
																regionalTotalMatches: regional.totalMatches,
																regionalTotalCidades: regional.totalCidades,
																isAgente: regional.isAgente,
																match,
																copyText:
																	match.copyText ||
																	buildCopyText(
																		regional.regional,
																		cidade.cidade,
																		match,
																		regional.isAgente,
																	),
															})
														}
														className={`match-mini-row ${selectedId === id ? "active" : ""}`}
													>
														<span>
															<strong>
																{match.principal?.tipo || "Serviço"}
															</strong>
															<small>
																{formatNumber(match.totalRelacionadas)}{" "}
																retirada(s) proxima(s)
																{firstDistance != null
																	? ` • ${firstDistance}m`
																	: ""}
															</small>
														</span>
														<ChevronRight size={16} />
													</button>
												);
											})}
										</div>
									</div>
								))}
							</div>
						) : null}
					</section>
				);
			})}
		</div>
	);
}

function SelectedMatchPanel({ selected, allMatches, onBack = null }) {
	const [reviewState, setReviewState] = useState({ id: null, reviewed: false });
	const match = selected?.match;
	const selectedId = selected?.id || null;
	const reviewed = reviewState.id === selectedId ? reviewState.reviewed : false;

	if (!selected || !match) {
		return (
			<section className="match-detail-card empty">
				<Route size={34} />
				<h2>Selecione um match</h2>
				<p>
					Escolha uma cidade na lista para visualizar a O.S. base, as retiradas
					proximas e o texto para copiar.
				</p>
			</section>
		);
	}

	const principal = match.principal || {};
	const relacionadas = match.relacionadas || [];
	const sameStreetCount = relacionadas.filter(
		(ordem) => ordem.sameStreet,
	).length;
	const minDistance = relacionadas.reduce(
		(min, ordem) => Math.min(min, Number(ordem.distanceMeters || Infinity)),
		Infinity,
	);
	const otherMatches = allMatches
		.filter(
			(item) => item.cidade === selected.cidade && item.id !== selected.id,
		)
		.slice(0, 4);

	return (
		<section className="match-detail-card">
			{onBack ? (
				<button type="button" className="match-modal-back" onClick={onBack}>
					<ArrowLeft size={18} />
					Voltar
				</button>
			) : null}

			<div className="match-detail-title">
				<h2>{selected.cidade}</h2>
			</div>

			<div className="match-insight-strip">
				<div>
					<strong>{formatNumber(selected.cidadeTotalMatches)}</strong>
					<span>matches nesta cidade</span>
				</div>
				<div>
					<strong>{formatNumber(relacionadas.length)}</strong>
					<span>retiradas no match selecionado</span>
				</div>
				<div>
					<strong>{formatNumber(sameStreetCount)}</strong>
					<span>mesma rua</span>
				</div>
				<div>
					<strong>
						{Number.isFinite(minDistance)
							? `${formatNumber(minDistance)}m`
							: "--"}
					</strong>
					<span>menor distancia</span>
				</div>
			</div>

			<div className="match-os-card">
				<div className="match-os-top">
					<div>
						<div className="match-breadcrumb">
							{selected.regional} <span>•</span> {selected.cidade}
						</div>
						<h3>{principal.tipo || "Serviço"}</h3>
						<p>
							{principal.nome_cliente || "-"} <span>•</span>{" "}
							<strong>COD {principal.codigo_cliente || "-"}</strong>
						</p>
						<p>
							O.S {principal.num_os || "-"} <span>•</span>{" "}
							<strong className="blue">
								Técnico: {principal.tecnico || "Não informado"}
							</strong>
						</p>
						<small>
							{principal.endereco_resumo ||
								principal.endereco ||
								"Endereço não informado"}
						</small>
					</div>
					<CopyButton text={selected.copyText}>Copiar match</CopyButton>
				</div>

				<div className="match-nearby-box">
					<h4>Retiradas proximas</h4>
					<div className="match-nearby-list">
						{relacionadas.map((ordem) => (
							<article
								className="match-nearby-item"
								key={ordem.id || ordem.num_os}
							>
								<div className="match-nearby-title">
									<strong>{ordem.tipo || "Retirada"}</strong>
									<span className="distance">
										{ordem.distanceMeters ?? "-"}m
									</span>
									{ordem.sameStreet ? (
										<span className="same-street">mesma rua</span>
									) : null}
								</div>
								<p>
									{ordem.nome_cliente || "-"} <span>•</span>{" "}
									<strong>COD {ordem.codigo_cliente || "-"}</strong>{" "}
									<span>•</span> O.S {ordem.num_os || "-"}
								</p>
								<small>
									{ordem.endereco_resumo ||
										ordem.endereco ||
										"Endereço não informado"}
								</small>
							</article>
						))}
					</div>
				</div>

				<div className="match-copy-preview">
					<div className="match-copy-title">
						<strong>Texto para copiar</strong>
					</div>
					<textarea readOnly value={selected.copyText} />
					<div className="match-copy-actions">
						<CopyButton text={selected.copyText} tone="primary">
							Copiar texto
						</CopyButton>
						<CopyButton text={selected.copyText} tone="whatsapp">
							Copiar WhatsApp
						</CopyButton>
						<button
							type="button"
							className={`match-copy-btn review ${reviewed ? "done" : ""}`}
							onClick={() =>
								setReviewState({ id: selectedId, reviewed: !reviewed })
							}
						>
							<ClipboardCheck size={16} />
							{reviewed ? "Revisado" : "Marcar revisado"}
						</button>
					</div>
				</div>
			</div>

			<div className="match-other-card">
				<div className="match-other-title">
					<strong>
						Outros matches nesta cidade ({formatNumber(otherMatches.length)})
					</strong>
				</div>
				<div className="match-other-list">
					{otherMatches.length ? (
						otherMatches.map((item) => (
							<article className="match-other-row" key={item.id}>
								<MapPin size={18} />
								<div>
									<strong>{item.match.principal?.tipo || "Serviço"}</strong>
									<span>
										{formatNumber(item.match.totalRelacionadas)} retirada(s)
										proxima(s)
										{item.match.relacionadas?.[0]?.distanceMeters != null
											? ` • menor distancia: ${item.match.relacionadas[0].distanceMeters}m`
											: ""}
									</span>
								</div>
								<CopyButton text={item.copyText} className="compact">
									Copiar
								</CopyButton>
							</article>
						))
					) : (
						<p className="match-empty-inline">
							Não há outros matches para esta cidade nos filtros atuais.
						</p>
					)}
				</div>
			</div>
		</section>
	);
}

function AgentCards({ agentes = [] }) {
	const agentCities = agentes
		.flatMap((regional) =>
			(regional.cidades || []).map((cidade) => ({
				regional: regional.regional,
				...cidade,
			})),
		)
		.slice(0, 12);

	const agentCopyText = agentCities
		.map(
			(cidade) =>
				`${cidade.cidade}: ${cidade.totalMatches} match(es), ${cidade.totalRetiradasRelacionadas} retirada(s) relacionada(s)`,
		)
		.join("\n");

	return (
		<section className="match-agents-card">
			<div className="match-agents-top">
				<div>
					<h2>Agentes Autorizados</h2>
					<p>Cidades de agentes aparecem em bloco proprio, no fim do Match.</p>
				</div>
				<CopyButton text={agentCopyText} disabled={!agentCopyText}>
					Copiar todos os agentes
				</CopyButton>
			</div>
			{agentCities.length ? (
				<div className="match-agent-grid">
					{agentCities.map((cidade) => (
						<article
							className="match-agent-item"
							key={`${cidade.regional}-${cidade.cidade}`}
						>
							<MapPin size={18} />
							<div>
								<strong>{cidade.cidade}</strong>
								<span>
									{formatNumber(cidade.totalMatches)} matches • Agente ativo
								</span>
							</div>
							<CopyButton
								text={(cidade.matches || [])
									.map(
										(match) =>
											match.copyText ||
											buildCopyText(
												cidade.regional,
												cidade.cidade,
												match,
												true,
											),
									)
									.join("\n\n")}
								className="icon-only"
							>
								Copiar
							</CopyButton>
						</article>
					))}
				</div>
			) : (
				<div className="match-agent-empty">
					Nenhum match de agente autorizado encontrado para os filtros atuais.
				</div>
			)}
		</section>
	);
}

export default function TabMatchOS({
	ordens = [],
	mode = "all",
	note = null,
	dataOverride = null,
}) {
	const dados = useMemo(
		() => dataOverride || buildMatchOSData(ordens),
		[dataOverride, ordens],
	);
	const agentesOnly = mode === "agentes-only";
	const [search, setSearch] = useState("");
	const [regionalFilter, setRegionalFilter] = useState("todas");
	const [cityFilter, setCityFilter] = useState("todas");
	const [activeFilter, setActiveFilter] = useState("todos");
	const [customerCode, setCustomerCode] = useState("");
	const [selected, setSelected] = useState(null);
	const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

	const sections = useMemo(
		() =>
			agentesOnly
				? dados.agentes || []
				: [...(dados.regionais || []), ...(dados.agentes || [])],
		[agentesOnly, dados],
	);

	const allMatches = useMemo(() => flattenMatches(sections), [sections]);
	const normalizedCustomerCode = normalizeCode(customerCode);
	const customerCodeMatches = useMemo(() => {
		if (!normalizedCustomerCode) return [];
		return allMatches.filter(
			(item) =>
				normalizeCode(item.match?.principal?.codigo_cliente) ===
				normalizedCustomerCode,
		);
	}, [allMatches, normalizedCustomerCode]);

	const selectedMatch = useMemo(() => {
		if (normalizedCustomerCode && customerCodeMatches[0])
			return customerCodeMatches[0];
		if (selected && allMatches.some((item) => item.id === selected.id))
			return selected;
		return allMatches[0] || null;
	}, [allMatches, customerCodeMatches, normalizedCustomerCode, selected]);

	const customerCodeMessage = useMemo(() => {
		if (!normalizedCustomerCode) return "";
		if (!customerCodeMatches.length) {
			return `Nenhum ativo com codigo ${normalizedCustomerCode} encontrado no snapshot atual.`;
		}
		return `${customerCodeMatches.length} match(es) encontrado(s) para o ativo ${normalizedCustomerCode}.`;
	}, [customerCodeMatches.length, normalizedCustomerCode]);

	const totalMatches = agentesOnly
		? dados.agentes.reduce((sum, item) => sum + item.totalMatches, 0)
		: dados.resumo.totalMatches;
	const totalRetiradasRelacionadas = agentesOnly
		? sumRetiradasRelacionadas(dados.agentes)
		: Number(
				dados.resumo.totalRetiradasRelacionadas ??
					sumRetiradasRelacionadas(dados.regionais) +
						sumRetiradasRelacionadas(dados.agentes),
			);
	const totalCidades = agentesOnly
		? dados.agentes.reduce((sum, item) => sum + item.totalCidades, 0)
		: dados.resumo.totalCidades;
	const totalAgentes = dados.agentes.reduce(
		(sum, item) => sum + item.totalCidades,
		0,
	);

	const regionalOptions = useMemo(
		() =>
			sections.map((item) => ({
				label: item.regional,
				value: normalizeText(item.regional),
			})),
		[sections],
	);
	const cityOptions = useMemo(() => {
		const map = new Map();
		sections.forEach((regional) => {
			(regional.cidades || []).forEach((cidade) => {
				map.set(normalizeText(cidade.cidade), cidade.cidade);
			});
		});
		return [...map.entries()].map(([value, label]) => ({ value, label }));
	}, [sections]);

	const selectedCopyText = selectedMatch?.copyText || "";

	function findCustomerCodeMatches(code) {
		if (!code) return [];
		return allMatches.filter(
			(item) => normalizeCode(item.match?.principal?.codigo_cliente) === code,
		);
	}

	function applyCustomerCode(value, { openMobile = false } = {}) {
		const code = normalizeCode(value);
		setCustomerCode(code);

		if (!code) return;

		const matches = findCustomerCodeMatches(code);
		const firstMatch = matches[0];
		if (!firstMatch) return;

		setSelected(firstMatch);
		setRegionalFilter(normalizeText(firstMatch.regional));
		setCityFilter(normalizeText(firstMatch.cidade));
		setActiveFilter("todos");
		if (openMobile) setMobileDetailOpen(true);
	}

	function handleSelectMatch(item) {
		setSelected(item);
		setMobileDetailOpen(true);
	}

	function handleCustomerCodeSubmit(event) {
		event.preventDefault();
		applyCustomerCode(customerCode, { openMobile: true });
	}

	function clearCustomerCode() {
		setCustomerCode("");
		setRegionalFilter("todas");
		setCityFilter("todas");
	}

	function exportTextFile() {
		const content = allMatches.map((item) => item.copyText).join("\n\n---\n\n");
		const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "match-os.txt";
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	if (!totalMatches) {
		return (
			<div className="match-dashboard">
				<div className="match-empty-state">
					<Route size={34} />
					<h2>Nenhum Match encontrado</h2>
					<p>
						{agentesOnly
							? "Nenhuma cidade de agente autorizado teve servicos proximos de retirada ou cancelamento."
							: "O painel compara servicos de campo com retiradas e cancelamentos proximos nas cidades cadastradas."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="match-dashboard">
			<section className="match-hero-card">
				<div className="match-hero-top">
					<div>
						<h1>MATCH</h1>
						<p>Encontre vinculos entre O.S. e retiradas proximas por cidade.</p>
					</div>
					<div className="match-hero-actions">
						<CopyButton
							text={selectedCopyText}
							tone="primary"
							disabled={!selectedCopyText}
						>
							Copiar selecionados
						</CopyButton>
						<button
							type="button"
							className="match-export-btn"
							onClick={exportTextFile}
						>
							<Download size={16} />
							Exportar
						</button>
					</div>
				</div>

				<div className="match-filter-grid">
					<label className="match-search-box">
						<Search size={18} />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Buscar regional, cidade, cliente, codigo ou O.S."
						/>
					</label>
					<form
						className="match-client-code-box"
						onSubmit={handleCustomerCodeSubmit}
					>
						<label>
							<Search size={18} />
							<input
								value={customerCode}
								onChange={(event) => applyCustomerCode(event.target.value)}
								inputMode="numeric"
								placeholder="Código do cliente ativo. Ex: 601629"
							/>
						</label>
						<button type="submit">Pesquisar</button>
						{normalizedCustomerCode ? (
							<button
								type="button"
								className="ghost"
								onClick={clearCustomerCode}
							>
								Limpar
							</button>
						) : null}
					</form>
					<select
						value={regionalFilter}
						onChange={(event) => setRegionalFilter(event.target.value)}
					>
						<option value="todas">Regional: Todas</option>
						{regionalOptions.map((item) => (
							<option key={item.value} value={item.value}>
								Regional: {item.label}
							</option>
						))}
					</select>
					<select
						value={cityFilter}
						onChange={(event) => setCityFilter(event.target.value)}
					>
						<option value="todas">Cidade: Todas</option>
						{cityOptions.map((item) => (
							<option key={item.value} value={item.value}>
								Cidade: {item.label}
							</option>
						))}
					</select>
				</div>

				{customerCodeMessage ? (
					<div
						className={`match-client-code-message ${
							customerCodeMatches.length ? "success" : "warning"
						}`}
					>
						{customerCodeMessage}
					</div>
				) : null}

				<div className="match-filter-chips">
					{[
						["todos", "Todos"],
						["com-retirada", "Com retirada proxima"],
						["mesma-rua", "Mesma rua"],
						["agentes", "Agentes autorizados"],
					].map(([value, label]) => (
						<button
							type="button"
							key={value}
							className={activeFilter === value ? "active" : ""}
							onClick={() => setActiveFilter(value)}
						>
							{label}
						</button>
					))}
				</div>
			</section>

			<div className="match-kpi-grid">
				{!agentesOnly ? (
					<MatchSummaryCard
						label="Regionais"
						value={formatNumber(dados.resumo.totalRegionais)}
						helper="Grupos regionais com match"
						tone="blue"
						icon={MapPin}
					/>
				) : null}
				<MatchSummaryCard
					label="Agentes"
					value={formatNumber(totalAgentes)}
					helper="Cidades de agente autorizado"
					tone="green"
					icon={ShieldCheck}
				/>
				<MatchSummaryCard
					label="Cidades"
					value={formatNumber(totalCidades)}
					helper="Com vinculos proximos"
					tone="orange"
					icon={Route}
				/>
				<MatchSummaryCard
					label="Matches"
					value={formatNumber(totalMatches)}
					helper={`${formatNumber(totalRetiradasRelacionadas)} retiradas relacionadas`}
					tone="purple"
					icon={ClipboardCheck}
				/>
			</div>

			{note ? <div className="match-note">{note}</div> : null}

			<div className="match-main-grid">
				<aside className="match-sidebar-card">
					<h2>Regionais</h2>
					<RegionList
						sections={sections}
						selectedId={selectedMatch?.id}
						onSelect={handleSelectMatch}
						search={search}
						customerCode={customerCode}
						activeRegional={regionalFilter}
						activeCity={cityFilter}
						activeFilter={activeFilter}
					/>
				</aside>

				<SelectedMatchPanel selected={selectedMatch} allMatches={allMatches} />
			</div>

			{mobileDetailOpen && selectedMatch ? (
				<div className="match-mobile-modal" role="dialog" aria-modal="true">
					<SelectedMatchPanel
						selected={selectedMatch}
						allMatches={allMatches}
						onBack={() => setMobileDetailOpen(false)}
					/>
				</div>
			) : null}

			{!agentesOnly ? <AgentCards agentes={dados.agentes || []} /> : null}

			<div className="match-footer-note">
				Os dados sao atualizados automaticamente conforme a ultima importacao do
				Match.
			</div>
		</div>
	);
}
