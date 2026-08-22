function text(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asDate(value) {
  const date =
    typeof value?.toDate === "function" ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value) {
  const date = asDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

function formatTime(value) {
  const date = asDate(value);
  if (!date) return "-";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatDateTime(value) {
  const date = asDate(value);
  if (!date) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function getCompletionDate(retirada) {
  return (
    retirada?.concluidoEm ||
    retirada?.tratativaAtualizadaEm ||
    retirada?.updatedAt ||
    retirada?.createdAt ||
    null
  );
}

function getDeliveryMode(retirada) {
  return retirada?.metodo === "ponto" ? "Entrega em unidade Sempre" : "Coleta no endereco";
}

function getLocation(retirada) {
  if (retirada?.metodo === "ponto") {
    return retirada?.lojaSelecionadaEndereco || retirada?.lojaSelecionadaNome || "-";
  }

  return [
    retirada?.endereco,
    retirada?.numero,
    retirada?.bairro,
    retirada?.cidade,
  ]
    .filter(Boolean)
    .join(", ");
}

function getAssetUrl(path) {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function buildRetiradaReceiptHtml(retirada) {
  const completionDate = getCompletionDate(retirada);
  const emittedAt = new Date();

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Comprovante de Entrega - ${escapeHtml(retirada?.protocolo)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #0f172a;
        --muted: #64748b;
        --line: #dbe3ee;
        --line-strong: #cbd5e1;
        --brand: #0f5bd8;
        --brand-soft: #eff6ff;
        --success: #0f766e;
        --success-soft: #ecfdf5;
        --surface: #f8fafc;
        --paper: #ffffff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Inter, Roboto, "Segoe UI", Arial, sans-serif;
        background: #f3f6fb;
        color: var(--ink);
      }

      .page {
        padding: 28px 20px 40px;
      }

      .shell {
        max-width: 860px;
        margin: 0 auto;
      }

      .toolbar {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-bottom: 16px;
      }

      .toolbar button {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 11px 18px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        background: var(--paper);
      }

      .toolbar .print {
        border-color: var(--brand);
        background: var(--brand);
        color: #ffffff;
      }

      .toolbar .close {
        color: var(--ink);
      }

      .document {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--paper);
        box-shadow: 0 18px 44px rgba(15, 23, 42, 0.06);
        page-break-inside: avoid;
      }

      .header {
        padding: 28px 32px 20px;
        border-bottom: 1px solid var(--line);
      }

      .header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .logo {
        height: 34px;
        width: auto;
      }

      .meta {
        text-align: right;
        font-size: 12px;
        line-height: 1.6;
        color: var(--muted);
      }

      .kicker {
        margin: 20px 0 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--brand);
      }

      h1 {
        margin: 10px 0 0;
        font-size: 30px;
        line-height: 1.08;
        font-weight: 700;
      }

      .subtitle {
        margin: 12px 0 0;
        max-width: 660px;
        font-size: 15px;
        line-height: 1.65;
        color: var(--muted);
      }

      .content {
        padding: 0 32px 28px;
      }

      .summary {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 150px;
        gap: 18px;
        align-items: center;
        padding: 22px 0;
        border-bottom: 1px solid var(--line);
      }

      .protocol-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
      }

      .protocol-number {
        margin-top: 8px;
        font-size: 30px;
        line-height: 1.08;
        font-weight: 700;
      }

      .summary-copy {
        margin-top: 12px;
        max-width: 520px;
        font-size: 14px;
        line-height: 1.65;
        color: var(--muted);
      }

      .summary-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 13px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }

      .chip.status {
        color: var(--success);
        background: var(--success-soft);
      }

      .chip.meta {
        color: var(--ink);
        background: var(--surface);
        border: 1px solid var(--line);
      }

      .stamp {
        justify-self: end;
      }

      .stamp img {
        width: 100%;
        max-width: 150px;
        height: auto;
      }

      .details {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0 24px;
        padding: 20px 0;
        border-bottom: 1px solid var(--line);
      }

      .detail {
        padding: 12px 0;
        border-top: 1px solid var(--line);
      }

      .detail:nth-child(-n + 2) {
        border-top: 0;
        padding-top: 0;
      }

      .detail-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
      }

      .detail-value {
        margin-top: 6px;
        font-size: 14px;
        line-height: 1.6;
        font-weight: 600;
      }

      @media print {
        @page {
          size: A4;
          margin: 12mm;
        }

        body {
          background: #ffffff;
        }

        .page {
          padding: 0;
        }

        .toolbar {
          display: none;
        }

        .document {
          box-shadow: none;
          border-radius: 0;
          border: 0;
        }
      }

      @media (max-width: 720px) {
        .header,
        .content {
          padding: 24px;
        }

        .summary,
        .details {
          grid-template-columns: 1fr;
        }

        .header-top {
          flex-direction: column;
          align-items: flex-start;
        }

        .meta {
          text-align: left;
        }

        .stamp {
          justify-self: start;
        }

        .detail:nth-child(2) {
          border-top: 1px solid var(--line);
          padding-top: 12px;
        }

        h1 {
          font-size: 28px;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="shell">
        <div class="toolbar">
          <button class="close" type="button" onclick="window.close()">Fechar</button>
          <button class="print" type="button" onclick="window.print()">Imprimir ou salvar em PDF</button>
        </div>

        <main class="document">
          <header class="header">
            <div class="header-top">
              <img class="logo" src="${getAssetUrl("/cluster-mg.png")}" alt="Sempre Internet" />
              <div class="meta">
                Documento institucional
                <br />
                Emitido em ${escapeHtml(formatDateTime(emittedAt))}
              </div>
            </div>
            <p class="kicker">Comprovante Digital de Entrega</p>
            <h1>Confirmacao oficial de devolucao de equipamento</h1>
            <p class="subtitle">
              Documento digital emitido automaticamente pela Sempre Internet para formalizacao e validacao da devolucao realizada.
            </p>
          </header>

          <div class="content">
            <section class="summary">
              <div>
                <div class="protocol-label">Protocolo de atendimento</div>
                <div class="protocol-number">${escapeHtml(retirada?.protocolo || "-")}</div>
                <div class="summary-copy">
                  A entrega do equipamento foi concluida com sucesso e registrada de forma oficial em nossos sistemas para fins operacionais e de validacao.
                </div>
                <div class="summary-meta">
                  <span class="chip status">Devolucao concluida</span>
                  <span class="chip meta">${escapeHtml(formatDate(completionDate))} as ${escapeHtml(formatTime(completionDate))}</span>
                </div>
              </div>
              <div class="stamp">
                <img src="${getAssetUrl("/retorninho-estela.webp")}" alt="Retorninho Sempre" />
              </div>
            </section>

            <section class="details">
              <div class="detail">
                <div class="detail-label">Cliente</div>
                <div class="detail-value">${escapeHtml(retirada?.nome || "Cliente Sempre")}</div>
              </div>
              <div class="detail">
                <div class="detail-label">Documento</div>
                <div class="detail-value">${escapeHtml(retirada?.cpfCnpj || "-")}</div>
              </div>
              <div class="detail">
                <div class="detail-label">Modalidade</div>
                <div class="detail-value">${escapeHtml(getDeliveryMode(retirada))}</div>
              </div>
              <div class="detail">
                <div class="detail-label">Equipamento</div>
                <div class="detail-value">${escapeHtml(retirada?.equipamento || "-")}</div>
              </div>
              <div class="detail">
                <div class="detail-label">Local da entrega</div>
                <div class="detail-value">${escapeHtml(getLocation(retirada) || "-")}</div>
              </div>
              <div class="detail">
                <div class="detail-label">Responsavel pelo registro</div>
                <div class="detail-value">${escapeHtml(retirada?.responsavelNome || "Equipe Sempre Internet")}</div>
              </div>
              <div class="detail">
                <div class="detail-label">Data da conclusao</div>
                <div class="detail-value">${escapeHtml(formatDate(completionDate))}</div>
              </div>
              <div class="detail">
                <div class="detail-label">Hora da conclusao</div>
                <div class="detail-value">${escapeHtml(formatTime(completionDate))}</div>
              </div>
            </section>

          </div>
        </main>
      </div>
    </div>
  </body>
</html>`;
}

export function openRetiradaReceiptWindow(retirada) {
  if (typeof window === "undefined") return false;

  const html = buildRetiradaReceiptHtml(retirada);

  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);

    const receiptWindow = window.open(url, "_blank");
    if (receiptWindow) {
      receiptWindow.focus();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      return true;
    }

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    try {
      const receiptWindow = window.open("", "_blank");
      if (!receiptWindow) return false;
      receiptWindow.document.open();
      receiptWindow.document.write(html);
      receiptWindow.document.close();
      receiptWindow.focus();
      return true;
    } catch {
      return false;
    }
  }
}

