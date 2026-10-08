import { describe, expect, it } from "vitest";
import { calcularMetricas, type EntregaM, type MensajeM, type PaqueteM } from "../metricas";

// "Ahora" fijo: 10 de octubre de 2026, 3 pm en RD (19:00 UTC)
const AHORA = new Date("2026-10-10T19:00:00Z");

const paquete = (extra: Partial<PaqueteM> = {}): PaqueteM => ({
  id: "p",
  estado: "recibido",
  fechaRecibido: "2026-10-10T16:00:00Z",
  intentos: 0,
  sector: "Centro",
  repartidor: "Ana",
  motivoDevolucion: null,
  confirmado: false,
  ...extra,
});

const entrega = (extra: Partial<EntregaM> = {}): EntregaM => ({
  paqueteId: "p",
  repartidor: "Ana",
  creadoEn: "2026-10-10T17:00:00Z",
  resultado: "entregado",
  tipo: "domicilio",
  cargadoEnCourier: true,
  ...extra,
});

describe("calcularMetricas", () => {
  it("sin datos no inventa porcentajes: devuelve null y ceros", () => {
    const m = calcularMetricas({ paquetes: [], entregas: [], mensajes: [] }, AHORA);
    expect(m.rendimiento.tasaEntrega).toBeNull();
    expect(m.rendimiento.primerIntento).toBeNull();
    expect(m.rendimiento.diasPromedio).toBeNull();
    expect(m.whatsapp.tasaRespuesta).toBeNull();
    expect(m.cartera.activos).toBe(0);
    expect(m.porRepartidor).toEqual([]);
  });

  it("cuenta los paquetes activos por semáforo de plazo", () => {
    const m = calcularMetricas(
      {
        paquetes: [
          paquete({ id: "a", fechaRecibido: "2026-10-10T16:00:00Z" }), // hoy -> verde
          paquete({ id: "b", fechaRecibido: "2026-10-09T16:00:00Z" }), // ayer -> amarillo
          paquete({ id: "c", fechaRecibido: "2026-10-08T16:00:00Z" }), // hace 2 días -> rojo
          paquete({ id: "d", fechaRecibido: "2026-10-05T16:00:00Z" }), // vencido
          paquete({ id: "e", estado: "entregado" }), // no es activo
        ],
        entregas: [],
        mensajes: [],
      },
      AHORA
    );
    expect(m.cartera.activos).toBe(4);
    expect(m.cartera.porPlazo).toEqual({ verde: 1, amarillo: 1, rojo: 1, vencido: 1 });
  });

  it("calcula tasa de entrega y entrega al primer intento", () => {
    const paquetes = [
      paquete({ id: "1", estado: "entregado", intentos: 0 }),
      paquete({ id: "2", estado: "entregado", intentos: 0 }),
      paquete({ id: "3", estado: "entregado", intentos: 1 }),
      paquete({ id: "4", estado: "devuelto", motivoDevolucion: "no_localizable" }),
    ];
    const m = calcularMetricas({ paquetes, entregas: [], mensajes: [] }, AHORA);
    expect(m.rendimiento.entregados).toBe(3);
    expect(m.rendimiento.devueltos).toBe(1);
    expect(m.rendimiento.tasaEntrega).toBe(75); // 3 de 4 cerrados
    expect(m.rendimiento.primerIntento).toBe(67); // 2 de 3 entregados
    expect(m.rendimiento.motivos).toEqual([{ motivo: "no_localizable", cantidad: 1 }]);
  });

  it("promedia los días entre recibir y entregar usando la entrega registrada", () => {
    const m = calcularMetricas(
      {
        paquetes: [
          paquete({ id: "1", estado: "entregado", fechaRecibido: "2026-10-08T16:00:00Z" }),
          paquete({ id: "2", estado: "entregado", fechaRecibido: "2026-10-09T16:00:00Z" }),
        ],
        entregas: [
          entrega({ paqueteId: "1", creadoEn: "2026-10-10T16:00:00Z" }), // 2 días
          entrega({ paqueteId: "2", creadoEn: "2026-10-10T16:00:00Z" }), // 1 día
        ],
        mensajes: [],
      },
      AHORA
    );
    expect(m.rendimiento.diasPromedio).toBe(1.5);
  });

  it("mide la respuesta al aviso de WhatsApp sobre los paquetes que sí recibieron aviso", () => {
    const m = calcularMetricas(
      {
        paquetes: [
          paquete({ id: "1", confirmado: true }),
          paquete({ id: "2", confirmado: false }),
          paquete({ id: "3", confirmado: true }), // sin aviso en mensajes: no cuenta
        ],
        entregas: [],
        mensajes: [
          { paqueteId: "1", tipo: "aviso", estado: "leido" },
          { paqueteId: "2", tipo: "aviso", estado: "fallido" },
          { paqueteId: "2", tipo: "recordatorio", estado: "enviado" },
        ] satisfies MensajeM[],
      },
      AHORA
    );
    expect(m.whatsapp.avisados).toBe(2);
    expect(m.whatsapp.confirmaron).toBe(1);
    expect(m.whatsapp.tasaRespuesta).toBe(50);
    expect(m.whatsapp.mensajes).toBe(3);
    expect(m.whatsapp.fallidos).toBe(1);
  });

  it("resume cada repartidor: entregas, fallidos, primer intento y pruebas sin subir", () => {
    const m = calcularMetricas(
      {
        paquetes: [
          paquete({ id: "1", estado: "entregado", intentos: 0 }),
          paquete({ id: "2", estado: "entregado", intentos: 2 }),
        ],
        entregas: [
          entrega({ paqueteId: "1", cargadoEnCourier: true }),
          entrega({ paqueteId: "2", cargadoEnCourier: false }),
          entrega({ paqueteId: "2", resultado: "intento_fallido", cargadoEnCourier: false }),
          entrega({ paqueteId: "9", repartidor: "Luis" }),
          entrega({ paqueteId: "x", tipo: "retiro_oficina", repartidor: null }), // retiro en oficina: sin repartidor
        ],
        mensajes: [],
      },
      AHORA
    );
    const ana = m.porRepartidor.find((r) => r.nombre === "Ana")!;
    expect(ana).toMatchObject({ entregas: 2, fallidos: 1, sinSubir: 1, primerIntento: 50 });
    expect(m.porRepartidor.map((r) => r.nombre)).toEqual(["Ana", "Luis"]); // ordenados por entregas
  });

  it("agrupa por sector y deja los sin sector con nombre claro", () => {
    const m = calcularMetricas(
      {
        paquetes: [
          paquete({ id: "1", sector: "Centro", estado: "entregado" }),
          paquete({ id: "2", sector: "Centro" }),
          paquete({ id: "3", sector: null }),
        ],
        entregas: [],
        mensajes: [],
      },
      AHORA
    );
    expect(m.porSector[0]).toEqual({ sector: "Centro", recibidos: 2, entregados: 1, pendientes: 1 });
    expect(m.porSector.some((s) => s.sector === "Sin sector")).toBe(true);
  });

  it("arma 14 días terminando hoy, con la fecha de RD", () => {
    const m = calcularMetricas(
      {
        paquetes: [
          paquete({ id: "1", fechaRecibido: "2026-10-10T02:00:00Z" }), // 9 oct 10 pm en RD -> cuenta el 9
          paquete({ id: "2", fechaRecibido: "2026-10-10T16:00:00Z" }),
        ],
        entregas: [entrega({ creadoEn: "2026-10-10T17:00:00Z" })],
        mensajes: [],
      },
      AHORA
    );
    expect(m.porDia).toHaveLength(14);
    expect(m.porDia[13]).toEqual({ dia: "2026-10-10", recibidos: 1, entregados: 1 });
    expect(m.porDia[12]).toEqual({ dia: "2026-10-09", recibidos: 1, entregados: 0 });
    expect(m.porDia[0].dia).toBe("2026-09-27");
  });
});

describe("retiros en oficina", () => {
  it("mide qué parte de las entregas fue retiro en oficina (cada una es una entrega a domicilio que el courier se ahorra)", () => {
    const m = calcularMetricas(
      {
        paquetes: [],
        entregas: [
          entrega({ paqueteId: "1" }), // domicilio
          entrega({ paqueteId: "2" }), // domicilio
          entrega({ paqueteId: "3", tipo: "retiro_oficina", repartidor: null }),
          entrega({ paqueteId: "4", tipo: "retiro_oficina", repartidor: null }),
          entrega({ paqueteId: "5", resultado: "intento_fallido" }), // no es una entrega: no cuenta
        ],
        mensajes: [],
      },
      AHORA
    );
    expect(m.retiros).toEqual({ retiros: 2, domicilio: 2, porcentaje: 50 });
  });

  it("sin entregas no inventa un porcentaje", () => {
    const m = calcularMetricas({ paquetes: [], entregas: [], mensajes: [] }, AHORA);
    expect(m.retiros).toEqual({ retiros: 0, domicilio: 0, porcentaje: null });
  });
});
