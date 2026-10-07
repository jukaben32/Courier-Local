import { describe, expect, it, vi } from "vitest";
import { cuerpoBotones, cuerpoPlantilla, enviarMensajes, type ConfigEnvio, type MensajeSaliente } from "../whatsapp/envio";
import { firmaYCloudValida } from "../whatsapp/firma";
import {
  franjasDisponibles,
  interpretarEvento,
  opcionesFranjas,
  tituloFranja,
  type Franja,
} from "../whatsapp/mensajes";
import { PLANTILLAS, accionDeBoton, parametrosAvisoLlegada, textoGuias } from "../whatsapp/plantillas";
import { createHmac } from "node:crypto";

const FRANJAS: Franja[] = [
  { codigo: "AM", hora_inicio: "09:00:00", hora_fin: "12:00:00" },
  { codigo: "MID", hora_inicio: "12:00:00", hora_fin: "15:00:00" },
  { codigo: "PM", hora_inicio: "15:00:00", hora_fin: "18:00:00" },
];

describe("franjas", () => {
  it("el día del camión (12:30) ya no ofrece la mañana", () => {
    expect(franjasDisponibles(FRANJAS, "12:30").map((f) => f.codigo)).toEqual(["MID", "PM"]);
    expect(franjasDisponibles(FRANJAS, "19:00")).toHaveLength(0);
  });

  it("los títulos de botón caben en 20 caracteres", () => {
    expect(tituloFranja(FRANJAS[0])).toBe("9:00 am a 12:00 pm");
    for (const f of FRANJAS) expect(tituloFranja(f).length).toBeLessThanOrEqual(20);
    expect(opcionesFranjas(FRANJAS).map((o) => o.id)).toEqual(["franja:AM", "franja:MID", "franja:PM"]);
  });
});

describe("plantillas", () => {
  it("cada plantilla tiene un ejemplo por cada hueco {{n}} y botones de hasta 25 caracteres", () => {
    for (const p of Object.values(PLANTILLAS)) {
      const huecos = new Set(p.cuerpo.match(/\{\{\d+\}\}/g) ?? []);
      expect(p.ejemplos).toHaveLength(huecos.size);
      for (const b of p.botones) expect(b.texto.length).toBeLessThanOrEqual(25);
    }
  });

  it("arma los valores del aviso con una o varias guías", () => {
    expect(textoGuias(["A1"])).toBe("guía A1");
    expect(textoGuias(["A1", "A2"])).toBe("2 paquetes: A1, A2");
    expect(textoGuias(["A", "B", "C", "D"])).toBe("4 paquetes");
    expect(parametrosAvisoLlegada("María Pérez", ["A1"])).toEqual(["María", "guía A1", "María Pérez"]);
  });

  it("reconoce el botón tocado aunque cambien tildes o mayúsculas", () => {
    expect(accionDeBoton("Reprogramar entrega")).toBe("coordinar");
    expect(accionDeBoton("12:00 PM a 3:00 pm")).toBe("franja:MID");
    expect(accionDeBoton("PASO A BUSCARLO")).toBe("retiro");
    expect(accionDeBoton("Otra persona lo recibe")).toBe("otra_persona");
    expect(accionDeBoton("Reprogramar entrega")).toBe("coordinar");
    expect(accionDeBoton("hola")).toBeNull();
  });
});

describe("interpretarEvento (webhook de YCloud)", () => {
  const entrante = (mensaje: object) => ({
    id: "evt_1",
    type: "whatsapp.inbound_message.received",
    whatsappInboundMessage: { from: "+18295550123", ...mensaje },
  });

  it("entiende botón de plantilla, botón interactivo, ubicación y texto", () => {
    expect(interpretarEvento(entrante({ type: "button", button: { text: "Reprogramar entrega" } }))).toEqual({
      eventoId: "evt_1", clase: "entrante", entrante: { telefono: "8295550123", tipo: "accion", accion: "coordinar" },
    });
    expect(interpretarEvento(entrante({ type: "button", button: { text: "3:00 pm a 6:00 pm" } }))).toMatchObject({
      entrante: { tipo: "franja", codigo: "PM" },
    });
    expect(interpretarEvento(entrante({ type: "interactive", interactive: { button_reply: { id: "franja:PM" } } }))).toMatchObject({
      entrante: { tipo: "franja", codigo: "PM" },
    });
    expect(interpretarEvento(entrante({ type: "location", location: { latitude: 18.45, longitude: -69.3 } }))).toMatchObject({
      entrante: { tipo: "ubicacion", lat: 18.45, lng: -69.3 },
    });
    expect(interpretarEvento(entrante({ type: "text", text: { body: "hola" } }))).toMatchObject({
      entrante: { tipo: "texto", texto: "hola" },
    });
  });

  it("ignora números de otro país y deja entrante en null", () => {
    const e = interpretarEvento({ ...entrante({ type: "text", text: { body: "x" } }), whatsappInboundMessage: { from: "+573001234567", type: "text", text: { body: "x" } } });
    expect(e).toMatchObject({ clase: "entrante", entrante: null });
  });

  it("traduce los estados de entrega", () => {
    const e = interpretarEvento({ id: "evt_2", type: "whatsapp.message.updated", whatsappMessage: { id: "m1", status: "failed", errorMessage: "No existe" } });
    expect(e).toEqual({ eventoId: "evt_2", clase: "estado", mensajeId: "m1", estado: "fallido", error: "No existe" });
    expect(interpretarEvento({ id: "evt_3", type: "whatsapp.message.updated", whatsappMessage: { id: "m1", status: "read" } })).toMatchObject({ estado: "leido" });
    expect(interpretarEvento({ id: "evt_4", type: "otra.cosa" })).toBeNull();
    expect(interpretarEvento(null)).toBeNull();
  });
});

describe("firmaYCloudValida", () => {
  const secreto = "whsec_prueba";
  const cuerpo = '{"id":"evt_1"}';
  const firmar = (t: string) => `t=${t},s=${createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex")}`;

  it("acepta la firma correcta y rechaza cuerpos alterados, firmas falsas y secretos vacíos", () => {
    expect(firmaYCloudValida(cuerpo, firmar("1700000000"), secreto)).toBe(true);
    expect(firmaYCloudValida('{"id":"evt_2"}', firmar("1700000000"), secreto)).toBe(false);
    expect(firmaYCloudValida(cuerpo, `t=1700000000,s=${"a".repeat(64)}`, secreto)).toBe(false);
    expect(firmaYCloudValida(cuerpo, null, secreto)).toBe(false);
    expect(firmaYCloudValida(cuerpo, firmar("1700000000"), "")).toBe(false);
  });
});

describe("enviarMensajes (envío masivo)", () => {
  const mensajes = (n: number): MensajeSaliente[] =>
    Array.from({ length: n }, (_, i) => ({ telefono: `829555${String(i).padStart(4, "0")}`, cuerpo: cuerpoPlantilla("aviso_paquete_llegada", ["A", "B", "C"]) }));
  const respuestaOk = (id: string) => new Response(JSON.stringify({ id }), { status: 200 });
  const base: Omit<ConfigEnvio, "fetchFn"> = { apiKey: "k", desde: "+18095550000", esperar: async () => {} };

  it("envía 300 mensajes sin pasar del límite de peticiones simultáneas y en orden", async () => {
    let activas = 0;
    let maxActivas = 0;
    let llamadas = 0;
    const fetchFn = vi.fn(async () => {
      activas += 1;
      llamadas += 1;
      maxActivas = Math.max(maxActivas, activas);
      await new Promise((r) => setTimeout(r, 1));
      activas -= 1;
      return respuestaOk(`id-${llamadas}`);
    }) as unknown as typeof fetch;

    const resultados = await enviarMensajes(mensajes(300), { ...base, fetchFn, concurrencia: 25 });
    expect(resultados).toHaveLength(300);
    expect(resultados.every((r) => r.ok && r.id)).toBe(true);
    expect(maxActivas).toBeLessThanOrEqual(25);
    expect(maxActivas).toBeGreaterThan(1);
  });

  it("reintenta cuando YCloud pide esperar (429) y respeta Retry-After", async () => {
    const esperar = vi.fn(async () => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(respuestaOk("x1")) as unknown as typeof fetch;
    const [r] = await enviarMensajes(mensajes(1), { ...base, fetchFn, esperar });
    expect(r).toEqual({ ok: true, id: "x1" });
    expect(esperar).toHaveBeenCalledWith(2000);
  });

  it("un número inválido (4xx) falla sin reintentos y no frena a los demás", async () => {
    let llamada = 0;
    const fetchFn = vi.fn(async () => {
      llamada += 1;
      return llamada === 2
        ? new Response(JSON.stringify({ error: { message: "Número inválido" } }), { status: 400 })
        : respuestaOk(`ok-${llamada}`);
    }) as unknown as typeof fetch;
    const r = await enviarMensajes(mensajes(3), { ...base, fetchFn, concurrencia: 1 });
    expect(r.map((x) => x.ok)).toEqual([true, false, true]);
    expect(r[1].error).toBe("Número inválido");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("agota los reintentos con errores 500 y manda el X-API-Key", async () => {
    const mock = vi.fn(async () => new Response("{}", { status: 503 }));
    const [r] = await enviarMensajes(mensajes(1), { ...base, fetchFn: mock as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(mock).toHaveBeenCalledTimes(4);
    const init = (mock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("k");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "+18095550000", to: "+18295550000", type: "template" });
  });

  it("limita los botones a 3", () => {
    expect(() => cuerpoBotones("x", [])).toThrow();
    expect(() => cuerpoBotones("x", Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, titulo: "a" })))).toThrow();
  });
});
