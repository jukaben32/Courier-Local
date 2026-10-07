"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { almacenLocal } from "@/lib/almacenIndexedDB";
import type { EntregaEnCola } from "@/lib/colaOffline";
import { enviarEntrega } from "@/lib/enviarEntrega";
import { fotoABase64 } from "@/lib/imagen";
import { registrarIntentoFallido } from "../../actions";

const MOTIVOS = ["No había nadie", "No contesta el teléfono", "No encontré la dirección", "Rechazó el paquete", "Pidió otro día"];
const ESPERA_UBICACION_MS = 6000;

function obtenerUbicacion(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolver) => {
    if (!navigator.geolocation) return resolver(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: ESPERA_UBICACION_MS }
    );
  });
}

export function FormularioEntrega({ paqueteId, guia, nombre }: { paqueteId: string; guia: string; nombre: string }) {
  const router = useRouter();
  const inputFoto = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<{ base64: string; vista: string } | null>(null);
  const [recibeOtro, setRecibeOtro] = useState(false);
  const [receptor, setReceptor] = useState("");
  const [origen, setOrigen] = useState<"fisica_en_entrega" | "captura_whatsapp">("fisica_en_entrega");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarFallo, setMostrarFallo] = useState(false);
  const [guardada, setGuardada] = useState<EntregaEnCola | null>(null);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [solicitada, setSolicitada] = useState(false);
  const [fallando, iniciarFallo] = useTransition();

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    const base64 = await fotoABase64(archivo);
    setFoto({ base64, vista: `data:image/jpeg;base64,${base64}` });
    setCodigoError(null);
  }

  // La cédula no coincide pero el repartidor cree que corresponde: la oficina decide
  async function pedirAutorizacion() {
    if (!foto) return;
    setPidiendo(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/excepcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paqueteId, imagen: foto.base64, nota: nota.trim() || undefined }),
      });
      const cuerpo = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) {
        setError(cuerpo.error ?? "No se pudo enviar la solicitud.");
        return;
      }
      setSolicitada(true);
    } catch {
      setError("Sin conexión. Intenta de nuevo cuando tengas señal.");
    } finally {
      setPidiendo(false);
    }
  }

  async function entregar() {
    if (!foto) return;
    setEnviando(true);
    setError(null);
    const ubicacion = await obtenerUbicacion();
    const entrega: EntregaEnCola = {
      id: crypto.randomUUID(),
      paqueteId,
      guia,
      nombre,
      imagen: foto.base64,
      origen,
      recibeOtro,
      receptorNombre: recibeOtro ? receptor : undefined,
      lat: ubicacion?.lat,
      lng: ubicacion?.lng,
      momento: new Date().toISOString(),
    };

    const { resultado, entregaId, codigo } = await enviarEntrega(entrega);
    if (resultado.estado === "ok" && entregaId) {
      router.replace(`/subir/${entregaId}`);
      return;
    }
    if (resultado.estado === "rechazada") {
      setError(resultado.mensaje);
      setCodigoError(codigo ?? null);
      setEnviando(false);
      return;
    }

    // Sin señal: la entrega queda guardada en el celular y se envía sola cuando vuelva la conexión
    try {
      await almacenLocal.guardar(entrega);
      setGuardada(entrega);
    } catch {
      setError("No hay señal y no se pudo guardar en el celular. Inténtalo de nuevo cuando tengas conexión.");
    }
    setEnviando(false);
  }

  if (guardada) return <GuardadaSinSenal entrega={guardada} />;

  if (solicitada) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-ambar/20 p-4">
          <p className="text-lg font-semibold">Solicitud enviada a la oficina</p>
          <p className="text-sm text-tinta-2">Un organizador revisará la foto y te responderá. Mientras tanto sigue con tu ruta: verás el resultado en la pantalla principal.</p>
        </div>
        <a href="/ruta" className="block rounded-xl bg-tinta py-4 text-center font-semibold text-white">Seguir con la ruta</a>
      </div>
    );
  }

  const campo = "w-full rounded-lg border border-linea bg-tarjeta px-3 py-3";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{nombre}</h1>
        <p className="font-mono text-sm text-tinta-2">{guia}</p>
      </div>

      <div className="rounded-xl bg-tarjeta p-4">
        <p className="mb-3 text-sm text-tinta-2">
          Fotografía la cédula de <b>{nombre}</b>. El nombre debe coincidir con el del paquete.
        </p>
        <input ref={inputFoto} type="file" accept="image/*" capture="environment" onChange={alElegirFoto} className="hidden" />
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto.vista} alt="Foto de la cédula" className="mb-3 max-h-64 w-full rounded-lg object-contain" />
        ) : null}
        <button type="button" onClick={() => inputFoto.current?.click()} className="w-full rounded-lg border-2 border-dashed border-acento bg-acento/5 py-4 font-semibold text-acento-oscuro">
          {foto ? "Tomar otra foto" : "Tomar foto de la cédula"}
        </button>
      </div>

      <div className="space-y-3 rounded-xl bg-tarjeta p-4">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={recibeOtro} onChange={(e) => setRecibeOtro(e.target.checked)} className="size-5 accent-[#f26a1b]" />
          Lo recibe otra persona
        </label>
        {recibeOtro && (
          <>
            <input aria-label="Nombre de quien recibe" placeholder="Nombre de quien recibe" value={receptor} onChange={(e) => setReceptor(e.target.value)} className={campo} />
            <select aria-label="Cómo se mostró la cédula" value={origen} onChange={(e) => setOrigen(e.target.value as typeof origen)} className={campo}>
              <option value="fisica_en_entrega">Me dio la cédula física</option>
              <option value="captura_whatsapp">Me mostró una foto en su celular</option>
            </select>
          </>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rojo/10 px-3 py-3 text-sm font-medium text-rojo">{error}</p>}

      {(codigoError === "no_coincide" || codigoError === "ilegible") && (
        <div className="space-y-2 rounded-xl border border-ambar bg-ambar/10 p-4">
          <p className="text-sm font-semibold">¿Estás seguro de que es la persona correcta?</p>
          <p className="text-sm text-tinta-2">Puedes pedir que la oficina autorice la entrega. Verán la foto y decidirán.</p>
          <input aria-label="Nota para la oficina" placeholder="Nota para la oficina (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className={campo} />
          <button type="button" onClick={pedirAutorizacion} disabled={pidiendo} className="w-full rounded-lg bg-tinta py-3 font-semibold text-white disabled:opacity-50">
            {pidiendo ? "Enviando…" : "Pedir autorización a la oficina"}
          </button>
        </div>
      )}

      <button type="button" onClick={entregar} disabled={!foto || enviando || (recibeOtro && !receptor.trim())} className="w-full rounded-xl bg-verde py-4 text-lg font-semibold text-white disabled:opacity-50">
        {enviando ? "Verificando cédula…" : "Entregar paquete"}
      </button>

      <div className="border-t border-linea pt-4">
        {!mostrarFallo ? (
          <button type="button" onClick={() => setMostrarFallo(true)} className="w-full py-3 text-sm font-medium text-tinta-2 underline">
            No pude entregarlo
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">¿Qué pasó?</p>
            {MOTIVOS.map((m) => (
              <button key={m} type="button" disabled={fallando} onClick={() => iniciarFallo(async () => { const r = await registrarIntentoFallido(paqueteId, m); if (r?.error) setError(r.error); })} className="w-full rounded-lg border border-linea bg-tarjeta py-3 text-sm font-medium disabled:opacity-50">
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Pantalla cuando la entrega quedó guardada en el celular: ya se puede compartir la foto al courier
function GuardadaSinSenal({ entrega }: { entrega: EntregaEnCola }) {
  const [aviso, setAviso] = useState<string | null>(null);

  async function compartir() {
    try {
      const blob = await (await fetch(`data:image/jpeg;base64,${entrega.imagen}`)).blob();
      const archivo = new File([blob], `${entrega.guia}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: entrega.guia });
        return;
      }
      setAviso("Este celular no permite compartir la foto desde aquí.");
    } catch {
      setAviso("No se pudo compartir la foto.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-ambar/20 p-4">
        <p className="text-lg font-semibold">Entrega guardada sin señal 📶</p>
        <p className="text-sm text-tinta-2">
          Se verificará la cédula y se registrará sola cuando el celular tenga conexión. No cierres la sesión.
        </p>
      </div>
      <div className="rounded-xl bg-tarjeta p-4">
        <p className="font-semibold">{entrega.nombre}</p>
        <p className="font-mono text-sm text-tinta-2">{entrega.guia}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/jpeg;base64,${entrega.imagen}`} alt="Foto de la cédula" className="mt-3 max-h-56 w-full rounded-lg object-contain" />
      </div>
      <button type="button" onClick={compartir} className="w-full rounded-xl bg-acento py-4 text-lg font-semibold text-[#1a0900]">
        Compartir foto al courier
      </button>
      {aviso && <p role="status" className="text-center text-sm text-tinta-2">{aviso}</p>}
      <a href="/ruta" className="block py-3 text-center text-sm font-medium text-tinta-2 underline">Seguir con la ruta</a>
    </div>
  );
}
