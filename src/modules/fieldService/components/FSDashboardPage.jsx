import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users,
  Car,
  CalendarDays,
  Gift,
  UserPlus,
  CalendarCheck,
  MessageSquareWarning,
  Wrench,
  AlertTriangle,
  Clock,
  RefreshCw,
  TrendingDown,
  ChevronRight,
  Cake,
  Bell,
} from "lucide-react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../../services/firebase";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { useFSFrota } from "../hooks/useFSFrota";
import { useFSReclamacoes } from "../hooks/useFSReclamacoes";
import {
  useBancoHoras,
  formatarSaldo,
} from "../../bancohoras/hooks/useBancoHoras";
import Spinner from "../../../components/ui/Spinner";

// ── Helpers ──────────────────────────────────────────────────────────────────
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const hoje = new Date();
const mesAtual = hoje.getMonth(); // 0-based
const anoAtual = hoje.getFullYear();
const DASHBOARD_REUNIOES_MAX = 120;
const DASHBOARD_FERIAS_MAX = 120;

const parseData = (val) => {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  const d = new Date(val);
  return isNaN(d) ? null : d;
};

const diffMeses = (dataISO) => {
  const d = parseData(dataISO);
  if (!d) return null;
  return (anoAtual - d.getFullYear()) * 12 + (mesAtual - d.getMonth());
};

const fmtData = (val) => {
  const d = parseData(val);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
};

// ── Sub-componentes de card ───────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 border-blue-100 text-blue-600",
    green: "bg-green-50 border-green-100 text-green-600",
    purple: "bg-purple-50 border-purple-100 text-purple-600",
    orange: "bg-orange-50 border-orange-100 text-orange-600",
    red: "bg-red-50 border-red-100 text-red-600",
    yellow: "bg-yellow-50 border-yellow-100 text-yellow-600",
    gray: "bg-gray-50 border-gray-100 text-gray-600",
  };
  return (
    <div
      className={`rounded-2xl border px-5 py-4 flex items-center gap-4 ${colors[color].split(" ").slice(0, 2).join(" ")}`}
    >
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">
          {value}
        </p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
};

const SectionCard = ({
  title,
  icon,
  children,
  empty,
  badge,
  badgeColor = "blue",
}) => {
  const badgeColors = {
    blue: "bg-blue-100 text-blue-600",
    red: "bg-red-100 text-red-600",
    orange: "bg-orange-100 text-orange-600",
    green: "bg-green-100 text-green-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{icon}</span>
          <p className="font-bold text-gray-800 text-sm">{title}</p>
          {badge != null && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColors[badgeColor]}`}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {empty ? (
          <p className="px-5 py-6 text-sm text-center text-gray-400">{empty}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

const ListRow = ({ left, right, sub, dot }) => (
  <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/60 transition-colors">
    <div className="flex items-center gap-3 min-w-0">
      {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{left}</p>
        {sub && (
          // ✅ CORRIGIDO: span ao invés de p para evitar div dentro de p
          <span className="text-xs text-gray-400 block truncate">{sub}</span>
        )}
      </div>
    </div>
    {right && (
      <span className="ml-3 shrink-0 text-xs font-semibold">{right}</span>
    )}
  </div>
);

// ── Componente principal ──────────────────────────────────────────────────────
const FSDashboardPage = () => {
  const { colaboradores, loading: loadingColab } = useFSColaboradores();
  const { veiculos, loading: loadingFrota } = useFSFrota();
  const { reclamacoes, loading: loadingRec } = useFSReclamacoes();
  const { saldos, loading: loadingBH } = useBancoHoras();

  const [agendas, setAgendas] = useState([]);
  const [ferias, setFerias] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const carregarColab = async () => {};
  const carregarFrota = async () => {};
  const carregarRec = async () => {};
  const carregarBH = async () => {};
  const carregarFerias = async () => {};
  const carregarReunioes = async () => {};

  const carregar = useCallback(async () => {
    
    try {
      const [reunioesSnap, feriasSnap] = await Promise.all([
      // ✅ COLEÇÕES CORRETAS do Field Service
        getDocs(collection(db, "fs_reunioes")), // ← CORRIGIDO
        getDocs(collection(db, "fs_ferias")), // ← CORRIGIDO
      ]);
      setAgendas(reunioesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setFerias(feriasSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      await Promise.all([
        carregarColab(),
        carregarFrota(),
        carregarRec(),
        carregarBH(),
        carregarFerias(),
        carregarReunioes(),
      ]);
      setUltimaAtualizacao(new Date());
    } catch (e) {
      console.error("❌ Erro ao carregar:", e);
    } finally {
      setLoadingExtra(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregar();
    }, 0);

    return () => clearTimeout(timer);
  }, [carregar]);

  // ── Derivações ──────────────────────────────────────────────────────────────
  const ativos = useMemo(
    () =>
      colaboradores.filter((c) => c.status === "ativo" || c.status === "Ativo"),
    [colaboradores],
  );

  const carrosAtivos = useMemo(
    () => veiculos.filter((v) => !v.parado_na_base),
    [veiculos],
  );

  // Férias no mês atual
  const feriasNoMes = useMemo(() => {
    return ferias.filter((f) => {
      const inicio = parseData(f.data_inicio);
      if (!inicio) return false;
      return (
        inicio.getMonth() === mesAtual && inicio.getFullYear() === anoAtual
      );
    });
  }, [ferias]);

  const nomesColaboradoresFeriasNoMes = useMemo(() => {
    return feriasNoMes.map((f) => {
      const col = colaboradores.find(
        (c) => c.id === f.colaboradorId || c.id === f.colaborador_id,
      );
      return {
        nome: col?.nome ?? f.nome ?? "Colaborador",
        inicio: fmtData(f.data_inicio),
        fim: fmtData(f.data_fim),
      };
    });
  }, [feriasNoMes, colaboradores]);

  // Aniversariantes do mês
  const aniversariantes = useMemo(() => {
    return ativos
      .filter((c) => {
        const d = parseData(c.data_aniversario);
        return d && d.getMonth() === mesAtual;
      })
      .sort((a, b) => {
        const da = parseData(a.data_aniversario);
        const db_ = parseData(b.data_aniversario);
        return (da?.getDate() ?? 0) - (db_?.getDate() ?? 0);
      });
  }, [ativos]);

  // Novos colaboradores (últimos 30 dias)
  const novosColaboradores = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() - 30);
    return ativos
      .filter((c) => {
        const d = parseData(c.data_contratacao);
        return d && d >= limite;
      })
      .sort(
        (a, b) => parseData(b.data_contratacao) - parseData(a.data_contratacao),
      );
  }, [ativos]);

  const proximasAgendas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    console.log(
      "🔍 Filtrando agendas. Total:",
      agendas.length,
      "Hoje:",
      hoje.toISOString().slice(0, 10),
    );

    return agendas
      .map((a) => {
        let dataReuniao = null;

        const tentarCampo = (campo) => {
          if (!a[campo]) return null;
          let d;
          if (typeof a[campo] === "string") {
            // Formato brasileiro DD/MM/YYYY
            const partes = a[campo].split("/");
            if (partes.length === 3) {
              // ✅ Construtor com partes numéricas — nunca interpreta como UTC
              d = new Date(
                Number(partes[2]),
                Number(partes[1]) - 1, // mês é 0-indexed
                Number(partes[0]),
              );
            } else {
              // ✅ String ISO YYYY-MM-DD: adiciona T00:00:00 para forçar horário local
              const semFuso =
                a[campo].length === 10 ? a[campo] + "T00:00:00" : a[campo];
              d = new Date(semFuso);
            }
          } else if (a[campo]?.toDate) {
            // Timestamp do Firebase — já retorna horário local ✅
            d = a[campo].toDate();
          } else if (a[campo] instanceof Date) {
            d = a[campo];
          }
          return !d || isNaN(d) ? null : d;
        };

        dataReuniao =
          tentarCampo("data") ||
          tentarCampo("dataInicio") ||
          tentarCampo("data_inicio") ||
          tentarCampo("dataAgenda") ||
          null;

        console.log(
          `🔍 Reunião "${a.titulo ?? a.assunto}": data_raw="${a.data}", parsed=`,
          dataReuniao?.toLocaleString("pt-BR"),
        );

        if (!dataReuniao) {
          console.log("❌ Sem data válida");
          return null;
        }

        // Normaliza para comparar só a data (sem hora)
        const dataNormalizada = new Date(dataReuniao);
        dataNormalizada.setHours(0, 0, 0, 0);

        const futuro = dataNormalizada >= hoje;
        console.log(
          "🔍 É futura?",
          futuro,
          "Data norm:",
          dataNormalizada.toISOString().slice(0, 10),
        );

        if (!futuro) return null;

        // Calcula tempo restante
        const agora = new Date();
        const diffTempo = dataReuniao - agora;
        const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
        const diffHoras = Math.floor(diffTempo / (1000 * 60 * 60));

        return {
          ...a,
          // Formatação manual usando getDate/getMonth/getFullYear (sempre local)
          dataFormatada: (() => {
            const dia = dataReuniao.getDate().toString().padStart(2, "0");
            const mes = (dataReuniao.getMonth() + 1)
              .toString()
              .padStart(2, "0");
            const ano = dataReuniao.getFullYear();
            return `${dia}/${mes}/${ano}`;
          })(),
          horaFormatada: a.hora || a.horaInicio || "Horário TBA",
          diasRestantes: Math.max(0, diffDias),
          horasRestantes: Math.floor((diffTempo / (1000 * 60 * 60)) % 24),
          tempoRestanteHoras: diffHoras,
          titulo: a.titulo ?? a.assunto ?? "Reunião",
          regional: a.regional ?? a.local ?? "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.tempoRestanteHoras - b.tempoRestanteHoras)
      .slice(0, 6);
  }, [agendas]);

  // Reclamações abertas
  const reclamacoesAbertas = useMemo(
    () =>
      reclamacoes.filter(
        (r) => r.status === "aberta" || r.status === "em_analise",
      ),
    [reclamacoes],
  );

  // Veículos próximos de manutenção (≤ 3000km ou vencidos)
  const veiculosAlertaManut = useMemo(() => {
    return veiculos
      .filter((v) => {
        const rest =
          v.km_prox_revisao && v.km_atual
            ? v.km_prox_revisao - v.km_atual
            : null;
        return rest != null && rest <= 3000;
      })
      .sort((a, b) => {
        const rA = a.km_prox_revisao - a.km_atual;
        const rB = b.km_prox_revisao - b.km_atual;
        return rA - rB;
      })
      .slice(0, 6);
  }, [veiculos]);

  // Colaboradores com risco de férias (>= 11 meses de contrato, sem férias registradas)
  const colaboradoresRiscoFerias = useMemo(() => {
    const comFerias = new Set(
      ferias.map((f) => f.colaboradorId ?? f.colaborador_id),
    );
    return ativos
      .filter((c) => {
        const meses = diffMeses(c.data_contratacao);
        return meses != null && meses >= 11 && !comFerias.has(c.id);
      })
      .sort((a, b) => {
        const mA = diffMeses(a.data_contratacao) ?? 0;
        const mB = diffMeses(b.data_contratacao) ?? 0;
        return mB - mA;
      });
  }, [ativos, ferias]);

  // Top 10 banco de horas negativos
  const saldoMap = useMemo(() => {
    const m = {};
    saldos.forEach((s) => {
      m[s.colaboradorId] = s;
    });
    return m;
  }, [saldos]);

  const top10Negativos = useMemo(() => {
    return ativos
      .map((c) => ({ ...c, saldo: saldoMap[c.id]?.saldo_minutos ?? null }))
      .filter((c) => c.saldo != null && c.saldo < 0)
      .sort((a, b) => a.saldo - b.saldo)
      .slice(0, 10);
  }, [ativos, saldoMap]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  const loading =
    loadingColab || loadingFrota || loadingRec || loadingBH || loadingExtra;
  if (loading) return <Spinner fullScreen />;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Dashboard Field Service
          </h2>
          <p className="text-xs text-gray-400">
            {ultimaAtualizacao
              ? `Atualizado às ${ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : "Carregando dados..."}
          </p>
        </div>
        <button
          onClick={carregar}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 text-sm font-semibold transition-colors"
        >
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      {/* ── KPIs principais ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users size={20} />}
          label="Colaboradores Ativos"
          value={ativos.length}
          sub={`${colaboradores.length} total`}
          color="blue"
        />
        <StatCard
          icon={<Car size={20} />}
          label="Carros Ativos"
          value={carrosAtivos.length}
          sub={`${veiculos.length} na frota`}
          color="green"
        />
        <StatCard
          icon={<CalendarDays size={20} />}
          label={`Férias em ${MESES[mesAtual]}`}
          value={feriasNoMes.length}
          sub="colaboradores no mês"
          color="purple"
        />
        <StatCard
          icon={<MessageSquareWarning size={20} />}
          label="Reclamações Abertas"
          value={reclamacoesAbertas.length}
          sub={`${reclamacoes.filter((r) => r.status === "em_analise").length} em análise`}
          color={reclamacoesAbertas.length > 0 ? "red" : "green"}
        />
      </div>

      {/* ── KPIs secundários ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Cake size={20} />}
          label={`Aniversários em ${MESES[mesAtual]}`}
          value={aniversariantes.length}
          sub="colaboradores"
          color="orange"
        />
        <StatCard
          icon={<UserPlus size={20} />}
          label="Novos (30 dias)"
          value={novosColaboradores.length}
          sub="novas contratações"
          color="blue"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Risco de Férias"
          value={colaboradoresRiscoFerias.length}
          sub="≥ 11 meses sem férias"
          color={colaboradoresRiscoFerias.length > 0 ? "yellow" : "green"}
        />
        <StatCard
          icon={<Wrench size={20} />}
          label="Alerta de Revisão"
          value={veiculosAlertaManut.length}
          sub="veículos ≤ 3.000 km"
          color={veiculosAlertaManut.length > 0 ? "red" : "green"}
        />
      </div>

      {/* ── Grid de seções ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Aniversariantes */}
        <SectionCard
          title={`Aniversariantes — ${MESES[mesAtual]}`}
          icon={<Gift size={16} />}
          badge={aniversariantes.length}
          badgeColor="orange"
          empty={
            aniversariantes.length === 0
              ? "Nenhum aniversariante este mês."
              : null
          }
        >
          {aniversariantes.map((c) => {
            const d = parseData(c.data_aniversario);
            const diaHoje = hoje.getDate();
            const diaAniv = d?.getDate() ?? 0;
            const ehHoje = diaAniv === diaHoje;
            return (
              <ListRow
                key={c.id}
                dot={ehHoje ? "bg-orange-400 animate-pulse" : "bg-gray-200"}
                left={c.nome}
                sub={`${c.cargo ?? ""} · ${c.regional ?? ""}`}
                right={
                  <span
                    className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                      ehHoje
                        ? "bg-orange-50 text-orange-600 border-orange-200"
                        : "bg-gray-50 text-gray-500 border-gray-100"
                    }`}
                  >
                    {ehHoje ? "🎂 Hoje!" : `Dia ${diaAniv}`}
                  </span>
                }
              />
            );
          })}
        </SectionCard>

        {/* Novos Colaboradores */}
        <SectionCard
          title="Novos Colaboradores (30 dias)"
          icon={<UserPlus size={16} />}
          badge={novosColaboradores.length}
          badgeColor="blue"
          empty={
            novosColaboradores.length === 0
              ? "Nenhuma contratação recente."
              : null
          }
        >
          {novosColaboradores.map((c) => (
            <ListRow
              key={c.id}
              dot="bg-blue-400"
              left={c.nome}
              sub={`${c.cargo ?? ""} · ${c.regional ?? ""}`}
              right={
                <span className="text-xs text-gray-400">
                  {fmtData(c.data_contratacao)}
                </span>
              }
            />
          ))}
        </SectionCard>

        {/* Férias no mês */}
        <SectionCard
          title={`Férias em ${MESES[mesAtual]}`}
          icon={<CalendarDays size={16} />}
          badge={nomesColaboradoresFeriasNoMes.length}
          badgeColor="blue"
          empty={
            nomesColaboradoresFeriasNoMes.length === 0
              ? "Nenhum colaborador de férias este mês."
              : null
          }
        >
          {nomesColaboradoresFeriasNoMes.map((f, i) => (
            <ListRow
              key={i}
              dot="bg-purple-400"
              left={f.nome}
              sub={`${f.inicio} → ${f.fim}`}
            />
          ))}
        </SectionCard>

        {/* Próximas Agendas — COM HORÁRIO E CONTAGEM REGRESSIVA */}
        <SectionCard
          title="Próximas Reuniões"
          icon={<CalendarCheck size={16} />}
          badge={proximasAgendas.length}
          badgeColor="blue"
          empty={
            proximasAgendas.length === 0
              ? "Nenhuma reunião futura encontrada"
              : null
          }
        >
          {proximasAgendas.map((a) => {
            const urgente = a.tempoRestante <= 24;
            const comecandoAgora = a.tempoRestante <= 2;

            return (
              <ListRow
                key={a.id}
                dot={
                  comecandoAgora
                    ? "bg-red-400 animate-pulse"
                    : urgente
                      ? "bg-orange-400"
                      : "bg-blue-400"
                }
                left={a.titulo}
                sub={
                  <span>
                    {" "}
                    {/* ✅ span para evitar erro HTML */}
                    <span>{a.dataFormatada}</span>
                    {a.horaFormatada !== "Horário TBA" && (
                      <span className="text-xs text-gray-400 block">
                        · {a.horaFormatada}
                      </span>
                    )}
                  </span>
                }
                right={
                  <div className="text-right space-y-0.5">
                    <span
                      className={`block text-xs font-bold px-2 py-0.5 rounded-lg ${
                        comecandoAgora
                          ? "bg-red-50 text-red-600 border border-red-100"
                          : urgente
                            ? "bg-orange-50 text-orange-600 border border-orange-100"
                            : "bg-green-50 text-green-600 border border-green-100"
                      }`}
                    >
                      {a.diasRestantes}d {a.horasRestantes}h
                    </span>
                    {a.regional && (
                      <span className="text-xs bg-gray-50 text-gray-600 border border-gray-100 px-2 py-0.5 rounded-lg">
                        {a.regional}
                      </span>
                    )}
                  </div>
                }
              />
            );
          })}
        </SectionCard>

        {/* Reclamações abertas */}
        <SectionCard
          title="Reclamações em Aberto"
          icon={<MessageSquareWarning size={16} />}
          badge={reclamacoesAbertas.length}
          badgeColor={reclamacoesAbertas.length > 0 ? "red" : "green"}
          empty={
            reclamacoesAbertas.length === 0
              ? "Nenhuma reclamação em aberto. ✅"
              : null
          }
        >
          {reclamacoesAbertas.slice(0, 6).map((r) => (
            <ListRow
              key={r.id}
              dot={r.status === "aberta" ? "bg-red-400" : "bg-yellow-400"}
              left={r.titulo}
              sub={`${r.categoria ?? ""} · ${r.regional ?? ""}`}
              right={
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                    r.status === "aberta"
                      ? "bg-red-50 text-red-600 border-red-100"
                      : "bg-yellow-50 text-yellow-600 border-yellow-100"
                  }`}
                >
                  {r.status === "aberta" ? "Aberta" : "Em Análise"}
                </span>
              }
            />
          ))}
        </SectionCard>

        {/* Alerta de manutenção */}
        <SectionCard
          title="Veículos Próximos de Revisão"
          icon={<Wrench size={16} />}
          badge={veiculosAlertaManut.length}
          badgeColor={veiculosAlertaManut.length > 0 ? "red" : "green"}
          empty={
            veiculosAlertaManut.length === 0
              ? "Nenhum veículo com alerta de revisão. ✅"
              : null
          }
        >
          {veiculosAlertaManut.map((v) => {
            const restante = v.km_prox_revisao - v.km_atual;
            const vencido = restante <= 0;
            return (
              <ListRow
                key={v.id}
                dot={vencido ? "bg-red-500" : "bg-orange-400"}
                left={`${v.modelo ?? "Veículo"} — ${v.placa ?? "—"}`}
                sub={`${v.regional ?? ""} · KM atual: ${v.km_atual?.toLocaleString("pt-BR") ?? "—"}`}
                right={
                  <span
                    className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                      vencido
                        ? "bg-red-50 text-red-600 border-red-100"
                        : "bg-orange-50 text-orange-600 border-orange-100"
                    }`}
                  >
                    {vencido
                      ? "Vencido!"
                      : `${restante.toLocaleString("pt-BR")} km`}
                  </span>
                }
              />
            );
          })}
        </SectionCard>

        {/* Risco de férias */}
        <SectionCard
          title="Colaboradores com Risco de Férias"
          icon={<Bell size={16} />}
          badge={colaboradoresRiscoFerias.length}
          badgeColor={colaboradoresRiscoFerias.length > 0 ? "orange" : "green"}
          empty={
            colaboradoresRiscoFerias.length === 0
              ? "Nenhum colaborador em risco. ✅"
              : null
          }
        >
          {colaboradoresRiscoFerias.slice(0, 8).map((c) => {
            const meses = diffMeses(c.data_contratacao) ?? 0;
            const critico = meses >= 12;
            return (
              <ListRow
                key={c.id}
                dot={critico ? "bg-red-500" : "bg-yellow-400"}
                left={c.nome}
                sub={`${c.cargo ?? ""} · ${c.regional ?? ""}`}
                right={
                  <span
                    className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                      critico
                        ? "bg-red-50 text-red-600 border-red-100"
                        : "bg-yellow-50 text-yellow-600 border-yellow-100"
                    }`}
                  >
                    {meses} meses
                  </span>
                }
              />
            );
          })}
        </SectionCard>

        {/* Top 10 Banco de Horas Negativo */}
        <SectionCard
          title="Top 10 — Horas Negativas"
          icon={<TrendingDown size={16} />}
          badge={top10Negativos.length}
          badgeColor="red"
          empty={
            top10Negativos.length === 0
              ? "Nenhum colaborador com saldo negativo. ✅"
              : null
          }
        >
          {top10Negativos.map((c, i) => (
            <ListRow
              key={c.id}
              left={
                <span className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 w-4">
                    {i + 1}.
                  </span>
                  {c.nome}
                </span>
              }
              sub={`${c.cargo ?? ""} · ${c.regional ?? ""}`}
              right={
                <span className="px-2 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-100">
                  {formatarSaldo(c.saldo)}
                </span>
              }
            />
          ))}
        </SectionCard>
      </div>
    </div>
  );
};

export default FSDashboardPage;
