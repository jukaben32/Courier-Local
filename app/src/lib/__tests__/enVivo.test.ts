import { describe, expect, it } from "vitest";
import { esArchivoVisible, horaLegible, resumirConversaciones, type MensajeDelDia, type PaqueteDelCliente } from "../enVivo";

const AHORA = new Date("2026-10-30T16:30:00Z");
const FRANJAS = { MID: "Mediodía (12:00 - 3:00)" };

const msj = (telefono: string, direccion: "entrante" | "saliente", minuto: number, extra: Partial<MensajeDelDia> = {}): MensajeDelDia => ({
  id: `${telefono}-${direccion}-${minuto}`,
  telefono,
  direccion,
  tipo: direccion === "saliente" ? "aviso" : "respuesta",
  estado: "entregado",
  contenido: null,
  creado_en: `2026-10-30T16:${String(minuto).padStart(2, "0")}:00+00:00`,
  proveedor_id: null,
  ...extra,
});
const paquete = (telefono: string, extra: Partial<PaqueteDelCliente> = {}): PaqueteDelCliente => ({
  telefono,
  numero_guia: `G-${telefono}`,
  nombre_etiqueta: `Cliente ${telefono}`,
  estado: "notificado",
  ventana_horaria: null,
  hora_preferida: null,
  tiene_ubicacion: false,
  sector: "Miramar",
  ...extra,
});

describe("resumirConversaciones", () => {
  it("avisado sin respuesta: esperando, con el estado del aviso", () => {
    const [f] = resumirConversaciones([msj("1", "saliente", 0, { estado: "leido" })], [paquete("1")], FRANJAS, AHORA);
    expect(f).toMatchObject({ estado: "esperando", aviso: "leido", nombre: "Cliente 1", ultimoDelCliente: null });
  });

  it("eligió horario: confirmado, con la hora y su respuesta tal cual", () => {
    const [f] = resumirConversaciones(
      [msj("1", "saliente", 0), msj("1", "entrante", 5, { contenido: "2" }), msj("1", "saliente", 5, { tipo: "ubicacion" })],
      [paquete("1", { estado: "confirmado", ventana_horaria: "MID", hora_preferida: "13:00:00" })],
      FRANJAS,
      AHORA
    );
    expect(f).toMatchObject({ estado: "confirmado", eligio: "1:00 pm", ultimoDelCliente: { texto: "2" } });
  });

  it("escribió algo que el sistema no contestó: necesita atención, y va primero", () => {
    const filas = resumirConversaciones(
      [msj("1", "saliente", 0), msj("2", "saliente", 1), msj("2", "entrante", 20, { contenido: "No estoy en casa" })],
      [paquete("1"), paquete("2")],
      FRANJAS,
      AHORA
    );
    expect(filas.map((f) => [f.telefono, f.estado])).toEqual([
      ["2", "atencion"],
      ["1", "esperando"],
    ]);
  });

  it("no marca atención mientras la respuesta automática puede estar saliendo", () => {
    const [f] = resumirConversaciones([msj("1", "saliente", 0), msj("1", "entrante", 29, { contenido: "Hola" })], [paquete("1")], FRANJAS, AHORA);
    expect(f.estado).toBe("respondio");
  });

  it("aviso que no salió: fallido", () => {
    const [f] = resumirConversaciones([msj("1", "saliente", 0, { estado: "fallido" })], [paquete("1")], FRANJAS, AHORA);
    expect(f).toMatchObject({ estado: "fallido", aviso: "fallido" });
  });

  it("cuenta las fotos y videos de la casa que se pueden abrir", () => {
    const foto = msj("1", "entrante", 3, { contenido: "[foto]", proveedor_id: "99@lid|false_99@lid_A" });
    const audio = msj("1", "entrante", 4, { contenido: "[nota de voz]" });
    const [f] = resumirConversaciones([msj("1", "saliente", 0), foto, audio, msj("1", "saliente", 4)], [paquete("1")], FRANJAS, AHORA);
    expect(f.fotos).toBe(1);
    expect([esArchivoVisible(foto), esArchivoVisible(audio)]).toEqual([true, false]);
  });

  it("sin horario exacto muestra la franja", () => {
    const [f] = resumirConversaciones([msj("1", "saliente", 0)], [paquete("1", { ventana_horaria: "MID" })], FRANJAS, AHORA);
    expect(f.eligio).toBe("Mediodía (12:00 - 3:00)");
  });
});

it("horaLegible", () => {
  expect([horaLegible("09:30:00"), horaLegible("12:00:00"), horaLegible("15:00:00"), horaLegible("00:15:00")]).toEqual(["9:30 am", "12:00 pm", "3:00 pm", "12:15 am"]);
});
