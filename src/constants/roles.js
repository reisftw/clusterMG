export const ROLES = {
  ADMIN:   'admin',
  GESTOR:  'gestor',
  TECNICO: 'tecnico',

  SUPERVISOR_FS:  'supervisor',
  GERENTE_FS:     'gerente',
  COORDENADOR_FS: 'coordenador',
  LIDER_FS_I:     'lider_fs_i',
  LIDER_FS_II:    'lider_fs_ii',
  LIDER_FS_III:   'lider_fs_iii',
  TECNICO_FS_I:   'tecnico_fs_i',
  TECNICO_FS_II:  'tecnico_fs_ii',
  TECNICO_FS_III: 'tecnico_fs_iii',
  BACKOFFICE_FS_I:   'backoffice_fs_i',
  BACKOFFICE_FS_II:  'backoffice_fs_ii',
  BACKOFFICE_FS_III: 'backoffice_fs_iii',
};

export const CARGOS_RETIRADAS = [
  { value: 'gestor',  label: 'Gestor'  },
  { value: 'tecnico', label: 'Técnico' },
];

export const CARGOS_FS = [
  { value: 'Supervisor',   label: 'Supervisor FS'    },
  { value: 'Gerente',      label: 'Gerente FS'       },
  { value: 'Coordenador',  label: 'Coordenador FS'   },
  { value: 'Líder I',      label: 'Líder FS I'       },
  { value: 'Líder II',     label: 'Líder FS II'      },
  { value: 'Líder III',    label: 'Líder FS III'     },
  { value: 'Técnico I',    label: 'Técnico FS I'     },
  { value: 'Técnico II',   label: 'Técnico FS II'    },
  { value: 'Técnico III',  label: 'Técnico FS III'   },
  { value: 'Backoffice I',   label: 'Backoffice FS I'   },
  { value: 'Backoffice II',  label: 'Backoffice FS II'  },
  { value: 'Backoffice III', label: 'Backoffice FS III' },
];

export const TODOS_CARGOS = [...CARGOS_RETIRADAS, ...CARGOS_FS];

const FS_ROLES = [
  'supervisor', 'gerente', 'coordenador',
  'lider_i', 'lider_ii', 'lider_iii',
  'tecnico_i', 'tecnico_ii', 'tecnico_iii',
  'backoffice_i', 'backoffice_ii', 'backoffice_iii',
];

export const isFS = (role) => FS_ROLES.includes(role?.toLowerCase());

export const hasPermission = (role, permission) => {
  if (!role || !permission) return false;

  const PERMISSIONS = {
    view_dashboard:          ['admin', 'gestor', 'tecnico'],
    manage_colaboradores:    ['admin', 'gestor'],
    manage_presenca:         ['admin', 'gestor', 'tecnico'],
    request_ferias:          ['admin', 'gestor', 'tecnico', ...FS_ROLES],
    manage_ferias:           ['admin', 'gestor', 'supervisor', 'gerente', 'coordenador'],
    checklist_frota:         ['admin', 'gestor', 'tecnico', ...FS_ROLES],
    view_comissao:           ['admin', 'gestor'],
    view_banco_horas:        ['admin', 'gestor', 'tecnico', ...FS_ROLES],
    view_equipamentos:       ['admin', 'gestor', 'tecnico'],
    view_regionais:          ['admin', 'gestor'],
    view_agentes:            ['admin', 'gestor'],
    view_agenda:             ['admin', 'gestor', 'tecnico'],
    view_duvidas:            ['admin', 'gestor', 'tecnico'],
    view_metas:              ['admin', 'gestor'],
    manage_metas:            ['admin', 'gestor'],
    manage_duvidas:          ['admin', 'gestor'],
    manage_feriados:         ['admin', 'gestor'],
    manage_users:            ['admin'],
    manage_email:            ['admin', 'gestor'],
    manage_veiculos:         ['admin', 'gestor'],
    manage_regionais:         ['admin', 'gestor'],
    manage_agentes:           ['admin', 'gestor'],
    manage_agenda:            ['admin', 'gestor'],
    manage_equipamentos:         ['admin', 'gestor'],
    manage_comissao:           ['admin', 'gestor'],
    manage_banco_horas:           ['admin', 'gestor'],
    view_ferramentas: ['admin', 'gestor'],
    view_mapa: ['admin', 'gestor'],
    view_mapeamento: ['admin', 'gestor'],
    view_tecnicos: ['admin', 'gestor'],
    view_visitantes: ['admin', 'gestor'],
    view_auditoria: ['admin', 'gestor'],
    view_operacional: ['admin', 'gestor'],
    view_analises: ['admin', 'gestor'],
    

    view_fs_dashboard:       ['admin', ...FS_ROLES],
    manage_fs_escala: ['admin', 'supervisor', 'gerente', 'coordenador'],
    view_fs_escala:   ['admin', ...FS_ROLES],
    manage_fs_colaboradores: ['admin', 'supervisor', 'gerente', 'coordenador'],
    view_fs_banco_horas:     ['admin', ...FS_ROLES],
    view_fs_ferias:          ['admin', ...FS_ROLES],
    view_fs_frota:           ['admin', 'supervisor', 'gerente', 'coordenador'],
    manage_fs_ferramentas:   ['admin', 'supervisor', 'gerente', 'coordenador', 'lider_i', 'lider_ii', 'lider_iii', 'backoffice_i', 'backoffice_ii', 'backoffice_iii'],
    view_fs_reclamacoes:     ['admin', 'supervisor', 'gerente', 'coordenador'],
    view_fs_reunioes:        ['admin', 'supervisor', 'gerente', 'coordenador', 'lider_i', 'lider_ii', 'lider_iii'],
    approve_ferias:            ['admin', 'supervisor', 'gerente', 'coordenador'],
    manage_fs_reunioes: ['admin', 'gestor', 'supervisor', 'gerente', 'coordenador', 'lider_i', 'lider_ii', 'lider_iii'],
manage_fs_frota: ['admin', 'supervisor', 'gerente', 'coordenador'],
    manage_fs_banco_horas: ['admin', 'supervisor', 'gerente', 'coordenador'],
  };

  const userRoles = Array.isArray(role) ? role : [role];
  return userRoles.some(r => PERMISSIONS[permission]?.includes(r.toLowerCase()) ?? false);
};
