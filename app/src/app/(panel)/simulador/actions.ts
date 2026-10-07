"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizarTelefonoRD } from "@/lib/telefono";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { whatsappSimulado } from "@/lib/whatsapp/cliente";
import { procesarEntrante } from "@/lib/whatsapp/conversacion";
import type { Entrante } from "@/lib/whatsapp/mensajes";

const Respuesta = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("accion"), accion: z.string().min(1) }),
  z.object({ tipo: z.literal("franja"), codigo: z.string().min(1) }),
  z.object({ tipo: z.literal("ubicacion"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  z.object({ tipo: z.literal("texto"), texto: z.string().min(1).max(500) }),
]);

export type RespuestaSimulada = z.infer<typeof Respuesta>;

/** Hace lo mismo que hará el webhook de YCloud cuando un cliente toque un botón o escriba. */
export async function simularRespuesta(telefono: string, respuesta: RespuestaSimulada): Promise<string> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return "No tienes permiso.";
  if (!whatsappSimulado()) return "El simulador solo funciona mientras WhatsApp está en modo prueba.";

  const numero = normalizarTelefonoRD(telefono);
  const datos = Respuesta.safeParse(respuesta);
  if (!numero || !datos.success) return "Datos inválidos.";

  await procesarEntrante({ telefono: numero, ...datos.data } as Entrante);
  revalidatePath("/simulador");
  revalidatePath("/paquetes");
  return "Respuesta enviada.";
}
