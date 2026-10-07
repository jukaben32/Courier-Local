import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccionesUsuario } from "./AccionesUsuario";
import { FormularioUsuario } from "./FormularioUsuario";

export const dynamic = "force-dynamic";

const TEXTO_ROL = { dueno: "Dueño", organizador: "Organizador", repartidor: "Repartidor" } as const;

interface FilaUsuario {
  id: string;
  nombre: string;
  rol: keyof typeof TEXTO_ROL;
  activo: boolean;
  repartidor_id: string | null;
}

export default async function PaginaUsuarios() {
  const actual = await obtenerUsuarioActual();
  if (actual?.rol !== "dueno") redirect("/paquetes");

  const admin = createAdminClient();
  const [{ data: fichas }, { data: autenticacion }, { data: repartidores }] = await Promise.all([
    admin.from("usuarios").select("id, nombre, rol, activo, repartidor_id").order("rol").order("nombre"),
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from("repartidores").select("id, nombre").eq("rol", "repartidor").eq("activo", true).order("nombre"),
  ]);

  const correos = new Map((autenticacion?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const usuarios = (fichas ?? []) as FilaUsuario[];
  const vinculados = new Set(usuarios.map((u) => u.repartidor_id).filter(Boolean));
  const repartidoresLibres = (repartidores ?? []).filter((r: { id: string }) => !vinculados.has(r.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Usuarios</h1>
        <p className="text-sm text-tinta-2">Quién puede entrar al sistema y con qué permisos. Al desactivar a alguien pierde el acceso al instante.</p>
      </div>

      <section className="overflow-x-auto rounded-xl border border-linea bg-tarjeta">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-linea bg-fondo/60 text-xs uppercase tracking-wide text-tinta-2">
            <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-linea last:border-0">
                <td className="px-4 py-3 font-medium">{u.nombre}</td>
                <td className="px-4 py-3 text-tinta-2">{correos.get(u.id) ?? "—"}</td>
                <td className="px-4 py-3">{TEXTO_ROL[u.rol]}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.activo ? "bg-verde/15 text-verde" : "bg-rojo/15 text-rojo"}`}>{u.activo ? "Activo" : "Desactivado"}</span>
                </td>
                <td className="px-4 py-3 text-right"><AccionesUsuario usuarioId={u.id} activo={u.activo} esMismoUsuario={u.id === actual.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-linea bg-tarjeta p-5">
        <h2 className="mb-1 text-lg font-semibold">Crear usuario</h2>
        <p className="mb-4 text-sm text-tinta-2">El sistema genera una contraseña temporal que se muestra una sola vez. Entrégasela a la persona para que entre.</p>
        <FormularioUsuario repartidoresLibres={repartidoresLibres} />
      </section>
    </div>
  );
}
