const isLiderOuSupervisor = (cargo = '') => {
  const r = cargo.toLowerCase();
  return (
    r.includes('lider_fs') ||
    r.includes('supervisor_fs') ||
    r.includes('coordenador_fs') ||
    r.includes('gerente_fs')
  );
};

const isBackOffice = (cargo = '') =>
  cargo.toLowerCase().includes('backoffice_fs');

/**
 * Verifica conflitos de folga para um conjunto de datas
 * @returns { conflito: bool, mensagem: string, conflitantes: array }
 */
export const verificarConflitoEscala = ({
  colaboradorId,
  regional,
  cargo,
  datas,           // array de strings 'YYYY-MM-DD'
  folgasExistentes,
  colaboradores,
}) => {
  const colabMap = {};
  colaboradores.forEach(c => { colabMap[c.id] = c; });

  const isCandidatoLider = isLiderOuSupervisor(cargo);
  const isCandidatoBO    = isBackOffice(cargo);

  // Se não é lider nem BO, sem regra de conflito
  if (!isCandidatoLider && !isCandidatoBO) {
    return { conflito: false, mensagem: '', conflitantes: [] };
  }

  const datasSet = new Set(datas);
  const conflitantes = [];

  for (const f of folgasExistentes) {
    if (f.colaborador_id === colaboradorId) continue;

    const outro = colabMap[f.colaborador_id];
    if (!outro || outro.regional !== regional) continue;
    if (!datasSet.has(f.data)) continue;

    const outroIsLider = isLiderOuSupervisor(outro.cargo);
    const outroIsBO    = isBackOffice(outro.cargo);

    if (isCandidatoLider && outroIsLider) {
      conflitantes.push({ colaborador: outro, data: f.data, tipo: 'lider' });
    }
    if (isCandidatoBO && outroIsBO) {
      conflitantes.push({ colaborador: outro, data: f.data, tipo: 'backoffice' });
    }
  }

  if (conflitantes.length === 0) return { conflito: false, mensagem: '', conflitantes: [] };

  // Agrupa por colaborador para mensagem limpa
  const porColab = {};
  conflitantes.forEach(c => {
    const nome = c.colaborador.nome;
    if (!porColab[nome]) porColab[nome] = [];
    porColab[nome].push(new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR'));
  });

  const tipo = conflitantes[0].tipo === 'lider' ? 'Líder/Supervisor' : 'BackOffice';
  const detalhes = Object.entries(porColab)
    .map(([nome, dts]) => `${nome} (${dts.join(', ')})`)
    .join('; ');

  return {
    conflito: true,
    mensagem: `⚠️ Conflito de ${tipo} na regional ${regional}: ${detalhes} já ${conflitantes.length > 1 ? 'têm' : 'tem'} folga neste(s) dia(s).`,
    conflitantes,
  };
};
