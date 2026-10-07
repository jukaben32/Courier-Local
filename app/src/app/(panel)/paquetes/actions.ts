"use server";

import { revalidatePath } from "next/cache";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { enviarPorWhatsApp } from "@/lib/whatsapp/cliente";
import { cuerpoPlantilla, type MensajeSaliente } from "@/lib/whatsapp/envio";
import { franjasDisponibles, horaLocalRD, type Franja } from "@/lib/whatsapp/mensajes";
import { PLANTILLAS, parametrosAvisoLlegada } from "@/lib/whatsapp/plantillas";

export interface EstadoAvisos {
  mensaje?: string;
  error?: string;
}

interface PaqueteNuevo {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  destinatario_id: string;
  destinatarios: { telefono: string } | null;
}

/** Envía un solo aviso por persona (con todos sus paquetes recibidos) y los pasa a "avisado". */
export async function enviarAvisos(): Promise<EstadoAvisos> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No tienes permiso para enviar avisos." };

  const supabase = await createClient();
  const [{ data: franjas }, { data: paquetes }] = await Promise.all([
    supabase.from("franjas").select("codigo, hora_inicio, hora_fin").order("hora_inicio"),
    supabase
      .from("paquetes")
      .select("id, numero_guia, nombre_etiqueta, destinatario_id, destinatarios(telefono)")
      .eq("estado", "recibido"),
  ]);

  const nuevos = (paquetes ?? []) as unknown as PaqueteNuevo[];
  if (nuevos.length === 0) return { mensaje: "No hay paquetes nuevos por avisar." };

  // Si ya no quedan franjas hoy, el cliente no tendría qué elegir al responder
  if (franjasDisponibles((franjas ?? []) as Franja[], horaLocalRD()).length === 0) {
    return { error: "Ya no quedan franjas de entrega hoy. Envía los avisos mañana a primera hora." };
  }

  const porPersona = new Map<string, PaqueteNuevo[]>();
  for (const p of nuevos) {
    porPersona.set(p.destinatario_id, [...(porPersona.get(p.destinatario_id) ?? []), p]);
  }
  const grupos = [...porPersona.values()].filter((g) => g[0].destinatarios?.telefono);
  const sinTelefono = porPersona.size - grupos.length;

  const mensajes: MensajeSaliente[] = grupos.map((grupo) => ({
    telefono: grupo[0].destinatarios!.telefono,
    externalId: grupo[0].destinatario_id,
    cuerpo: cuerpoPlantilla(
      PLANTILLAS.avisoLlegada.nombre,
      parametrosAvisoLlegada(grupo[0].nombre_etiqueta, grupo.map((p) => p.numero_guia))
    ),
  }));

  const resultados = await enviarPorWhatsApp(mensajes);

  const filasHistorial: Record<string, unknown>[] = [];
  const idsAvisados: string[] = [];
  grupos.forEach((grupo, i) => {
    const r = resultados[i];
    for (const p of grupo) {
      filasHistorial.push({
        paquete_id: p.id,
        telefono: mensajes[i].telefono,
        direccion: "saliente",
        tipo: "aviso",
        plantilla: PLANTILLAS.avisoLlegada.nombre,
        estado: r.ok ? "enviado" : "fallido",
        proveedor_id: r.id ?? null,
        error: r.error ?? null,
      });
      if (r.ok) idsAvisados.push(p.id);
    }
  });

  if (filasHistorial.length > 0) await supabase.from("mensajes_whatsapp").insert(filasHistorial);
  if (idsAvisados.length > 0) await supabase.from("paquetes").update({ estado: "notificado" }).in("id", idsAvisados);

  revalidatePath("/paquetes");

  const avisados = resultados.filter((r) => r.ok).length;
  const fallidos = resultados.length - avisados + sinTelefono;
  const base = `Se avisó a ${avisados} ${avisados === 1 ? "persona" : "personas"}.`;
  return fallidos > 0
    ? { error: `${base} No se pudo avisar a ${fallidos}: siguen como "Recibido" para reintentar o llamar.` }
    : { mensaje: base };
}
