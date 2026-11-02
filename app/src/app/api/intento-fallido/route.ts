import { NextResponse } from "next/server";
import { z } from "zod";
import { MOTIVOS_FALLO } from "@/lib/intentos";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ESTADOS_ENTREGABLES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];

const Entrada = z.object({
  paqueteId: z.string().uuid(),
  motivo: z.enum(MOTIVOS_FALLO),
  /** Foto de evidencia (JPEG en base64), opcional. */
  imagen: z.string().min(1).optional(),
});

const falla = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "repartidor" || !usuario.repartidorId) return falla("No autorizado.", 401);

  const entrada = Entrada.safeParse(await request.json().catch(() => null));
  if (!entrada.success) return falla("Datos incompletos.", 400);
  const { paqueteId, motivo, imagen } = entrada.data;
  if (imagen && imagen.length * 0.75 > MAX_BYTES) return falla("La foto es muy pesada.", 413);

  const supabase = await createClient();
  // RLS: el repartidor solo ve los paquetes que tiene asignados
  const { data: paquete } = await supabase.from("paquetes").select("id, estado").eq("id", paqueteId).maybeSingle();
  if (!paquete) return falla("Ese paquete no está en tu ruta.", 404);
  if (!ESTADOS_ENTREGABLES.includes(paquete.estado)) return falla("Ese paquete ya no se puede gestionar.", 409);

  let ruta: string | null = null;
  if (imagen) {
    ruta = `${usuario.repartidorId}/${paquete.id}/intento-${Date.now()}.jpg`;
    const { error: errorFoto } = await supabase.storage.from("evidencias").upload(ruta, Buffer.from(imagen, "base64"), { contentType: "image/jpeg" });
    if (errorFoto) return falla("No se pudo guardar la foto. Intenta de nuevo.", 500);
  }

  const { error } = await supabase.from("entregas").insert({
    paquete_id: paquete.id,
    repartidor_id: usuario.repartidorId,
    tipo: "domicilio",
    resultado: "intento_fallido",
    motivo_fallo: motivo,
    foto_evidencia_url: ruta,
  });
  if (error) {
    if (ruta) await supabase.storage.from("evidencias").remove([ruta]);
    return falla("No se pudo registrar el intento.", 500);
  }
  return NextResponse.json({ ok: true });
}
