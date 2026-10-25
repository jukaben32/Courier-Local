import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { enviarTanda } from "@/lib/whatsapp/tanda";

// Una tanda del envío espaciado (OpenWA). La llama el programador local cada ~2 minutos.
// Protegida con CRON_SECRET: sin esa clave configurada rechaza todo.
export const maxDuration = 300;

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
    return NextResponse.json({ ok: true, ...(await enviarTanda()) });
  } catch (error) {
    console.error("Error en la tanda de envío:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

export const GET = ejecutar;
export const POST = ejecutar;
