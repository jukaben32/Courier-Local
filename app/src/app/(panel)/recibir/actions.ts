"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { cargarContextoAsignacion, guardarPaquete } from "@/lib/registroPaquete";
import { createClient } from "@/lib/supabase/server";
import { formatearTelefono, normalizarTelefonoRD } from "@/lib/telefono";

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
  const contexto = await cargarContextoAsignacion(supabase, datos.sectorId ? [datos.sectorId] : []);
  const guardado = await guardarPaquete(supabase, { ...datos, telefono }, contexto);
  if (!guardado.ok) return { error: guardado.error };
  const repartidorId = guardado.repartidorId;

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
