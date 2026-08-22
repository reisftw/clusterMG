import { formatarDataGeracao, imprimirHtml } from "../../../utils/impressao";
import { resolveVpsDate } from "../../../services/vpsDate";

export function gerarPDFMapa(ordens, ultimaAtualizacao) {
  const formatData = (meta) => {
    if (!meta?.data) return "Não informado";
    const d = resolveVpsDate(meta);
    if (!d) return "Nao informado";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const dataGeracao = formatarDataGeracao();

  const total = ordens.length;
  const pendente = ordens.filter((o) => o.status === "Pendente").length;
  const aguardando = ordens.filter((o) => o.status === "Aguardando Agendamento").length;
  const totalRegional = ordens.filter((o) => !o.agente).length;
  const totalAgente = ordens.filter((o) => o.agente).length;

  const mapaRegionais = {};
  ordens
    .filter((o) => !o.agente)
    .forEach((os) => {
      const reg = os.regional || "Sem Regional";
      if (!mapaRegionais[reg]) mapaRegionais[reg] = {};
      const cidade = os.cidade || "Desconhecida";
      if (!mapaRegionais[reg][cidade]) {
        mapaRegionais[reg][cidade] = { pendente: {}, aguardando: {} };
      }
      const sk = os.status === "Pendente" ? "pendente" : "aguardando";
      mapaRegionais[reg][cidade][sk][os.tipo] =
        (mapaRegionais[reg][cidade][sk][os.tipo] || 0) + 1;
    });

  const mapaAgentes = {};
  ordens
    .filter((o) => o.agente)
    .forEach((os) => {
      const cidade = os.cidade || "Desconhecida";
      if (!mapaAgentes[cidade]) {
        mapaAgentes[cidade] = {
          pendente: {},
          aguardando: {},
          regional: os.regional || "",
        };
      }
      const sk = os.status === "Pendente" ? "pendente" : "aguardando";
      mapaAgentes[cidade][sk][os.tipo] = (mapaAgentes[cidade][sk][os.tipo] || 0) + 1;
    });

  const totalCidade = (d) =>
    Object.values(d.pendente || {}).reduce((a, b) => a + b, 0) +
    Object.values(d.aguardando || {}).reduce((a, b) => a + b, 0);

  let regionaisHtml = "";
  Object.entries(mapaRegionais)
    .sort((a, b) => {
      const tA = Object.values(a[1]).reduce((s, d) => s + totalCidade(d), 0);
      const tB = Object.values(b[1]).reduce((s, d) => s + totalCidade(d), 0);
      return tB - tA;
    })
    .forEach(([regional, cidades]) => {
      const totalReg = Object.values(cidades).reduce((s, d) => s + totalCidade(d), 0);
      let cidadesHtml = "";
      Object.entries(cidades)
        .sort((a, b) => totalCidade(b[1]) - totalCidade(a[1]))
        .forEach(([cidade, data]) => {
          const tot = totalCidade(data);
          const badges = [
            ...Object.entries(data.pendente || {}).map(
              ([tipo, qtd]) =>
                `<span style="background:#f3e8ff;color:#7e22ce;border:1px solid #d8b4fe;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;margin-right:4px">${tipo}: ${qtd}</span>`,
            ),
            ...Object.entries(data.aguardando || {}).map(
              ([tipo, qtd]) =>
                `<span style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;margin-right:4px">${tipo}: ${qtd}</span>`,
            ),
          ].join("");

          cidadesHtml += `
            <div style="border-bottom:1px solid #f1f5f9;padding:8px 16px;display:flex;flex-direction:column;gap:4px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;font-weight:600;color:#374151">${cidade}</span>
                <span style="font-size:12px;font-weight:700;color:#111827">${tot} O.S</span>
              </div>
              <div>${badges}</div>
            </div>`;
        });

      regionaisHtml += `
        <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:12px">
          <div style="background:#eff6ff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #dbeafe">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13px;font-weight:700;color:#1e40af">Regional ${regional}</span>
              <span style="background:#dbeafe;color:#1d4ed8;border-radius:20px;padding:1px 9px;font-size:10px;font-weight:600">${Object.keys(cidades).length} cidades</span>
            </div>
            <span style="font-size:14px;font-weight:800;color:#111827">${totalReg} O.S</span>
          </div>
          ${cidadesHtml}
        </div>`;
    });

  let agentesHtml = "";
  Object.entries(mapaAgentes)
    .sort((a, b) => totalCidade(b[1]) - totalCidade(a[1]))
    .forEach(([cidade, data]) => {
      const tot = totalCidade(data);
      const badges = [
        ...Object.entries(data.pendente || {}).map(
          ([tipo, qtd]) =>
            `<span style="background:#f3e8ff;color:#7e22ce;border:1px solid #d8b4fe;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;margin-right:4px">${tipo}: ${qtd}</span>`,
        ),
        ...Object.entries(data.aguardando || {}).map(
          ([tipo, qtd]) =>
            `<span style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;margin-right:4px">${tipo}: ${qtd}</span>`,
        ),
      ].join("");

      agentesHtml += `
        <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:10px">
          <div style="background:#fffbeb;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #fde68a">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13px;font-weight:700;color:#92400e">Agente ${cidade}</span>
              ${data.regional ? `<span style="background:#f3f4f6;color:#6b7280;border-radius:20px;padding:1px 9px;font-size:10px">${data.regional}</span>` : ""}
            </div>
            <span style="font-size:14px;font-weight:800;color:#d97706">${tot} O.S</span>
          </div>
          <div style="padding:10px 16px">${badges}</div>
        </div>`;
    });

  const conteudo = `
<div style="font-family:Arial,sans-serif;color:#111827;font-size:12px;padding:20px;background:#fff">

  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:20px 24px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="color:rgba(255,255,255,.6);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Sempre Internet · Operações</div>
      <div style="color:#fff;font-size:22px;font-weight:800">Mapa de Ordens em Aberto</div>
      <div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:2px">Última atualização: ${formatData(ultimaAtualizacao)}</div>
    </div>
    <div style="text-align:right;color:rgba(255,255,255,.5);font-size:10px;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
      <div style="background:#fff;border-radius:8px;padding:5px 7px">
        <img src="/cluster-mg.png" alt="Cluster MG" style="display:block;width:92px;height:auto;max-height:46px;object-fit:contain" />
      </div>
      <div>Gerado em ${dataGeracao}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px">
    <div style="border:1px solid #e5e7eb;border-top:3px solid #3b82f6;border-radius:10px;padding:12px">
      <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total em Aberto</div>
      <div style="font-size:26px;font-weight:800;color:#3b82f6">${total}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:3px solid #a855f7;border-radius:10px;padding:12px">
      <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Pendente</div>
      <div style="font-size:26px;font-weight:800;color:#a855f7">${pendente}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:3px solid #f97316;border-radius:10px;padding:12px">
      <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Ag. Agendamento</div>
      <div style="font-size:26px;font-weight:800;color:#f97316">${aguardando}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:3px solid #10b981;border-radius:10px;padding:12px">
      <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Regionais</div>
      <div style="font-size:26px;font-weight:800;color:#10b981">${totalRegional}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:3px solid #f59e0b;border-radius:10px;padding:12px">
      <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Ag. Autorizados</div>
      <div style="font-size:26px;font-weight:800;color:#f59e0b">${totalAgente}</div>
    </div>
  </div>

  <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Regionais</div>
  ${regionaisHtml}

  <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin:16px 0 10px">Agentes Autorizados</div>
  ${agentesHtml}

  <div style="background:#f9fafb;border-radius:8px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:12px;border:1px solid #e5e7eb">
    <span style="font-size:11px;font-weight:700;color:#374151">Sempre Internet - Gestão de Retiradas</span>
    <span style="font-size:10px;color:#9ca3af">${dataGeracao}</span>
  </div>
</div>`;

  imprimirHtml(conteudo, {
    areaId: "mapa-print-area",
    styleId: "mapa-print-style",
  });
}

