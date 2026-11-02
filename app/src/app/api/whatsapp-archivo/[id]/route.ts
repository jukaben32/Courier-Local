import { NextResponse } from "next/server";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { configsOpenWA } from "@/lib/whatsapp/proveedor";

// Muestra la foto o el video que mandó un cliente (por ejemplo, la fachada de su casa).
// El archivo vive en OpenWA; esta ruta lo trae sin exponer la clave de OpenWA al navegador.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();
  const { data: mensaje } = await supabase
    .from("mensajes_whatsapp")
    .select("proveedor_id, sesion")
    .eq("id", id)
    .eq("direccion", "entrante")
    .maybeSingle();

  const [chatId, mensajeId] = (mensaje?.proveedor_id ?? "").split("|");
  const configs = configsOpenWA();
  const config = configs.find((c) => c.sessionId === mensaje?.sesion) ?? configs[0];
  if (!chatId || !mensajeId || !config) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });

  const respuesta = await fetch(
    `${config.url}/api/sessions/${config.sessionId}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(mensajeId)}/media`,
    { headers: { "X-API-Key": config.apiKey } }
  ).catch(() => null);
  if (!respuesta?.ok || !respuesta.body) return NextResponse.json({ error: "OpenWA no tiene el archivo." }, { status: 404 });

  return new Response(respuesta.body, {
    headers: {
      "Content-Type": respuesta.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
