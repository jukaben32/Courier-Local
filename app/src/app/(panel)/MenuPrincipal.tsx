"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Enlace {
  href: string;
  texto: string;
}

interface Grupo {
  /** Título del encabezado; sin título = enlace suelto (el Resumen). */
  titulo?: string;
  enlaces: Enlace[];
}

// Agrupado por lo que se hace en el día: preparar, repartir, entregar y administrar.
// "Recibir paquetes" ya no está en el menú: la entrada de paquetes es Importar listado.
const GRUPOS: Grupo[] = [
  { enlaces: [{ href: "/", texto: "Resumen" }] },
  {
    titulo: "Preparación",
    enlaces: [
      { href: "/importar", texto: "Importar listado" },
      { href: "/paquetes", texto: "Paquetes" },
      { href: "/en-vivo", texto: "En vivo" },
    ],
  },
  { titulo: "Reparto", enlaces: [{ href: "/repartidores", texto: "Repartidores" }] },
  {
    titulo: "Entrega",
    enlaces: [
      { href: "/retiros", texto: "Retiros" },
      { href: "/excepciones", texto: "Excepciones" },
      { href: "/cierre", texto: "Cierre del día" },
    ],
  },
];
const GRUPO_DUENO: Grupo = {
  titulo: "Administración",
  enlaces: [
    { href: "/pagos", texto: "Pagos y bonos" },
    { href: "/usuarios", texto: "Usuarios" },
  ],
};
const GRUPO_SIMULADOR: Grupo = { titulo: "Pruebas", enlaces: [{ href: "/simulador", texto: "Simulador" }] };

export function MenuPrincipal({ simulado, esDueno, excepcionesPendientes }: { simulado: boolean; esDueno: boolean; excepcionesPendientes: number }) {
  const ruta = usePathname();
  const grupos = [...GRUPOS, ...(esDueno ? [GRUPO_DUENO] : []), ...(simulado ? [GRUPO_SIMULADOR] : [])];

  return (
    <nav aria-label="Principal" className="deslizable flex items-center gap-1">
      {grupos.map((grupo, i) => (
        <div
          key={grupo.titulo ?? "inicio"}
          role="group"
          aria-label={grupo.titulo}
          className={`flex shrink-0 items-center gap-1 ${i > 0 ? "ml-2 border-l border-white/15 pl-3" : ""}`}
        >
          {grupo.titulo && <span className="select-none text-[10px] font-semibold uppercase tracking-widest text-white/45">{grupo.titulo}</span>}
          {grupo.enlaces.map((enlace) => {
            // "/" (Resumen) solo está activo en la raíz; si no, todas las pantallas lo marcarían
            const activo = enlace.href === "/" ? ruta === "/" : ruta.startsWith(enlace.href);
            return (
              <Link
                key={enlace.href}
                href={enlace.href}
                aria-current={activo ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition md:py-1.5 ${
                  activo ? "bg-acento text-[#1a0900]" : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {enlace.texto}
                {enlace.href === "/excepciones" && excepcionesPendientes > 0 && (
                  <span className="ml-1.5 rounded-full bg-rojo px-1.5 py-0.5 text-[11px] font-bold text-white">{excepcionesPendientes}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
