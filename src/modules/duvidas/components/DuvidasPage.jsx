import { useMemo, useState } from "react";
import {
  BookOpen,
  CircleHelp,
  Phone,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission } from "../../../constants/roles";
import Spinner from "../../../components/ui/Spinner";
import InternalStaticDataStatus from "../../../components/ui/InternalStaticDataStatus";
import { useDuvidas } from "../hooks/useDuvidas";

const TEAM_LABELS = {
  backoffice: "Backoffice",
  supervisor: "Supervisor",
  lider: "Líder",
  tecnico: "Técnico",
};

const EMPTY_DUVIDA = { id: null, pergunta: "", resposta: "", categoria: "" };
const EMPTY_CONTATO = {
  id: null,
  nome: "",
  telefone: "",
  cargo: "",
  observacao: "",
  grupo: "backoffice",
};

function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon size={18} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function BaseModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-100"
          >
            Fechar
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DuvidaModal({ initialValue, onClose, onSave, saving }) {
  const [form, setForm] = useState(initialValue || EMPTY_DUVIDA);

  const update = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <BaseModal
      title={form?.id ? "Editar dúvida" : "Nova dúvida"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Pergunta
          </label>
          <input
            value={form.pergunta}
            onChange={(e) => update("pergunta", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Categoria
          </label>
          <input
            value={form.categoria}
            onChange={(e) => update("categoria", e.target.value)}
            placeholder="Ex.: Agendamento, Loja, Backoffice"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Resposta
          </label>
          <textarea
            value={form.resposta}
            onChange={(e) => update("resposta", e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !form.pergunta.trim() || !form.resposta.trim()}
            onClick={() => onSave(form)}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar dúvida"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

function ContatoModal({ initialValue, onClose, onSave, saving }) {
  const [form, setForm] = useState(initialValue || EMPTY_CONTATO);

  const update = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <BaseModal
      title={form?.id ? "Editar contato" : "Novo contato"}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Grupo
          </label>
          <select
            value={form.grupo}
            onChange={(e) => update("grupo", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          >
            {Object.entries(TEAM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Nome
          </label>
          <input
            value={form.nome}
            onChange={(e) => update("nome", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Cargo
          </label>
          <input
            value={form.cargo}
            onChange={(e) => update("cargo", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Telefone corporativo
          </label>
          <input
            value={form.telefone}
            onChange={(e) => update("telefone", e.target.value)}
            placeholder="(31) 99999-9999"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-gray-600">
            Observação
          </label>
          <textarea
            value={form.observacao}
            onChange={(e) => update("observacao", e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={saving || !form.nome.trim() || !form.telefone.trim()}
          onClick={() => onSave(form)}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar contato"}
        </button>
      </div>
    </BaseModal>
  );
}

export default function DuvidasPage() {
  const { currentUser } = useAuthContext();
  const { conteudo, loading, saving, error, carregar, salvar } = useDuvidas();
  const [search, setSearch] = useState("");
  const [duvidaModal, setDuvidaModal] = useState(null);
  const [contatoModal, setContatoModal] = useState(null);

  const podeEditar = hasPermission(currentUser?.role, "manage_duvidas");

  const duvidasFiltradas = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conteudo.duvidas;
    return conteudo.duvidas.filter((item) =>
      `${item.pergunta} ${item.resposta} ${item.categoria}`
        .toLowerCase()
        .includes(term),
    );
  }, [conteudo.duvidas, search]);

  const totalContatos = Object.values(conteudo.equipe || {}).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0,
  );

  const replaceContent = async (nextContent) => {
    await salvar({
      ...conteudo,
      ...nextContent,
    });
  };

  const handleSaveDuvida = async (form) => {
    const nextDuvidas = form.id
      ? conteudo.duvidas.map((item) => (item.id === form.id ? { ...item, ...form } : item))
      : [
          { ...form, id: `duvida-${Date.now()}` },
          ...conteudo.duvidas,
        ];
    await replaceContent({ duvidas: nextDuvidas });
    setDuvidaModal(null);
  };

  const handleDeleteDuvida = async (id) => {
    await replaceContent({
      duvidas: conteudo.duvidas.filter((item) => item.id !== id),
    });
  };

  const handleSaveContato = async (form) => {
    const grupo = form.grupo || "backoffice";
    const atuais = conteudo.equipe?.[grupo] || [];
    const nextGrupo = form.id
      ? atuais.map((item) => (item.id === form.id ? { ...item, ...form } : item))
      : [{ ...form, id: `contato-${Date.now()}` }, ...atuais];

    const nextEquipe = {
      ...conteudo.equipe,
      [grupo]: nextGrupo,
    };

    if (form.id && contatoModal?.grupo && contatoModal.grupo !== grupo) {
      nextEquipe[contatoModal.grupo] = (conteudo.equipe?.[contatoModal.grupo] || []).filter(
        (item) => item.id !== form.id,
      );
    }

    await replaceContent({ equipe: nextEquipe });
    setContatoModal(null);
  };

  const handleDeleteContato = async (grupo, id) => {
    await replaceContent({
      equipe: {
        ...conteudo.equipe,
        [grupo]: (conteudo.equipe?.[grupo] || []).filter((item) => item.id !== id),
      },
    });
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{conteudo.titulo}</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            {conteudo.descricao}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={carregar}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={16} />
              Atualizar
            </span>
          </button>
          <InternalStaticDataStatus className="max-w-xl" />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <CircleHelp size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Dúvidas
              </p>
              <p className="text-2xl font-extrabold text-gray-900">
                {conteudo.duvidas.length}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <Phone size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Contatos
              </p>
              <p className="text-2xl font-extrabold text-gray-900">
                {totalContatos}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Users size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Perfis
              </p>
              <p className="text-2xl font-extrabold text-gray-900">4</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={BookOpen}
              title="Wiki da Retirada"
              subtitle="Dúvidas frequentes para consulta rápida da operação."
              action={
                podeEditar ? (
                  <button
                    type="button"
                    onClick={() => setDuvidaModal(EMPTY_DUVIDA)}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus size={16} />
                      Nova dúvida
                    </span>
                  </button>
                ) : null
              }
            />

            <div className="mt-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por pergunta, resposta ou categoria"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
              />
            </div>

            <div className="mt-4 space-y-3">
              {duvidasFiltradas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                  Nenhuma dúvida cadastrada.
                </div>
              ) : (
                duvidasFiltradas.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {item.categoria ? (
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                              {item.categoria}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="text-sm font-bold text-gray-900">
                          {item.pergunta}
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">
                          {item.resposta}
                        </p>
                      </div>
                      {podeEditar ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDuvidaModal(item)}
                            className="rounded-xl p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDuvida(item.id)}
                            className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={Phone}
              title="Equipe e telefones corporativos"
              subtitle="Contatos corporativos da retirada para apoio rápido."
              action={
                podeEditar ? (
                  <button
                    type="button"
                    onClick={() => setContatoModal(EMPTY_CONTATO)}
                    className="rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus size={16} />
                      Novo contato
                    </span>
                  </button>
                ) : null
              }
            />

            <div className="mt-4 space-y-4">
              {Object.entries(TEAM_LABELS).map(([groupKey, label]) => {
                const items = conteudo.equipe?.[groupKey] || [];
                return (
                  <div
                    key={groupKey}
                    className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-gray-900">{label}</h3>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                        {items.length} contato(s)
                      </span>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        Nenhum contato cadastrado.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-white bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">
                                  {item.nome}
                                </p>
                                <p className="text-xs text-gray-500">{item.cargo}</p>
                                <p className="mt-2 text-sm font-semibold text-blue-700">
                                  {item.telefone}
                                </p>
                                {item.observacao ? (
                                  <p className="mt-2 text-xs leading-5 text-gray-500">
                                    {item.observacao}
                                  </p>
                                ) : null}
                              </div>
                              {podeEditar ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setContatoModal({ ...item, grupo: groupKey })
                                    }
                                    className="rounded-xl p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteContato(groupKey, item.id)}
                                    className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {duvidaModal ? (
        <DuvidaModal
          initialValue={duvidaModal}
          onClose={() => setDuvidaModal(null)}
          onSave={handleSaveDuvida}
          saving={saving}
        />
      ) : null}

      {contatoModal ? (
        <ContatoModal
          initialValue={contatoModal}
          onClose={() => setContatoModal(null)}
          onSave={handleSaveContato}
          saving={saving}
        />
      ) : null}
    </div>
  );
}
