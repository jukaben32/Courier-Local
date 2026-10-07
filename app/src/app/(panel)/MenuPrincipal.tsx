"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/recibir", texto: "Recibir paquetes" },
  { href: "/paquetes", texto: "Paquetes" },
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
    <nav aria-label="Principal" className="flex gap-1">
      {enlaces.map((enlace) => {
        const activo = ruta.startsWith(enlace.href);
        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            aria-current={activo ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
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
