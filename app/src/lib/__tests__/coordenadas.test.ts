import { describe, expect, it } from "vitest";
import { leerCoordenadas } from "../coordenadas";

describe("leerCoordenadas", () => {
  it("entiende las coordenadas copiadas de Google Maps", () => {
    expect(leerCoordenadas("18.4503, -69.3012")).toEqual({ lat: 18.4503, lng: -69.3012 });
    expect(leerCoordenadas("  18.4503,-69.3012 ")).toEqual({ lat: 18.4503, lng: -69.3012 });
    expect(leerCoordenadas("18.4503 -69.3012")).toEqual({ lat: 18.4503, lng: -69.3012 });
  });

  it("entiende un enlace largo de Google Maps", () => {
    expect(leerCoordenadas("https://www.google.com/maps/@18.4503,-69.3012,17z")).toEqual({ lat: 18.4503, lng: -69.3012 });
    expect(leerCoordenadas("https://www.google.com/maps?q=18.4503,-69.3012")).toEqual({ lat: 18.4503, lng: -69.3012 });
  });

  it("de un lugar marcado toma el punto exacto y no el centro de la vista", () => {
    const enlace = "https://www.google.com/maps/place/Miramar/@18.4600,-69.3100,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d18.4503!4d-69.3012";
    expect(leerCoordenadas(enlace)).toEqual({ lat: 18.4503, lng: -69.3012 });
  });

  it("rechaza lo que no es una ubicación de la zona", () => {
    expect(leerCoordenadas("hola")).toBeNull();
    expect(leerCoordenadas("")).toBeNull();
    expect(leerCoordenadas("40.7128, -74.0060")).toBeNull(); // Nueva York
    expect(leerCoordenadas("-69.3012, 18.4503")).toBeNull(); // al revés
    expect(leerCoordenadas("https://maps.app.goo.gl/abc123")).toBeNull(); // enlace corto: no trae coordenadas
  });
});
