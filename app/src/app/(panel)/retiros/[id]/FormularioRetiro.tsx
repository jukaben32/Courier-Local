"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fotoABase64 } from "@/lib/imagen";

export function FormularioRetiro({ paqueteId, guia, nombre }: { paqueteId: string; guia: string; nombre: string }) {
  const router = useRouter();
  const inputFoto = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<{ base64: string; vista: string } | null>(null);
  const [retiraOtro, setRetiraOtro] = useState(false);
  const [receptor, setReceptor] = useState("");
  const [origen, setOrigen] = useState<"fisica_en_entrega" | "captura_whatsapp">("fisica_en_entrega");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    const base64 = await fotoABase64(archivo);
    setFoto({ base64, vista: `data:image/jpeg;base64,${base64}` });
  }

  async function entregar() {
    if (!foto) return;
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/retiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paqueteId, imagen: foto.base64, origen, recibeOtro: retiraOtro, receptorNombre: retiraOtro ? receptor : undefined }),
      });
      const cuerpo = (await respuesta.json()) as { error?: string; entregaId?: string };
      if (!respuesta.ok || !cuerpo.entregaId) {
        setError(cuerpo.error ?? "No se pudo registrar la entrega.");
        return;
      }
      router.replace(`/retiros/subir/${cuerpo.entregaId}`);
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const campo = "w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Entrega en oficina</h1>
        <p className="mt-1 text-lg font-medium">{nombre}</p>
        <p className="font-mono text-sm text-tinta-2">{guia}</p>
      </div>

      <div className="rounded-xl border border-linea bg-tarjeta p-4">
        <p className="mb-3 text-sm text-tinta-2">Fotografía la cédula de <b>{nombre}</b>. El nombre debe coincidir con el del paquete.</p>
        <input ref={inputFoto} type="file" accept="image/*" capture="environment" onChange={alElegirFoto} className="hidden" />
        {foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto.vista} alt="Foto de la cédula" className="mb-3 max-h-64 w-full rounded-lg object-contain" />
        )}
        <button type="button" onClick={() => inputFoto.current?.click()} className="w-full rounded-lg border-2 border-dashed border-acento bg-acento/5 py-4 font-semibold text-acento-oscuro">
          {foto ? "Tomar otra foto" : "Tomar foto de la cédula"}
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-linea bg-tarjeta p-4">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={retiraOtro} onChange={(e) => setRetiraOtro(e.target.checked)} className="size-5 accent-[#f26a1b]" />
          Lo retira otra persona
        </label>
        {retiraOtro && (
          <>
            <input aria-label="Nombre de quien retira" placeholder="Nombre de quien retira" value={receptor} onChange={(e) => setReceptor(e.target.value)} className={campo} />
            <select aria-label="Cómo se mostró la cédula" value={origen} onChange={(e) => setOrigen(e.target.value as typeof origen)} className={campo}>
              <option value="fisica_en_entrega">Trajo la cédula física</option>
              <option value="captura_whatsapp">Mostró una foto en su celular</option>
            </select>
          </>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rojo/10 px-3 py-3 text-sm font-medium text-rojo">{error}</p>}

      <button type="button" onClick={entregar} disabled={!foto || enviando || (retiraOtro && !receptor.trim())} className="w-full rounded-xl bg-verde py-4 text-lg font-semibold text-white disabled:opacity-50">
        {enviando ? "Verificando cédula…" : "Entregar paquete"}
      </button>
    </div>
  );
}
