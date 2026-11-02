import { describe, expect, it } from "vitest";
import { pareceDireccion, traeHoraExplicita } from "../whatsapp/direccion";

describe("pareceDireccion", () => {
  it.each([
    "Calle Duarte #12, frente al colmado de Pedro",
    "Estoy en la calle 5 casa número 8 en Guayacanes",
    "Residencial Las Palmas, edificio 3, apartamento 2B",
    "Casa azul entrando por la iglesia, al lado del colmado",
    "Villa Faro, detrás de la escuela, casa color verde",
  ])("acepta: %s", (t) => expect(pareceDireccion(t)).toBe(true));

  it.each([
    "Buenos días",
    "Cualquier hora esta bien",
    "Estaré disponible para recibir hasta las 2 de la tarde",
    "Estaré en casa de 2 a 4 pm",
    "Mi hijo le va a mandar la ubicación. Yo dejé una copia de la cédula",
    "Llama o escribe a ese número",
    "Esta bien",
  ])("rechaza: %s", (t) => expect(pareceDireccion(t)).toBe(false));

  it("detecta si además trae una hora", () => {
    expect(traeHoraExplicita("Calle Duarte 12, de 2 a 4 pm")).toBe(true);
    expect(traeHoraExplicita("Calle Duarte #12 frente al colmado")).toBe(false);
  });
});
