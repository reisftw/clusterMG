import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { sanitizeHtml } from "../../../../shared/html/sanitizeHtml";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";

const SEASONAL_META = {
	Janeiro: 65,
	Fevereiro: 65,
	Março: 75,
	Marco: 75,
	Abril: 85,
	Maio: 90,
	Junho: 90,
	Julho: 90,
	Agosto: 90,
	Setembro: 85,
	Outubro: 85,
	Novembro: 75,
	Dezembro: 65,
};

const MESES = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

const mesAtual = MESES[new Date().getMonth()];
const anoAtual = new Date().getFullYear().toString();
const RETORNINHO_EMAIL_URL = "https://retiradas.tech/retorninho-prancheta.png";
const MAPA_URL = "https://retiradas.tech/painel/mapa";
const MATCH_URL = "https://retiradas.tech/painel/match";

const getMesAnterior = (mes) => {
	const index = MESES.indexOf(mes);
	return MESES[index === 0 ? MESES.length - 1 : index - 1] || mes;
};

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveStatusRegLabel(status, qtd) {
	if (status) return "Atingida";
	return qtd > 0 ? "Parcial" : "Não atingida";
}

const TabEmailFechamento = () => {
	useFerramentasRegionais();

	// -- ABA -------------------------------------------------------
	const [aba, setAba] = useState("fechamento");
	const fcMesInputId = useId();
	const fcAnoInputId = useId();
	const fcMetaGeralInputId = useId();
	const fcTotalRealizadoInputId = useId();
	const inMesInputId = useId();
	const inAnoInputId = useId();
	const inCancelInputId = useId();
	const inDiasUInputId = useId();
	const inDiasCInputId = useId();

	// -- FECHAMENTO ------------------------------------------------
	const [fcMes, setFcMes] = useState(mesAtual);
	const [fcAno, setFcAno] = useState(anoAtual);
	const [fcMetaGeral, setFcMetaGeral] = useState("");
	const [fcTotalRealizado, setFcTotalRealizado] = useState("");
	const [fcRegs, setFcRegs] = useState([]);
	const [fcNovaReg, setFcNovaReg] = useState("");
	const [fcHTML, setFcHTML] = useState("");
	const [fcCopied, setFcCopied] = useState(false);

	const fcAddRegional = () => {
		const nome = fcNovaReg.trim();
		if (!nome) return;
		setFcRegs((p) => [...p, { nome, qtd: 0 }]);
		setFcNovaReg("");
	};

	const fcGerar = () => {
		const metaGeral = Number.parseInt(fcMetaGeral) || 0;
		const totalRealizado = Number.parseInt(fcTotalRealizado) || 0;
		const goalPct = (SEASONAL_META[fcMes] || 80) / 100;
		const goalPctDisplay = SEASONAL_META[fcMes] || 80;
		const meta80 = Math.round(metaGeral * goalPct);
		const pctGeral =
			metaGeral > 0 ? ((totalRealizado / metaGeral) * 100).toFixed(1) : 0;
		const pct80 = meta80 > 0 ? ((totalRealizado / meta80) * 100).toFixed(1) : 0;
		const bateuMeta = totalRealizado >= meta80;

		let linhasReg = "";
		fcRegs.forEach((r) => {
			const pct = ((r.qtd / 110) * 100).toFixed(1);
			const status = r.qtd >= 110;
			const cor = status ? "#28a745" : "#dc3545";
			const emoji = status ? "✅" : "⚠️";
			linhasReg += `
        <tr class="${status ? "meta-ok" : "meta-nok"}">
          <td>${r.nome}</td>
          <td style="text-align:center">${r.qtd}</td>
          <td style="text-align:center">110</td>
          <td style="text-align:center;color:${cor};font-weight:bold">${pct}%</td>
          <td style="text-align:center">${emoji} ${resolveStatusRegLabel(status, r.qtd)}</td>
        </tr>`;
		});

		const msgMeta = bateuMeta
			? `<p style="color:#28a745;font-weight:bold">✅ Parabens! Atingimos <strong>${pctGeral}%</strong> da meta geral no mes de ${fcMes}/${fcAno}. Continuemos com esse desempenho!</p>`
			: `<p style="color:#dc3545;font-weight:bold">⚠️ Neste mês não conseguimos bater a meta estabelecida, atingindo <strong>${pctGeral}%</strong> do total. Mas estamos evoluindo! Cada retirada conta e estamos no caminho certo. Contamos com o apoio de todos para que no próximo mês possamos superar essa marca juntos. 💪</p>`;

		setFcHTML(`
      <h1>📦 Relatorio de Fechamento — Retiradas ${fcMes}/${fcAno}</h1>
      <p>Prezados, segue abaixo o relatorio de fechamento de retiradas referente ao mes de <strong>${fcMes}/${fcAno}</strong>. Confira o desempenho por regional:</p>

      <table>
        <thead>
          <tr>
            <th>Regional</th>
            <th style="text-align:center">Realizado</th>
            <th style="text-align:center">Meta</th>
            <th style="text-align:center">% Meta</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>${linhasReg}</tbody>
      </table>

      <hr style="margin:20px 0;border:none;border-top:1px solid #ddd">
      <h2 style="font-size:16px;margin-bottom:10px">📊 Resultado Geral do Mes</h2>
      <table>
        <thead><tr><th>Indicador</th><th style="text-align:center">Valor</th></tr></thead>
        <tbody>
          <tr><td>Total de retiradas realizadas</td><td style="text-align:center;font-weight:bold">${totalRealizado}</td></tr>
          <tr><td>Meta geral (100%)</td><td style="text-align:center">${metaGeral}</td></tr>
          <tr><td>Meta minima exigida (${goalPctDisplay}%)</td><td style="text-align:center">${meta80}</td></tr>
          <tr><td>% atingida sobre meta geral</td><td style="text-align:center;font-weight:bold;color:${Number.parseFloat(pctGeral) >= 80 ? "#28a745" : "#dc3545"}">${pctGeral}%</td></tr>
          <tr><td>% atingida sobre meta minima (${goalPctDisplay}%)</td><td style="text-align:center;font-weight:bold;color:${Number.parseFloat(pct80) >= 100 ? "#28a745" : "#dc3545"}">${pct80}%</td></tr>
        </tbody>
      </table>

      <div style="margin-top:18px">${msgMeta}</div>

      <div class="footer-email">
        <p>Em caso de duvidas ou informacoes adicionais, entre em contato:</p>
        <p><strong>Rodrigo Reis</strong> — (31) 9 8466-7498</p>
      </div>`);
	};

	const fcCopiar = () => {
		const el = document.getElementById("fc-preview-content");
		if (!el) return;
		const range = document.createRange();
		range.selectNode(el);
		window.getSelection().removeAllRanges();
		window.getSelection().addRange(range);
		document.execCommand("copy");
		window.getSelection().removeAllRanges();
		setFcCopied(true);
		setTimeout(() => setFcCopied(false), 2000);
	};

	// -- INICIO ----------------------------------------------------
	const [inMes, setInMes] = useState(mesAtual);
	const [inAno, setInAno] = useState(anoAtual);
	const [inCancel, setInCancel] = useState("");
	const [inDiasU, setInDiasU] = useState("");
	const [inDiasC, setInDiasC] = useState("");
	const [inRegs, setInRegs] = useState([]);
	const [inNovaReg, setInNovaReg] = useState("");
	const [inHTML, setInHTML] = useState("");
	const [inCopied, setInCopied] = useState(false);

	const inGoalPct = (SEASONAL_META[inMes] || 80) / 100;
	const inGoalDisplay = SEASONAL_META[inMes] || 80;
	const inCancelNum = Number.parseInt(inCancel) || 0;
	const inMeta = Math.round(inCancelNum * inGoalPct);
	const inDiasUNum = Number.parseInt(inDiasU) || 0;
	const inDiasCNum = Number.parseInt(inDiasC) || 0;
	const inMedU = inDiasUNum > 0 ? (inMeta / inDiasUNum).toFixed(1) : "—";
	const inMedC = inDiasCNum > 0 ? (inMeta / inDiasCNum).toFixed(1) : "—";

	const inAddRegional = () => {
		const nome = inNovaReg.trim();
		if (!nome) return;
		setInRegs((p) => [...p, { nome, cancelamentos: 0, meta: 110 }]);
		setInNovaReg("");
	};

	const inGerar = () => {
		const medU = inDiasUNum > 0 ? (inMeta / inDiasUNum).toFixed(1) : "N/A";
		const medC = inDiasCNum > 0 ? (inMeta / inDiasCNum).toFixed(1) : "N/A";
		const mesAnterior = getMesAnterior(inMes);
		const linhasReg = inRegs
			.map((r) => {
				const cancelamentos = Number.parseInt(r.cancelamentos) || 0;
				const meta = Number.parseInt(r.meta) || 110;
				const pctCobertura =
					cancelamentos > 0 ? ((meta / cancelamentos) * 100).toFixed(1) : "0.0";

				return `
          <tr>
            <td>${r.nome}</td>
            <td style="text-align:center">${cancelamentos}</td>
            <td style="text-align:center;font-weight:bold">${meta}</td>
            <td style="text-align:center;color:#c2410c;font-weight:bold">${pctCobertura}%</td>
          </tr>`;
			})
			.join("");
		const maiorRegional = [...inRegs]
			.map((r) => ({
				nome: r.nome,
				cancelamentos: Number.parseInt(r.cancelamentos) || 0,
				meta: Number.parseInt(r.meta) || 110,
			}))
			.sort((a, b) => b.cancelamentos - a.cancelamentos)[0];
		const destaqueRegional =
			maiorRegional && maiorRegional.cancelamentos > 0
				? `<p>O maior volume esta em <strong>${maiorRegional.nome}</strong>, com <strong>${maiorRegional.cancelamentos}</strong> cancelamentos em ${mesAnterior}. Nesse caso, a referencia de <strong>${maiorRegional.meta}</strong> retiradas representa apenas <strong>${((maiorRegional.meta / maiorRegional.cancelamentos) * 100).toFixed(1)}%</strong> do que foi aberto. Essa disparidade mostra que ainda temos bastante espaco para crescer, principalmente com as regionais puxando as ordens e usando melhor as rotas.</p>`
				: "";
		const tabelaRegional = linhasReg
			? `
      <h2 style="font-size:15px;margin:18px 0 10px">Cancelamentos do mes anterior por regional</h2>
      <p>Os cancelamentos abertos em <strong>${mesAnterior}</strong> mostram o tamanho da oportunidade para ${inMes}. As regionais sao decisivas para transformar esse volume em retirada executada e aproximar o resultado da meta final.</p>
      <table>
        <thead>
          <tr>
            <th>Regional</th>
            <th style="text-align:center">Cancelamentos em ${mesAnterior}</th>
            <th style="text-align:center">Meta referencia</th>
            <th style="text-align:center">Meta x abertos</th>
          </tr>
        </thead>
        <tbody>${linhasReg}</tbody>
      </table>
      ${destaqueRegional}`
			: "";

		setInHTML(`
      <h1>🚀 Inicio de Mes — Retiradas ${inMes}/${inAno}</h1>
      <p>Prezados, iniciamos o mes de <strong>${inMes}/${inAno}</strong>! Com base nos cancelamentos do periodo anterior, seguem as metas e orientacoes para este mes.</p>

      <h2 style="font-size:15px;margin:18px 0 10px">📊 Metas do Mes</h2>
      <table>
        <thead><tr><th>Indicador</th><th style="text-align:center">Valor</th></tr></thead>
        <tbody>
          <tr><td>Total de cancelamentos (base)</td><td style="text-align:center">${inCancelNum}</td></tr>
          <tr><td><strong>Meta do mes (${inGoalDisplay}% dos cancelamentos)</strong></td><td style="text-align:center;font-weight:bold;color:#1a6f3c;font-size:15px">${inMeta}</td></tr>
          <tr><td>Media diaria necessaria <em>(incluindo sabado e domingo)</em></td><td style="text-align:center;font-weight:bold">${medC} / dia</td></tr>
          <tr><td>Media diaria necessaria <em>(apenas dias uteis, sem sab/dom)</em></td><td style="text-align:center;font-weight:bold">${medU} / dia</td></tr>
        </tbody>
      </table>

      ${tabelaRegional}

      <div style="background:#eef7ff;border-left:4px solid #0f5ea8;padding:14px 18px;margin:18px 0;border-radius:4px">
        <p style="font-weight:bold;margin-bottom:6px">Mapa e Match no painel</p>
        <p>Tambem contamos com as ferramentas de <strong>Mapa</strong> e <strong>Match</strong>, disponiveis no painel, para organizar retiradas em fila e acionar os servicos de ativa com mais inteligencia. Isso nos ajuda a aproveitar melhor as rotas, ganhar tempo em campo e gerar economia financeira ao reduzir deslocamentos isolados.</p>
        <div style="margin:16px 0 18px">
          <p style="font-weight:bold;margin:0 0 10px">Links de apoio:</p>
          <a href="${MAPA_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0f5ea8;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:6px;margin:0 10px 8px 0">Acessar Mapa</a>
          <a href="${MATCH_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1a6f3c;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:6px;margin:0 0 8px 0">Acessar Match</a>
        </div>
        <p>Hoje a equipe dedicada de retiradas conta com <strong>7 tecnicos</strong>. Ja na equipe de ativa conseguimos ampliar o alcance com profissionais proprios e terceirizados, aumentando a gama de atendimento e trazendo mais efetividade para a tratativa das ordens de retirada.</p>
      </div>

      <div style="background:#e8f4fd;border-left:4px solid #1a73e8;padding:14px 18px;margin:18px 0;border-radius:4px">
        <p style="font-weight:bold;margin-bottom:6px">💪 Contamos com todos voces!</p>
        <p>Juntos conseguimos atingir nossas metas. Cada atendimento realizado e um passo a mais para o nosso sucesso. Vamos com tudo nesse mes de ${inMes}!</p>
      </div>

      <h2 style="font-size:15px;margin:18px 0 10px">🔍 Como filtrar as ordens no sistema</h2>
      <div style="background:#f7fbff;border:1px solid #dbeafe;padding:14px 18px;margin:18px 0;border-radius:4px;text-align:center">
        <img src="${RETORNINHO_EMAIL_URL}" alt="Retorninho com plano de acao" style="max-width:150px;width:100%;height:auto;margin:0 auto 8px;display:block">
        <p style="font-weight:bold;margin:0;color:#1e3a8a">O Retorninho tambem esta confiante: com rota bem aproveitada e apoio das regionais, a meta fica mais perto.</p>
        <p style="margin:8px 0 0">Confiamos no empenho de cada regional para aumentar as retiradas e fortalecer a meta final.</p>
      </div>

      <p>Para localizar as ordens que precisam de retirada, utilize os seguintes filtros:</p>

      <table>
        <thead><tr><th>Tipo de Ordem</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Cancelamento</td><td>Pendente / Aguardando Agendamento</td></tr>
          <tr><td>Cancelamento Loja</td><td>Pendente / Aguardando Agendamento</td></tr>
          <tr><td>Cancelamento Técnico</td><td>Pendente / Aguardando Agendamento</td></tr>
          <tr><td>Retirada</td><td>Pendente / Aguardando Agendamento</td></tr>
        </tbody>
      </table>

      <div style="background:#fff8e1;border-left:4px solid #f9a825;padding:14px 18px;margin:18px 0;border-radius:4px">
        <p style="font-weight:bold;margin-bottom:6px">⚙️ Configuracao do filtro de data</p>
        <p>Filtrar como <strong>Data de Cadastro</strong> ate <strong>01/01/2026</strong>.</p>
      </div>

      <div style="background:#fce4ec;border-left:4px solid #c62828;padding:14px 18px;margin:18px 0;border-radius:4px">
        <p style="font-weight:bold;margin-bottom:6px">🚨 Atencao — Ordens sem técnico</p>
        <p><strong>Não filtrar pelo nome de nenhum técnico.</strong> Existem ordens de serviço abertas <u>sem técnico vinculado</u> que precisam de tentativa de atendimento. <strong>Essas ordens devem ser priorizadas!</strong></p>
      </div>

      <div class="footer-email">
        <p>Em caso de duvidas ou necessidade de apoio, fale comigo:</p>
        <p><strong>Rodrigo Reis</strong> — (31) 9 8466-7498</p>
      </div>`);
	};

	const inCopiarFn = () => {
		const el = document.getElementById("in-preview-content");
		if (!el) return;
		const range = document.createRange();
		range.selectNode(el);
		window.getSelection().removeAllRanges();
		window.getSelection().addRange(range);
		document.execCommand("copy");
		window.getSelection().removeAllRanges();
		setInCopied(true);
		setTimeout(() => setInCopied(false), 2000);
	};

	// -- ESTILOS DO PREVIEW ----------------------------------------
	return (
		<div className="space-y-4">
			{/* Seletor de aba */}
			<div className="flex gap-2">
				{[
					{ key: "fechamento", label: "📧 E-mail Fechamento" },
					{ key: "inicio", label: "🚀 E-mail Inicio de Mes" },
				].map((t) => (
					<button
						type="button"
						key={t.key}
						onClick={() => setAba(t.key)}
						className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors
              ${
								aba === t.key
									? "bg-blue-800 text-white border-blue-800"
									: "bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700"
							}`}
					>
						{t.label}
					</button>
				))}
			</div>

			{/* -- ABA FECHAMENTO -- */}
			{aba === "fechamento" && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* Configuracoes */}
					<div className="space-y-4">
						<div className="bg-white border border-gray-200 rounded-xl p-5">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
								Configuracoes do Mes
							</p>
							<div className="grid grid-cols-2 gap-3 mb-3">
								<div>
									<label
										htmlFor={fcMesInputId}
										className="block text-xs text-gray-500 mb-1"
									>
										Mes de Referencia
									</label>
									<select
										id={fcMesInputId}
										value={fcMes}
										onChange={(e) => setFcMes(e.target.value)}
										className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
									>
										{MESES.map((m) => (
											<option key={m}>{m}</option>
										))}
									</select>
								</div>
								<div>
									<label
										htmlFor={fcAnoInputId}
										className="block text-xs text-gray-500 mb-1"
									>
										Ano
									</label>
									<input
										id={fcAnoInputId}
										type="number"
										value={fcAno}
										onChange={(e) => setFcAno(e.target.value)}
										className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
									/>
								</div>
							</div>
							<div className="mb-3">
								<label
									htmlFor={fcMetaGeralInputId}
									className="block text-xs text-gray-500 mb-1"
								>
									Meta geral de retiradas (total)
								</label>
								<input
									id={fcMetaGeralInputId}
									type="number"
									value={fcMetaGeral}
									onChange={(e) => setFcMetaGeral(e.target.value)}
									placeholder="Ex: 770"
									className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
								/>
								<p className="text-xs text-gray-400 mt-1">
									💡 Soma das metas de todas as regionais (110 × nº de
									regionais)
								</p>
							</div>
							<div>
								<label
									htmlFor={fcTotalRealizadoInputId}
									className="block text-xs text-gray-500 mb-1"
								>
									Total de retiradas realizadas no mes
								</label>
								<input
									id={fcTotalRealizadoInputId}
									type="number"
									value={fcTotalRealizado}
									onChange={(e) => setFcTotalRealizado(e.target.value)}
									placeholder="Ex: 620"
									className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
								/>
							</div>
						</div>

						{/* Regionais */}
						<div className="bg-white border border-gray-200 rounded-xl p-5">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
								Retiradas por Regional
							</p>
							<div className="space-y-2 mb-3">
								{fcRegs.map((r, i) => (
									<div key={i} className="flex items-center gap-2">
										<span className="text-sm font-semibold text-gray-700 w-40 truncate">
											{r.nome}
										</span>
										<input
											type="number"
											min="0"
											value={r.qtd || ""}
											placeholder="Qtd realizada"
											onChange={(e) => {
												const updated = [...fcRegs];
												updated[i] = {
													...updated[i],
													qtd: Number.parseInt(e.target.value) || 0,
												};
												setFcRegs(updated);
											}}
											className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
										/>
										<button
											type="button"
											onClick={() =>
												setFcRegs((p) => p.filter((_, j) => j !== i))
											}
											className="text-gray-400 hover:text-red-500 transition-colors"
										>
											<Trash2 size={14} />
										</button>
									</div>
								))}
							</div>
							<div className="flex gap-2">
								<input
									type="text"
									value={fcNovaReg}
									onChange={(e) => setFcNovaReg(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && fcAddRegional()}
									placeholder="Nome da regional..."
									className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
								/>
								<button
									type="button"
									onClick={fcAddRegional}
									className="flex items-center gap-1 px-3 py-2 bg-blue-800 text-white rounded-lg text-sm font-semibold hover:bg-blue-900"
								>
									<Plus size={14} /> Regional
								</button>
							</div>
						</div>
					</div>

					{/* Preview fechamento */}
					<div className="bg-white border border-gray-200 rounded-xl p-5">
						<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
							Pre-visualizacao
						</p>
						<button
							type="button"
							onClick={fcGerar}
							className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors mb-4"
						>
							⚡ Gerar E-mail
						</button>
						{fcHTML && (
							<div className="relative">
								<button
									type="button"
									onClick={fcCopiar}
									className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600"
								>
									{fcCopied ? (
										<>
											<Check size={12} /> Copiado!
										</>
									) : (
										<>
											<Copy size={12} /> Copiar
										</>
									)}
								</button>
								<div
									id="fc-preview-content"
									style={{
										fontFamily: "Arial,sans-serif",
										color: "#1a1a1a",
										lineHeight: 1.7,
										fontSize: 14,
									}}
									className="border border-gray-200 rounded-xl p-6 bg-gray-50 overflow-auto max-h-[600px] [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_th]:bg-blue-900 [&_th]:text-white [&_th]:p-3 [&_th]:text-left [&_th]:text-xs [&_td]:p-3 [&_td]:border [&_td]:border-gray-200 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-blue-900 [&_h1]:mb-4 [&_tr:nth-child(even)_td]:bg-blue-50 [&_.meta-ok_td:first-child]:border-l-4 [&_.meta-ok_td:first-child]:border-l-green-500 [&_.meta-nok_td:first-child]:border-l-4 [&_.meta-nok_td:first-child]:border-l-orange-500 [&_.footer-email]:mt-6 [&_.footer-email]:pt-4 [&_.footer-email]:border-t [&_.footer-email]:border-gray-200 [&_.footer-email]:text-xs [&_.footer-email]:text-gray-500"
									dangerouslySetInnerHTML={{ __html: sanitizeHtml(fcHTML) }}
								/>
							</div>
						)}
					</div>
				</div>
			)}

			{/* -- ABA INICIO -- */}
			{aba === "inicio" && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* Configuracoes */}
					<div className="space-y-4">
						<div className="bg-white border border-gray-200 rounded-xl p-5">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
								Configuracoes do Mes
							</p>
							<div className="grid grid-cols-2 gap-3 mb-3">
								<div>
									<label
										htmlFor={inMesInputId}
										className="block text-xs text-gray-500 mb-1"
									>
										Mes de Referencia
									</label>
									<select
										id={inMesInputId}
										value={inMes}
										onChange={(e) => setInMes(e.target.value)}
										className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
									>
										{MESES.map((m) => (
											<option key={m}>{m}</option>
										))}
									</select>
								</div>
								<div>
									<label
										htmlFor={inAnoInputId}
										className="block text-xs text-gray-500 mb-1"
									>
										Ano
									</label>
									<input
										id={inAnoInputId}
										type="number"
										value={inAno}
										onChange={(e) => setInAno(e.target.value)}
										className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
									/>
								</div>
							</div>
							<div className="mb-3">
								<label
									htmlFor={inCancelInputId}
									className="block text-xs text-gray-500 mb-1"
								>
									Total de cancelamentos no mes anterior
								</label>
								<input
									id={inCancelInputId}
									type="number"
									value={inCancel}
									onChange={(e) => setInCancel(e.target.value)}
									placeholder="Ex: 950"
									className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
								/>
								<p className="text-xs text-gray-400 mt-1">
									💡 {inGoalDisplay}% desse valor sera a meta do mes
								</p>
							</div>
							<div className="mb-3">
								<label
									htmlFor={inDiasUInputId}
									className="block text-xs text-gray-500 mb-1"
								>
									Dias uteis no mes (sem sab/dom)
								</label>
								<input
									id={inDiasUInputId}
									type="number"
									value={inDiasU}
									onChange={(e) => setInDiasU(e.target.value)}
									placeholder="Ex: 22"
									className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
								/>
							</div>
							<div>
								<label
									htmlFor={inDiasCInputId}
									className="block text-xs text-gray-500 mb-1"
								>
									Dias corridos no mes (com sab/dom)
								</label>
								<input
									id={inDiasCInputId}
									type="number"
									value={inDiasC}
									onChange={(e) => setInDiasC(e.target.value)}
									placeholder="Ex: 31"
									className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
								/>
							</div>
						</div>

						{/* Regionais inicio */}
						<div className="bg-white border border-gray-200 rounded-xl p-5">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
								Cancelamentos por Regional
							</p>
							<div className="space-y-2 mb-3">
								{inRegs.map((r, i) => (
									<div
										key={i}
										className="grid grid-cols-[minmax(0,1fr)_90px_80px_28px] items-center gap-2"
									>
										<span className="text-sm font-semibold text-gray-700 truncate">
											{r.nome}
										</span>
										<input
											type="number"
											min="0"
											value={r.cancelamentos || ""}
											placeholder="Canc."
											onChange={(e) => {
												const updated = [...inRegs];
												updated[i] = {
													...updated[i],
													cancelamentos: Number.parseInt(e.target.value) || 0,
												};
												setInRegs(updated);
											}}
											className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
										/>
										<input
											type="number"
											min="0"
											value={r.meta || ""}
											placeholder="Meta"
											onChange={(e) => {
												const updated = [...inRegs];
												updated[i] = {
													...updated[i],
													meta: Number.parseInt(e.target.value) || 0,
												};
												setInRegs(updated);
											}}
											className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
										/>
										<button
											type="button"
											onClick={() =>
												setInRegs((p) => p.filter((_, j) => j !== i))
											}
											className="text-gray-400 hover:text-red-500 transition-colors"
										>
											<Trash2 size={14} />
										</button>
									</div>
								))}
							</div>
							<div className="flex gap-2">
								<input
									type="text"
									value={inNovaReg}
									onChange={(e) => setInNovaReg(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && inAddRegional()}
									placeholder="Nome da regional..."
									className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
								/>
								<button
									type="button"
									onClick={inAddRegional}
									className="flex items-center gap-1 px-3 py-2 bg-blue-800 text-white rounded-lg text-sm font-semibold hover:bg-blue-900"
								>
									<Plus size={14} /> Regional
								</button>
							</div>
							<p className="text-xs text-gray-400 mt-2">
								Use a meta 110 como referencia ou ajuste conforme a regional.
							</p>
						</div>

						{/* KPIs calculados */}
						<div className="bg-white border border-gray-200 rounded-xl p-5">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
								Metas Calculadas
							</p>
							<div className="grid grid-cols-2 gap-3 mb-3">
								<div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
									<div className="text-3xl font-bold text-yellow-600">
										{inMeta > 0 ? inMeta : "—"}
									</div>
									<div className="text-xs text-gray-400 uppercase mt-1">
										Meta do Mes ({inGoalDisplay}%)
									</div>
								</div>
								<div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
									<div className="text-3xl font-bold text-blue-700">
										{inMedU}
									</div>
									<div className="text-xs text-gray-400 uppercase mt-1">
										Media/dia (uteis)
									</div>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
									<div className="text-3xl font-bold text-green-700">
										{inMedC}
									</div>
									<div className="text-xs text-gray-400 uppercase mt-1">
										Media/dia (corridos)
									</div>
								</div>
								<div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
									<div className="text-3xl font-bold text-purple-600">
										{inCancelNum > 0 ? inCancelNum : "—"}
									</div>
									<div className="text-xs text-gray-400 uppercase mt-1">
										Total Cancelamentos
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Preview inicio */}
					<div className="bg-white border border-gray-200 rounded-xl p-5">
						<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
							Pre-visualizacao
						</p>
						<button
							type="button"
							onClick={inGerar}
							className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors mb-4"
						>
							⚡ Gerar E-mail
						</button>
						{inHTML && (
							<div className="relative">
								<button
									type="button"
									onClick={inCopiarFn}
									className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600"
								>
									{inCopied ? (
										<>
											<Check size={12} /> Copiado!
										</>
									) : (
										<>
											<Copy size={12} /> Copiar
										</>
									)}
								</button>
								<div
									id="in-preview-content"
									style={{
										fontFamily: "Arial,sans-serif",
										color: "#1a1a1a",
										lineHeight: 1.7,
										fontSize: 14,
									}}
									className="border border-gray-200 rounded-xl p-6 bg-gray-50 overflow-auto max-h-[600px] [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_th]:bg-blue-900 [&_th]:text-white [&_th]:p-3 [&_th]:text-left [&_th]:text-xs [&_td]:p-3 [&_td]:border [&_td]:border-gray-200 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-blue-900 [&_h1]:mb-4 [&_h2]:font-bold [&_h2]:text-blue-900 [&_tr:nth-child(even)_td]:bg-blue-50 [&_.footer-email]:mt-6 [&_.footer-email]:pt-4 [&_.footer-email]:border-t [&_.footer-email]:border-gray-200 [&_.footer-email]:text-xs [&_.footer-email]:text-gray-500"
									dangerouslySetInnerHTML={{ __html: sanitizeHtml(inHTML) }}
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default TabEmailFechamento;
