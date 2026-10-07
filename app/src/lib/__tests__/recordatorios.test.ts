import { describe, expect, it } from "vitest";
import { CONFIG_POR_DEFECTO, configDesdeEntorno, decidirRecordatorios, type CandidatoRecordatorio } from "../recordatorios";

// 18:30 UTC = 14:30 en RD (lunes 5 de octubre de 2026)
const AHORA = new Date("2026-10-05T18:30:00Z");

const candidato = (cambios: Partial<CandidatoRecordatorio> = {}): CandidatoRecordatorio => ({
  destinatarioId: "d1",
  telefono: "8095550000",
  nombreEtiqueta: "Maria Perez",
  guias: ["G1"],
  fechaRecibido: "2026-10-05T16:00:00Z", // 12:00 del mismo día
  ultimoMensajeEn: "2026-10-05T16:45:00Z", // 12:45
  mensajesEnviados: 1,
  ultimoFallo: false,
  recordatoriosHoy: 0,
  ...cambios,
});

describe("decidirRecordatorios", () => {
  it("el mismo día recuerda pasados 90 minutos del aviso", () => {
    const r = decidirRecordatorios([candidato()], AHORA, CONFIG_POR_DEFECTO);
    expect(r).toHaveLength(1);
    expect(r[0].plantilla).toBe("recordatorio");
  });

  it("no recuerda antes de cumplirse el intervalo", () => {
    expect(decidirRecordatorios([candidato({ ultimoMensajeEn: "2026-10-05T17:30:00Z" })], AHORA, CONFIG_POR_DEFECTO)).toHaveLength(0);
  });

  it("no escribe de noche ni de madrugada", () => {
    const noche = new Date("2026-10-06T02:00:00Z"); // 22:00 en RD
    const madrugada = new Date("2026-10-06T09:00:00Z"); // 05:00 en RD
    expect(decidirRecordatorios([candidato()], noche, CONFIG_POR_DEFECTO)).toHaveLength(0);
    expect(decidirRecordatorios([candidato({ fechaRecibido: "2026-10-05T16:00:00Z" })], madrugada, CONFIG_POR_DEFECTO)).toHaveLength(0);
  });

  it("después de la hora límite no manda recordatorios del mismo día", () => {
    const tarde = new Date("2026-10-05T21:00:00Z"); // 17:00 en RD
    expect(decidirRecordatorios([candidato()], tarde, CONFIG_POR_DEFECTO)).toHaveLength(0);
  });

  it("al día siguiente manda recordatorio a las 8 am aunque haya pasado poco desde el aviso", () => {
    const manana8 = new Date("2026-10-06T12:00:00Z"); // 08:00 en RD
    const r = decidirRecordatorios([candidato()], manana8, CONFIG_POR_DEFECTO);
    expect(r).toHaveLength(1);
    expect(r[0].plantilla).toBe("recordatorio");
  });

  it("el tercer día usa el mensaje de último día", () => {
    const dia3 = new Date("2026-10-07T12:00:00Z");
    const r = decidirRecordatorios([candidato({ ultimoMensajeEn: "2026-10-06T12:00:00Z", mensajesEnviados: 2 })], dia3, CONFIG_POR_DEFECTO);
    expect(r[0].plantilla).toBe("ultimoDia");
  });

  it("no manda a paquetes vencidos, con aviso fallido, sin aviso previo ni al llegar al tope", () => {
    const dia4 = new Date("2026-10-08T14:00:00Z");
    expect(decidirRecordatorios([candidato()], dia4, CONFIG_POR_DEFECTO)).toHaveLength(0);
    expect(decidirRecordatorios([candidato({ ultimoFallo: true })], AHORA, CONFIG_POR_DEFECTO)).toHaveLength(0);
    expect(decidirRecordatorios([candidato({ ultimoMensajeEn: null })], AHORA, CONFIG_POR_DEFECTO)).toHaveLength(0);
    expect(decidirRecordatorios([candidato({ mensajesEnviados: 4 })], AHORA, CONFIG_POR_DEFECTO)).toHaveLength(0);
  });

  it("un recordatorio por día como máximo", () => {
    expect(decidirRecordatorios([candidato({ recordatoriosHoy: 1 })], AHORA, CONFIG_POR_DEFECTO)).toHaveLength(0);
  });
});

describe("configDesdeEntorno", () => {
  it("usa los valores por defecto y acepta cambios por variables de entorno", () => {
    expect(configDesdeEntorno({})).toEqual(CONFIG_POR_DEFECTO);
    expect(configDesdeEntorno({ RECORDATORIO_MINUTOS: "60", RECORDATORIO_HORA_HASTA: "20", RECORDATORIO_MAXIMO_MENSAJES: "abc" })).toEqual({
      ...CONFIG_POR_DEFECTO,
      minutosPrimero: 60,
      horaHasta: 20,
    });
  });
});
