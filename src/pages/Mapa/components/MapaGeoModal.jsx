import React, { useEffect, useRef, useMemo, useState } from "react";
import { X, Map, Loader } from "lucide-react";
import {
  totalCidade,
  agruparPorRegional,
  agruparPorAgente,
} from "../utils/mapaUtils";

function getColor(total, max) {
  const r = total / max;
  if (r >= 0.75) return "#ef4444";
  if (r >= 0.5) return "#f97316";
  if (r >= 0.25) return "#eab308";
  return "#22c55e";
}
function getRadius(total, max) {
  return 10 + (total / max) * 30;
}

async function geocodificar(cidade) {
  try {
    const query = encodeURIComponent(`${cidade}, Minas Gerais, Brasil`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "Accept-Language": "pt-BR" } },
    );
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {}
  return null;
}

export default function MapaGeoModal({ ordens, onClose }) {
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const [status, setStatus] = useState("carregando"); // carregando | pronto

  const cidadesData = useMemo(() => {
    const result = {};
    const regionais = agruparPorRegional(ordens);
    Object.values(regionais).forEach((cidades) => {
      Object.entries(cidades).forEach(([cidade, data]) => {
        if (!result[cidade]) result[cidade] = { total: 0, tipo: "regional" };
        result[cidade].total += totalCidade(data);
      });
    });
    const agentes = agruparPorAgente(ordens);
    Object.entries(agentes).forEach(([cidade, data]) => {
      if (!result[cidade]) result[cidade] = { total: 0, tipo: "agente" };
      result[cidade].total += totalCidade(data);
    });
    return result;
  }, [ordens]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = async () => {
      const L = window.L;
      const map = L.map(mapRef.current).setView([-19.95, -44.2], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 13,
      }).addTo(map);
      leafletRef.current = map;

      const max = Math.max(
        ...Object.values(cidadesData).map((d) => d.total),
        1,
      );
      const cidades = Object.entries(cidadesData);

      // Geocodifica em série para respeitar rate limit do Nominatim (1 req/s)
      for (const [cidade, { total, tipo }] of cidades) {
        const coords = await geocodificar(cidade);
        if (!coords) continue;

        const color = getColor(total, max);
        const radius = getRadius(total, max);

        L.circleMarker(coords, {
          radius,
          fillColor: color,
          color: "#fff",
          weight: 2,
          fillOpacity: 0.85,
        }).addTo(map).bindPopup(`
            <div style="font-family:sans-serif;min-width:140px">
              <strong style="font-size:14px">${cidade}</strong><br/>
              <span style="color:${color};font-size:20px;font-weight:800">${total} O.S</span><br/>
              <span style="font-size:11px;color:#888">${tipo === "agente" ? "🤝 Agente" : "📡 Regional"}</span>
            </div>
          `);

        // Pausa 1s entre requests para respeitar o limite do Nominatim
        await new Promise((r) => setTimeout(r, 1100));
      }

      setStatus("pronto");
    };
    document.head.appendChild(script);

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }
    };
  }, [cidadesData]);

  const totalCidades = Object.keys(cidadesData).length;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-4 md:inset-8 bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-blue-50">
          <div className="flex items-center gap-2">
            <Map size={18} className="text-blue-500" />
            <h3 className="font-bold text-gray-900">Mapa Geográfico de O.S</h3>
            {status === "carregando" && (
              <span className="flex items-center gap-1 text-xs text-blue-500 font-medium ml-2">
                <Loader size={12} className="animate-spin" />
                Carregando {totalCidades} cidades...
              </span>
            )}
            {status === "pronto" && (
              <span className="text-xs text-green-600 font-medium ml-2">
                ✅ {totalCidades} cidades carregadas
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Legenda */}
        <div className="flex gap-4 px-6 py-2 bg-white border-b border-gray-100">
          {[
            ["#22c55e", "Baixo"],
            ["#eab308", "Médio"],
            ["#f97316", "Alto"],
            ["#ef4444", "Crítico"],
          ].map(([color, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ background: color }}
              />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
          <span className="text-xs text-gray-400 ml-auto">
            tamanho = volume de O.S
          </span>
        </div>

        {/* Mapa */}
        <div ref={mapRef} className="flex-1 w-full" />
      </div>
    </>
  );
}
