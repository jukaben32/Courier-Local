import { redirect } from "next/navigation";
import { TarjetaRepartidor, type FilaBono, type ParametrosBono } from "@/components/TarjetaRepartidor";
import { resumenPagos, type EntregaPagable, type PaqueteAsignado } from "@/lib/ganancias";
import { leerTodo } from "@/lib/paginar";
import { diaDeRD, limitesPeriodo } from "@/lib/periodoPago";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ESTADOS_POR_ENTREGAR = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];

interface FilaEntrega {
  creado_en: string;
  tarifa_aplicada: number | string | null;
  cargado_en_courier: boolean;
}
interface FilaPaquete {
  fecha_recibido: string;
}

/** El resumen personal de cada repartidor: lo que entregó, lo que ha ganado y cómo va su índice. */
export default async function PaginaMiResumen() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario?.repartidorId) redirect("/ruta");

  const ahora = new Date();
  const supabase = await createClient();
  const base = resumenPagos({ repartidores: [], entregas: [], paquetes: [] }, ahora);
  const desde = limitesPeriodo(base.periodoAnterior.inicio).desde;
  const mes = `${diaDeRD(ahora).slice(0, 7)}-01`;

  // Cada consulta devuelve solo lo suyo: la base no le deja ver las entregas ni los paquetes de otros
  const [entregasDb, paquetesDb, { data: repartidor }, { data: bono }, { data: parametros }] = await Promise.all([
    leerTodo<FilaEntrega>((a, b) =>
      supabase
        .from("entregas")
        .select("creado_en, tarifa_aplicada, cargado_en_courier")
        .eq("resultado", "entregado")
        .eq("tipo", "domicilio")
        .or(`creado_en.gte.${desde},cargado_en_courier.eq.false`)
        .order("id")
        .range(a, b)
    ),
    leerTodo<FilaPaquete>((a, b) =>
      supabase.from("paquetes").select("fecha_recibido").in("estado", ESTADOS_POR_ENTREGAR).order("id").range(a, b)
    ),
    supabase.from("repartidores").select("id, nombre, rol").eq("id", usuario.repartidorId).maybeSingle(),
    supabase.from("bonos_mensuales").select("*").eq("mes", mes).eq("repartidor_id", usuario.repartidorId).maybeSingle(),
    supabase.from("parametros_bono").select("volumen_minimo_mensual, umbral_bono_mensual").limit(1).maybeSingle(),
  ]);

  const yo = { id: usuario.repartidorId, nombre: repartidor?.nombre ?? usuario.nombre, rol: repartidor?.rol ?? "repartidor" };
  const entregas = entregasDb.map<EntregaPagable>((e) => ({
    repartidorId: yo.id,
    creadoEn: e.creado_en,
    tarifa: e.tarifa_aplicada === null ? null : Number(e.tarifa_aplicada),
    cargadoEnCourier: e.cargado_en_courier,
  }));
  const paquetes = paquetesDb.map<PaqueteAsignado>((p) => ({ repartidorId: yo.id, fechaRecibido: p.fecha_recibido }));
  const resumen = resumenPagos({ repartidores: [yo], entregas, paquetes }, ahora);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Mi resumen</h1>
        <p className="text-sm text-tinta-2">Lo que llevas entregado y ganado. Se cobra el 10 y el 25.</p>
      </div>
      <TarjetaRepartidor
        fila={resumen.repartidores[0]}
        bono={(bono ?? undefined) as FilaBono | undefined}
        parametros={parametros as ParametrosBono | null}
        periodoActual={resumen.periodoActual}
        periodoAnterior={resumen.periodoAnterior}
        verDinero
      />
    </div>
  );
}
