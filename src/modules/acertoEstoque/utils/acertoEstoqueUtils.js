const WEEKDAY_INDEX = Object.freeze({
	domingo: 0,
	segunda: 1,
	terca: 2,
	quarta: 3,
	quinta: 4,
	sexta: 5,
	sabado: 6,
});

export function formatDate(value) {
	if (!value) return "-";
	return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateWithWeekday(value) {
	if (!value) return "-";
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return "-";
	const day = date.toLocaleDateString("pt-BR");
	const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
	const formattedWeekday = weekday
		? weekday.charAt(0).toUpperCase() + weekday.slice(1)
		: "";
	return formattedWeekday ? `${day} (${formattedWeekday})` : day;
}

function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function formatQuantidade(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) return escapeHtml(value || 0);
	return number.toLocaleString("pt-BR", {
		minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
		maximumFractionDigits: 2,
	});
}

export function formatDateTime(value) {
	if (!value) return "-";
	return new Date(value).toLocaleString("pt-BR");
}

export function formatTurno(value) {
	const labels = {
		manha: "Manha",
		tarde: "Tarde",
		noite: "Noite",
	};
	return labels[value] || value || "-";
}

export function formatDiaSemana(value) {
	const labels = {
		segunda: "Segunda",
		terca: "Terca",
		quarta: "Quarta",
		quinta: "Quinta",
		sexta: "Sexta",
		sabado: "Sabado",
	};
	return labels[value] || value || "-";
}

export function getStatusBadgeClasses(status) {
	return status === "ativo"
		? "bg-emerald-50 text-emerald-700 border-emerald-200"
		: "bg-slate-100 text-slate-500 border-slate-200";
}

function normalizeTecnicoLancamentos(acerto = {}) {
	if (
		Array.isArray(acerto.tecnicoLancamentos) &&
		acerto.tecnicoLancamentos.length > 0
	) {
		return acerto.tecnicoLancamentos;
	}

	if (acerto.tecnicoNome) {
		return [
			{
				tecnicoId: acerto.tecnicoId || "",
				tecnicoNome: acerto.tecnicoNome,
				tecnicoEmail: acerto.tecnicoEmail || "",
				empresaId: acerto.empresaId || "",
				empresaNome: acerto.empresaNome || "",
				responsavel: acerto.responsavel || "",
				itens: Array.isArray(acerto.itens) ? acerto.itens : [],
			},
		];
	}

	return [];
}

export function buildAcertoWhatsAppMessage(acerto = {}) {
	const tecnicoLancamentos = normalizeTecnicoLancamentos(acerto);
	const lines = [
		`Codigo: ${acerto.codigo || "PREVIEW"}`,
		`Data: ${acerto.dataAcerto || "-"}`,
		`Cidade: ${acerto.cidade || "-"}`,
		`Turno: ${formatTurno(acerto.turno)}`,
		"",
		"Acerto por estoque:",
	];

	tecnicoLancamentos.forEach((lancamento, index) => {
		lines.push(
			`${index + 1}. ${lancamento.tecnicoNome || "-"} - ${lancamento.empresaNome || "-"}`,
		);
		if (lancamento.responsavel) {
			lines.push(`Responsavel: ${lancamento.responsavel}`);
		}
		if (lancamento.tecnicoEmail) {
			lines.push(`E-mail tecnico: ${lancamento.tecnicoEmail}`);
		}
		(lancamento.itens || []).forEach((item) => {
			lines.push(`- ${item.nome}: ${item.quantidade} ${item.unidade}`);
		});
		lines.push("");
	});

	return lines.join("\n").trim();
}

export function buildAcertoPreviewMessage(acerto = {}) {
	return buildAcertoWhatsAppMessage(acerto);
}

export function buildAcertoEmailHtml(acerto = {}) {
	const tecnicoLancamentos = normalizeTecnicoLancamentos(acerto);
	const blocosTecnicos = tecnicoLancamentos
		.map((lancamento) => {
			const email = String(lancamento.tecnicoEmail || "").trim();
			const empresa = lancamento.empresaNome || "-";
			const tipoAtuacao = lancamento.tipoAtuacao || lancamento.atuacao || "";
			const itemRows = (lancamento.itens || [])
				.map(
					(item) => `
            <div style="margin:3px 0 0 14px;line-height:1.35;">
              &bull; ${escapeHtml(item.nome)}:
              <strong>${formatQuantidade(item.quantidade)} ${escapeHtml(String(item.unidade || "").toUpperCase())}</strong>
            </div>
          `,
				)
				.join("");

			return `
        <div style="margin-top:22px;">
          <div style="line-height:1.45;color:#334155;">
            <span style="color:#1f7ad2;">👤</span>
            <strong>TECNICO:</strong> ${escapeHtml(lancamento.tecnicoNome || "-")}
            | ${escapeHtml(empresa)}
            ${
							email
								? ` (<a href="mailto:${escapeHtml(email)}" style="color:#0065d0;text-decoration:underline;">${escapeHtml(email)}</a>)`
								: ""
						}
            ${tipoAtuacao ? ` | ${escapeHtml(tipoAtuacao)}` : ""}
          </div>
          <div style="margin-top:6px;line-height:1.4;color:#334155;">
            <span>📦</span><strong>MATERIAIS:</strong>
          </div>
          <div style="color:#334155;">
            ${itemRows || '<div style="margin:3px 0 0 14px;color:#64748b;">&bull; Nenhum item informado.</div>'}
          </div>
        </div>
      `;
		})
		.join("");

	return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;padding:16px 20px;color:#334155;font-size:13px;">
      <div style="padding:14px 18px;background:#f1f5f9;border-left:6px solid #0f172a;border-radius:8px;color:#334155;font-weight:700;">
        📍 ACERTO: ${escapeHtml(String(acerto.cidade || "-").toUpperCase())}
        | 📅 ${escapeHtml(formatDateWithWeekday(acerto.dataAcerto))}
        | 🕒 PERIODO: ${escapeHtml(formatTurno(acerto.turno))}
      </div>
      ${blocosTecnicos || '<div style="margin-top:18px;color:#64748b;">Nenhum tecnico informado.</div>'}
    </div>
  `.trim();
}

function isSameWeek(referenceDate, targetDate) {
	const reference = new Date(referenceDate);
	const start = new Date(reference);
	start.setHours(0, 0, 0, 0);
	start.setDate(reference.getDate() - reference.getDay());

	const end = new Date(start);
	end.setDate(start.getDate() + 7);

	const target = new Date(`${targetDate}T00:00:00`);
	return target >= start && target < end;
}

export function buildDashboardMetrics(store) {
	const empresas = Array.isArray(store?.empresas) ? store.empresas : [];
	const tecnicos = Array.isArray(store?.tecnicos) ? store.tecnicos : [];
	const produtos = Array.isArray(store?.produtos) ? store.produtos : [];
	const acertos = Array.isArray(store?.acertos) ? store.acertos : [];
	const now = new Date();

	const acertosSemana = acertos.filter((item) =>
		isSameWeek(now, item.dataAcerto),
	);
	const porEmpresa = empresas
		.map((empresa) => ({
			empresaId: empresa.id,
			nome: empresa.nome,
			totalTecnicos: tecnicos.filter(
				(tecnico) => tecnico.empresaId === empresa.id,
			).length,
			totalAcertos: acertos.filter(
				(acerto) =>
					(acerto.tecnicoLancamentos || []).some(
						(lancamento) => lancamento.empresaId === empresa.id,
					) || acerto.empresaId === empresa.id,
			).length,
		}))
		.sort((left, right) => right.totalAcertos - left.totalAcertos);

	const porCidade = [...acertos].reduce((accumulator, item) => {
		accumulator[item.cidade] = (accumulator[item.cidade] || 0) + 1;
		return accumulator;
	}, {});

	return {
		totals: {
			empresas: empresas.length,
			tecnicos: tecnicos.length,
			produtos: produtos.length,
			acertos: acertos.length,
			acertosSemana: acertosSemana.length,
		},
		latestAcertos: acertos.slice(0, 5),
		weeklyAcertos: acertosSemana.slice(0, 8),
		porEmpresa,
		porCidade: Object.entries(porCidade)
			.map(([cidade, total]) => ({ cidade, total }))
			.sort((left, right) => right.total - left.total),
	};
}

export function buildAgendaLabel(agenda) {
	if (!agenda) return "-";
	return `${agenda.cidade} - ${formatDiaSemana(agenda.diaSemana)} - ${formatTurno(agenda.turno)}`;
}

export function getAgendaWeekdayIndex(agenda) {
	return WEEKDAY_INDEX[agenda?.diaSemana] ?? 99;
}
