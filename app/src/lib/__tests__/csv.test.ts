import { describe, expect, it } from "vitest";
import { aCsv } from "../csv";

const columnas = [
  { clave: "guia", titulo: "Guía" },
  { clave: "nombre", titulo: "Destinatario" },
  { clave: "grande", titulo: "Grande" },
  { clave: "cedula", titulo: "Cédula" },
];

describe("aCsv", () => {
  it("empieza con la marca UTF-8 y los títulos, y termina cada fila con salto de línea", () => {
    const csv = aCsv(columnas, [{ guia: "SP1", nombre: "Ana Pérez", grande: false, cedula: "02301535932" }]);
    expect(csv).toBe("﻿Guía,Destinatario,Grande,Cédula\r\nSP1,Ana Pérez,No,02301535932\r\n");
  });

  it("encierra entre comillas lo que lleva comas, comillas o saltos de línea", () => {
    const csv = aCsv(columnas, [{ guia: "SP2", nombre: 'Luis "El Rápido", Gómez', grande: true, cedula: null }]);
    expect(csv).toContain('SP2,"Luis ""El Rápido"", Gómez",Sí,');
  });

  it("lo vacío queda vacío y sin filas solo hay títulos", () => {
    expect(aCsv(columnas, [{ guia: "SP3" }])).toContain("SP3,,,\r\n");
    expect(aCsv(columnas, [])).toBe("﻿Guía,Destinatario,Grande,Cédula\r\n\r\n".replace("\r\n\r\n", "\r\n"));
  });
});
