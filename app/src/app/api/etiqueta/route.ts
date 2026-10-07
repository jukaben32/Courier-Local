import { NextResponse } from "next/server";
import { z } from "zod";
import { IaNoConfigurada, leerEtiqueta } from "@/lib/etiqueta";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;

const Entrada = z.object({
  imagen: z.string().min(1),
  tipo: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export async function POST(request: Request) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const entrada = Entrada.safeParse(await request.json().catch(() => null));
  if (!entrada.success) {
    return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });
  }
  // base64 pesa ~4/3 del archivo original
  if (entrada.data.imagen.length * 0.75 > MAX_BYTES) {
    return NextResponse.json({ error: "La foto es muy pesada (máximo 5 MB)." }, { status: 413 });
  }

  const supabase = await createClient();
  const { data: sectores } = await supabase.from("sectores").select("nombre").order("nombre");

  try {
    const datos = await leerEtiqueta(
      entrada.data.imagen,
      entrada.data.tipo,
      (sectores ?? []).map((s) => s.nombre)
    );
    return NextResponse.json({ datos });
  } catch (error) {
    if (error instanceof IaNoConfigurada) {
      return NextResponse.json(
        { error: "La lectura con IA aún no está activada. Escribe los datos a mano." },
        { status: 503 }
      );
    }
    console.error("Error leyendo etiqueta:", error);
    return NextResponse.json(
      { error: "No se pudo leer la etiqueta. Escribe los datos a mano." },
      { status: 502 }
    );
  }
}
