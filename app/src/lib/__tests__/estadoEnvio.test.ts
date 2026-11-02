import { describe, expect, it } from "vitest";
import { evaluarEstadoEnvio, type EntradaEstadoEnvio, type SesionEstado } from "../estadoEnvio";
import { ritmoDesdeEntorno } from "../whatsapp/proveedor";

// 11:00 am en RD (UTC-4)
const AHORA = new Date("2026-10-31T15:00:00Z");
const lista = (nombre: string): SesionEstado => ({ nombre, telefono: "18490000000", estado: "ready", lista: true });
const caida = (nombre: string): SesionEstado => ({ nombre, telefono: null, estado: "qr_ready", lista: false });

const base = (extra: Partial<EntradaEstadoEnvio> = {}): EntradaEstadoEnvio => ({
  sesiones: [lista("courier2")],
  enCola: 20,
  avisadosHoy: 10,
  fallidosHoy: 0,
  ultimoAviso: "2026-10-31T14:58:00Z",
  ahora: AHORA,
  ritmo: ritmoDesdeEntorno({}),
  ...extra,
});

describe("evaluarEstadoEnvio", () => {
  it("todo bien: verde y hora estimada de fin", () => {
    const r = evaluarEstadoEnvio(base());
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0]).toMatchObject({ nivel: "verde" });
    expect(r.alertas[0].texto).toContain("terminaría hacia las");
    expect(r.terminaHacia).not.toBeNull();
  });

  it("sin cola: nada pendiente", () => {
    expect(evaluarEstadoEnvio(base({ enCola: 0 })).alertas).toEqual([{ nivel: "verde", texto: "No hay avisos pendientes." }]);
  });

  it("ninguna cuenta conectada es rojo", () => {
    const r = evaluarEstadoEnvio(base({ sesiones: [caida("courier2")] }));
    expect(r.alertas[0]).toMatchObject({ nivel: "rojo" });
    expect(r.alertas[0].texto).toContain("Ninguna cuenta");
    expect(r.terminaHacia).toBeNull();
  });

  it("una cuenta caída entre varias es ámbar y nombra cuál", () => {
    const r = evaluarEstadoEnvio(base({ sesiones: [lista("a"), caida("b"), lista("c")] }));
    expect(r.alertas[0]).toMatchObject({ nivel: "ambar" });
    expect(r.alertas[0].texto).toContain("b (qr_ready)");
    expect(r.listas).toBe(2);
  });

  it("con cola, sesión lista y sin enviar hace 10 minutos o más: parece detenido", () => {
    const r = evaluarEstadoEnvio(base({ ultimoAviso: "2026-10-31T14:40:00Z" }));
    expect(r.alertas[0]).toMatchObject({ nivel: "rojo" });
    expect(r.alertas[0].texto).toContain("hace 20 minutos");
  });

  it("si todavía no ha salido ninguno hoy, avisa que se encienda el programador", () => {
    const r = evaluarEstadoEnvio(base({ ultimoAviso: null }));
    expect(r.alertas[0].texto).toContain("npm run programador");
  });

  it("fuera de horario no es un fallo, es una espera", () => {
    const r = evaluarEstadoEnvio(base({ ahora: new Date("2026-10-31T01:00:00Z"), ultimoAviso: "2026-10-30T22:00:00Z" }));
    expect(r.alertas[0]).toMatchObject({ nivel: "ambar" });
    expect(r.alertas[0].texto).toContain("Fuera del horario");
    expect(r.terminaHacia).toBeNull();
  });

  it("muchos fallos se avisan", () => {
    const r = evaluarEstadoEnvio(base({ fallidosHoy: 7 }));
    expect(r.alertas.some((a) => a.texto.includes("7 avisos fallaron"))).toBe(true);
  });

  it("si no se puede consultar OpenWA lo dice sin dar por caído el envío", () => {
    const r = evaluarEstadoEnvio(base({ sesiones: null }));
    expect(r.alertas[0]).toMatchObject({ nivel: "ambar" });
    expect(r.alertas[0].texto).toContain("No se pudo consultar OpenWA");
  });

  it("más cuentas conectadas terminan antes", () => {
    const una = evaluarEstadoEnvio(base({ enCola: 200 })).terminaHacia!;
    const cinco = evaluarEstadoEnvio(base({ enCola: 200, sesiones: ["a", "b", "c", "d", "e"].map(lista) })).terminaHacia!;
    expect(cinco < una).toBe(true);
  });
});
