import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Busca o nome do líder por ID
 */
const buscarNomeLider = (liderId, colaboradores) => {
  if (!liderId) return '—';
  const lider = colaboradores.find(c => c.id === liderId);
  return lider?.nome ?? '—';
};

/**
 * Formata data para DD/MM/YYYY
 */
const formatarData = (data) => {
  if (!data) return '—';
  try {
    const d = new Date(data + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
  } catch {
    return data;
  }
};

/**
 * Exportar XLSX com estilo
 */
export const exportarXLSX = (colaboradores, colaboradoresCompleto, nomeArquivo = 'Colaboradores.xlsx') => {
  // Se o segundo argumento for string (nome do arquivo), é compatível com versão anterior
  if (typeof colaboradoresCompleto === 'string') {
    nomeArquivo = colaboradoresCompleto;
    colaboradoresCompleto = colaboradores;
  }

  const dados = colaboradores.map(c => ({
    'Nome': c.nome || '—',
    'Matrícula': c.matricula || '—',
    'Cargo': c.cargo || '—',
    'Regional': c.regional || '—',
    'Turno': c.turno ? (c.turno === '12x36' ? '12x36' : 'Seg-Sex') : '—',
    'Telefone': c.telefone || '—',
    'Status': c.status || 'inativo',
    'Líder Imediato': buscarNomeLider(c.lider_responsavel, colaboradoresCompleto),
    'Aniversário': formatarData(c.data_aniversario),
    'Contratação': formatarData(c.data_contratacao),
    'Demissão': formatarData(c.data_demissao),
  }));

  const ws = XLSX.utils.json_to_sheet(dados);

  // Ajustar largura das colunas
  ws['!cols'] = [
    { wch: 20 }, // Nome
    { wch: 12 }, // Matrícula
    { wch: 18 }, // Cargo
    { wch: 15 }, // Regional
    { wch: 12 }, // Turno
    { wch: 16 }, // Telefone
    { wch: 12 }, // Status
    { wch: 18 }, // Líder
    { wch: 13 }, // Aniversário
    { wch: 13 }, // Contratação
    { wch: 13 }, // Demissão
  ];

  // Estilo header (azul com branco)
  const headerStyle = {
    fill: { fgColor: { rgb: 'FF3B82F6' } },
    font: { bold: true, color: { rgb: 'FFFFFFFF' }, size: 11 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'FF1E40AF' } },
      bottom: { style: 'thin', color: { rgb: 'FF1E40AF' } },
      left: { style: 'thin', color: { rgb: 'FF1E40AF' } },
      right: { style: 'thin', color: { rgb: 'FF1E40AF' } },
    }
  };

  // Aplicar estilo ao header
  for (let i = 0; i < Object.keys(dados[0] || {}).length; i++) {
    const cellRef = XLSX.utils.encode_col(i) + '1';
    if (ws[cellRef]) {
      ws[cellRef].fill = headerStyle.fill;
      ws[cellRef].font = headerStyle.font;
      ws[cellRef].alignment = headerStyle.alignment;
      ws[cellRef].border = headerStyle.border;
    }
  }

  // Estilo para linhas alternadas
  for (let i = 2; i <= dados.length + 1; i++) {
    for (let j = 0; j < Object.keys(dados[0] || {}).length; j++) {
      const cellRef = XLSX.utils.encode_col(j) + i;
      if (ws[cellRef]) {
        ws[cellRef].fill = i % 2 === 0 ? { fgColor: { rgb: 'FFF3F4F6' } } : { fgColor: { rgb: 'FFFFFFFF' } };
        ws[cellRef].alignment = { horizontal: 'left', vertical: 'center' };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
  XLSX.writeFile(wb, nomeArquivo);
};

/**
 * Exportar PDF com tabela bonita (jsPDF + autoTable)
 */
export const exportarPDF = (colaboradores, nomeArquivo = 'Colaboradores.pdf', colaboradoresCompleto = []) => {
  if (!colaboradoresCompleto || colaboradoresCompleto.length === 0) {
    colaboradoresCompleto = colaboradores;
  }

  const dataAtual = new Date();
  const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
  const horaFormatada = dataAtual.toLocaleTimeString('pt-BR');

  // Preparar dados para tabela
  const tableData = colaboradores.map(c => [
    c.nome || '—',
    c.matricula || '—',
    c.cargo || '—',
    c.regional || '—',
    c.turno === '12x36' ? '12x36' : c.turno === 'seg_sex' ? 'Seg-Sex' : '—',
    c.telefone || '—',
    buscarNomeLider(c.lider_responsavel, colaboradoresCompleto),
    c.status === 'ativo' ? 'Ativo' : c.status === 'demitido' ? 'Demitido' : 'Inativo',
  ]);

  // Criar PDF em landscape
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Cores (laranja, azul, branco)
  const corAzul = [59, 130, 246]; // #3B82F6
  const corLaranja = [255, 149, 0]; // #FF9500
  const corBranco = [255, 255, 255];
  const corCinza = [243, 244, 246]; // #F3F4F6

  // Adicionar header
  doc.setFillColor(...corAzul);
  doc.rect(0, 0, 297, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('📋 Relatório de Colaboradores FS', 15, 12);
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Gerado em: ${dataFormatada} às ${horaFormatada}`, 15, 18);

  // Adicionar resumo
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(`Total de Colaboradores: ${colaboradores.length}`, 15, 32);
  doc.text(`Ativos: ${colaboradores.filter(c => c.status === 'ativo').length}`, 90, 32);
  doc.text(`Inativos: ${colaboradores.filter(c => c.status === 'inativo').length}`, 150, 32);
  doc.text(`Demitidos: ${colaboradores.filter(c => c.status === 'demitido').length}`, 210, 32);

  // Adicionar tabela
  doc.autoTable({
    head: [[
      'Nome',
      'Matrícula',
      'Cargo',
      'Regional',
      'Turno',
      'Telefone',
      'Líder',
      'Status'
    ]],
    body: tableData,
    startY: 38,
    margin: { left: 10, right: 10, top: 10, bottom: 15 },
    headStyles: {
      fillColor: corLaranja,
      textColor: corBranco,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.5,
      lineColor: [200, 100, 0],
    },
    bodyStyles: {
      textColor: [60, 60, 60],
      fontSize: 8,
      lineWidth: 0.3,
      lineColor: [220, 220, 220],
    },
    alternateRowStyles: {
      fillColor: corCinza,
    },
    columnStyles: {
      0: { halign: 'left', minCellWidth: 30 },
      1: { halign: 'center', minCellWidth: 15 },
      2: { halign: 'left', minCellWidth: 20 },
      3: { halign: 'center', minCellWidth: 15 },
      4: { halign: 'center', minCellWidth: 12 },
      5: { halign: 'center', minCellWidth: 18 },
      6: { halign: 'left', minCellWidth: 25 },
      7: { halign: 'center', minCellWidth: 15 },
    },
    didDrawPage: function(data) {
      // Footer
      const pageCount = doc.internal.pages.length - 1;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Página ${data.pageNumber}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
  });

  // Salvar
  doc.save(nomeArquivo);
};

/**
 * Copiar para WhatsApp com todas as informações
 */
export const copiarParaWhatsApp = (colaborador, colaboradores = []) => {
  const status = 
    colaborador.status === 'ativo'    ? '✅ Ativo'   :
    colaborador.status === 'demitido' ? '❌ Demitido' :
    '⚠️ Inativo';

  const nomeLider = buscarNomeLider(colaborador.lider_responsavel, colaboradores);

  const texto = `👷 *${colaborador.nome}*
📋 *${colaborador.cargo || '—'}* | Regional *${colaborador.regional || '—'}*
📱 *${colaborador.telefone || '—'}*
🗓️ *Contratado em:* ${formatarData(colaborador.data_contratacao)}
🎂 *Aniversário:* ${formatarData(colaborador.data_aniversario)}
📊 *Matrícula:* ${colaborador.matricula || '—'}
⏰ *Turno:* ${colaborador.turno === '12x36' ? '12x36' : colaborador.turno === 'seg_sex' ? 'Seg-Sex' : '—'}
👔 *Líder:* ${nomeLider}
${status}
${colaborador.status === 'demitido' ? `
📅 *Data de demissão:* ${formatarData(colaborador.data_demissao)}
📝 *Motivo:* ${colaborador.motivo_demissao || '—'}
` : ''}`;

  navigator.clipboard.writeText(texto);
  return true;
};
