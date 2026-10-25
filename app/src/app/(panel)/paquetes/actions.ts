"use server";

import { revalidatePath } from "next/cache";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { enviarPorWhatsApp } from "@/lib/whatsapp/cliente";
import { agruparAvisos, historialDeAvisos, mensajesDeAvisos, type PaqueteNuevo } from "@/lib/whatsapp/avisos";
import { franjasDisponibles, horaLocalRD, type Franja } from "@/lib/whatsapp/mensajes";
import { usaOpenWA } from "@/lib/whatsapp/proveedor";
import { describirTanda, enviarTanda } from "@/lib/whatsapp/tanda";

export interface EstadoAvisos {
  mensaje?: string;
  error?: string;
}

/** Envía un solo aviso por persona (con todos sus paquetes recibidos) y los pasa a "avisado". */
export async function enviarAvisos(): Promise<EstadoAvisos> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No tienes permiso para enviar avisos." };

  // Con OpenWA los avisos no salen de golpe: este botón manda la primera tanda y el programador
  // (npm run programador) sigue enviando poco a poco, con pausas, dentro del horario permitido.
  if (usaOpenWA()) {
    const tanda = await enviarTanda();
    revalidatePath("/paquetes");
    return { mensaje: `${describirTanda(tanda)} Deja corriendo el programador para que siga enviando.` };
  }

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

  const { grupos, sinTelefono } = agruparAvisos(nuevos);
  const mensajes = mensajesDeAvisos(grupos);
  const resultados = await enviarPorWhatsApp(mensajes);

  const { filas, idsAvisados } = historialDeAvisos(grupos, mensajes, resultados);
  if (filas.length > 0) await supabase.from("mensajes_whatsapp").insert(filas);
  if (idsAvisados.length > 0) await supabase.from("paquetes").update({ estado: "notificado" }).in("id", idsAvisados);

  revalidatePath("/paquetes");

  const avisados = resultados.filter((r) => r.ok).length;
  const fallidos = resultados.length - avisados + sinTelefono;
  const base = `Se avisó a ${avisados} ${avisados === 1 ? "persona" : "personas"}.`;
  return fallidos > 0
    ? { error: `${base} No se pudo avisar a ${fallidos}: siguen como "Recibido" para reintentar o llamar.` }
    : { mensaje: base };
}
