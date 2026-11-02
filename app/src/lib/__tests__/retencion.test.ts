import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { DIAS_RETENCION_FOTOS, borrarFotosVencidas, diasDeRetencion, limiteDeRetencion } from "../retencion";

describe("retención de fotos de cédula", () => {
  it("la ley sugiere 90 días, pero el borrado está apagado hasta que se defina", () => {
    expect(DIAS_RETENCION_FOTOS).toBe(90);
    expect(diasDeRetencion({})).toBe(0);
    expect(diasDeRetencion({ FOTOS_CEDULA_DIAS: "abc" })).toBe(0);
    expect(diasDeRetencion({ FOTOS_CEDULA_DIAS: "90" })).toBe(90);
  });

  it("apagado, no toca nada", async () => {
    expect(await borrarFotosVencidas(new Date(), 0)).toEqual({ entregas: 0, excepciones: 0 });
  });

  it("el límite es 90 días antes de ahora", () => {
    expect(limiteDeRetencion(new Date("2026-10-31T12:00:00.000Z"))).toBe("2026-08-02T12:00:00.000Z");
  });

  it("una foto de justo 89 días sigue vigente y una de 91 ya venció", () => {
    const limite = limiteDeRetencion(new Date("2026-10-31T12:00:00.000Z"));
    expect("2026-08-03T12:00:00.000Z" < limite).toBe(false);
    expect("2026-08-01T12:00:00.000Z" < limite).toBe(true);
  });
});
