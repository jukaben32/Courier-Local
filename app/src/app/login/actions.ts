"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface EstadoLogin {
  error?: string;
}

export async function iniciarSesion(
  _anterior: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const correo = formData.get("correo");
  const clave = formData.get("clave");

  if (typeof correo !== "string" || typeof clave !== "string" || !correo || !clave) {
    return { error: "Escribe tu correo y tu contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });

  if (error) return { error: "Correo o contraseña incorrectos." };

  redirect("/");
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
