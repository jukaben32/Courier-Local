import { describe, expect, it } from "vitest";
import { MAX_PARADAS_ENLACE, enlaceRutaGoogleMaps } from "../enlaceRuta";

// Genera N puntos de prueba en una línea, con ubicación exacta
const puntos = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: Number((18.45 + i * 0.001).toFixed(6)), lng: -69.3 }));

describe("enlaceRutaGoogleMaps", () => {
  it("devuelve null si no hay ninguna parada con ubicación", () => {
    expect(enlaceRutaGoogleMaps([])).toBeNull();
  });

  it("con una sola parada la usa como destino y no pone paradas intermedias", () => {
    const resultado = enlaceRutaGoogleMaps(puntos(1));
    const url = new URL(resultado!.url);
    expect(url.searchParams.get("destination")).toBe("18.45,-69.3");
    expect(url.searchParams.has("waypoints")).toBe(false);
    expect(url.searchParams.get("travelmode")).toBe("motorcycle");
    expect(resultado!.cantidad).toBe(1);
  });

  it("la última parada es el destino y las anteriores van como paradas intermedias en orden", () => {
    const url = new URL(enlaceRutaGoogleMaps(puntos(3))!.url);
    expect(url.searchParams.get("waypoints")).toBe("18.45,-69.3|18.451,-69.3");
    expect(url.searchParams.get("destination")).toBe("18.452,-69.3");
  });

  it("no pasa del máximo que acepta Google Maps y avisa cuántas paradas incluyó", () => {
    const resultado = enlaceRutaGoogleMaps(puntos(25))!;
    const url = new URL(resultado.url);
    expect(resultado.cantidad).toBe(MAX_PARADAS_ENLACE);
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(MAX_PARADAS_ENLACE - 1);
  });

  it("no incluye el origen: Google Maps parte de donde está el repartidor", () => {
    expect(new URL(enlaceRutaGoogleMaps(puntos(2))!.url).searchParams.has("origin")).toBe(false);
  });
});
