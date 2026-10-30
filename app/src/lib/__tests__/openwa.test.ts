import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { horaEstimadaFin, pausaEntreMensajes, planificarTanda, type EntradaTanda } from "../whatsapp/goteo";
import {
  bloquesDisponibles,
  columnaDeHora,
  configHorasDesdeEntorno,
  etiquetaBloque,
  franjaDeHora,
  horaDeColumna,
  interpretarHora,
  textoBloque,
} from "../whatsapp/horas";
import { interpretarRespuestaTexto, type OpcionMenu } from "../whatsapp/menu";
import {
  chatIdDeTelefono,
  enviarTextoOpenWA,
  estadoSesionOpenWA,
  firmaOpenWAValida,
  interpretarEventoOpenWA,
} from "../whatsapp/openwa";
import { textoConfirmacionFinal } from "../whatsapp/plantillas";
import { ritmoDesdeEntorno } from "../whatsapp/proveedor";
import { aTextoPlano, cuerpoMenuHoras } from "../whatsapp/textoPlano";
import { textoDePlantilla } from "../whatsapp/textosOpenWA";

// 12:30 pm en República Dominicana (UTC-4) = 16:30 UTC
const MEDIODIA_Y_MEDIA = new Date("2026-10-26T16:30:00Z");

describe("horas exactas", () => {
  it("ofrece los bloques que empiezan al menos 30 min después de ahora", () => {
    expect(bloquesDisponibles(MEDIODIA_Y_MEDIA)).toEqual([13, 14, 15, 16, 17, 18]);
  });

  it("a las 8 am ofrece todo el día desde las 9", () => {
    expect(bloquesDisponibles(new Date("2026-10-26T12:00:00Z"))).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("después de las 6:30 pm ya no queda ningún bloque", () => {
    expect(bloquesDisponibles(new Date("2026-10-26T22:45:00Z"))).toEqual([]);
  });

  it("escribe los bloques como los lee el cliente", () => {
    expect(textoBloque(13)).toBe("entre 1 y 2 pm");
    expect(textoBloque(11)).toBe("entre 11 am y 12 pm");
    expect(etiquetaBloque(16)).toBe("4 pm a 5 pm");
    expect(etiquetaBloque(18)).toBe("6 pm a 7 pm");
  });

  it("guarda y lee la hora de la columna time", () => {
    expect(columnaDeHora(9)).toBe("09:00:00");
    expect(horaDeColumna("16:00:00")).toBe(16);
    expect(horaDeColumna(null)).toBeNull();
  });

  it("asigna la franja fija que contiene la hora", () => {
    expect(franjaDeHora(9)).toBe("AM");
    expect(franjaDeHora(11)).toBe("AM");
    expect(franjaDeHora(12)).toBe("MID");
    expect(franjaDeHora(14)).toBe("MID");
    expect(franjaDeHora(15)).toBe("PM");
    expect(franjaDeHora(18)).toBe("PM");
  });

  it("lee la configuración del entorno y ignora valores inválidos", () => {
    expect(configHorasDesdeEntorno({ ENTREGA_HORA_DESDE: "10", ENTREGA_HORA_HASTA: "17" })).toMatchObject({ desde: 10, hasta: 17 });
    expect(configHorasDesdeEntorno({ ENTREGA_HORA_DESDE: "20", ENTREGA_HORA_HASTA: "9" })).toMatchObject({ desde: 9, hasta: 19 });
    expect(configHorasDesdeEntorno({})).toMatchObject({ desde: 9, hasta: 19 });
  });
});

describe("interpretarHora", () => {
  it.each([
    ["4:30 pm", 16],
    ["4pm", 16],
    ["4 p.m.", 16],
    ["16:00", 16],
    ["a las 4", 16],
    ["a las 4 de la tarde", 16],
    ["las 10 de la mañana", 10],
    ["10 am", 10],
    ["12 pm", 12],
    ["a las 6", 18],
  ])("entiende %s", (texto, hora) => {
    expect(interpretarHora(texto)).toEqual({ hora, fuera: false });
  });

  it("marca como fuera de horario lo que cae antes de las 9 o desde las 7 pm", () => {
    expect(interpretarHora("8 pm")).toEqual({ hora: 20, fuera: true });
    expect(interpretarHora("7pm")).toEqual({ hora: 19, fuera: true });
    expect(interpretarHora("7:00 am")).toEqual({ hora: 7, fuera: true });
  });

  it("un número suelto no es una hora (es la opción del menú)", () => {
    expect(interpretarHora("4")).toEqual({ hora: null, fuera: false });
    expect(interpretarHora("hola buenas")).toEqual({ hora: null, fuera: false });
  });
});

const MENU: OpcionMenu[] = [
  { numero: 1, tipo: "retiro" },
  { numero: 2, tipo: "hora", hora: 13 },
  { numero: 3, tipo: "hora", hora: 14 },
  { numero: 4, tipo: "otra_persona" },
];

describe("interpretarRespuestaTexto", () => {
  const acc = (accion: string) => ({ tipo: "entrante", entrante: { tipo: "accion", accion } });

  it("interpreta el número de una opción, también con emoji o puntuación", () => {
    expect(interpretarRespuestaTexto("1", MENU)).toEqual(acc("retiro"));
    expect(interpretarRespuestaTexto("3", MENU)).toEqual({ tipo: "entrante", entrante: { tipo: "hora", hora: 14 } });
    expect(interpretarRespuestaTexto(" 2️⃣ ", MENU)).toEqual({ tipo: "entrante", entrante: { tipo: "hora", hora: 13 } });
    expect(interpretarRespuestaTexto("4.", MENU)).toEqual(acc("otra_persona"));
  });

  it("un número que no está en el menú no se entiende", () => {
    expect(interpretarRespuestaTexto("9", MENU)).toBeNull();
  });

  it("una hora escrita gana sobre el menú", () => {
    expect(interpretarRespuestaTexto("a las 4:30 pm", MENU)).toEqual({ tipo: "entrante", entrante: { tipo: "hora", hora: 16 } });
  });

  it("entiende palabras clave", () => {
    expect(interpretarRespuestaTexto("paso a buscarlo mañana", MENU)).toEqual(acc("retiro"));
    expect(interpretarRespuestaTexto("lo recibe mi esposa", MENU)).toEqual(acc("otra_persona"));
  });

  it("reconoce el rechazo", () => {
    expect(interpretarRespuestaTexto("NO", MENU)).toEqual({ tipo: "rechazo" });
    expect(interpretarRespuestaTexto("no espero nada", MENU)).toEqual({ tipo: "rechazo" });
    expect(interpretarRespuestaTexto("Número equivocado", MENU)).toEqual({ tipo: "rechazo" });
  });

  it("no responde a conversación normal (la lee una persona)", () => {
    expect(interpretarRespuestaTexto("Hola, ¿quién es?", MENU)).toBeNull();
    expect(interpretarRespuestaTexto("   ", MENU)).toBeNull();
  });
});

describe("textos de OpenWA", () => {
  const params = ["María", "guía CR2026-48213", "María Altagracia Pérez"];

  it("el aviso se presenta y pide ubicación y hora a la vez, solo con horas numeradas", () => {
    const m = textoDePlantilla("aviso_paquete_llegada", params, { ahora: MEDIODIA_Y_MEDIA, azar: () => 0 })!;
    expect(m.texto).toContain("*Filpo Pack*");
    expect(m.texto).toContain("María");
    expect(m.texto).toContain("guía CR2026-48213");
    expect(m.texto).toContain("📍 Tu ubicación");
    expect(m.texto).toContain("🕐 La hora");
    expect(m.texto).toContain("1 - Llévenmelo entre 1 y 2 pm");
    expect(m.texto).toContain("6 - Llévenmelo entre 6 y 7 pm");
    expect(m.texto).not.toContain("oficina");
    expect(m.texto).toContain("foto o video");
    expect(m.texto).toContain("responde NO");
    expect(m.opciones).toEqual([13, 14, 15, 16, 17, 18].map((hora, i) => ({ numero: i + 1, tipo: "hora", hora })));
  });

  it("el texto y las opciones del aviso siempre coinciden en cantidad", () => {
    const m = textoDePlantilla("aviso_paquete_llegada", params, { ahora: MEDIODIA_Y_MEDIA })!;
    const lineas = m.texto.split("\n").filter((l) => /^\d+ - /.test(l));
    expect(lineas).toHaveLength(m.opciones.length);
  });

  it("alterna entre 3 redacciones del aviso", () => {
    const textos = [0, 0.4, 0.9].map((azar) => textoDePlantilla("aviso_paquete_llegada", params, { ahora: MEDIODIA_Y_MEDIA, azar: () => azar })!.texto.split("\n")[0]);
    expect(new Set(textos).size).toBe(3);
  });

  it("si ya no hay horas hoy, no pide nada y avisa que mañana se coordina", () => {
    const m = textoDePlantilla("aviso_paquete_llegada", params, { ahora: new Date("2026-10-26T22:45:00Z") })!;
    expect(m.opciones).toEqual([]);
    expect(m.texto).toContain("mañana a primera hora");
  });

  it("recordatorio y último día ofrecen retiro y horas; en camino y entregado no piden nada", () => {
    expect(textoDePlantilla("recordatorio_coordinar", params.slice(0, 2), { ahora: MEDIODIA_Y_MEDIA })!.opciones[0]).toEqual({ numero: 1, tipo: "retiro" });
    expect(textoDePlantilla("ultimo_dia_paquete", params.slice(0, 2), { ahora: MEDIODIA_Y_MEDIA })!.texto).toContain("último día");
    expect(textoDePlantilla("repartidor_en_camino", params, {})!.opciones).toEqual([]);
    expect(textoDePlantilla("paquete_entregado", ["guía A1"], {})!.opciones).toEqual([]);
    expect(textoDePlantilla("plantilla_que_no_existe", [], {})).toBeNull();
  });

  it("el intento fallido ofrece reprogramar o ir a la oficina", () => {
    const m = textoDePlantilla("intento_fallido_reprogramar", ["María", "guía A1", "2"], {})!;
    expect(m.opciones).toEqual([{ numero: 1, tipo: "coordinar" }, { numero: 2, tipo: "retiro" }]);
  });

  it("usa el remitente configurado", () => {
    const m = textoDePlantilla("aviso_paquete_llegada", params, { ahora: MEDIODIA_Y_MEDIA, remitente: "Otra Marca" })!;
    expect(m.texto).toContain("Otra Marca");
  });
});

describe("mensaje de cierre", () => {
  it("lleva el horario, el repartidor con su teléfono y la cédula", () => {
    const t = textoConfirmacionFinal("1 pm a 2 pm", "María Pérez", { nombre: "Isamar Santana", telefono: "829-555-0123" });
    expect(t).toContain("Te lo lleva Isamar (829-555-0123) en el horario de 1 pm a 2 pm");
    expect(t).toContain("cédula de María Pérez");
    expect(t).toContain("escríbele directo");
  });

  it("sin repartidor o sin teléfono sigue siendo un mensaje correcto", () => {
    expect(textoConfirmacionFinal(null, "Ana", null)).toBe("Listo ✅ Tu repartidor pasará.\nTen a mano la cédula de Ana.");
    const sinTelefono = textoConfirmacionFinal("2 pm a 3 pm", "Ana", { nombre: "Luis Gómez", telefono: null });
    expect(sinTelefono).toContain("Te lo lleva Luis en el horario");
    expect(sinTelefono).not.toContain("escríbele");
  });
});

describe("aTextoPlano", () => {
  it("convierte plantillas, texto libre, pedido de ubicación y menú de horas", () => {
    const plantilla = aTextoPlano(
      { type: "template", template: { name: "paquete_entregado", components: [{ parameters: [{ text: "guía A1" }] }] } },
      {}
    );
    expect(plantilla?.texto).toContain("guía A1");

    expect(aTextoPlano({ type: "text", text: { body: "Hola" } })).toEqual({ texto: "Hola", opciones: [] });

    const ubicacion = aTextoPlano({ type: "interactive", interactive: { type: "location_request_message", body: { text: "Comparte tu ubicación" } } });
    expect(ubicacion?.texto).toContain("Comparte tu ubicación");
    expect(ubicacion?.texto).toContain("📎");

    const horas = aTextoPlano(cuerpoMenuHoras("¿Cuándo te lo llevamos?"), { ahora: MEDIODIA_Y_MEDIA })!;
    expect(horas.texto).toContain("1 - Llévenmelo entre 1 y 2 pm");
    expect(horas.opciones).toHaveLength(6);
  });

  it("los botones de franjas se reemplazan por el menú de horas", () => {
    const m = aTextoPlano(
      { type: "interactive", interactive: { type: "button", body: { text: "Elige:" } } },
      { ahora: MEDIODIA_Y_MEDIA }
    )!;
    expect(m.opciones.every((o) => o.tipo === "hora")).toBe(true);
  });

  it("devuelve null con lo que no se puede mandar como texto", () => {
    expect(aTextoPlano({ type: "image" })).toBeNull();
  });
});

function respuesta(estado: number, cuerpo: unknown, encabezados: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: encabezados });
}

describe("enviarTextoOpenWA", () => {
  const base = { url: "http://localhost:2785", apiKey: "owa_k1_x", sessionId: "s1", esperar: async () => {} };

  it("envía al chat correcto con la clave y devuelve el id del mensaje", async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(201, { messageId: "true_1@c.us_ABC", timestamp: 1 }));
    const r = await enviarTextoOpenWA("8295550123", "Hola", { ...base, fetchFn });
    expect(r).toEqual({ ok: true, id: "true_1@c.us_ABC" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:2785/api/sessions/s1/messages/send-text");
    expect(init.headers["X-API-Key"]).toBe("owa_k1_x");
    expect(JSON.parse(init.body)).toEqual({ chatId: "18295550123@c.us", text: "Hola" });
  });

  it("no reintenta los errores 4xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(409, { message: "Session not ready" }));
    const r = await enviarTextoOpenWA("8295550123", "Hola", { ...base, fetchFn });
    expect(r).toEqual({ ok: false, error: "Session not ready" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("reintenta cuando OpenWA falla o está saturado, y respeta Retry-After", async () => {
    const esperar = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respuesta(429, { message: "slow down" }, { "retry-after": "3" }))
      .mockResolvedValueOnce(respuesta(500, {}))
      .mockResolvedValueOnce(respuesta(201, { messageId: "ok" }));
    const r = await enviarTextoOpenWA("8295550123", "Hola", { ...base, fetchFn, esperar });
    expect(r.ok).toBe(true);
    expect(esperar).toHaveBeenNthCalledWith(1, 3000);
  });

  it("se rinde tras los intentos si no hay conexión", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await enviarTextoOpenWA("8295550123", "Hola", { ...base, fetchFn });
    expect(r).toEqual({ ok: false, error: "No hubo conexión con OpenWA." });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("arma el chatId con el prefijo de país", () => {
    expect(chatIdDeTelefono("8495550123")).toBe("18495550123@c.us");
  });
});

describe("estadoSesionOpenWA", () => {
  const base = { url: "http://localhost:2785", apiKey: "k", sessionId: "s1" };
  const con = (cuerpo: unknown, estado = 200) => ({ ...base, fetchFn: vi.fn().mockResolvedValue(respuesta(estado, cuerpo)) });

  it("está lista solo si está conectada y sin restricción", async () => {
    expect(await estadoSesionOpenWA(con({ status: "ready", restriction: null }))).toEqual({ lista: true });
    expect((await estadoSesionOpenWA(con({ status: "disconnected" }))).lista).toBe(false);
    expect((await estadoSesionOpenWA(con({ status: "ready", restriction: { kind: "temporary" } }))).motivo).toContain("restricción");
    expect((await estadoSesionOpenWA(con({}, 404))).lista).toBe(false);
  });

  it("avisa si OpenWA no está encendido", async () => {
    const r = await estadoSesionOpenWA({ ...base, fetchFn: vi.fn().mockRejectedValue(new Error("x")) });
    expect(r.lista).toBe(false);
    expect(r.motivo).toContain("OpenWA");
  });
});

describe("webhooks de OpenWA", () => {
  it("valida la firma HMAC del cuerpo crudo", () => {
    const cuerpo = '{"event":"message.received"}';
    const firma = `sha256=${createHmac("sha256", "secreto").update(cuerpo).digest("hex")}`;
    expect(firmaOpenWAValida(cuerpo, firma, "secreto")).toBe(true);
    expect(firmaOpenWAValida(cuerpo, firma, "otro")).toBe(false);
    expect(firmaOpenWAValida(`${cuerpo} `, firma, "secreto")).toBe(false);
    expect(firmaOpenWAValida(cuerpo, null, "secreto")).toBe(false);
    expect(firmaOpenWAValida(cuerpo, "sha256=corta", "secreto")).toBe(false);
  });

  const recibido = (data: Record<string, unknown>) => ({
    event: "message.received",
    idempotencyKey: "msg_1",
    data: { kind: "individual", isGroup: false, fromMe: false, ...data },
  });

  it("interpreta un texto entrante con el teléfono real", () => {
    const e = interpretarEventoOpenWA(recibido({ type: "text", body: "3", chatId: "99999@lid", senderPhone: "18295550123" }));
    expect(e).toEqual({ eventoId: "msg_1", clase: "entrante", telefono: "8295550123", texto: "3", ubicacion: null });
  });

  it("toma el teléfono del chatId cuando es @c.us", () => {
    const e = interpretarEventoOpenWA(recibido({ type: "text", body: "1", chatId: "18495550123@c.us" }));
    expect(e).toMatchObject({ telefono: "8495550123" });
  });

  it("interpreta una ubicación", () => {
    const e = interpretarEventoOpenWA(
      recibido({ type: "location", chatId: "18295550123@c.us", location: { latitude: 18.45, longitude: -69.3 } })
    );
    expect(e).toMatchObject({ clase: "entrante", ubicacion: { lat: 18.45, lng: -69.3 }, texto: null });
  });

  it("anota fotos, audios y ubicaciones sin coordenadas como adjuntos", () => {
    expect(interpretarEventoOpenWA(recibido({ type: "image", chatId: "18295550123@c.us", id: "false_x_ABC" }))).toMatchObject({
      texto: null,
      ubicacion: null,
      adjunto: "foto",
      archivo: "18295550123@c.us|false_x_ABC",
    });
    expect(interpretarEventoOpenWA(recibido({ type: "ptt", chatId: "18295550123@c.us" }))).toMatchObject({ adjunto: "nota de voz" });
    expect(interpretarEventoOpenWA(recibido({ type: "location", chatId: "18295550123@c.us" }))).toMatchObject({ adjunto: "ubicación sin coordenadas" });
  });

  it("ignora grupos, mensajes propios, números extranjeros, mensajes borrados y sin teléfono", () => {
    expect(interpretarEventoOpenWA(recibido({ type: "text", body: "x", chatId: "1829@c.us", isGroup: true }))).toBeNull();
    expect(interpretarEventoOpenWA(recibido({ type: "text", body: "x", chatId: "18295550123@c.us", fromMe: true }))).toBeNull();
    expect(interpretarEventoOpenWA(recibido({ type: "text", body: "x", chatId: "18295550123@g.us", kind: "group" }))).toBeNull();
    expect(interpretarEventoOpenWA(recibido({ type: "text", body: "x", chatId: "5215512345678@c.us" }))).toBeNull();
    expect(interpretarEventoOpenWA(recibido({ type: "revoked", chatId: "18295550123@c.us" }))).toBeNull();
    expect(interpretarEventoOpenWA(recibido({ type: "text", body: "x", chatId: "99@lid", senderPhone: null }))).toBeNull();
  });

  it("interpreta los estados de entrega y los fallos", () => {
    const ack = (status: string) => ({ event: "message.ack", idempotencyKey: "ack_1", data: { id: "m1", messageId: "m2", status } });
    expect(interpretarEventoOpenWA(ack("delivered"))).toEqual({ eventoId: "ack_1", clase: "estado", mensajeIds: ["m2", "m1"], estado: "entregado" });
    expect(interpretarEventoOpenWA(ack("read"))).toMatchObject({ estado: "leido" });
    expect(interpretarEventoOpenWA(ack("pending"))).toBeNull();
    expect(interpretarEventoOpenWA({ event: "message.failed", deliveryId: "d1", data: { id: "m1" } })).toMatchObject({ estado: "fallido" });
  });

  it("ignora eventos desconocidos o sin identificador", () => {
    expect(interpretarEventoOpenWA({ event: "session.qr", idempotencyKey: "x", data: {} })).toBeNull();
    expect(interpretarEventoOpenWA({ event: "message.received", data: {} })).toBeNull();
    expect(interpretarEventoOpenWA(null)).toBeNull();
  });
});

describe("goteo", () => {
  const ritmo = ritmoDesdeEntorno({});
  const entrada = (cambios: Partial<EntradaTanda> = {}): EntradaTanda => ({
    ahora: MEDIODIA_Y_MEDIA,
    ritmo,
    enviadosHoy: 0,
    enCola: 100,
    fallosSeguidos: 0,
    sesion: { lista: true },
    azar: () => 0,
    ...cambios,
  });

  it("por defecto manda de 2 a 4 personas por tanda", () => {
    expect(planificarTanda(entrada({ azar: () => 0 }))).toEqual({ enviar: 2 });
    expect(planificarTanda(entrada({ azar: () => 0.99 }))).toEqual({ enviar: 4 });
  });

  it("no manda más de las que hay en cola ni de las que faltan para el tope", () => {
    expect(planificarTanda(entrada({ enCola: 1, azar: () => 0.99 }))).toEqual({ enviar: 1 });
    expect(planificarTanda(entrada({ enviadosHoy: 199, azar: () => 0.99 }))).toEqual({ enviar: 1 });
  });

  it("se detiene con el tope diario, la cola vacía y los fallos seguidos", () => {
    expect(planificarTanda(entrada({ enviadosHoy: 200 })).pausa).toContain("tope");
    expect(planificarTanda(entrada({ enCola: 0 })).pausa).toContain("No hay avisos");
    expect(planificarTanda(entrada({ fallosSeguidos: 5 })).pausa).toContain("fallidos seguidos");
    expect(planificarTanda(entrada({ fallosSeguidos: 4 })).enviar).toBeGreaterThan(0);
  });

  it("se detiene si el WhatsApp no está listo", () => {
    expect(planificarTanda(entrada({ sesion: { lista: false, motivo: "WhatsApp puso una restricción." } }))).toEqual({
      enviar: 0,
      pausa: "WhatsApp puso una restricción.",
    });
  });

  it("solo envía dentro del horario (8 am a 7 pm)", () => {
    const madrugada = new Date("2026-10-26T10:00:00Z"); // 6 am RD
    const noche = new Date("2026-10-26T23:30:00Z"); // 7:30 pm RD
    expect(planificarTanda(entrada({ ahora: madrugada })).pausa).toContain("horario");
    expect(planificarTanda(entrada({ ahora: noche })).pausa).toContain("horario");
    expect(planificarTanda(entrada({ ahora: new Date("2026-10-26T12:00:00Z") })).enviar).toBeGreaterThan(0);
  });

  it("la pausa entre mensajes queda entre 20 y 50 segundos", () => {
    expect(pausaEntreMensajes(ritmo, () => 0)).toBe(20_000);
    expect(pausaEntreMensajes(ritmo, () => 1)).toBe(50_000);
    expect(pausaEntreMensajes(ritmo, () => 0.5)).toBe(35_000);
  });

  it("200 personas se terminan en unas 2 horas y media", () => {
    expect(horaEstimadaFin(MEDIODIA_Y_MEDIA, 0, ritmo)).toBeNull();
    // 200 / 3 por tanda = 67 tandas × 2 min = 134 min → 12:30 + 2:14 = 14:44
    expect(horaEstimadaFin(MEDIODIA_Y_MEDIA, 200, ritmo)).toBe("14:44");
  });

  it("el ritmo se ajusta con variables y no permite rangos al revés", () => {
    const r = ritmoDesdeEntorno({ ENVIO_POR_TANDA_MIN: "5", ENVIO_POR_TANDA_MAX: "2", ENVIO_PAUSA_MIN_S: "30", ENVIO_PAUSA_MAX_S: "10", ENVIO_TOPE_DIARIO: "50" });
    expect(r.porTandaMax).toBeGreaterThanOrEqual(r.porTandaMin);
    expect(r.pausaMaxSegundos).toBeGreaterThanOrEqual(r.pausaMinSegundos);
    expect(r.topeDiario).toBe(50);
  });
});
