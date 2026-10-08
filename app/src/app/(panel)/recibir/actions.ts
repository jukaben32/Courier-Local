"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aplicarCoberturas, elegirRepartidor } from "@/lib/asignacion";
import { diaDeRD } from "@/lib/periodoPago";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { formatearTelefono, normalizarTelefonoRD } from "@/lib/telefono";

const ESTADOS_PENDIENTES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];

export interface EstadoRecibir {
  ok?: boolean;
  error?: string;
  resumen?: { guia: string; nombre: string; sector: string; repartidor: string };
}

const Entrada = z.object({
  guia: z.string().trim().min(3, "Escribe el número de guía."),
  nombre: z.string().trim().min(3, "Escribe el nombre tal como aparece en la etiqueta."),
  telefono: z.string().trim().min(1, "Escribe el teléfono."),
  direccion: z.string().trim().optional(),
  sectorId: z.string().uuid().optional(),
  contenido: z.string().trim().optional(),
  voluminoso: z.boolean(),
});

export async function registrarPaquete(
  _anterior: EstadoRecibir,
  formData: FormData
): Promise<EstadoRecibir> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No tienes permiso para recibir paquetes." };

  const campo = (nombre: string) => {
    const valor = formData.get(nombre);
    return typeof valor === "string" && valor !== "" ? valor : undefined;
  };

  const entrada = Entrada.safeParse({
    guia: campo("guia") ?? "",
    nombre: campo("nombre") ?? "",
    telefono: campo("telefono") ?? "",
    direccion: campo("direccion"),
    sectorId: campo("sectorId"),
    contenido: campo("contenido"),
    voluminoso: formData.get("voluminoso") === "on",
  });
  if (!entrada.success) return { error: entrada.error.issues[0].message };
  const datos = entrada.data;

  const telefono = normalizarTelefonoRD(datos.telefono);
  if (!telefono) {
    return { error: "El teléfono no es válido. Debe ser de RD (809, 829 o 849) con 10 dígitos." };
  }

  const supabase = await createClient();

  const { data: repetido } = await supabase
    .from("paquetes")
    .select("id")
    .eq("numero_guia", datos.guia)
    .maybeSingle();
  if (repetido) return { error: `La guía ${datos.guia} ya fue registrada.` };

  // Una persona = nombre + teléfono (una familia puede compartir teléfono)
  const { data: mismosTelefono } = await supabase
    .from("destinatarios")
    .select("id, nombre")
    .eq("telefono", telefono);
  const clave = (nombre: string) => nombre.trim().toLowerCase();
  const existente = (mismosTelefono ?? []).find((d) => clave(d.nombre) === clave(datos.nombre));

  let destinatarioId: string;
  if (existente) {
    destinatarioId = existente.id;
    const cambios = {
      ...(datos.direccion ? { direccion_texto: datos.direccion } : {}),
      ...(datos.sectorId ? { sector_id: datos.sectorId } : {}),
    };
    if (Object.keys(cambios).length > 0) {
      await supabase.from("destinatarios").update(cambios).eq("id", destinatarioId);
    }
  } else {
    const { data: nuevo, error } = await supabase
      .from("destinatarios")
      .insert({
        nombre: datos.nombre,
        telefono,
        direccion_texto: datos.direccion ?? null,
        sector_id: datos.sectorId ?? null,
      })
      .select("id")
      .single();
    if (error || !nuevo) return { error: "No se pudo guardar al destinatario. Intenta de nuevo." };
    destinatarioId = nuevo.id;
  }

  // Asignación automática: dueño del sector (o el de menos carga si es rotativo)
  const hoy = diaDeRD(new Date());
  const [{ data: rutas }, { data: admin }, { data: pendientes }, { data: coberturas }] = await Promise.all([
    datos.sectorId
      ? supabase
          .from("repartidor_sectores")
          .select("repartidor_id, repartidores!inner(activo, rol)")
          .eq("sector_id", datos.sectorId)
          .eq("repartidores.activo", true)
          .eq("repartidores.rol", "repartidor")
      : Promise.resolve({ data: [] }),
    supabase.from("repartidores").select("id").eq("rol", "administrador").eq("activo", true).limit(1),
    supabase.from("paquetes").select("repartidor_asignado_id").in("estado", ESTADOS_PENDIENTES).not("repartidor_asignado_id", "is", null),
    // Ausencias que se están cubriendo hoy: el paquete del que falta va a quien lo cubre
    supabase.from("coberturas").select("ausente_id, cubre_id").lte("desde", hoy).gte("hasta", hoy).is("terminada_en", null),
  ]);

  const cargaActual: Record<string, number> = {};
  for (const p of pendientes ?? []) {
    cargaActual[p.repartidor_asignado_id] = (cargaActual[p.repartidor_asignado_id] ?? 0) + 1;
  }

  const repartidorId = elegirRepartidor({
    voluminoso: datos.voluminoso,
    administradorId: admin?.[0]?.id ?? null,
    duenosDelSector: aplicarCoberturas(
      (rutas ?? []).map((r: { repartidor_id: string }) => r.repartidor_id),
      (coberturas ?? []).map((c: { ausente_id: string; cubre_id: string }) => ({ ausenteId: c.ausente_id, cubreId: c.cubre_id }))
    ),
    cargaActual,
  });

  const { error: errorPaquete } = await supabase.from("paquetes").insert({
    numero_guia: datos.guia,
    destinatario_id: destinatarioId,
    nombre_etiqueta: datos.nombre,
    contenido: datos.contenido ?? null,
    voluminoso: datos.voluminoso,
    sector_id: datos.sectorId ?? null,
    repartidor_asignado_id: repartidorId,
  });
  if (errorPaquete) return { error: "No se pudo guardar el paquete. Intenta de nuevo." };

  const [{ data: sector }, { data: repartidor }] = await Promise.all([
    datos.sectorId ? supabase.from("sectores").select("nombre").eq("id", datos.sectorId).maybeSingle() : Promise.resolve({ data: null }),
    repartidorId ? supabase.from("repartidores").select("nombre").eq("id", repartidorId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  revalidatePath("/paquetes");
  return {
    ok: true,
    resumen: {
      guia: datos.guia,
      nombre: `${datos.nombre} · ${formatearTelefono(telefono)}`,
      sector: sector?.nombre ?? "Sin sector",
      repartidor: repartidor?.nombre ?? "Sin asignar",
    },
  };
}
