import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  Database,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import {
  buscarStatusBancoDados,
  criarBackupBancoDados,
  restaurarBackupBancoDados,
} from "../services/databaseBackupService";

const CONFIRMATION_TEXT = "RESTAURAR BANCO";

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toLocaleString("pt-BR", {
    maximumFractionDigits: index === 0 ? 0 : 2,
  })} ${units[index]}`;
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const reasonLabel = {
  manual: "Manual",
  scheduled: "Automático",
  "manual-cli": "Manual VPS",
  "pre-restore": "Segurança antes do rollback",
};

const DatabaseBackupsPage = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [confirmation, setConfirmation] = useState("");

  const loadStatus = useCallback(async () => {
    setError("");
    const data = await buscarStatusBancoDados();
    setStatus(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadStatus()
      .catch((err) => {
        if (active) setError(err.message || "Não foi possível carregar os backups.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadStatus]);

  const storagePercent = useMemo(() => {
    const used = Number(status?.storage?.usedBytes || 0);
    const max = Number(status?.storage?.maxBytes || 0);
    if (!max) return 0;
    return Math.min(Math.round((used / max) * 100), 100);
  }, [status]);

  const latestBackup = status?.backups?.[0] || null;
  const canRestore = confirmation === CONFIRMATION_TEXT && selectedBackup?.fileName;

  const runAction = async (action, successMessage) => {
    setWorking(true);
    setError("");
    setFeedback("");
    try {
      const nextStatus = await action();
      setStatus(nextStatus.status || nextStatus);
      setFeedback(successMessage);
      setSelectedBackup(null);
      setConfirmation("");
    } catch (err) {
      setError(err.message || "Não foi possível concluir a ação.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Spinner fullScreen={false} />;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">
              <ShieldCheck size={18} />
              Segurança do Banco
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              Backups do PostgreSQL
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Backup automático diário às 00:01, retenção de 30 arquivos e limite total de 10GB.
              O rollback cria um backup de segurança antes de restaurar o arquivo escolhido.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runAction(loadStatus, "Status atualizado.")}
              disabled={working}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={16} className={working ? "animate-spin" : ""} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() =>
                runAction(criarBackupBancoDados, "Backup criado com sucesso.")
              }
              disabled={working}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Archive size={16} />
              Gerar Backup Agora
            </button>
          </div>
        </div>

        {(feedback || error) && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            {error || feedback}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
            <Database size={16} />
            Banco Atual
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {status?.database?.pretty || formatBytes(status?.database?.sizeBytes)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tamanho real informado pelo PostgreSQL.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
            <HardDrive size={16} />
            Espaço dos Backups
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatBytes(status?.storage?.usedBytes)}
          </p>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-emerald-500"
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {storagePercent}% de {formatBytes(status?.storage?.maxBytes)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
            <Archive size={16} />
            Retenção
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {status?.retention?.currentBackups || 0}/{status?.retention?.maxBackups || 30}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ao passar do limite, os mais antigos são apagados.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
            <Clock3 size={16} />
            Último Backup
          </div>
          <p className="mt-3 text-lg font-bold text-slate-900">
            {latestBackup ? formatDateTime(latestBackup.createdAt) : "Nenhum backup"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pasta: {status?.storage?.backupDir || "/opt/retiradas/backups/postgres"}
            {" · "}
            {status?.storage?.encryptionEnabled ? "Criptografado" : "Sem criptografia"}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Backups Disponíveis</h2>
            <p className="text-xs text-slate-500">
              Escolha um arquivo apenas quando precisar voltar o banco para aquele momento.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Tamanho</th>
                <th className="px-4 py-3">Arquivo</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(status?.backups || []).map((backup) => (
                <tr key={backup.fileName} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {formatDateTime(backup.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {reasonLabel[backup.reason] || backup.reason || "Manual"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatBytes(backup.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {backup.fileName}
                    {backup.encrypted ? (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-sans text-[10px] font-bold uppercase text-emerald-700">
                        age
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBackup(backup);
                        setConfirmation("");
                        setFeedback("");
                        setError("");
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50"
                    >
                      <RotateCcw size={14} />
                      Rollback
                    </button>
                  </td>
                </tr>
              ))}
              {!status?.backups?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    Nenhum backup criado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedBackup && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-sm font-bold uppercase text-amber-700">
                <AlertTriangle size={18} />
                Confirmar rollback
              </div>
              <p className="mt-2 text-sm text-amber-800">
                O banco será restaurado para o backup{" "}
                <strong>{selectedBackup.fileName}</strong>. Digite{" "}
                <strong>{CONFIRMATION_TEXT}</strong> para liberar o botão.
              </p>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-amber-400"
                placeholder={CONFIRMATION_TEXT}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedBackup(null);
                  setConfirmation("");
                }}
                disabled={working}
                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!canRestore || working}
                onClick={() =>
                  runAction(
                    () => restaurarBackupBancoDados(selectedBackup.fileName, confirmation),
                    "Rollback concluído com sucesso.",
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw size={16} />
                Restaurar Banco
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default DatabaseBackupsPage;
