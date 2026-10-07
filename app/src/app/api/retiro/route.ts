import { NextResponse } from "next/server";
import { z } from "zod";
import { formatearCedula } from "@/lib/cedula";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verificarCedulaDelPaquete } from "@/lib/verificarCedula";

// Entrega en la oficina: un organizador la registra cuando el cliente pasa a buscar su paquete
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const ESTADOS_ENTREGABLES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];

const Entrada = z.object({
  paqueteId: z.string().uuid(),
  imagen: z.string().min(1),
  origen: z.enum(["fisica_en_entrega", "captura_whatsapp"]),
  recibeOtro: z.boolean(),
  receptorNombre: z.string().trim().max(120).optional(),
});

const falla = (error: string, status: number, codigo?: string) => NextResponse.json({ error, codigo }, { status });

export async function POST(request: Request) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return falla("No autorizado.", 401);

  const entrada = Entrada.safeParse(await request.json().catch(() => null));
  if (!entrada.success) return falla("Datos incompletos.", 400);
  const datos = entrada.data;

  if (datos.imagen.length * 0.75 > MAX_BYTES) return falla("La foto es muy pesada.", 413);
  if (datos.recibeOtro && !datos.receptorNombre) return falla("Escribe el nombre de quien retira.", 400, "falta_receptor");

  const supabase = await createClient();
  const { data: paquete } = await supabase
    .from("paquetes")
    .select("id, nombre_etiqueta, estado, destinatario_id")
    .eq("id", datos.paqueteId)
    .maybeSingle();
  if (!paquete) return falla("No se encontró ese paquete.", 404);

  if (paquete.estado === "entregado") {
    const { data: previa } = await supabase
      .from("entregas")
      .select("id")
      .eq("paquete_id", paquete.id)
      .eq("resultado", "entregado")
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previa) return NextResponse.json({ ok: true, entregaId: previa.id, repetida: true });
  }
  if (!ESTADOS_ENTREGABLES.includes(paquete.estado)) return falla("Ese paquete ya no se puede entregar.", 409);

  const verificacion = await verificarCedulaDelPaquete(datos.imagen, paquete.nombre_etiqueta, "oficina");
  if (!verificacion.ok) return falla(verificacion.error, verificacion.status, verificacion.codigo);

  const ruta = `oficina/${paquete.id}/cedula-${Date.now()}.jpg`;
  const { error: errorFoto } = await supabase.storage
    .from("evidencias")
    .upload(ruta, Buffer.from(datos.imagen, "base64"), { contentType: "image/jpeg" });
  if (errorFoto) return falla("No se pudo guardar la foto. Intenta de nuevo.", 500);

  const { data: entrega, error } = await supabase
    .from("entregas")
    .insert({
      paquete_id: paquete.id,
      repartidor_id: null,
      tipo: "retiro_oficina",
      resultado: "entregado",
      foto_cedula_destinatario_url: ruta,
      cedula_origen: datos.origen,
      nombre_en_cedula: verificacion.nombre,
      cedula_leida: formatearCedula(verificacion.numero),
      cedula_coincide: true,
      receptor_es_destinatario: !datos.recibeOtro,
      receptor_nombre: datos.recibeOtro ? datos.receptorNombre : null,
    })
    .select("id")
    .single();

  if (error || !entrega) {
    await supabase.storage.from("evidencias").remove([ruta]);
    return falla("No se pudo registrar la entrega.", 500);
  }

  await createAdminClient().from("destinatarios").update({ cedula: verificacion.numero }).eq("id", paquete.destinatario_id).is("cedula", null);

  return NextResponse.json({ ok: true, entregaId: entrega.id, cedula: formatearCedula(verificacion.numero), nombre: verificacion.nombre });
}
