"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fijarAcceso } from "@/lib/accesoUsuario";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EstadoUsuario {
  error?: string;
  /** Contraseña temporal: se muestra una sola vez, no queda guardada en ninguna parte. */
  clave?: string;
  correo?: string;
  /** Algo que la oficina debe saber (por ejemplo, paquetes que quedaron sin repartidor). */
  aviso?: string;
}

const claveTemporal = () => randomBytes(9).toString("base64url");

async function soloDueno() {
  const usuario = await obtenerUsuarioActual();
  return usuario?.rol === "dueno" ? usuario : null;
}

const Nuevo = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre."),
  correo: z.string().trim().toLowerCase().email("El correo no es válido."),
  rol: z.enum(["dueno", "organizador", "repartidor"]),
  repartidorId: z.union([z.string().uuid(), z.literal("nuevo")]).optional(),
  esSuplente: z.boolean().default(false),
});

export async function crearUsuario(_anterior: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  if (!(await soloDueno())) return { error: "Solo el dueño puede crear usuarios." };

  const repartidor = formData.get("repartidorId");
  const entrada = Nuevo.safeParse({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    rol: formData.get("rol"),
    repartidorId: typeof repartidor === "string" && repartidor ? repartidor : undefined,
    esSuplente: formData.get("esSuplente") === "on",
  });
  if (!entrada.success) return { error: entrada.error.issues[0].message };
  const datos = entrada.data;

  if (datos.rol === "repartidor" && !datos.repartidorId) return { error: "Elige a qué repartidor corresponde este usuario." };

  const admin = createAdminClient();
  const clave = claveTemporal();
  const { data, error } = await admin.auth.admin.createUser({ email: datos.correo, password: clave, email_confirm: true });
  if (error || !data.user) {
    return { error: error?.message.includes("already") ? "Ya existe un usuario con ese correo." : "No se pudo crear el usuario." };
  }

  // Repartidor que todavía no existe en el sistema: se crea su ficha, sin sectores fijos
  let fichaNuevaId: string | null = null;
  if (datos.rol === "repartidor" && datos.repartidorId === "nuevo") {
    const { data: ficha, error: errorNuevo } = await admin
      .from("repartidores")
      .insert({ nombre: datos.nombre, rol: "repartidor", es_suplente: datos.esSuplente })
      .select("id")
      .single();
    if (errorNuevo || !ficha) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: "No se pudo registrar al repartidor." };
    }
    fichaNuevaId = ficha.id;
  }

  const repartidorId = datos.rol === "repartidor" ? (fichaNuevaId ?? datos.repartidorId) : null;
  const { error: errorFicha } = await admin.from("usuarios").insert({
    id: data.user.id,
    nombre: datos.nombre,
    rol: datos.rol,
    repartidor_id: repartidorId,
  });
  if (errorFicha) {
    // Se deshace todo lo creado para no dejar datos a medias
    if (fichaNuevaId) await admin.from("repartidores").delete().eq("id", fichaNuevaId);
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: errorFicha.message.includes("duplicate") ? "Ese repartidor ya tiene un usuario." : "No se pudo guardar el usuario." };
  }

  revalidatePath("/usuarios");
  revalidatePath("/repartidores");
  return { correo: datos.correo, clave };
}

export async function reiniciarClave(usuarioId: string): Promise<EstadoUsuario> {
  if (!(await soloDueno()) || !z.string().uuid().safeParse(usuarioId).success) return { error: "No autorizado." };

  const clave = claveTemporal();
  const { data, error } = await createAdminClient().auth.admin.updateUserById(usuarioId, { password: clave });
  if (error || !data.user) return { error: "No se pudo reiniciar la contraseña." };
  return { correo: data.user.email ?? undefined, clave };
}

export async function cambiarActivo(usuarioId: string, activo: boolean): Promise<EstadoUsuario> {
  const dueno = await soloDueno();
  if (!dueno || !z.string().uuid().safeParse(usuarioId).success) return { error: "No autorizado." };
  if (usuarioId === dueno.id) return { error: "No puedes desactivarte a ti mismo." };

  const resultado = await fijarAcceso(createAdminClient(), usuarioId, activo);
  if (resultado.error) return { error: resultado.error };

  revalidatePath("/usuarios");
  revalidatePath("/repartidores");
  const huerfanos = resultado.paquetesHuerfanos ?? 0;
  return huerfanos > 0
    ? { aviso: `Quedaron ${huerfanos} paquetes pendientes a su nombre. Pásalos a otro repartidor en "Repartidores" → cobertura.` }
    : {};
}
