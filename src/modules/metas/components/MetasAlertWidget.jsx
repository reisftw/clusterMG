import { AlertTriangle } from "lucide-react";
import { useMetasDashboard } from "../hooks/useMetasDashboard";

function diasUteisRestantesNoMes(feriadosSet = new Set()) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diaHoje = hoje.getDate();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  let count = 0;

  for (let dia = diaHoje; dia <= diasNoMes; dia += 1) {
    const data = new Date(ano, mes, dia);
    if (data.getDay() === 0 || data.getDay() === 6) continue;

    const key = `${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (feriadosSet.has(key)) continue;

    count += 1;
  }

  return count;
}

const MetasAlertWidget = () => {
  const { metaMes, loading, feriadosSet } = useMetasDashboard();

  if (loading || !metaMes) return null;

  const planilhaSemNumeros =
    metaMes.planilhaCarregada &&
    !metaMes.temLancamentos &&
    Number(metaMes.totalOS || 0) === 0;

  if (planilhaSemNumeros) {
    return (
      <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500">
            <AlertTriangle size={20} className="text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm font-bold text-amber-800">
              Planilha carregada, sem numeros ainda
            </p>

            <p className="text-xs text-amber-700">
              A aba de {metaMes.mes.toLowerCase()} ja foi identificada, mas ainda nao ha lancamentos para exibir.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const diasUteisRestantes = diasUteisRestantesNoMes(feriadosSet);
  const falta = Math.max(0, metaMes.meta - metaMes.totalOS);
  const ritmoNecessario =
    diasUteisRestantes > 0 ? falta / diasUteisRestantes : 0;
  const pct = parseFloat(metaMes.percentAchieved);
  const risco = pct < 70 && diasUteisRestantes <= 5;

  if (!risco) return null;

  return (
    <div className="animate-pulse rounded-xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-500">
          <AlertTriangle size={20} className="text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-sm font-bold text-red-800">
            {"\u26A0\uFE0F"} ATENCAO - Meta em risco
          </p>

          <p className="mb-1 text-xs text-red-700">
            Faltam {falta.toLocaleString("pt-BR")} O.S - {metaMes.percentAchieved}% concluido
          </p>

          <p className="text-xs font-semibold text-red-700">
            Ritmo necessario: <span className="text-lg">{Math.round(ritmoNecessario)}</span>{" "}
            O.S/dia - {diasUteisRestantes}{" "}
            {diasUteisRestantes === 1 ? `dia ${"\u00FAtil"} restante` : `dias ${"\u00FAteis"} restantes`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MetasAlertWidget;

