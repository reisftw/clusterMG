export function gerarPDFCidade(cidadeNome, month, allData) {
  const d = allData[month];
  if (!d) return;
  const c = d.cidades.find(x => x.nome === cidadeNome);
  if (!c) return;

  const now = new Date();
  const dataGeracao = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} às ${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`;

  const pct = c.pct;
  const barW = Math.min(pct, 100);
  const barColor = pct > 100 ? '#7c3aed' : pct >= 80 ? '#00875A' : pct >= 50 ? '#FF8B00' : '#DE350B';
  const sk = pct > 100 ? 'over' : pct >= 80 ? 'atingido' : pct >= 50 ? 'andamento' : 'abaixo';
  const statusMap = {
    over:     { cls: '#6B21A8', bg: '#F3E8FF', txt: 'Acima da Meta' },
    atingido: { cls: '#00875A', bg: '#E3FCEF', txt: 'Meta Atingida' },
    andamento:{ cls: '#7A5700', bg: '#FFF3CD', txt: 'Em Andamento' },
    abaixo:   { cls: '#DE350B', bg: '#FFEBE6', txt: 'Abaixo da Meta' },
  };
  const st = statusMap[sk];

  const faltaVal = parseFloat(c.falta.toFixed(1));
  const faltaDisplay = c.falta < 0 ? '+' + Math.abs(faltaVal) : faltaVal;

  let daysHtml = '';
  c.daily.forEach((val, i) => {
    const bg    = val > 0 ? '#E6EEFF' : '#F4F6FA';
    const color = val > 0 ? '#003087' : '#aaa';
    daysHtml += `
      <div style="border:1px solid #DDE3EE;border-radius:6px;padding:6px 4px;text-align:center;background:${bg}">
        <div style="font-size:9px;color:#6B7897;font-weight:600">Dia ${i+1}</div>
        <div style="font-size:18px;font-weight:700;color:${color}">${val > 0 ? val : '-'}</div>
      </div>`;
  });

  const faltaTxt = c.falta < 0
    ? `${Math.abs(faltaVal)} acima da meta`
    : c.falta === 0 ? 'Meta cumprida'
    : `${faltaVal} retiradas pendentes`;

  const conteudo = `
<div style="font-family:Arial,sans-serif;color:#1A2340;font-size:13px;background:#fff;padding:24px">

  <!-- CABEÇALHO -->
  <div style="background:linear-gradient(135deg,#1a0050 0%,#003087 55%,#0052CC 100%);padding:24px 28px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="color:rgba(255,255,255,.6);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">Sempre Internet · Agentes Autorizados</div>
      <div style="color:#fff;font-size:26px;font-weight:800;letter-spacing:1px;margin-bottom:3px">${c.nome}</div>
      <div style="color:rgba(255,255,255,.75);font-size:13px">${month} 2026 · Relatório Individual de Performance</div>
    </div>
    <div style="text-align:right">
      <div style="background:${st.bg};color:${st.cls};border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700">${st.txt}</div>
      <div style="color:rgba(255,255,255,.5);font-size:10px;margin-top:8px">Gerado em ${dataGeracao}</div>
    </div>
  </div>

  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid #003087">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Cancelamentos</div>
      <div style="font-size:32px;font-weight:800;color:#003087">${c.cancelamentos}</div>
    </div>
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid #FF6B00">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Meta 80%</div>
      <div style="font-size:32px;font-weight:800;color:#FF6B00">${Math.round(c.meta80)}</div>
    </div>
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid #00875A">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Realizado</div>
      <div style="font-size:32px;font-weight:800;color:#00875A">${c.realizado}</div>
    </div>
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid ${barColor}">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Falta / Sobra</div>
      <div style="font-size:32px;font-weight:800;color:${barColor}">${faltaDisplay}</div>
    </div>
  </div>

  <!-- PROGRESSO -->
  <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:18px;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#003087;margin-bottom:12px">📊 Progresso da Meta</div>
    <div style="background:#F4F6FA;border-radius:8px;overflow:hidden;height:18px;margin-bottom:7px">
      <div style="width:${barW}%;height:100%;background:${barColor};border-radius:8px"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#6B7897">
      <span>${c.daily.reduce((a,b) => a+b, 0).toLocaleString('pt-BR')} retiradas</span>
      <span style="font-size:18px;font-weight:800;color:#1A2340">${pct.toFixed(1)}% da meta</span>
      <span>Meta: ${Math.round(c.meta80)}</span>
    </div>
  </div>

  <!-- DIAS -->
  <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:18px;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#003087;margin-bottom:12px">📅 Retiradas por Dia</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(50px,1fr));gap:5px">
      ${daysHtml}
    </div>
    <div style="margin-top:10px;font-size:11px;color:#6B7897">
      Total acumulado no mês: <strong style="color:#003087">${c.daily.reduce((a,b) => a+b, 0).toLocaleString('pt-BR')}</strong> retiradas
    </div>
  </div>

  <!-- RODAPÉ -->
  <div style="background:#F0F3F8;border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:10px;color:#6B7897;font-weight:700;text-transform:uppercase;letter-spacing:1px">Situação atual</div>
      <div style="font-size:14px;font-weight:700;color:${barColor};margin-top:3px">${faltaTxt}</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#6B7897">
      <div style="font-weight:600">Sempre Internet</div>
      <div>Dashboard Agentes Autorizados</div>
      <div>${dataGeracao}</div>
    </div>
  </div>

</div>`;

  _printArea(conteudo);
}

export function gerarRelatorio3Meses(cidadeNome, mesAtual, allData) {
  const MONTH_ORDER = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const now = new Date();
  const dataGeracao = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} às ${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`;

  const mesIdx = MONTH_ORDER.indexOf(mesAtual);
  const meses3 = [];
  for (let i = 2; i >= 0; i--) {
    const idx = mesIdx - i;
    if (idx >= 0) meses3.push(MONTH_ORDER[idx]);
  }

  let blocosHtml = '';
  let mesesAbaixoCount = 0;
  let mesesComDados = 0;

  meses3.forEach(m => {
    const dadosMes = allData[m];
    if (!dadosMes) {
      blocosHtml += `
        <div style="border:1.5px solid #DDE3EE;border-radius:12px;padding:18px;margin-bottom:16px;opacity:.5">
          <div style="font-size:15px;font-weight:700;color:#003087;margin-bottom:8px">${m} 2026</div>
          <div style="font-size:13px;color:#6B7897">Sem dados disponíveis para este mês.</div>
        </div>`;
      return;
    }

    const cidadeM = dadosMes.cidades.find(x => x.nome === cidadeNome);
    if (!cidadeM) {
      blocosHtml += `
        <div style="border:1.5px solid #DDE3EE;border-radius:12px;padding:18px;margin-bottom:16px;opacity:.5">
          <div style="font-size:15px;font-weight:700;color:#003087;margin-bottom:8px">${m} 2026</div>
          <div style="font-size:13px;color:#6B7897">Cidade não encontrada nos dados deste mês.</div>
        </div>`;
      return;
    }

    mesesComDados++;
    const pct = cidadeM.pct;
    const atingiu = pct >= 80;
    if (!atingiu) mesesAbaixoCount++;

    const barColor = pct > 100 ? '#7c3aed' : pct >= 80 ? '#00875A' : pct >= 50 ? '#FF8B00' : '#DE350B';
    const barW = Math.min(pct, 100);
    const statusTxt = pct > 100 ? 'Acima da meta' : pct >= 80 ? 'Meta atingida' : pct >= 50 ? 'Em andamento' : 'Abaixo da meta';
    const statusBg  = pct > 100 ? '#F3E8FF' : pct >= 80 ? '#E3FCEF' : pct >= 50 ? '#FFF3CD' : '#FFEBE6';

    const faltaVal = parseFloat(cidadeM.falta.toFixed(1));
    const faltaTxt = cidadeM.falta < 0
      ? `${Math.abs(faltaVal)} acima`
      : cidadeM.falta === 0 ? 'Meta cumprida'
      : `${faltaVal} pendentes`;

    blocosHtml += `
      <div style="border:1.5px solid ${atingiu ? '#00875A' : '#DE350B'};border-radius:8px;padding:10px 14px;margin-bottom:8px;background:${atingiu ? '#F0FFF7' : '#FFF8F7'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#003087">${m} 2026</div>
          <div style="background:${statusBg};color:${barColor};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:700">${statusTxt}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:8px">
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid #003087">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Cancelamentos</div>
            <div style="font-size:19px;font-weight:800;color:#003087;line-height:1">${cidadeM.cancelamentos}</div>
          </div>
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid #FF6B00">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Meta 80%</div>
            <div style="font-size:19px;font-weight:800;color:#FF6B00;line-height:1">${Math.round(cidadeM.meta80)}</div>
          </div>
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid #00875A">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Realizado</div>
            <div style="font-size:19px;font-weight:800;color:#00875A;line-height:1">${cidadeM.realizado}</div>
          </div>
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid ${barColor}">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Falta/Sobra</div>
            <div style="font-size:19px;font-weight:800;color:${barColor};line-height:1">${faltaTxt}</div>
          </div>
        </div>
        <div style="background:#F4F6FA;border-radius:6px;overflow:hidden;height:10px;margin-bottom:4px">
          <div style="width:${barW}%;height:100%;background:${barColor};border-radius:6px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#6B7897">
          <span>${cidadeM.realizado} realizados</span>
          <span style="font-weight:700;color:#1A2340;font-size:12px">${pct.toFixed(1)}%</span>
          <span>Meta ${Math.round(cidadeM.meta80)}</span>
        </div>
      </div>`;
  });

  const alertaHtml = mesesComDados > 0 ? `
    <div style="border-radius:8px;padding:9px 14px;margin-bottom:10px;background:${mesesAbaixoCount === 0 ? '#E3FCEF' : mesesAbaixoCount >= 2 ? '#FFEBE6' : '#FFF3CD'};border:1.5px solid ${mesesAbaixoCount === 0 ? '#00875A' : mesesAbaixoCount >= 2 ? '#DE350B' : '#FF8B00'}">
      <div style="font-size:12px;font-weight:700;color:${mesesAbaixoCount === 0 ? '#00875A' : mesesAbaixoCount >= 2 ? '#DE350B' : '#7A5700'};margin-bottom:2px">
        ${mesesAbaixoCount === 0
          ? `Excelente! Atingiu a meta nos ${mesesComDados} meses analisados.`
          : `Ficou abaixo da meta em ${mesesAbaixoCount} de ${mesesComDados} ${mesesComDados === 1 ? 'mês' : 'meses'} analisados.`}
      </div>
      <div style="font-size:11px;color:${mesesAbaixoCount === 0 ? '#00875A' : mesesAbaixoCount >= 2 ? '#DE350B' : '#7A5700'}">
        ${mesesAbaixoCount >= 2
          ? 'Atenção: desempenho recorrentemente abaixo do esperado. Ação necessária.'
          : mesesAbaixoCount === 1
          ? 'Desempenho irregular. Monitorar evolução no próximo período.'
          : 'Continue assim! Performance consistente acima dos 80%.'}
      </div>
    </div>` : '';

  const conteudo = `
<div style="font-family:Arial,sans-serif;color:#1A2340;font-size:12px;background:#fff;padding:16px">

  <!-- CABEÇALHO -->
  <div style="background:linear-gradient(135deg,#1a0050 0%,#003087 55%,#0052CC 100%);padding:16px 20px;border-radius:10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="color:rgba(255,255,255,.6);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Sempre Internet · Agentes Autorizados</div>
      <div style="color:#fff;font-size:21px;font-weight:800;letter-spacing:1px;margin-bottom:2px">${cidadeNome}</div>
      <div style="color:rgba(255,255,255,.75);font-size:11px">Relatório de Performance · Últimos 3 Meses</div>
    </div>
    <div style="text-align:right">
      <div style="background:rgba(255,255,255,.15);color:#fff;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700">Trimestral</div>
      <div style="color:rgba(255,255,255,.5);font-size:9px;margin-top:6px">Gerado em ${dataGeracao}</div>
    </div>
  </div>

  ${alertaHtml}
  ${blocosHtml}

  <!-- RODAPÉ -->
  <div style="background:#F0F3F8;border-radius:8px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:4px">
    <div>
      <div style="font-size:9px;color:#6B7897;font-weight:700;text-transform:uppercase;letter-spacing:1px">Meses abaixo da meta</div>
      <div style="font-size:17px;font-weight:800;color:${mesesAbaixoCount === 0 ? '#00875A' : '#DE350B'};margin-top:1px">${mesesAbaixoCount} de ${mesesComDados} ${mesesComDados === 1 ? 'mês' : 'meses'}</div>
    </div>
    <div style="text-align:right;font-size:9px;color:#6B7897">
      <div style="font-weight:600">Sempre Internet</div>
      <div>Dashboard Agentes Autorizados</div>
      <div>${dataGeracao}</div>
    </div>
  </div>

</div>`;

  _printArea(conteudo);
}

function _printArea(conteudo) {
  const existing = document.getElementById('pdf-print-area');
  if (existing) existing.remove();

  const printArea = document.createElement('div');
  printArea.id = 'pdf-print-area';
  printArea.innerHTML = conteudo;
  printArea.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: #fff;
    z-index: 99999;
    overflow: auto;
  `;

  document.body.appendChild(printArea);

  const style = document.createElement('style');
  style.id = 'pdf-print-style';
  style.innerHTML = `
    @media print {
      body > *:not(#pdf-print-area) { display: none !important; }
      #pdf-print-area { display: block !important; position: static !important; }
    }
  `;
  document.head.appendChild(style);

  window.print();

  setTimeout(() => {
    printArea.remove();
    style.remove();
  }, 1000);
}