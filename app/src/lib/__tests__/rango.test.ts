import { describe, expect, it } from "vitest";
import { interpretarRespuestaTexto } from "../whatsapp/menu";
import { interpretarRango } from "../whatsapp/rango";

// 8:00 am en RD (UTC-4)
const MAÑANA_TEMPRANO = new Date("2026-10-30T12:00:00Z");
// 2:20 pm en RD
const TARDE = new Date("2026-10-30T18:20:00Z");
// 7:30 pm en RD
const NOCHE = new Date("2026-10-30T23:30:00Z");

const rango = (texto: string, ahora = MAÑANA_TEMPRANO) => interpretarRango(texto, ahora);

describe("interpretarRango", () => {
  it.each([
    ["entre 2 y 4 de la tarde", 14, 16],
    ["entre las 2 y las 4", 14, 16],
    ["de 3 a 5", 15, 17],
    ["De 3 a 5 pm", 15, 17],
    ["entre 10 y 11", 10, 11],
    ["entre las 10am y las 11am", 10, 11],
    ["de 8 a 10 am", 9, 10],
    ["entre 11 y 2", 11, 14],
    ["10 a 2 pm", 10, 14],
    ["12 a 3", 12, 15],
    ["de 2 a 3:30", 14, 16],
    ["entre 2 - 4", 14, 16],
  ])("%s -> %i a %i", (texto, desde, hasta) => {
    expect(rango(texto)).toEqual({ desde, hasta, dia: "hoy" });
  });

  it("una hora suelta es un bloque de una hora", () => {
    expect(rango("a las 4")).toEqual({ desde: 16, hasta: 17, dia: "hoy" });
    expect(rango("4:30 pm")).toEqual({ desde: 16, hasta: 17, dia: "hoy" });
  });

  it("entiende partes del día y 'cualquier hora'", () => {
    expect(rango("por la tarde")).toEqual({ desde: 12, hasta: 18, dia: "hoy" });
    expect(rango("en la mañana")).toEqual({ desde: 9, hasta: 12, dia: "hoy" });
    expect(rango("cualquier hora")).toEqual({ desde: 9, hasta: 19, dia: "hoy" });
    expect(rango("al mediodía")).toEqual({ desde: 12, hasta: 14, dia: "hoy" });
  });

  it("'mañana' suelta es el día siguiente; 'por la mañana' es la parte del día", () => {
    expect(rango("mañana entre 9 y 11")).toEqual({ desde: 9, hasta: 11, dia: "manana" });
    expect(rango("mañana por la tarde")).toEqual({ desde: 12, hasta: 18, dia: "manana" });
    expect(rango("mañana a las 10 am")).toEqual({ desde: 10, hasta: 11, dia: "manana" });
    expect(rango("de 9 a 11 por la mañana")).toEqual({ desde: 9, hasta: 11, dia: "hoy" });
  });

  it("recorta lo que ya pasó hoy y, si todo pasó, lo manda a mañana", () => {
    // Son las 2:20 pm: con 30 min de margen, la primera hora posible son las 3 pm
    expect(rango("entre 1 y 5", TARDE)).toEqual({ desde: 15, hasta: 17, dia: "hoy" });
    expect(rango("entre 10 y 11", TARDE)).toEqual({ desde: 10, hasta: 11, dia: "manana" });
    expect(rango("por la tarde", NOCHE)).toEqual({ desde: 12, hasta: 18, dia: "manana" });
  });

  it("recorta al horario de entrega y rechaza lo que queda fuera", () => {
    expect(rango("entre 5 y 9 pm")).toEqual({ desde: 17, hasta: 19, dia: "hoy" });
    expect(rango("entre 8 y 11 pm")).toBeNull();
  });

  it("no confunde saludos ni mensajes sin hora", () => {
    for (const texto of ["buenas tardes", "Buenas tarde", "hola", "gracias", "ok", "no estoy en casa", "buenos dias"]) {
      expect(rango(texto)).toBeNull();
    }
  });
});

describe("interpretarRespuestaTexto con horas escritas", () => {
  const interpretar = (texto: string, ahora = MAÑANA_TEMPRANO) => interpretarRespuestaTexto(texto, [], undefined, ahora);

  it("una hora escrita llega como rango", () => {
    expect(interpretar("entre 2 y 4 de la tarde")).toEqual({ tipo: "entrante", entrante: { tipo: "rango", desde: 14, hasta: 16, dia: "hoy" } });
  });

  it("pasar por la oficina manda sobre la hora", () => {
    expect(interpretar("paso a buscarlo a las 3")).toMatchObject({ entrante: { tipo: "accion" } });
    expect(interpretar("voy a la oficina")).toMatchObject({ entrante: { tipo: "accion" } });
  });

  it("'otra persona' sin hora es una acción; con hora se toma la hora", () => {
    expect(interpretar("mi esposo lo recibe")).toMatchObject({ entrante: { tipo: "accion" } });
    expect(interpretar("mi esposo lo recibe entre 2 y 4")).toMatchObject({ entrante: { tipo: "rango", desde: 14, hasta: 16 } });
  });

  it("lo que no se entiende es null", () => {
    expect(interpretar("qué hora es")).toBeNull();
  });
});
