/**
 * Verifica se dois períodos de férias se sobrepõem
 */
const periodosSobrepoem = (inicio1, fim1, inicio2, fim2) => {
  const a = new Date(inicio1 + 'T00:00:00');
  const b = new Date(fim1 + 'T00:00:00');
  const c = new Date(inicio2 + 'T00:00:00');
  const d = new Date(fim2 + 'T00:00:00');
  return a <= d && b >= c;
};

const isLiderOuSupervisor = (cargo = '') => {
  const r = cargo.toLowerCase();
  return (
    r.includes('líder') || r.includes('lider') ||
    r.includes('supervisor') || r.includes('coordenador') ||
    r.includes('gerente')
  );
};

const isBackOffice = (cargo = '') =>
  cargo.toLowerCase().includes('backoffice') ||
  cargo.toLowerCase().includes('back office');

/**
 * Verifica conflitos de férias para um novo período
 * @returns {conflito: boolean, mensagem: string, conflitantes: array}
 */
export const verificarConflito = ({
  colaboradorId,
  regional,
  cargo,
  dataInicio,
  dataFim,
  feriasExistentes,  // todas as férias aprovadas/pendentes
  colaboradores,     // array completo de colaboradores
}) => {
  const colabMap = {};
  colaboradores.forEach(c => { colabMap[c.id] = c; });

  const novaRegional = regional;
  const isCandidatoLider = isLiderOuSupervisor(cargo);
  const isCandidatoBO = isBackOffice(cargo);

  const conflitantes = [];

  for (const f of feriasExistentes) {
    if (f.colaborador_id === colaboradorId) continue;
    if (f.status === 'reprovado' || f.status === 'cancelado') continue;

    const outroColab = colabMap[f.colaborador_id];
    if (!outroColab) continue;
    if (outroColab.regional !== novaRegional) continue; // diferente regional, OK

    const sobrepoem = periodosSobrepoem(dataInicio, dataFim, f.data_inicio, f.data_fim);
    if (!sobrepoem) continue;

    const outroIsLider = isLiderOuSupervisor(outroColab.cargo);
    const outroIsBO = isBackOffice(outroColab.cargo);

    // Regra 1: lider/supervisor da mesma regional não podem coincidir
    if (isCandidatoLider && outroIsLider) {
      conflitantes.push({ colaborador: outroColab, ferias: f, tipo: 'lider' });
    }

    // Regra 2: backoffice da mesma regional não podem coincidir
    if (isCandidatoBO && outroIsBO) {
      conflitantes.push({ colaborador: outroColab, ferias: f, tipo: 'backoffice' });
    }
  }

  if (conflitantes.length === 0) return { conflito: false, mensagem: '', conflitantes: [] };

  const nomes = conflitantes.map(c => c.colaborador.nome).join(', ');
  const tipo = conflitantes[0].tipo === 'lider' ? 'Líder/Supervisor' : 'BackOffice';

  return {
    conflito: true,
    mensagem: `⚠️ Conflito de ${tipo}: ${nomes} já ${conflitantes.length > 1 ? 'estão' : 'está'} de férias neste período na regional ${novaRegional}.`,
    conflitantes,
  };
};
