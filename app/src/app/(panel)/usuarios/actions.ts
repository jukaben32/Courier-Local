"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EstadoUsuario {
  error?: string;
  /** Contraseña temporal: se muestra una sola vez, no queda guardada en ninguna parte. */
  clave?: string;
  correo?: string;
}

const BLOQUEO_PERMANENTE = "876000h";

const claveTemporal = () => randomBytes(9).toString("base64url");

async function soloDueno() {
  const usuario = await obtenerUsuarioActual();
  return usuario?.rol === "dueno" ? usuario : null;
}

const Nuevo = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre."),
  correo: z.string().trim().toLowerCase().email("El correo no es válido."),
  rol: z.enum(["dueno", "organizador", "repartidor"]),
  repartidorId: z.string().uuid().optional(),
});

export async function crearUsuario(_anterior: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  if (!(await soloDueno())) return { error: "Solo el dueño puede crear usuarios." };

  const repartidor = formData.get("repartidorId");
  const entrada = Nuevo.safeParse({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    rol: formData.get("rol"),
    repartidorId: typeof repartidor === "string" && repartidor ? repartidor : undefined,
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

  const { error: errorFicha } = await admin.from("usuarios").insert({
    id: data.user.id,
    nombre: datos.nombre,
    rol: datos.rol,
    repartidor_id: datos.rol === "repartidor" ? datos.repartidorId : null,
  });
  if (errorFicha) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: errorFicha.message.includes("duplicate") ? "Ese repartidor ya tiene un usuario." : "No se pudo guardar el usuario." };
  }

  revalidatePath("/usuarios");
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

  const admin = createAdminClient();
  const { error } = await admin.from("usuarios").update({ activo }).eq("id", usuarioId);
  if (error) return { error: "No se pudo cambiar el estado." };

  // Además de la ficha, se bloquea el acceso para que no pueda renovar su sesión
  await admin.auth.admin.updateUserById(usuarioId, { ban_duration: activo ? "none" : BLOQUEO_PERMANENTE });

  revalidatePath("/usuarios");
  return {};
}
