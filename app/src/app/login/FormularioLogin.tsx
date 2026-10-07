"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./actions";

const ESTADO_INICIAL: EstadoLogin = {};

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="correo" className="mb-1 block text-sm font-medium">
          Correo
        </label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5"
        />
      </div>
      <div>
        <label htmlFor="clave" className="mb-1 block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="clave"
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5"
        />
      </div>
      {estado.error && (
        <p role="alert" className="text-sm font-medium text-rojo">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-lg bg-acento px-4 py-3 font-semibold text-[#1a0900] transition hover:bg-acento-oscuro hover:text-white disabled:opacity-60"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
