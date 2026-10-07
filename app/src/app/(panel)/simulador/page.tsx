import { notFound } from "next/navigation";
import { formatearTelefono } from "@/lib/telefono";
import { createClient } from "@/lib/supabase/server";
import { whatsappSimulado } from "@/lib/whatsapp/cliente";
import { tituloFranja, type Franja } from "@/lib/whatsapp/mensajes";
import { BotonesRespuesta } from "./BotonesRespuesta";
import { ProbarTareas } from "./ProbarTareas";

interface FilaPaquete {
  nombre_etiqueta: string;
  numero_guia: string;
  estado: string;
  ventana_horaria: string | null;
  ubicacion_entrega_lat: number | null;
  destinatarios: { telefono: string } | null;
}

interface Mensaje {
  telefono: string;
  direccion: string;
  contenido: string | null;
  tipo: string;
  plantilla: string | null;
}

export default async function PaginaSimulador() {
  if (!whatsappSimulado()) notFound();

  const supabase = await createClient();
  const [{ data: franjas }, { data: paquetes }, { data: mensajes }] = await Promise.all([
    supabase.from("franjas").select("codigo, hora_inicio, hora_fin").order("hora_inicio"),
    supabase
      .from("paquetes")
      .select("nombre_etiqueta, numero_guia, estado, ventana_horaria, ubicacion_entrega_lat, destinatarios(telefono)")
      .in("estado", ["notificado", "confirmado", "retiro_oficina"])
      .order("fecha_recibido"),
    supabase
      .from("mensajes_whatsapp")
      .select("telefono, direccion, contenido, tipo, plantilla, creado_en")
      .not("telefono", "is", null)
      .order("creado_en", { ascending: false })
      .limit(200),
  ]);

  const opcionesFranja = ((franjas ?? []) as Franja[]).map((f) => ({ codigo: f.codigo, titulo: tituloFranja(f) }));

  const clientes = new Map<string, { nombre: string; guias: string[]; estado: string; conUbicacion: boolean }>();
  for (const p of (paquetes ?? []) as unknown as FilaPaquete[]) {
    const telefono = p.destinatarios?.telefono;
    if (!telefono) continue;
    const actual = clientes.get(telefono);
    clientes.set(telefono, {
      nombre: actual?.nombre ?? p.nombre_etiqueta,
      guias: [...(actual?.guias ?? []), p.numero_guia],
      estado: p.estado,
      conUbicacion: (actual?.conUbicacion ?? false) || p.ubicacion_entrega_lat !== null,
    });
  }

  const hilo = (telefono: string) =>
    ((mensajes ?? []) as Mensaje[]).filter((m) => m.telefono === telefono).slice(0, 6).reverse();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Simulador de WhatsApp</h1>
        <p className="max-w-2xl text-sm text-tinta-2">
          Mientras no estén las claves de YCloud, aquí se responde en nombre del cliente para probar toda la conversación.
          Cada botón hace lo mismo que hará el cliente desde su WhatsApp, con el mismo código del webhook real.
        </p>
      </div>

      <ProbarTareas />

      {clientes.size === 0 && (
        <p className="rounded-xl border border-linea bg-tarjeta px-4 py-8 text-center text-tinta-2">
          No hay clientes avisados. Recibe paquetes y envía los avisos desde la pantalla Paquetes.
        </p>
      )}

      <ul className="space-y-3">
        {[...clientes].map(([telefono, datos]) => (
          <li key={telefono} className="rounded-xl border border-linea bg-tarjeta p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{datos.nombre}</span>
              <span className="text-sm text-tinta-2">{formatearTelefono(telefono)} · {datos.guias.join(", ")}</span>
            </div>
            <p className="mt-1 text-xs text-tinta-2">
              Estado: <b>{datos.estado}</b> · Ubicación: {datos.conUbicacion ? "recibida ✅" : "pendiente"}
            </p>
            <ul className="mt-3 space-y-1 rounded-lg bg-fondo p-3 text-sm">
              {hilo(telefono).map((m, i) => (
                <li key={i} className={m.direccion === "entrante" ? "text-right text-tinta-2" : ""}>
                  <span className="font-medium">{m.direccion === "entrante" ? "Cliente" : "Courier Local"}:</span>{" "}
                  {m.plantilla ? `[plantilla ${m.plantilla}]` : (m.contenido ?? m.tipo)}
                </li>
              ))}
            </ul>
            <BotonesRespuesta telefono={telefono} franjas={opcionesFranja} />
          </li>
        ))}
      </ul>
    </div>
  );
}
