"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fijarAcceso } from "@/lib/accesoUsuario";
import { diaDeRD } from "@/lib/periodoPago";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface EstadoCobertura {
  error?: string;
  mensaje?: string;
}

const ESTADOS_MOVIBLES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];
const MAX_DIAS_COBERTURA = 14;
const MAX_PAQUETES_ENTRENAMIENTO = 50;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const CODIGO_DUPLICADO = "23505";

const id = z.string().uuid("Elige a las personas de la lista.");
const textoMotivo = z.string().trim().max(200).optional();

function refrescar() {
  revalidatePath("/repartidores");
  revalidatePath("/paquetes");
  revalidatePath("/");
}

/** Los dos deben ser repartidores activos (no el administrador de la minivan). */
async function nombresValidos(ids: string[]): Promise<Map<string, string> | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("repartidores").select("id, nombre").in("id", ids).eq("rol", "repartidor").eq("activo", true);
  return data && data.length === new Set(ids).size ? new Map(data.map((r: { id: string; nombre: string }) => [r.id, r.nombre])) : null;
}

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo);
  return typeof valor === "string" && valor !== "" ? valor : undefined;
};

/** Hoy falta alguien: sus paquetes pendientes pasan a quien lo cubre, y los que lleguen hoy también. */
export async function cubrirAusencia(_anterior: EstadoCobertura, formData: FormData): Promise<EstadoCobertura> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No autorizado." };

  const entrada = z
    .object({ ausenteId: id, cubreId: id, hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), motivo: textoMotivo })
    .safeParse({
      ausenteId: textoDe(formData, "ausenteId"),
      cubreId: textoDe(formData, "cubreId"),
      hasta: textoDe(formData, "hasta"),
      motivo: textoDe(formData, "motivo"),
    });
  if (!entrada.success) return { error: entrada.error.issues[0].message };
  const { ausenteId, cubreId, hasta, motivo } = entrada.data;
  if (ausenteId === cubreId) return { error: "Quien falta y quien lo cubre no pueden ser la misma persona." };

  const hoy = diaDeRD(new Date());
  const limite = diaDeRD(new Date(Date.now() + MAX_DIAS_COBERTURA * MS_POR_DIA));
  if (hasta && (hasta < hoy || hasta > limite)) return { error: `La fecha debe estar entre hoy y los próximos ${MAX_DIAS_COBERTURA} días.` };

  const nombres = await nombresValidos([ausenteId, cubreId]);
  if (!nombres) return { error: "Los dos deben ser repartidores activos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cubrir_ausencia", { p_ausente: ausenteId, p_cubre: cubreId, p_hasta: hasta ?? hoy, p_motivo: motivo ?? null });
  if (error) {
    return { error: error.code === CODIGO_DUPLICADO ? `${nombres.get(ausenteId)} ya tiene una cobertura abierta. Termínala primero.` : "No se pudo registrar la cobertura." };
  }

  refrescar();
  const movidos = Number(data ?? 0);
  return { mensaje: `Listo: ${nombres.get(cubreId)} cubre a ${nombres.get(ausenteId)}. ${movidos} ${movidos === 1 ? "paquete pasó" : "paquetes pasaron"} a ${nombres.get(cubreId)}.` };
}

/** Vuelve el repartidor que faltaba: los paquetes nuevos le llegan otra vez a él (los que ya pasaron se quedan donde están). */
export async function terminarCobertura(coberturaId: string): Promise<EstadoCobertura> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario) || !id.safeParse(coberturaId).success) return { error: "No autorizado." };

  const supabase = await createClient();
  const { error } = await supabase.from("coberturas").update({ terminada_en: new Date().toISOString() }).eq("id", coberturaId).is("terminada_en", null);
  if (error) return { error: "No se pudo terminar la cobertura." };

  refrescar();
  return { mensaje: "Cobertura terminada." };
}

/** Entrenamiento: le pasa unos pocos paquetes a otro repartidor, sin dejar a nadie ausente. */
export async function pasarPaquetes(_anterior: EstadoCobertura, formData: FormData): Promise<EstadoCobertura> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No autorizado." };

  const entrada = z
    .object({ desdeId: id, haciaId: id, cantidad: z.coerce.number().int().min(1, "Escribe cuántos paquetes.").max(MAX_PAQUETES_ENTRENAMIENTO) })
    .safeParse({ desdeId: textoDe(formData, "desdeId"), haciaId: textoDe(formData, "haciaId"), cantidad: textoDe(formData, "cantidad") });
  if (!entrada.success) return { error: entrada.error.issues[0].message };
  const { desdeId, haciaId, cantidad } = entrada.data;
  if (desdeId === haciaId) return { error: "Elige dos personas distintas." };

  const nombres = await nombresValidos([desdeId, haciaId]);
  if (!nombres) return { error: "Los dos deben ser repartidores activos." };

  const supabase = await createClient();
  const { data: candidatos } = await supabase
    .from("paquetes")
    .select("id")
    .eq("repartidor_asignado_id", desdeId)
    .in("estado", ESTADOS_MOVIBLES)
    .order("fecha_recibido")
    .limit(cantidad);
  const ids = (candidatos ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return { error: `${nombres.get(desdeId)} no tiene paquetes pendientes para pasar.` };

  const { error } = await supabase.from("paquetes").update({ repartidor_asignado_id: haciaId }).in("id", ids);
  if (error) return { error: "No se pudieron pasar los paquetes." };

  refrescar();
  return { mensaje: `${ids.length} ${ids.length === 1 ? "paquete pasó" : "paquetes pasaron"} de ${nombres.get(desdeId)} a ${nombres.get(haciaId)}.` };
}

/** Definitivo: el que entra hereda las rutas y los paquetes del que sale, y este queda dado de baja. Solo el dueño. */
export async function reemplazarRepartidor(_anterior: EstadoCobertura, formData: FormData): Promise<EstadoCobertura> {
  const usuario = await obtenerUsuarioActual();
  if (usuario?.rol !== "dueno") return { error: "Solo el dueño puede reemplazar a un repartidor." };

  const entrada = z
    .object({ salienteId: id, entranteId: id, confirmo: z.literal("on", { error: "Marca la casilla para confirmar." }) })
    .safeParse({ salienteId: textoDe(formData, "salienteId"), entranteId: textoDe(formData, "entranteId"), confirmo: textoDe(formData, "confirmo") });
  if (!entrada.success) return { error: entrada.error.issues[0].message };
  const { salienteId, entranteId } = entrada.data;
  if (salienteId === entranteId) return { error: "Elige dos personas distintas." };

  const nombres = await nombresValidos([salienteId, entranteId]);
  if (!nombres) return { error: "Los dos deben ser repartidores activos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reemplazar_repartidor", { p_saliente: salienteId, p_entrante: entranteId });
  if (error) return { error: "No se pudo hacer el reemplazo. No se cambió nada." };

  // El que sale pierde el acceso a la app
  const admin = createAdminClient();
  const { data: cuenta } = await admin.from("usuarios").select("id").eq("repartidor_id", salienteId).maybeSingle();
  if (cuenta) await fijarAcceso(admin, cuenta.id, false);

  refrescar();
  revalidatePath("/usuarios");
  const movidos = Number(data ?? 0);
  return { mensaje: `${nombres.get(entranteId)} heredó las rutas de ${nombres.get(salienteId)} y recibió ${movidos} ${movidos === 1 ? "paquete pendiente" : "paquetes pendientes"}. ${nombres.get(salienteId)} quedó dado de baja.` };
}
