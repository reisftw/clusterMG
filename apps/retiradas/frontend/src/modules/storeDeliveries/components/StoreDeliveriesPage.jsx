import {
  Building2,
  Check,
  Download,
  History,
  Loader2,
  PackageCheck,
  Plus,
  ScanLine,
  Search,
  Store,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasAnyPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
  baixarEntregaLoja,
  buscarClientesLoja,
  confirmarEntregaLoja,
  listarEntregasLoja,
  listarLojas,
  listarUsuariosLoja,
  salvarLoja,
  vincularUsuarioLoja,
} from "../services/storeDeliveriesService";

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "-";
const normalMac = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

function HistoryTable({ mine = false }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      setItems((await listarEntregasLoja({ mine, q, limit: 50 })).items || []);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }, [mine, q]);
  useEffect(() => {
    let active = true;
    listarEntregasLoja({ mine, limit: 50 })
      .then((response) => {
        if (active) { setItems(response.items || []); setLoading(false); }
      })
      .catch((e) => {
        if (active) { setError(e.message); setLoading(false); }
      });
    return () => {
      active = false;
    };
  }, [mine]);
  return (
    <section className="space-y-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
          placeholder="Protocolo, cliente, código ou MAC"
        />
        <button
          type="button"
          onClick={load}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 font-bold text-white"
        >
          <Search size={17} />
          Buscar
        </button>
      </div>
      {error ? (
        <p className="text-sm font-semibold text-red-700">{error}</p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
		{loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={18} /> Carregando entregas...</div> : null}
		{!loading ? <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Protocolo</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Loja</th>
              <th className="p-3">Recebimento</th>
              <th className="p-3">Conciliação</th>
              <th className="p-3">Documento</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3 font-black text-blue-700">
                  {item.protocol}
                </td>
                <td className="p-3">
                  <strong className="block">{item.client_name}</strong>
                  <span className="text-xs text-slate-500">
                    {item.client_code}
                  </span>
                </td>
                <td className="p-3">{item.store_name}</td>
                <td className="p-3">
                  {formatDate(item.confirmed_at)}
                  <span className="block text-xs">
                    {item.item_count} equipamento(s)
                  </span>
                </td>
                <td className="p-3">{item.reconciliation_status}</td>
                <td className="p-3">
                  <button
                    type="button"
                    title="Baixar comprovante"
                    onClick={() => baixarEntregaLoja(item)}
                    className="rounded-lg border p-2 text-blue-700"
                  >
                    <Download size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
		</div> : null}
        {!loading && !items.length ? (
          <p className="p-8 text-center text-slate-500">
            Nenhuma entrega encontrada.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function StoresPanel() {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ company: "SEMPRE", active: true });
  const [assignment, setAssignment] = useState({ storeId: "", uid: "" });
  const [message, setMessage] = useState("");
  const load = async () => {
    const [storesResponse, usersResponse] = await Promise.all([
      listarLojas(),
      listarUsuariosLoja(),
    ]);
    setItems(storesResponse.items || []);
    setUsers(usersResponse.items || []);
  };
  useEffect(() => {
    let active = true;
    Promise.all([listarLojas(), listarUsuariosLoja()])
      .then(([storesResponse, usersResponse]) => {
        if (active) {
          setItems(storesResponse.items || []);
          setUsers(usersResponse.items || []);
        }
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      await salvarLoja(form);
      setMessage("Loja salva com sucesso.");
      setForm({ company: "SEMPRE", active: true });
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const assign = async (e) => {
    e.preventDefault();
    try {
      await vincularUsuarioLoja(assignment.storeId, assignment.uid);
      setMessage("Usuário vinculado à loja.");
      setAssignment({ storeId: "", uid: "" });
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <form onSubmit={save} className="space-y-3">
          <h2 className="text-lg font-black">Cadastrar loja</h2>
          {[
            ["code", "Código interno"],
            ["name", "Nome"],
            ["cnpj", "CNPJ"],
            ["zipCode", "CEP"],
            ["address", "Endereço"],
            ["number", "Número"],
            ["district", "Bairro"],
            ["city", "Cidade"],
            ["state", "UF"],
          ].map(([key, label]) => (
            <label key={key} className="block text-sm font-bold text-slate-700">
              {label}
              <input
                required={["code", "name", "address", "city", "state"].includes(
                  key,
                )}
                value={form[key] || ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
          ))}
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-blue-700 font-black text-white"
          >
            Salvar loja
          </button>
        </form>
        <form onSubmit={assign} className="space-y-3 border-t pt-5">
          <h2 className="text-lg font-black">Vincular usuário</h2>
          <select
            required
            value={assignment.uid}
            onChange={(e) =>
              setAssignment({ ...assignment, uid: e.target.value })
            }
            className="h-11 w-full rounded-lg border px-3"
          >
            <option value="">Selecione o usuário</option>
            {users.map((user) => (
              <option key={user.uid} value={user.uid}>
                {user.display_name || user.email} · {user.role}
              </option>
            ))}
          </select>
          <select
            required
            value={assignment.storeId}
            onChange={(e) =>
              setAssignment({ ...assignment, storeId: e.target.value })
            }
            className="h-11 w-full rounded-lg border px-3"
          >
            <option value="">Selecione a loja</option>
            {items
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <button
            type="submit"
            className="h-11 w-full rounded-lg border border-blue-700 font-black text-blue-700"
          >
            Vincular
          </button>
        </form>
        {message ? <p className="text-sm font-semibold">{message}</p> : null}
      </div>
      <div>
        <h2 className="mb-3 text-lg font-black">Lojas cadastradas</h2>
        {items.map((item) => (
          <div
            key={item.id}
            className="mb-2 flex items-center justify-between border-b py-3"
          >
            <div>
              <strong>{item.name}</strong>
              <span className="block text-xs text-slate-500">
                {item.code} · {item.city}/{item.state}
              </span>
            </div>
            <span
              className={item.active ? "text-emerald-700" : "text-slate-400"}
            >
              {item.active ? "Ativa" : "Inativa"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewDelivery() {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [scan, setScan] = useState("");
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const scanRef = useRef(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  useEffect(() => {
    listarLojas()
      .then((r) => {
        const available = (r.items || []).filter((item) => item.active);
        setStores(available);
        if (available.length === 1) setStoreId(available[0].id);
      })
      .catch(() => {});
  }, []);
  const search = async (e) => {
    e.preventDefault();
    if (searching) return;
    setSearching(true);
    try {
      setMessage("Buscando cliente, contrato e equipamentos no HubSoft...");
      setSelected(null);
      setResults([]);
      const items = (await buscarClientesLoja(term)).items || [];
      setResults(items);
      setMessage(items.length ? "Cliente localizado." : "Nenhum cliente corresponde à busca informada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSearching(false);
    }
  };
  const equipment = selected?.equipment || [];
  const add = (item) => {
    const mac = normalMac(item.mac || item.serial);
    if (!mac)
      return setMessage(
        "Este equipamento não possui MAC ou serial cadastrado.",
      );
    setChecked((current) =>
      current.some((row) => normalMac(row.mac) === mac)
        ? current
        : [
            ...current,
            {
              ...item,
              mac,
              contractId: selected.contractId,
              serviceId: selected.serviceId,
            },
          ],
    );
  };
  const toggle = (item) => {
    const mac = normalMac(item.mac || item.serial);
    if (checked.some((row) => normalMac(row.mac) === mac)) {
      setChecked((current) =>
        current.filter((row) => normalMac(row.mac) !== mac),
      );
      return;
    }
    add(item);
  };
  const readScan = (e) => {
    e.preventDefault();
    const mac = normalMac(scan);
    const item = equipment.find(
      (row) => normalMac(row.mac || row.serial) === mac,
    );
    if (!item) {
      setMessage(
        "MAC não corresponde aos equipamentos cadastrados para este contrato.",
      );
      return;
    }
    add(item);
    setScan("");
    setMessage(
      "MAC identificado — Equipamento localizado. Confirme a devolução para registrar o recebimento.",
    );
  };
  const confirm = async () => {
    if (!selected || !checked.length || submitting) return;
    setSubmitting(true);
    try {
      const response = await confirmarEntregaLoja({
        idempotencyKey: idempotencyKey.current,
        storeId,
        clientCode: selected.clientCode,
        clientName: selected.clientName,
        documentMasked: selected.documentMasked,
        contractId: selected.contractId,
        serviceId: selected.serviceId,
        deliveryType: checked.length < equipment.length ? "PARTIAL" : "TOTAL",
        items: checked,
      });
      setMessage(`Entrega confirmada. Protocolo ${response.item.protocol}.`);
      setSelected(null);
      setResults([]);
      setChecked([]);
      setTerm("");
      idempotencyKey.current = crypto.randomUUID();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="space-y-6">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-4"
          placeholder="CPF, código, nome completo ou MAC"
        />
        <button
          type="submit"
          disabled={searching || term.trim().length < 3}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-blue-700 px-5 font-black text-white disabled:cursor-wait disabled:opacity-60"
        >
          {searching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
          {searching ? "Buscando..." : "Buscar"}
        </button>
      </form>
      {message ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
          {message}
        </div>
      ) : null}
      {!selected &&
        results.map((item) => (
          <button
            type="button"
            key={`${item.clientCode}-${item.contractId}-${item.serviceId}`}
            onClick={() => {
              setSelected(item);
              setChecked([]);
            }}
            className="block w-full border-b p-4 text-left hover:bg-slate-50"
          >
            <strong className="text-lg">{item.clientName}</strong>
            <span className="block text-sm text-slate-500">
              Código {item.clientCode} · Contrato {item.contractId || "-"} ·{" "}
              {item.serviceName || "Serviço"}
            </span>
          </button>
        ))}
      {selected ? (
        <section className="space-y-5">
          <header className="flex items-start justify-between">
            <div>
              <p className="text-xs font-black uppercase text-blue-700">
                Cliente selecionado
              </p>
              <h2 className="text-2xl font-black">{selected.clientName}</h2>
              <p className="text-sm text-slate-500">
                Código {selected.clientCode} · Contrato{" "}
                {selected.contractId || "-"}
              </p>
            </div>
            <button
              type="button"
              title="Fechar"
              onClick={() => setSelected(null)}
              className="rounded-lg border p-2"
            >
              <X />
            </button>
          </header>
          {stores.length > 1 ? (
            <label className="block text-sm font-bold">
              Loja
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border px-3"
              >
                <option value="">Selecione a loja</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <form onSubmit={readScan} className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <ScanLine className="absolute left-3 top-3 text-slate-400" />
              <input
                ref={scanRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                className="h-12 w-full rounded-lg border pl-11 pr-3"
                placeholder="Leia ou digite o MAC"
              />
            </div>
            <button type="submit" className="rounded-lg border px-4 font-bold">
              Conferir
            </button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((item) => {
              const isChecked = checked.some(
                (row) =>
                  normalMac(row.mac) === normalMac(item.mac || item.serial),
              );
              return (
                <button
                  type="button"
                  key={`${item.assetId}-${item.mac}`}
                  onClick={() => toggle(item)}
                  className={`flex items-center justify-between rounded-lg border p-4 text-left ${isChecked ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}
                >
                  <div>
                    <strong>{item.productName}</strong>
                    <span className="block font-mono text-sm text-slate-600">
                      {item.mac || item.serial || "Sem MAC"}
                    </span>
                  </div>
                  {isChecked ? (
                    <Check className="text-emerald-700" />
                  ) : (
                    <Plus />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t pt-5">
            <p className="font-bold">
              {checked.length} de {equipment.length} conferido(s)
            </p>
            <button
              type="button"
              onClick={confirm}
              disabled={!checked.length || submitting}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-emerald-700 px-5 font-black text-white disabled:opacity-50"
            >
              <PackageCheck />
              {submitting ? "Confirmando..." : "Confirmar devolução"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function StoreDeliveriesPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const canManage = hasAnyPermission(currentUser, ["loja.lojas.manage"]);
  const canHistory = hasAnyPermission(currentUser, [
    "loja.historico.view",
    "loja.entregas.store",
  ]);
  const tabs = useMemo(
    () => [
      ["new", "Nova entrega", PackageCheck],
      ["mine", "Minhas entregas", History],
      ...(canHistory ? [["history", "Entregas da loja", Store]] : []),
      ...(canManage ? [["stores", "Lojas", Building2]] : []),
    ],
    [canHistory, canManage],
  );
  const routeTab =
    pathname === "/loja/lojas"
      ? "stores"
	  : pathname === "/loja/minhas-entregas"
		? "mine"
      : ["/loja/entregas", "/loja/historico", "/loja/protocolos"].includes(pathname)
        ? "history"
        : "new";
  const tab = routeTab;
	const tabRoutes = { new: "/loja/nova-entrega", mine: "/loja/minhas-entregas", history: "/loja/entregas", stores: "/loja/lojas" };
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
	  <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase text-blue-700">Loja</p>
        <h1 className="text-3xl font-black text-slate-950">Entrega em Loja</h1>
        <p className="text-slate-600">
          Recebimento físico, custódia e protocolo de equipamentos.
        </p>
      </header>
      <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map(([key, label, Icon]) => (
          <button
            type="button"
            key={key}
			onClick={() => navigate(tabRoutes[key])}
			className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md px-4 font-bold ${tab === key ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      {tab === "new" ? (
        <NewDelivery />
      ) : tab === "mine" ? (
        <HistoryTable mine />
      ) : tab === "history" ? (
        <HistoryTable />
      ) : (
        <StoresPanel />
      )}
    </main>
  );
}
