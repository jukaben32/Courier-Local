import { NextResponse, after } from "next/server";
import { z } from "zod";
import { formatearCedula } from "@/lib/cedula";
import { enviarPruebaAlCourier } from "@/lib/courier";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verificarCedulaDelPaquete } from "@/lib/verificarCedula";

// Leer la cédula con IA y guardar la foto puede tardar unos segundos
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const MARGEN_FUTURO_MS = 60 * 1000;
const ANTIGUEDAD_MAXIMA_MS = 24 * 60 * 60 * 1000;
const ESTADOS_ENTREGABLES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];

const Entrada = z.object({
  paqueteId: z.string().uuid(),
  imagen: z.string().min(1),
  origen: z.enum(["fisica_en_entrega", "captura_whatsapp"]),
  recibeOtro: z.boolean(),
  receptorNombre: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** Hora real de la entrega cuando se guardó sin señal y se envía después. */
  momento: z.string().datetime().optional(),
});

// Se acepta la hora del celular solo si es razonable: ni del futuro ni de hace más de un día
function momentoDeEntrega(propuesto: string | undefined): string {
  const ahora = Date.now();
  if (propuesto) {
    const t = new Date(propuesto).getTime();
    if (t <= ahora + MARGEN_FUTURO_MS && t >= ahora - ANTIGUEDAD_MAXIMA_MS) return new Date(t).toISOString();
  }
  return new Date(ahora).toISOString();
}

const falla = (error: string, status: number, codigo?: string) =>
  NextResponse.json({ error, codigo }, { status });

export async function POST(request: Request) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "repartidor" || !usuario.repartidorId) return falla("No autorizado.", 401);

  const entrada = Entrada.safeParse(await request.json().catch(() => null));
  if (!entrada.success) return falla("Datos incompletos.", 400);
  const datos = entrada.data;

  if (datos.imagen.length * 0.75 > MAX_BYTES) return falla("La foto es muy pesada.", 413);
  if (datos.recibeOtro && !datos.receptorNombre) return falla("Escribe el nombre de quien recibe.", 400, "falta_receptor");

  const supabase = await createClient();
  // RLS: el repartidor solo ve los paquetes que tiene asignados
  const { data: paquete } = await supabase
    .from("paquetes")
    .select("id, numero_guia, nombre_etiqueta, estado, destinatario_id")
    .eq("id", datos.paqueteId)
    .maybeSingle();
  if (!paquete) return falla("Ese paquete no está en tu ruta.", 404);
  // Si el celular reenvía una entrega que ya se había guardado (se perdió la respuesta), no se duplica
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

  const verificacion = await verificarCedulaDelPaquete(datos.imagen, paquete.nombre_etiqueta, "repartidor");
  if (!verificacion.ok) return falla(verificacion.error, verificacion.status, verificacion.codigo);
  const cedula = { nombre: verificacion.nombre };
  const numero = verificacion.numero;

  const ruta = `${usuario.repartidorId}/${paquete.id}/cedula-${Date.now()}.jpg`;
  const { error: errorFoto } = await supabase.storage
    .from("evidencias")
    .upload(ruta, Buffer.from(datos.imagen, "base64"), { contentType: "image/jpeg" });
  if (errorFoto) return falla("No se pudo guardar la foto. Intenta de nuevo.", 500);

  const { data: entrega, error } = await supabase
    .from("entregas")
    .insert({
      paquete_id: paquete.id,
      repartidor_id: usuario.repartidorId,
      tipo: "domicilio",
      resultado: "entregado",
      foto_cedula_destinatario_url: ruta,
      cedula_origen: datos.origen,
      nombre_en_cedula: cedula.nombre,
      cedula_leida: formatearCedula(numero),
      cedula_coincide: true,
      receptor_es_destinatario: !datos.recibeOtro,
      receptor_nombre: datos.recibeOtro ? datos.receptorNombre : null,
      ubicacion_lat: datos.lat ?? null,
      ubicacion_lng: datos.lng ?? null,
      creado_en: momentoDeEntrega(datos.momento),
    })
    .select("id")
    .single();

  if (error || !entrega) {
    await supabase.storage.from("evidencias").remove([ruta]);
    const sinSector = error?.message.includes("sector");
    return falla(sinSector ? "El paquete no tiene sector. Avisa a la oficina." : "No se pudo registrar la entrega.", 500);
  }

  // Ya con la cédula verificada se guarda en la ficha del destinatario (el repartidor no puede editarla él mismo)
  await createAdminClient().from("destinatarios").update({ cedula: numero }).eq("id", paquete.destinatario_id).is("cedula", null);

  // En el instante de la entrega la prueba sale hacia el courier (si hay un canal configurado), sin
  // hacer esperar al repartidor. Si sale bien, la entrega queda marcada como subida sola.
  const momento = momentoDeEntrega(datos.momento);
  after(async () => {
    const salida = await enviarPruebaAlCourier({
      entregaId: entrega.id,
      guia: paquete.numero_guia,
      nombre: paquete.nombre_etiqueta,
      cedula: formatearCedula(numero),
      repartidor: usuario.nombre,
      momento,
      fotoBase64: datos.imagen,
    });
    if (salida.ok) {
      await createAdminClient()
        .from("entregas")
        .update({ cargado_en_courier: true, cargado_en_courier_en: new Date().toISOString() })
        .eq("id", entrega.id)
        .eq("cargado_en_courier", false);
    } else if (salida.motivo !== "sin_canal") {
      console.error("La prueba no salió hacia el courier:", salida.motivo);
    }
  });

  return NextResponse.json({
    ok: true,
    entregaId: entrega.id,
    cedula: formatearCedula(numero),
    nombre: cedula.nombre,
  });
}
