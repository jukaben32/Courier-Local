"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// En el orden en que se trabaja el día: importar la lista, revisar y avisar, ver las respuestas,
// repartir entre los repartidores y, al final, lo que pasa durante y después de las entregas.
const ENLACES = [
  { href: "/", texto: "Resumen" },
  { href: "/importar", texto: "Importar listado" },
  { href: "/recibir", texto: "Recibir paquetes" },
  { href: "/paquetes", texto: "Paquetes" },
  { href: "/en-vivo", texto: "En vivo" },
  { href: "/repartidores", texto: "Repartidores" },
  { href: "/retiros", texto: "Retiros" },
  { href: "/excepciones", texto: "Excepciones" },
  { href: "/cierre", texto: "Cierre del día" },
];
const ENLACE_SIMULADOR = { href: "/simulador", texto: "Simulador" };

const ENLACES_DUENO = [
  { href: "/pagos", texto: "Pagos y bonos" },
  { href: "/usuarios", texto: "Usuarios" },
];

export function MenuPrincipal({ simulado, esDueno, excepcionesPendientes }: { simulado: boolean; esDueno: boolean; excepcionesPendientes: number }) {
  const ruta = usePathname();
  const enlaces = [...ENLACES, ...(esDueno ? ENLACES_DUENO : []), ...(simulado ? [ENLACE_SIMULADOR] : [])];

  return (
    <nav aria-label="Principal" className="deslizable flex gap-1">
      {enlaces.map((enlace) => {
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
    </nav>
  );
}
