import { useEffect, useState } from "react";
import { Clock, CheckCircle, XCircle } from "lucide-react";

const FSReuniaoCountdown = ({ dataInicio, horarioInicio, status }) => {
  const [tempo, setTempo] = useState("");
  const [passou, setPassou] = useState(false);

  useEffect(() => {
    if (status === "realizada" || status === "cancelada") return;

    const calcular = () => {
      const alvo = new Date(`${dataInicio}T${horarioInicio}:00`);
      const agora = new Date();
      const diff = alvo - agora;

      if (diff <= 0) {
        setPassou(true);
        setTempo("Acontecendo agora");
        return;
      }

      const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
      const horas = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const segs = Math.floor((diff % (1000 * 60)) / 1000);

      if (dias > 0) setTempo(`${dias}d ${horas}h ${minutos}m`);
      else if (horas > 0) setTempo(`${horas}h ${minutos}m ${segs}s`);
      else setTempo(`${minutos}m ${segs}s`);
    };

    calcular();
    const timer = setInterval(calcular, 1000);
    return () => clearInterval(timer);
  }, [dataInicio, horarioInicio, status]);

  if (status === "realizada") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg">
        <CheckCircle size={11} /> Realizada
      </span>
    );
  }
  if (status === "cancelada") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
        <XCircle size={11} /> Cancelada
      </span>
    );
  }

  return (
    <span
      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
        passou
          ? "text-blue-700 bg-blue-50 border-blue-200 animate-pulse"
          : "text-orange-600 bg-orange-50 border-orange-200"
      }`}
    >
      <Clock size={11} /> {tempo}
    </span>
  );
};

export default FSReuniaoCountdown;
