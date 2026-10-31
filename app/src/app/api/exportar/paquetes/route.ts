import { NextResponse } from "next/server";
import { aCsv, type Columna } from "@/lib/csv";
import { leerTodo } from "@/lib/paginar";
import { diaDeRD } from "@/lib/periodoPago";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

// Descarga los paquetes con todo lo que sabemos de cada uno (vista paquetes_enriquecidos), para abrirlo en Excel.
export const maxDuration = 60;

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const DIAS_POR_DEFECTO = 30;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNAS: Columna[] = [
  { clave: "numero_guia", titulo: "Guía" },
  { clave: "destinatario", titulo: "Destinatario" },
  { clave: "telefono", titulo: "Teléfono" },
  { clave: "cedula", titulo: "Cédula" },
  { clave: "direccion", titulo: "Dirección" },
  { clave: "sector", titulo: "Sector" },
  { clave: "zona", titulo: "Zona" },
  { clave: "ubicacion_lat", titulo: "Ubicación (latitud)" },
  { clave: "ubicacion_lng", titulo: "Ubicación (longitud)" },
  { clave: "ubicacion_recibida_en", titulo: "Ubicación recibida" },
  { clave: "estado", titulo: "Estado" },
  { clave: "paquete_grande", titulo: "Paquete grande" },
  { clave: "fecha_recibido", titulo: "Recibido" },
  { clave: "hora_confirmacion", titulo: "Confirmó horario" },
  { clave: "entrega_desde", titulo: "Entrega desde" },
  { clave: "entrega_hasta", titulo: "Entrega hasta" },
  { clave: "dia_entrega", titulo: "Día pedido" },
  { clave: "repartidor", titulo: "Repartidor" },
  { clave: "intentos", titulo: "Intentos" },
  { clave: "fecha_entrega", titulo: "Entregado" },
  { clave: "tipo_entrega", titulo: "Tipo de entrega" },
  { clave: "receptor_es_destinatario", titulo: "Recibió el destinatario" },
  { clave: "receptor_nombre", titulo: "Recibió (si otro)" },
  { clave: "verificacion_cedula", titulo: "Verificación de cédula" },
  { clave: "prueba_subida", titulo: "Prueba subida al courier" },
  { clave: "minutos_hasta_subir_prueba", titulo: "Minutos hasta subir la prueba" },
  { clave: "servicio", titulo: "Servicio" },
  { clave: "manifiesto", titulo: "Manifiesto" },
  { clave: "orden", titulo: "Orden" },
  { clave: "peso", titulo: "Peso" },
  { clave: "estado_en_courier", titulo: "Estado en el courier" },
  { clave: "importado_desde", titulo: "Listado de origen" },
  { clave: "importado_en", titulo: "Importado" },
];

export async function GET(request: Request) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const parametros = new URL(request.url).searchParams;
  const hoy = diaDeRD(new Date());
  const hasta = FECHA.test(parametros.get("hasta") ?? "") ? parametros.get("hasta")! : hoy;
  const desde = FECHA.test(parametros.get("desde") ?? "") ? parametros.get("desde")! : diaDeRD(new Date(Date.now() - DIAS_POR_DEFECTO * MS_POR_DIA));

  const supabase = await createClient();
  try {
    const filas = await leerTodo<Record<string, unknown>>((a, b) =>
      supabase
        .from("paquetes_enriquecidos")
        .select("*")
        .gte("fecha_recibido", `${desde}T00:00:00-04:00`)
        .lte("fecha_recibido", `${hasta}T23:59:59-04:00`)
        .order("fecha_recibido", { ascending: false })
        .order("numero_guia")
        .range(a, b)
    );
    return new Response(aCsv(COLUMNAS, filas), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="paquetes-${desde}_a_${hasta}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo generar el archivo. ¿Se aplicó el SQL 012 en Supabase?" }, { status: 500 });
  }
}
