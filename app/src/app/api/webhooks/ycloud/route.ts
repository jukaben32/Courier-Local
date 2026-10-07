import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarEntrante } from "@/lib/whatsapp/conversacion";
import { firmaYCloudValida } from "@/lib/whatsapp/firma";
import { interpretarEvento } from "@/lib/whatsapp/mensajes";

// YCloud llama aquí cuando un cliente escribe (whatsapp.inbound_message.received) y cuando
// cambia el estado de un mensaje enviado (whatsapp.message.updated).
export const maxDuration = 60;

const CODIGO_DUPLICADO = "23505";

export async function POST(request: Request) {
  const secreto = process.env.YCLOUD_WEBHOOK_SECRET;
  // Sin el secreto no se puede comprobar quién llama: se rechaza todo, sin excepción
  if (!secreto) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const cuerpoCrudo = await request.text();
  if (!firmaYCloudValida(cuerpoCrudo, request.headers.get("ycloud-signature"), secreto)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(cuerpoCrudo);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const evento = interpretarEvento(json);
  if (!evento) return NextResponse.json({ ok: true });

  // YCloud reintenta si no recibe un 200 a tiempo: cada evento se procesa una sola vez
  const admin = createAdminClient();
  const { error: errorRegistro } = await admin.from("eventos_whatsapp").insert({ id: evento.eventoId });
  if (errorRegistro?.code === CODIGO_DUPLICADO) return NextResponse.json({ ok: true, repetido: true });
  if (errorRegistro) return NextResponse.json({ error: "Error interno." }, { status: 500 });

  try {
    if (evento.clase === "entrante" && evento.entrante) {
      await procesarEntrante(evento.entrante);
    } else if (evento.clase === "estado") {
      await admin
        .from("mensajes_whatsapp")
        .update({ estado: evento.estado, error: evento.error })
        .eq("proveedor_id", evento.mensajeId);
    }
  } catch (error) {
    console.error("Error procesando evento de WhatsApp:", error instanceof Error ? error.message : "desconocido");
    // Se libera el evento para que el reintento de YCloud sí se procese
    await admin.from("eventos_whatsapp").delete().eq("id", evento.eventoId);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
