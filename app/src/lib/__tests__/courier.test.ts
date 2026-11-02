import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { enviarPruebaAlCourier, type PruebaEntrega } from "../courier";

const prueba: PruebaEntrega = {
  entregaId: "e1",
  guia: "SP100989865T",
  nombre: "Yenifer Calderon",
  cedula: "402-1234567-8",
  repartidor: "Isamar Santana",
  momento: "2026-10-31T16:00:00.000Z",
  fotoBase64: "AAAA",
};

describe("enviarPruebaAlCourier", () => {
  it("sin canal configurado no hace nada y la subida sigue siendo manual", async () => {
    const hacerFetch = vi.fn();
    expect(await enviarPruebaAlCourier(prueba, {}, hacerFetch as unknown as typeof fetch)).toEqual({ ok: false, motivo: "sin_canal" });
    expect(hacerFetch).not.toHaveBeenCalled();
  });

  it("con canal manda la guía, la hora y la foto, con el token si hay", async () => {
    const hacerFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const r = await enviarPruebaAlCourier(
      prueba,
      { COURIER_WEBHOOK_URL: "https://puente.example/entrega", COURIER_WEBHOOK_TOKEN: "secreto" },
      hacerFetch as unknown as typeof fetch
    );
    expect(r).toEqual({ ok: true });
    const [url, opciones] = hacerFetch.mock.calls[0];
    expect(url).toBe("https://puente.example/entrega");
    expect(opciones.headers.Authorization).toBe("Bearer secreto");
    expect(JSON.parse(opciones.body)).toMatchObject({ guia: "SP100989865T", momento: prueba.momento, foto_tipo: "image/jpeg", foto_base64: "AAAA" });
  });

  it("si el canal rechaza o no responde, devuelve el motivo y no lanza", async () => {
    const rechaza = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    expect(await enviarPruebaAlCourier(prueba, { COURIER_WEBHOOK_URL: "https://x" }, rechaza as unknown as typeof fetch)).toEqual({
      ok: false,
      motivo: "El canal respondió 500",
    });
    const cae = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await enviarPruebaAlCourier(prueba, { COURIER_WEBHOOK_URL: "https://x" }, cae as unknown as typeof fetch)).toEqual({ ok: false, motivo: "timeout" });
  });
});
