import { resumirConversaciones, type FilaEnVivo, type MensajeDelDia, type PaqueteDelCliente } from "./enVivo";
import { diaDeRD } from "./periodoPago";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Las conversaciones de WhatsApp de hoy, cliente por cliente, y cuántos paquetes esperan su primer aviso. */
export async function cargarEnVivo(supabase: Supabase): Promise<{ filas: FilaEnVivo[]; enCola: number }> {
  const desde = `${diaDeRD(new Date())}T00:00:00-04:00`;

  const [{ data: mensajesBD }, { data: franjasBD }, { count: enCola }] = await Promise.all([
    supabase
      .from("mensajes_whatsapp")
      .select("id, telefono, direccion, tipo, estado, contenido, creado_en, proveedor_id")
      .gte("creado_en", desde)
      .not("telefono", "is", null)
      .order("creado_en")
      .limit(5000),
    supabase.from("franjas").select("codigo, nombre"),
    supabase.from("paquetes").select("id", { count: "exact", head: true }).eq("estado", "recibido"),
  ]);
  const mensajes = (mensajesBD ?? []) as MensajeDelDia[];
  const telefonos = [...new Set(mensajes.map((m) => m.telefono))];

  const { data: paquetesBD } = telefonos.length
    ? await supabase
        .from("paquetes")
        .select("numero_guia, nombre_etiqueta, estado, ventana_horaria, hora_preferida, hora_hasta, dia_entrega, ubicacion_entrega_lat, sectores(nombre), destinatarios!inner(telefono)")
        .in("destinatarios.telefono", telefonos)
        .order("fecha_recibido", { ascending: false })
    : { data: [] };

  type FilaPaquete = {
    numero_guia: string;
    nombre_etiqueta: string;
    estado: string;
    ventana_horaria: string | null;
    hora_preferida: string | null;
    hora_hasta: string | null;
    dia_entrega: string | null;
    ubicacion_entrega_lat: number | null;
    sectores: { nombre: string } | null;
    destinatarios: { telefono: string };
  };
  const paquetes: PaqueteDelCliente[] = ((paquetesBD ?? []) as unknown as FilaPaquete[]).map((p) => ({
    telefono: p.destinatarios.telefono,
    numero_guia: p.numero_guia,
    nombre_etiqueta: p.nombre_etiqueta,
    estado: p.estado,
    ventana_horaria: p.ventana_horaria,
    hora_preferida: p.hora_preferida,
    hora_hasta: p.hora_hasta,
    dia_entrega: p.dia_entrega,
    tiene_ubicacion: p.ubicacion_entrega_lat !== null,
    sector: p.sectores?.nombre ?? null,
  }));
  const franjas = Object.fromEntries((franjasBD ?? []).map((f: { codigo: string; nombre: string }) => [f.codigo, f.nombre]));

  const filas = resumirConversaciones(mensajes, paquetes, franjas, new Date());
  return { filas, enCola: enCola ?? 0 };
}
