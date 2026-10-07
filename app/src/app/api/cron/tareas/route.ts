import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ejecutarTareas } from "@/lib/tareas";

// Tareas programadas: cierra los paquetes vencidos y manda los recordatorios.
// Se llama cada 15 minutos desde un programador externo (Supabase pg_cron o Vercel Cron).
// Va protegida con una clave secreta: sin CRON_SECRET configurada rechaza todo.
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const recibido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${secreto}`;
  return recibido.length === esperado.length && timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

async function ejecutar(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, ...(await ejecutarTareas()) });
  } catch (error) {
    console.error("Error en las tareas programadas:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

export const GET = ejecutar;
export const POST = ejecutar;
