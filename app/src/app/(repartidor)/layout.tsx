import Link from "next/link";
import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { BotonSalir } from "./BotonSalir";
import { SincronizadorEntregas } from "./SincronizadorEntregas";

export default async function LayoutRepartidor({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioActual();
  // Sin usuario activo (sesión vencida o usuario desactivado) se cierra la sesión
  if (!usuario) redirect("/salir");
  if (usuario.rol !== "repartidor" || !usuario.repartidorId) redirect("/paquetes");

  return (
    <div className="mx-auto min-h-screen max-w-lg">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-tinta px-4 py-3 text-white">
        <Link href="/ruta" className="font-display text-lg font-semibold">Mi ruta</Link>
        <form action={cerrarSesion} className="flex items-center gap-3 text-sm">
          <span className="text-white/70">{usuario.nombre}</span>
          <BotonSalir />
        </form>
      </header>
      <main className="px-4 py-5">
        <SincronizadorEntregas />
        {children}
      </main>
    </div>
  );
}
