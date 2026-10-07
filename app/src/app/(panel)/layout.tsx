import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/login/actions";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { whatsappSimulado } from "@/lib/whatsapp/cliente";
import { MenuPrincipal } from "./MenuPrincipal";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioActual();
  // Sin usuario activo (sesión vencida o usuario desactivado) se cierra la sesión
  if (!usuario) redirect("/salir");

  // Los repartidores tienen su propia app (ruta, entrega y subida de pruebas)
  if (!esOficina(usuario)) redirect("/ruta");

  const supabase = await createClient();
  const { count: excepcionesPendientes } = await supabase
    .from("solicitudes_excepcion")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-tinta text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="font-display text-lg font-semibold tracking-tight">Courier Local</span>
          <MenuPrincipal simulado={whatsappSimulado()} esDueno={usuario.rol === "dueno"} excepcionesPendientes={excepcionesPendientes ?? 0} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-white/70 sm:inline">{usuario.nombre}</span>
            <form action={cerrarSesion}>
              <button className="rounded-md border border-white/20 px-3 py-1.5 hover:bg-white/10">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
