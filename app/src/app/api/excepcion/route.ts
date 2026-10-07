import { NextResponse } from "next/server";
import { z } from "zod";
import { formatearCedula } from "@/lib/cedula";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { verificarCedulaDelPaquete } from "@/lib/verificarCedula";

// El repartidor pide que la oficina autorice una entrega cuando la cédula no coincide con el paquete
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const ESTADOS_ENTREGABLES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];
const CODIGO_DUPLICADO = "23505";

const Entrada = z.object({
  paqueteId: z.string().uuid(),
  imagen: z.string().min(1),
  nota: z.string().trim().max(300).optional(),
});

const falla = (error: string, status: number, codigo?: string) => NextResponse.json({ error, codigo }, { status });

export async function POST(request: Request) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "repartidor" || !usuario.repartidorId) return falla("No autorizado.", 401);

  const entrada = Entrada.safeParse(await request.json().catch(() => null));
  if (!entrada.success) return falla("Datos incompletos.", 400);
  const datos = entrada.data;
  if (datos.imagen.length * 0.75 > MAX_BYTES) return falla("La foto es muy pesada.", 413);

  const supabase = await createClient();
  const { data: paquete } = await supabase
    .from("paquetes")
    .select("id, nombre_etiqueta, estado")
    .eq("id", datos.paqueteId)
    .maybeSingle();
  if (!paquete) return falla("Ese paquete no está en tu ruta.", 404);
  if (!ESTADOS_ENTREGABLES.includes(paquete.estado)) return falla("Ese paquete ya no se puede entregar.", 409);

  // Solo se pide excepción si de verdad no coincide o no se lee; si la cédula es correcta se entrega normal
  const verificacion = await verificarCedulaDelPaquete(datos.imagen, paquete.nombre_etiqueta, "repartidor");
  if (verificacion.ok) return falla("La cédula sí coincide con el paquete: entrégalo normalmente.", 409, "coincide");
  if (verificacion.codigo !== "no_coincide" && verificacion.codigo !== "ilegible") {
    return falla(verificacion.error, verificacion.status, verificacion.codigo);
  }

  const ruta = `${usuario.repartidorId}/${paquete.id}/excepcion-${Date.now()}.jpg`;
  const { error: errorFoto } = await supabase.storage
    .from("evidencias")
    .upload(ruta, Buffer.from(datos.imagen, "base64"), { contentType: "image/jpeg" });
  if (errorFoto) return falla("No se pudo guardar la foto. Intenta de nuevo.", 500);

  const { data: solicitud, error } = await supabase
    .from("solicitudes_excepcion")
    .insert({
      paquete_id: paquete.id,
      repartidor_id: usuario.repartidorId,
      foto_url: ruta,
      nombre_en_cedula: verificacion.leida?.nombre ?? null,
      cedula_leida: verificacion.leida ? formatearCedula(verificacion.leida.numero) : null,
      motivo_sistema: verificacion.codigo,
      nota_repartidor: datos.nota ?? null,
    })
    .select("id")
    .single();

  if (error || !solicitud) {
    await supabase.storage.from("evidencias").remove([ruta]);
    if (error?.code === CODIGO_DUPLICADO) return falla("Ya hay una solicitud pendiente para este paquete.", 409, "duplicada");
    return falla("No se pudo enviar la solicitud.", 500);
  }

  return NextResponse.json({ ok: true, solicitudId: solicitud.id });
}
