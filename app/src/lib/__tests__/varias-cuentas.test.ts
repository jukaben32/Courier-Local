import { describe, expect, it } from "vitest";
import { configOpenWA, configsOpenWA, MAX_CUENTAS, sesionesOpenWA } from "../whatsapp/proveedor";
import { repartirCola, type CupoCuenta, type PersonaEnCola } from "../whatsapp/reparto";

const ENTORNO = { OPENWA_URL: "http://localhost:2785/", OPENWA_API_KEY: "clave" };

describe("cuentas de WhatsApp configuradas", () => {
  it("sigue aceptando una sola sesión (OPENWA_SESSION_ID)", () => {
    expect(sesionesOpenWA({ OPENWA_SESSION_ID: "a" })).toEqual(["a"]);
    expect(configOpenWA({ ...ENTORNO, OPENWA_SESSION_ID: "a" })).toEqual({
      url: "http://localhost:2785",
      apiKey: "clave",
      sessionId: "a",
    });
  });

  it("lee varias sesiones separadas por coma, sin espacios ni repetidas", () => {
    expect(sesionesOpenWA({ OPENWA_SESSION_IDS: " a, b ,a,,c" })).toEqual(["a", "b", "c"]);
  });

  it("OPENWA_SESSION_IDS manda sobre OPENWA_SESSION_ID", () => {
    expect(sesionesOpenWA({ OPENWA_SESSION_IDS: "x,y", OPENWA_SESSION_ID: "a" })).toEqual(["x", "y"]);
  });

  it("usa como máximo 5 cuentas", () => {
    const ids = sesionesOpenWA({ OPENWA_SESSION_IDS: "1,2,3,4,5,6,7" });
    expect(ids).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids).toHaveLength(MAX_CUENTAS);
  });

  it("devuelve una configuración por cuenta, o ninguna si falta la URL o la clave", () => {
    expect(configsOpenWA({ ...ENTORNO, OPENWA_SESSION_IDS: "a,b" }).map((c) => c.sessionId)).toEqual(["a", "b"]);
    expect(configsOpenWA({ OPENWA_SESSION_IDS: "a,b" })).toEqual([]);
    expect(configOpenWA({ ...ENTORNO })).toBeNull();
  });
});

const persona = (telefono: string, preferida?: string): PersonaEnCola => ({ telefono, preferida });
const cuenta = (sesion: string, cupo: number, extra: Partial<CupoCuenta> = {}): CupoCuenta => ({
  sesion,
  cupo,
  enviadosHoy: 0,
  caida: false,
  ...extra,
});
const telefonos = (m: Map<string, PersonaEnCola[]>, sesion: string) => m.get(sesion)!.map((p) => p.telefono);

describe("reparto de la cola entre cuentas", () => {
  it("reparte parejo a las personas nuevas", () => {
    const cola = ["1", "2", "3", "4"].map((t) => persona(t));
    const r = repartirCola(cola, [cuenta("a", 2), cuenta("b", 2)]);
    expect(telefonos(r, "a")).toHaveLength(2);
    expect(telefonos(r, "b")).toHaveLength(2);
  });

  it("respeta el cupo de cada cuenta", () => {
    const cola = ["1", "2", "3", "4", "5"].map((t) => persona(t));
    const r = repartirCola(cola, [cuenta("a", 1), cuenta("b", 2)]);
    expect(telefonos(r, "a")).toHaveLength(1);
    expect(telefonos(r, "b")).toHaveLength(2);
  });

  it("prefiere la cuenta con menos envíos hoy", () => {
    const r = repartirCola([persona("1")], [cuenta("a", 3, { enviadosHoy: 50 }), cuenta("b", 3, { enviadosHoy: 10 })]);
    expect(telefonos(r, "b")).toEqual(["1"]);
    expect(telefonos(r, "a")).toEqual([]);
  });

  it("cada persona sigue con la cuenta que ya le escribió", () => {
    const r = repartirCola([persona("1", "b"), persona("2", "a"), persona("3", "b")], [cuenta("a", 3), cuenta("b", 3)]);
    expect(telefonos(r, "a")).toEqual(["2"]);
    expect(telefonos(r, "b")).toEqual(["1", "3"]);
  });

  it("si su cuenta está caída, la persona pasa a otra", () => {
    const r = repartirCola([persona("1", "a")], [cuenta("a", 0, { caida: true }), cuenta("b", 2)]);
    expect(telefonos(r, "b")).toEqual(["1"]);
  });

  it("si su cuenta solo está en pausa o sin cupo, espera su turno (no cambia de cuenta)", () => {
    const sinCupo = repartirCola([persona("1", "a")], [cuenta("a", 0), cuenta("b", 2)]);
    expect(telefonos(sinCupo, "a")).toEqual([]);
    expect(telefonos(sinCupo, "b")).toEqual([]);

    const llena = repartirCola([persona("1", "a"), persona("2", "a")], [cuenta("a", 1), cuenta("b", 2)]);
    expect(telefonos(llena, "a")).toEqual(["1"]);
    expect(telefonos(llena, "b")).toEqual([]);
  });

  it("ignora una cuenta preferida que ya no está configurada", () => {
    const r = repartirCola([persona("1", "vieja")], [cuenta("a", 1)]);
    expect(telefonos(r, "a")).toEqual(["1"]);
  });

  it("no manda nada si todas las cuentas están caídas", () => {
    const r = repartirCola([persona("1")], [cuenta("a", 0, { caida: true }), cuenta("b", 0, { caida: true })]);
    expect(telefonos(r, "a")).toEqual([]);
    expect(telefonos(r, "b")).toEqual([]);
  });
});

describe("respuestas de los clientes por varias cuentas", () => {
  it("el evento entrante indica la cuenta que lo recibió, y se procesa igual", async () => {
    const { interpretarEventoOpenWA } = await import("../whatsapp/openwa");
    const evento = (sessionId?: string) =>
      interpretarEventoOpenWA({
        event: "message.received",
        idempotencyKey: "k1",
        ...(sessionId ? { sessionId } : {}),
        data: { type: "chat", body: "3", chatId: "18295550123@c.us", senderPhone: "18295550123", kind: "individual" },
      });
    expect(evento("cuenta-b")).toMatchObject({ clase: "entrante", telefono: "8295550123", texto: "3", sesionId: "cuenta-b" });
    expect(evento("cuenta-a")).toMatchObject({ clase: "entrante", telefono: "8295550123", texto: "3" });
    expect(evento()).not.toHaveProperty("sesionId");
  });
});
