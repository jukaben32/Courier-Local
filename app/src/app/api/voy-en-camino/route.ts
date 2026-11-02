import { NextResponse } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPorWhatsApp } from "@/lib/whatsapp/cliente";
import { cuerpoTexto } from "@/lib/whatsapp/envio";
import { textoVoyEnCamino } from "@/lib/whatsapp/plantillas";

const Entrada = z.object({
  paqueteId: z.string().uuid(),
  /** Minutos que calcula la app hasta llegar a esa casa. */
  minutos: z.number().min(0).max(600),
});

const PLANTILLA = "voy_en_camino";
const falla = (error: string, status: number) => NextResponse.json({ error }, { status });

/** El repartidor avisa al cliente que va hacia su casa. Un solo aviso por paquete cada 3 horas. */
export async function POST(request: Request) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "repartidor" || !usuario.repartidorId) return falla("No autorizado.", 401);

  const entrada = Entrada.safeParse(await request.json().catch(() => null));
  if (!entrada.success) return falla("Datos incompletos.", 400);
  const { paqueteId, minutos } = entrada.data;

  // RLS: el repartidor solo ve los paquetes que tiene asignados
  const supabase = await createClient();
  const { data: paquete } = await supabase
    .from("paquetes")
    .select("id, estado, nombre_etiqueta, destinatarios(telefono)")
    .eq("id", paqueteId)
    .maybeSingle();
  if (!paquete) return falla("Ese paquete no está en tu ruta.", 404);
  if (!["confirmado", "en_ruta"].includes(paquete.estado)) return falla("Ese cliente aún no confirmó su entrega.", 409);
  const destinatario = paquete.destinatarios as unknown as { telefono: string } | { telefono: string }[] | null;
  const telefono = Array.isArray(destinatario) ? destinatario[0]?.telefono : destinatario?.telefono;
  if (!telefono) return falla("Ese cliente no tiene teléfono.", 409);

  const admin = createAdminClient();
  const hace3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("mensajes_whatsapp")
    .select("id", { count: "exact", head: true })
    .eq("paquete_id", paquete.id)
    .eq("plantilla", PLANTILLA)
    .gte("creado_en", hace3h);
  if (count) return NextResponse.json({ ok: true, yaAvisado: true });

  const { data: repartidor } = await admin.from("repartidores").select("nombre").eq("id", usuario.repartidorId).maybeSingle();
  const texto = textoVoyEnCamino(repartidor?.nombre ?? null, minutos, paquete.nombre_etiqueta);
  const [envio] = await enviarPorWhatsApp([{ telefono, cuerpo: cuerpoTexto(texto) }]);

  await admin.from("mensajes_whatsapp").insert({
    paquete_id: paquete.id,
    telefono,
    direccion: "saliente",
    tipo: "respuesta",
    estado: envio.ok ? "enviado" : "fallido",
    contenido: texto,
    plantilla: PLANTILLA,
    proveedor_id: envio.id ?? null,
    sesion: envio.sesion ?? null,
    error: envio.error ?? null,
  });
  if (!envio.ok) return falla("No se pudo enviar el aviso. Llámalo o escríbele directo.", 502);
  return NextResponse.json({ ok: true });
}
