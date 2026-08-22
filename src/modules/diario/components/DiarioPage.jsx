import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Save,
  Settings,
  ShieldAlert,
  TrendingUp,
  X,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { registrarAtividade } from "../../../services/activityLogService";
import { useDiarioEntries } from "../hooks/useDiarioEntries";
import {
  DIARIO_HORARIOS,
  classifyWeeklyProduction,
  formatDateLabel,
  localDateKey,
  monthKeyFromDateKey,
  normalizeDiarioEntry,
  saveDiarioEntry,
  subscribeDiarioLogsByMonth,
} from "../services/diarioService";
import "./DiarioPage.css";

const emptyFormFor = (date) => ({
  date,
  horarios: DIARIO_HORARIOS.reduce((result, horario) => {
    result[horario] = "";
    return result;
  }, {}),
  fines: "",
  notes: "",
});

function numberOrEmpty(value) {
  const number = Number(value || 0);
  return number > 0 ? String(number) : "";
}

function formFromEntry(entry, date) {
  if (!entry) return emptyFormFor(date);
  return {
    date,
    horarios: DIARIO_HORARIOS.reduce((result, horario) => {
      result[horario] = numberOrEmpty(entry.horarios?.[horario]);
      return result;
    }, {}),
    fines: numberOrEmpty(entry.fines),
    notes: entry.notes || "",
  };
}

function formatLogDay(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-");
  if (!year || !month || !day) return "--";
  return `${day}/${month}/${year}`;
}

function formatMonthNameFromKey(monthKey) {
  const [year, month] = String(monthKey || "").split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return "Mes selecionado";
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatLogTime(value) {
  const date = value?.toDate?.() || null;
  if (!date) return "--:--";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function getLogChanges(log) {
  const previous = log.previousSnapshot;
  const current = log.snapshot || {};
  const changes = [];
  const addChange = (label, before, after) => {
    const beforeNumber = Number(before || 0);
    const afterNumber = Number(after || 0);
    if (!previous || beforeNumber !== afterNumber) {
      changes.push({
        label,
        before: beforeNumber,
        after: afterNumber,
      });
    }
  };

  DIARIO_HORARIOS.forEach((horario) => {
    addChange(
      horario,
      previous?.horarios?.[horario],
      current.horarios?.[horario],
    );
  });
  addChange("Total dos horarios", previous?.hourlyTotal, current.hourlyTotal);
  addChange("Multas lancadas", previous?.fines, current.fines);

  return changes.filter(
    (change) => change.before !== change.after || !previous,
  );
}

function groupLogsByDay(logs) {
  const groups = new Map();
  logs.forEach((log) => {
    const key = log.entryDate || "sem-data";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  });
  return [...groups.entries()]
    .sort(([dateA], [dateB]) => String(dateB).localeCompare(String(dateA)))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return dateB - dateA;
      }),
    }));
}

function DiarioLogPanel({ logs, monthKey, open, onClose }) {
  const [showAll, setShowAll] = useState(false);
  const dayGroups = useMemo(() => groupLogsByDay(logs), [logs]);
  const visibleGroups = showAll ? dayGroups : dayGroups.slice(0, 3);

  if (!open) return null;
  return (
    <div className="diario-log-overlay" role="dialog" aria-modal="true">
      <section className="diario-log-modal">
        <header className="diario-log-modal-header">
          <div>
            <span>Auditoria</span>
            <h2>Historico de cadastros e alteracoes</h2>
            <p>{formatMonthNameFromKey(monthKey)}</p>
          </div>
          <button type="button" onClick={onClose} title="Fechar historico">
            <X size={18} />
          </button>
        </header>

        <div className="diario-log-modal-list">
          {dayGroups.length ? (
            <>
              {visibleGroups.map((group) => (
                <section className="diario-log-day-group" key={group.date}>
                  <h3>{formatLogDay(group.date)}</h3>
                  <div className="diario-log-day-list">
                    {group.items.map((log) => {
                      const changes = getLogChanges(log);
                      return (
                        <article className="diario-log-entry" key={log.id}>
                          <div className="diario-log-entry-head">
                            <div>
                              <strong>{formatLogTime(log.createdAt)}</strong>
                              <span>{log.action || "alterou"}</span>
                            </div>
                            <div>
                              <strong>{log.userName || "Sistema"}</strong>
                              <span>
                                {formatMonthNameFromKey(log.monthKey)}
                              </span>
                            </div>
                          </div>
                          <div className="diario-log-change-list">
                            {changes.length ? (
                              changes.map((change) => (
                                <p key={change.label}>
                                  <span>{change.label}</span>
                                  <strong>
                                    {formatValue(change.before)} {"->"}{" "}
                                    {formatValue(change.after)}
                                  </strong>
                                </p>
                              ))
                            ) : (
                              <p>
                                <span>Registro</span>
                                <strong>Sem mudanca numerica</strong>
                              </p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              {dayGroups.length > 3 ? (
                <button
                  type="button"
                  className="diario-log-more"
                  onClick={() => setShowAll((current) => !current)}
                >
                  {showAll
                    ? "Ver menos"
                    : `Ver mais ${dayGroups.length - 3} dia(s)`}
                </button>
              ) : null}
            </>
          ) : (
            <p className="diario-muted">Nenhum log encontrado neste mes.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function MonthName({ dateKey }) {
  const [year, month] = monthKeyFromDateKey(dateKey).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function SummaryCard({ icon: Icon, label, value, helper, tone = "blue" }) {
  return (
    <div className={`diario-summary-card is-${tone}`}>
      <div className="diario-summary-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </div>
  );
}

export default function DiarioPage() {
  const { currentUser } = useAuthContext();
  const today = localDateKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const { entries, boardData, loading, error } = useDiarioEntries(selectedDate);
  const currentEntry = useMemo(
    () => entries.find((entry) => entry.date === selectedDate) || null,
    [entries, selectedDate],
  );
  const [form, setForm] = useState(() => emptyFormFor(today));
  const [logs, setLogs] = useState([]);
  const [logOpen, setLogOpen] = useState(false);
  const [logPanelKey, setLogPanelKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm(formFromEntry(currentEntry, selectedDate));
    setMessage("");
  }, [currentEntry, selectedDate]);

  useEffect(() => {
    setLogs([]);
    return subscribeDiarioLogsByMonth(selectedDate, setLogs, () => setLogs([]));
  }, [selectedDate]);

  const preview = normalizeDiarioEntry(form);
  const currentWeekStatus = classifyWeeklyProduction(
    boardData.currentWeek.delivered,
  );

  const updateHorario = (horario, value) => {
    setForm((current) => ({
      ...current,
      horarios: {
        ...current.horarios,
        [horario]: value,
      },
    }));
  };

  const handleOpenLogs = () => {
    setLogPanelKey((current) => current + 1);
    setLogOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const action = currentEntry ? "atualizou" : "cadastrou";
      const saved = await saveDiarioEntry(form, {
        action,
        userId: currentUser?.id,
        userName: currentUser?.nome || "Sistema",
        previousEntry: currentEntry,
      });
      await registrarAtividade({
        usuarioId: currentUser?.id,
        nome: currentUser?.nome || "Sistema",
        acao: `${action} diario de acompanhamento`,
        modulo: "diario",
        entidadeId: saved.date,
        detalhes: {
          date: saved.date,
          hourlyTotal: saved.hourlyTotal,
          fines: saved.fines,
        },
      });
      setMessage("Diario salvo e enviado para o painel da TV.");
    } catch {
      setMessage("Nao foi possivel salvar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="diario-page">
      <header className="diario-header">
        <div>
          <span>Operaçao diária</span>
          <h1>Diário</h1>
          <p>
            Cadastre as retiradas por horário e as multas lançadas para
            alimentar o acompanhamento da TV em tempo real.
          </p>
        </div>
        <div className="diario-header-actions">
          <div className="diario-month-badge">
            <CalendarDays size={18} />
            <MonthName dateKey={selectedDate} />
          </div>
          <button
            type="button"
            className="diario-log-button"
            onClick={handleOpenLogs}
            title="Ver historico do mes"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <section className="diario-summary-grid">
        <SummaryCard
          icon={TrendingUp}
          label="Semana atual"
          value={boardData.currentWeek.delivered.toLocaleString("pt-BR")}
          helper={`Producao ${currentWeekStatus.label}`}
          tone={currentWeekStatus.tone}
        />
        <SummaryCard
          icon={ClipboardList}
          label="Entregue no mes"
          value={boardData.totals.monthDelivered.toLocaleString("pt-BR")}
          helper="Soma dos cadastros diarios"
          tone="blue"
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Multas lancadas"
          value={boardData.totals.monthFines.toLocaleString("pt-BR")}
          helper="Total do mes"
          tone="orange"
        />
      </section>

      <div className="diario-layout">
        <form className="diario-card diario-form" onSubmit={handleSubmit}>
          <div className="diario-card-title">
            <div>
              <span>Cadastro do dia</span>
              <h2>
                {formatDateLabel(selectedDate, { month: true, weekday: true })}
              </h2>
            </div>
            <label>
              Data
              <input
                type="date"
                value={selectedDate}
                onChange={(event) =>
                  setSelectedDate(event.target.value || today)
                }
              />
            </label>
          </div>

          <div className="diario-time-grid">
            {DIARIO_HORARIOS.map((horario) => (
              <label key={horario}>
                {horario}
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.horarios[horario] ?? ""}
                  onChange={(event) =>
                    updateHorario(horario, event.target.value)
                  }
                  placeholder="0"
                />
              </label>
            ))}
          </div>

          <div className="diario-form-row diario-form-row-single">
            <label>
              Multas lancadas
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.fines}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fines: event.target.value,
                  }))
                }
                placeholder="0"
              />
            </label>
          </div>

          <label className="diario-notes">
            Observaçoes
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Opcional"
            />
          </label>

          <div className="diario-form-footer">
            <div>
              <strong>{preview.hourlyTotal.toLocaleString("pt-BR")}</strong>
              <span>Soma dos horarios</span>
            </div>
            <button type="submit" disabled={saving}>
              <Save size={18} />
              {saving ? "Salvando..." : "Salvar diario"}
            </button>
          </div>
          {message ? <p className="diario-message">{message}</p> : null}
        </form>

        <section className="diario-card diario-weeks">
          <div className="diario-card-title">
            <div>
              <span>Produção semanal</span>
              <h2>METAS DO MÊS</h2>
            </div>
          </div>
          <div className="diario-week-list">
            {boardData.weeks.map((week) => (
              <div
                className={`diario-week-row is-${week.status.tone}`}
                key={week.week}
              >
                <div>
                  <strong>Semana {week.week}</strong>
                  <span>{week.status.label}</span>
                </div>
                <p>{week.delivered.toLocaleString("pt-BR")}</p>
                <small>{week.fines.toLocaleString("pt-BR")} multa(s)</small>
              </div>
            ))}
          </div>
          {loading ? <p className="diario-muted">Carregando dados...</p> : null}
          {error ? <p className="diario-error">{error}</p> : null}
        </section>
      </div>
      <DiarioLogPanel
        key={`${logPanelKey}-${monthKeyFromDateKey(selectedDate)}`}
        logs={logs}
        monthKey={monthKeyFromDateKey(selectedDate)}
        open={logOpen}
        onClose={() => setLogOpen(false)}
      />
    </div>
  );
}

