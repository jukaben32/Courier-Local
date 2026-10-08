"use client";

import { useActionState, useState } from "react";
import { crearUsuario, type EstadoUsuario } from "./actions";

const ESTADO_INICIAL: EstadoUsuario = {};

export function FormularioUsuario({ repartidoresLibres }: { repartidoresLibres: { id: string; nombre: string }[] }) {
  const [estado, accion, pendiente] = useActionState(crearUsuario, ESTADO_INICIAL);
  const [rol, setRol] = useState("organizador");
  const [ficha, setFicha] = useState("");
  const [copiado, setCopiado] = useState(false);

  const campo = "w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5";

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-4">
      <form action={accion} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre" className="mb-1 block text-sm font-medium">Nombre</label>
          <input id="nombre" name="nombre" required className={campo} />
        </div>
        <div>
          <label htmlFor="correo" className="mb-1 block text-sm font-medium">Correo</label>
          <input id="correo" name="correo" type="email" required className={campo} />
        </div>
        <div>
          <label htmlFor="rol" className="mb-1 block text-sm font-medium">Rol</label>
          <select id="rol" name="rol" value={rol} onChange={(e) => setRol(e.target.value)} className={campo}>
            <option value="organizador">Organizador (recibe paquetes y ve el panel)</option>
            <option value="repartidor">Repartidor (usa la app de la ruta)</option>
            <option value="dueno">Dueño (ve además los pagos y los usuarios)</option>
          </select>
        </div>
        {rol === "repartidor" && (
          <div>
            <label htmlFor="repartidorId" className="mb-1 block text-sm font-medium">Repartidor</label>
            <select id="repartidorId" name="repartidorId" required value={ficha} onChange={(e) => setFicha(e.target.value)} className={campo}>
              <option value="">Elegir…</option>
              <option value="nuevo">➕ Repartidor nuevo (aún no está en el sistema)</option>
              {repartidoresLibres.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
        )}
        {rol === "repartidor" && ficha === "nuevo" && (
          <label className="flex items-start gap-3 rounded-lg border border-linea bg-fondo/60 p-3 text-sm sm:col-span-2">
            <input type="checkbox" name="esSuplente" className="mt-1 size-4" />
            <span>
              <b>Es el repartidor suplente (de emergencia).</b> No tiene sectores fijos: entra cuando otro falla o se está entrenando por si alguien sale. Si no la marcas, queda como un repartidor normal sin rutas asignadas.
            </span>
          </label>
        )}
        <div className="sm:col-span-2">
          {estado.error && <p role="alert" className="mb-2 text-sm font-medium text-rojo">{estado.error}</p>}
          <button type="submit" disabled={pendiente} className="rounded-lg bg-tinta px-5 py-3 font-semibold text-white disabled:opacity-60">
            {pendiente ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>

      {estado.clave && (
        <div role="status" className="rounded-xl border-2 border-verde bg-verde/10 p-4">
          <p className="font-semibold">Usuario creado: {estado.correo}</p>
          <p className="mt-1 text-sm text-tinta-2">Contraseña temporal (solo se muestra ahora; no queda guardada):</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="rounded bg-tarjeta px-3 py-2 font-mono text-lg">{estado.clave}</code>
            <button type="button" onClick={() => copiar(estado.clave!)} className="rounded-lg border border-linea bg-tarjeta px-3 py-2 text-sm font-semibold">
              {copiado ? "Copiada ✓" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
