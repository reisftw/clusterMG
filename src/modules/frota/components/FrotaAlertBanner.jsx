import { AlertTriangle } from 'lucide-react';

const FrotaAlertBanner = ({ veiculos }) => {
  if (!veiculos.length) return null;
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle size={16} className="text-yellow-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-yellow-800">
            {veiculos.length} veículo{veiculos.length > 1 ? 's' : ''} próximo{veiculos.length > 1 ? 's' : ''} da manutenção
          </p>
          <ul className="mt-1.5 space-y-1">
            {veiculos.map((v) => (
              <li key={v.id} className="flex items-center gap-2 text-xs text-yellow-700">
                <span className="font-bold bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-md">{v.placa}</span>
                <span>{v.modelo}</span>
                <span className="text-yellow-500">·</span>
                <span>KM atual: <strong>{v.km_atual?.toLocaleString('pt-BR')}</strong></span>
                <span className="text-yellow-500">/</span>
                <span>Limite: <strong>{v.km_proxima_manutencao?.toLocaleString('pt-BR')}</strong></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FrotaAlertBanner;
