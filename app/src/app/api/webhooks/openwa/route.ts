import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarEntrante } from "@/lib/whatsapp/conversacion";
import { enviarPorWhatsApp } from "@/lib/whatsapp/cliente";
import { cuerpoTexto } from "@/lib/whatsapp/envio";
import { configHorasDesdeEntorno, sesionesOpenWA } from "@/lib/whatsapp/proveedor";
import { interpretarRespuestaTexto, type OpcionMenu } from "@/lib/whatsapp/menu";
import {
  firmaOpenWAValida,
  interpretarEventoOpenWA,
  type EstadoMensajeOpenWA,
  type EventoOpenWA,
} from "@/lib/whatsapp/openwa";

// OpenWA llama aquí cuando un cliente escribe (message.received) y cuando cambia el estado de un
// mensaje enviado (message.ack / message.failed). Se responde 200 enseguida y se procesa después,
// porque contestar al cliente incluye pausas de "escribiendo…" que pasarían el tiempo de espera.
export const maxDuration = 60;

const CODIGO_DUPLICADO = "23505";
const RESPUESTA_NO = "Gracias por avisar. No te volveremos a escribir por este paquete.";

// Un estado solo avanza (enviado -> entregado -> leído), nunca retrocede
const PREVIOS: Record<EstadoMensajeOpenWA, string[]> = {
  enviado: [],
  entregado: ["enviado"],
  leido: ["enviado", "entregado"],
  fallido: ["enviado"],
};

type Admin = ReturnType<typeof createAdminClient>;

async function procesarEvento(admin: Admin, evento: EventoOpenWA): Promise<void> {
  if (evento.clase === "estado") {
    const previos = PREVIOS[evento.estado];
    if (previos.length === 0) return;
    await admin
      .from("mensajes_whatsapp")
      .update({ estado: evento.estado })
      .in("proveedor_id", evento.mensajeIds)
      .in("estado", previos);
    return;
  }

  // Solo se atiende a quien nosotros le escribimos antes: el número lo usa también la oficina
  // para hablar con gente, y esas conversaciones no deben tocarse ni guardarse.
  const { data: menu } = await admin.from("menus_whatsapp").select("opciones, sesion").eq("telefono", evento.telefono).maybeSingle();
  if (!menu) return;

  // Las respuestas se tratan igual lleguen por la cuenta que lleguen. Solo se anota por cuál escribió
  // el cliente, para contestarle desde esa misma cuenta.
  if (evento.sesionId && evento.sesionId !== menu.sesion && sesionesOpenWA().includes(evento.sesionId)) {
    await admin.from("menus_whatsapp").update({ sesion: evento.sesionId }).eq("telefono", evento.telefono);
  }

  if (evento.ubicacion) {
    await procesarEntrante({ telefono: evento.telefono, tipo: "ubicacion", ...evento.ubicacion }, { soloLoEntendido: true, textoOriginal: "📍 Ubicación" });
    return;
  }
  // Foto o video de la casa (en muchos sectores no hay numeración clara): se guarda para el repartidor
  if (evento.adjunto === "foto" || evento.adjunto === "video") return recibirFoto(admin, evento.telefono, evento.adjunto, evento.archivo ?? null, menu.sesion);
  // Audio, documento, etc.: no hay respuesta automática; queda anotado para que la oficina lo atienda
  if (evento.adjunto) return anotarSinRespuesta(admin, evento.telefono, `[${evento.adjunto}]`);
  if (!evento.texto) return;

  const interpretacion = interpretarRespuestaTexto(
    evento.texto,
    menu.opciones as OpcionMenu[],
    configHorasDesdeEntorno(process.env)
  );
  // No se entiende: lo lee una persona en el teléfono (y lo ve en "En vivo")
  if (!interpretacion) return anotarSinRespuesta(admin, evento.telefono, evento.texto);

  if (interpretacion.tipo === "rechazo") {
    await admin.from("mensajes_whatsapp").insert({
      paquete_id: null,
      telefono: evento.telefono,
      direccion: "entrante",
      tipo: "respuesta",
      estado: "entregado",
      contenido: "NO",
    });
    const [envio] = await enviarPorWhatsApp([{ telefono: evento.telefono, cuerpo: cuerpoTexto(RESPUESTA_NO) }]);
    await admin.from("mensajes_whatsapp").insert({
      paquete_id: null,
      telefono: evento.telefono,
      direccion: "saliente",
      tipo: "respuesta",
      estado: envio.ok ? "enviado" : "fallido",
      contenido: RESPUESTA_NO,
      proveedor_id: envio.id ?? null,
      sesion: envio.sesion ?? null,
      error: envio.error ?? null,
    });
    return;
  }

  await procesarEntrante({ telefono: evento.telefono, ...interpretacion.entrante }, { soloLoEntendido: true, textoOriginal: evento.texto });
}

const ESTADOS_ABIERTOS = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];
async function recibirFoto(admin: Admin, telefono: string, adjunto: string, archivo: string | null, sesion: string | null): Promise<void> {
  const { data: personas } = await admin.from("destinatarios").select("id").eq("telefono", telefono);
  const { data: abiertos } = await admin
    .from("paquetes")
    .select("id")
    .in("destinatario_id", (personas ?? []).map((p) => p.id))
    .in("estado", ESTADOS_ABIERTOS)
    .order("fecha_recibido");
  const paquetes = abiertos ?? [];

  await admin.from("mensajes_whatsapp").insert({
    paquete_id: paquetes[0]?.id ?? null,
    telefono,
    direccion: "entrante",
    tipo: "respuesta",
    estado: "entregado",
    contenido: `[${adjunto}]`,
    // "chatId|messageId": con esto la oficina (y luego el repartidor) puede ver el archivo
    proveedor_id: archivo,
    sesion,
  });
}

/** Guarda lo que escribió el cliente cuando el sistema no le contesta solo. */
async function anotarSinRespuesta(admin: Admin, telefono: string, contenido: string): Promise<void> {
  await admin.from("mensajes_whatsapp").insert({
    paquete_id: null,
    telefono,
    direccion: "entrante",
    tipo: "respuesta",
    estado: "entregado",
    contenido,
  });
}

export async function POST(request: Request) {
  const secreto = process.env.OPENWA_WEBHOOK_SECRET;
  // Sin el secreto no se puede comprobar quién llama: se rechaza todo, sin excepción
  if (!secreto) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const cuerpoCrudo = await request.text();
  if (!firmaOpenWAValida(cuerpoCrudo, request.headers.get("x-openwa-signature"), secreto)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(cuerpoCrudo);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const evento = interpretarEventoOpenWA(json);
  if (!evento) return NextResponse.json({ ok: true });

  // OpenWA entrega cada evento "al menos una vez": cada uno se procesa una sola vez
  const admin = createAdminClient();
  const { error: errorRegistro } = await admin.from("eventos_whatsapp").insert({ id: evento.eventoId });
  if (errorRegistro?.code === CODIGO_DUPLICADO) return NextResponse.json({ ok: true, repetido: true });
  if (errorRegistro) return NextResponse.json({ error: "Error interno." }, { status: 500 });

  after(async () => {
    try {
      await procesarEvento(admin, evento);
    } catch (error) {
      console.error("Error procesando evento de OpenWA:", error instanceof Error ? error.message : "desconocido");
      // Se libera el evento: si OpenWA lo reenvía, se procesa de nuevo
      await admin.from("eventos_whatsapp").delete().eq("id", evento.eventoId);
    }
  });

  return NextResponse.json({ ok: true });
}
