"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { validarCedulaRD } from "@/lib/cedula";
import { verificarCedulaDelPaquete } from "@/lib/verificarCedula";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ResultadoVerificacion {
  ok?: string;
  error?: string;
}

const Id = z.string().uuid();

async function entregaPendiente(entregaId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("entregas")
    .select("id, foto_cedula_destinatario_url, verificacion, paquetes(nombre_etiqueta, destinatario_id)")
    .eq("id", entregaId)
    .eq("verificacion", "pendiente")
    .maybeSingle();
  return data as unknown as {
    id: string;
    foto_cedula_destinatario_url: string | null;
    paquetes: { nombre_etiqueta: string; destinatario_id: string } | null;
  } | null;
}

/** Vuelve a leer la cédula con la IA, ahora que quizá ya funciona. */
export async function reintentarVerificacion(entregaId: string): Promise<ResultadoVerificacion> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario) || !Id.safeParse(entregaId).success) return { error: "No tienes permiso." };

  const entrega = await entregaPendiente(entregaId);
  if (!entrega?.foto_cedula_destinatario_url || !entrega.paquetes) return { error: "Esa entrega ya no está pendiente." };

  const admin = createAdminClient();
  const { data: archivo } = await admin.storage.from("evidencias").download(entrega.foto_cedula_destinatario_url);
  if (!archivo) return { error: "No se encontró la foto (puede haberse borrado a los 90 días)." };
  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");

  const r = await verificarCedulaDelPaquete(base64, entrega.paquetes.nombre_etiqueta, "oficina");
  if (!r.ok) {
    return {
      error:
        r.codigo === "sin_ia" || r.codigo === "error_ia"
          ? "La lectura automática sigue sin funcionar. Mira la foto y apruébala a mano."
          : r.error,
    };
  }

  await admin
    .from("entregas")
    .update({ verificacion: "verificada", cedula_coincide: true, nombre_en_cedula: r.nombre, cedula_leida: r.numero })
    .eq("id", entregaId);
  await admin.from("destinatarios").update({ cedula: r.numero }).eq("id", entrega.paquetes.destinatario_id).is("cedula", null);

  revalidatePath("/entregas");
  return { ok: "Verificada: la cédula coincide con el paquete." };
}

/**
 * La oficina mira la foto y da la cédula por buena. Queda anotado quién la aprobó. Si escribe el número
 * (opcional), se valida y se guarda en la ficha del cliente para llenar la columna Cédula.
 */
export async function aprobarVerificacion(entregaId: string, cedulaEscrita?: string): Promise<ResultadoVerificacion> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario) || !Id.safeParse(entregaId).success) return { error: "No tienes permiso." };
  const entrega = await entregaPendiente(entregaId);
  if (!entrega) return { error: "Esa entrega ya no está pendiente." };

  const escrita = cedulaEscrita?.trim();
  const numero = escrita ? validarCedulaRD(escrita) : null;
  if (escrita && !numero) return { error: "Esa cédula no es válida: revisa los 11 dígitos." };

  const { error } = await createAdminClient()
    .from("entregas")
    .update({
      verificacion: "verificada",
      cedula_coincide: true,
      ...(numero ? { cedula_leida: numero } : {}),
      excepcion_motivo: "Verificada a mano por la oficina (la lectura automática no estaba disponible)",
      excepcion_autorizada_por: usuario.id,
    })
    .eq("id", entregaId);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  if (numero && entrega.paquetes) {
    await createAdminClient().from("destinatarios").update({ cedula: numero }).eq("id", entrega.paquetes.destinatario_id).is("cedula", null);
  }

  revalidatePath("/entregas");
  return { ok: "Aprobada." };
}
