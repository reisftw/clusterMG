import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ImageUp,
  Loader2,
  PackageSearch,
  ScanBarcode,
  Search,
  UserRound,
} from "lucide-react";
import { ROUTES } from "../../router/routes";
import {
  consultarMacPublico,
  normalizeMacInput,
} from "./terceirosService";

function InfoCard({ icon: Icon, label, value, helper, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white/80 p-2 shadow-sm">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide opacity-70">{label}</p>
          <p className="mt-1 break-words text-base font-black">{value || "nao_localizado"}</p>
          {helper ? <p className="mt-1 text-xs font-semibold opacity-70">{helper}</p> : null}
        </div>
      </div>
    </div>
  );
}

async function detectBarcodeFromImage(file) {
  if (!("BarcodeDetector" in window)) {
    throw new Error("Leitura automatica nao suportada neste navegador.");
  }
  const BarcodeDetectorConstructor = window.BarcodeDetector;
  const detector = new BarcodeDetectorConstructor({
    formats: ["code_128", "code_39", "code_93", "codabar", "ean_13", "qr_code"],
  });
  const image = await createImageBitmap(file);
  const codes = await detector.detect(image);
  const value = codes?.[0]?.rawValue || "";
  if (!value) throw new Error("Nenhum codigo encontrado na imagem.");
  return value;
}

export default function TerceirosConsultaMacPage({ portal = "terceiros" }) {
  const homeRoute = portal === "terceirizados" ? ROUTES.TERCEIRIZADOS : ROUTES.TERCEIROS;
  const [mac, setMac] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const normalizedMac = useMemo(() => normalizeMacInput(mac), [mac]);

  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    const previous = link?.getAttribute("href");
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    const previousAppleIcon = appleIcon?.getAttribute("href");
    link?.setAttribute("href", "/terceiros.webmanifest?v=cluster-v2");
    appleIcon?.setAttribute("href", "/terceiros-apple-touch-icon-v2.png");
    return () => {
      if (previous) link?.setAttribute("href", previous);
      if (previousAppleIcon) appleIcon?.setAttribute("href", previousAppleIcon);
    };
  }, []);

  async function submit(nextMac = normalizedMac) {
    setError("");
    setResult(null);
    const value = normalizeMacInput(nextMac);
    if (value.length !== 12 || value === "FFFFFFFFFFFF") {
      setError("Informe um MAC valido com 12 caracteres.");
      return;
    }

    setLoading(true);
    try {
      setResult(await consultarMacPublico(value));
    } catch (err) {
      setError(err?.message || "Nao foi possivel consultar o MAC.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const value = normalizeMacInput(await detectBarcodeFromImage(file));
      setMac(value);
      await submit(value);
    } catch (err) {
      setError(err?.message || "Nao foi possivel ler o codigo da imagem.");
    }
  }

  function openCamera() {
    setError("");
    cameraRef.current?.click();
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-[linear-gradient(180deg,#061b38_0%,#06294d_100%)] px-5 pb-8 pt-5 text-white shadow-lg">
        <div className="mx-auto max-w-5xl">
          <a
            href={homeRoute}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white"
          >
            <ArrowLeft size={16} />
            Voltar
          </a>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                Area de terceiros
              </p>
              <h1 className="mt-2 text-3xl font-black">Consultar MAC</h1>
            </div>
            <img src="/cluster-mg.png" alt="Cluster MG" className="h-auto w-40 object-contain" decoding="async" />
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-4 flex max-w-5xl flex-col gap-5 px-4 pb-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="grid gap-3"
          >
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={mac}
                onChange={(event) => setMac(normalizeMacInput(event.target.value))}
                placeholder="Digite ou cole o MAC"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-base font-black uppercase tracking-wide text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                Consultar
              </button>
              <button
                type="button"
                onClick={openCamera}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-300"
              >
                <ScanBarcode size={18} />
                Camera
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ImageUp size={18} />
                Imagem
              </button>
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImage}
              className="hidden"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleImage}
              className="hidden"
            />
          </form>

          {error ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              <AlertCircle size={18} />
              {error}
            </div>
          ) : null}
        </section>

        {result ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard
              icon={result.found ? CheckCircle2 : AlertCircle}
              label="Status"
              value={result.status}
              tone={result.found ? "green" : "orange"}
            />
            <InfoCard
              icon={Boxes}
              label="Estoque atual"
              value={result.estoqueAtual}
              helper={result.estoqueHelper}
              tone="blue"
            />
            <InfoCard
              icon={PackageSearch}
              label="Produto"
              value={result.produto}
              helper={result.produtoHelper}
            />
            <InfoCard
              icon={UserRound}
              label="Vinculado em"
              value={result.vinculadoEm}
              helper={result.vinculoHelper}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
