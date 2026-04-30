import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';

// ─── Buscar todos os colaboradores FS ───────────────────────────────────────
export const buscarTodosFS = async () => {
  const snap = await getDocs(
    query(collection(db, 'colaboradores_fs'), orderBy('nome'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── Buscar colaboradores do módulo Retiradas ────────────────────────────────
export const buscarColaboradoresRetiradas = async () => {
  const snap = await getDocs(
    query(collection(db, 'colaboradores'), orderBy('nome'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── Importar colaborador do Retiradas para o FS ────────────────────────────
export const importarColaborador = async (colaborador) => {
  const novoDoc = {
    nome:              colaborador.nome              ?? '',
    cargo:             colaborador.cargo             ?? '',
    regional:          colaborador.regional          ?? '',
    telefone:          colaborador.telefone          ?? '',
    turno:             colaborador.turno             ?? '',
    status:            colaborador.status            ?? 'ativo',
    matricula:         colaborador.matricula         ?? '',
    lider_responsavel: colaborador.lider_responsavel ?? '',
    data_aniversario:  colaborador.data_aniversario  ?? '',
    data_contratacao:  colaborador.data_contratacao  ?? '',
    data_demissao:     '',
    motivo_demissao:   '',
    origem:            'retiradas',
    origem_id:         colaborador.id,
    criado_em:         new Date().toISOString(),
  };
  return await addDoc(collection(db, 'colaboradores_fs'), novoDoc);
};

// ─── Cadastrar novo colaborador FS ───────────────────────────────────────────
export const cadastrarColaboradorFS = async (form) => {
  const novoDoc = {
    nome:              form.nome              ?? '',
    matricula:         form.matricula         ?? '',
    cargo:             form.cargo             ?? '',
    regional:          form.regional          ?? '',
    telefone:          form.telefone          ?? '',
    turno:             form.turno             ?? '',
    status:            form.status            ?? 'ativo',
    lider_responsavel: form.lider_responsavel ?? '',
    data_aniversario:  form.data_aniversario  ?? '',
    data_contratacao:  form.data_contratacao  ?? '',
    data_demissao:     form.data_demissao     ?? '',
    motivo_demissao:   form.motivo_demissao   ?? '',
    origem:            'fs',
    criado_em:         new Date().toISOString(),
  };
  return await addDoc(collection(db, 'colaboradores_fs'), novoDoc);
};

// ─── Atualizar colaborador FS ────────────────────────────────────────────────
export const atualizarColaboradorFS = async (id, dados) => {
  const ref = doc(db, 'colaboradores_fs', id);
  return await updateDoc(ref, {
    ...dados,
    atualizado_em: new Date().toISOString(),
  });
};

// ─── Deletar colaborador FS ──────────────────────────────────────────────────
export const deletarColaboradorFS = async (id) => {
  return await deleteDoc(doc(db, 'colaboradores_fs', id));
};

// ─── Buscar histórico (banco de horas, férias, escala) ──────────────────────
export const buscarHistoricoFS = async (colaboradorId) => {
  try {
    const [bancoSnap, feriasSnap, escalaSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'banco_horas'),
          where('colaborador_id', '==', colaboradorId),
          orderBy('criado_em', 'desc')
        )
      ),
      getDocs(
        query(
          collection(db, 'ferias'),
          where('colaborador_id', '==', colaboradorId),
          orderBy('data_inicio', 'desc')
        )
      ),
      getDocs(
        query(
          collection(db, 'escala_folga'),
          where('colaborador_id', '==', colaboradorId),
          orderBy('data', 'desc')
        )
      ),
    ]);

    return {
      bancoHoras: bancoSnap.docs.map(d  => ({ id: d.id,  ...d.data()  })),
      ferias:     feriasSnap.docs.map(d => ({ id: d.id,  ...d.data()  })),
      escala:     escalaSnap.docs.map(d => ({ id: d.id,  ...d.data()  })),
    };
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    return { bancoHoras: [], ferias: [], escala: [] };
  }
};
