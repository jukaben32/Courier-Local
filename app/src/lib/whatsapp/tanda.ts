import "server-only";
import { diaLocal } from "@/lib/plazo";
import { createAdminClient } from "@/lib/supabase/admin";
import { agruparAvisos, historialDeAvisos, mensajesDeAvisos, type PaqueteNuevo } from "./avisos";
import { enviarPorWhatsApp } from "./cliente";
import { horaEstimadaFin, planificarTanda, type PlanTanda } from "./goteo";
import { horaLocalRD } from "./mensajes";
import { estadoSesionOpenWA } from "./openwa";
import { telefonosQueDijeronNo } from "./optout";
import { configsOpenWA, ritmoDesdeEntorno } from "./proveedor";
import { repartirCola, type PersonaEnCola } from "./reparto";

/** Un mismo paquete de avisos fallando 2 veces en el día deja de reintentarse (número inválido, etc.). */
const FALLOS_MAXIMOS_POR_PERSONA = 2;

interface MensajeDelDia {
  telefono: string;
  sesion: string | null;
  estado: string;
  creado_en: string;
}

export interface ResumenCuenta {
  sesion: string;
  enviados: number;
  fallidos: number;
  /** Por qué esta cuenta no envió nada en esta tanda, si es el caso. */
  pausa?: string;
}

export interface ResumenTanda {
  /** Detalle por cuenta de WhatsApp (solo cuando hay más de una). */
  cuentas?: ResumenCuenta[];
  enviados: number;
  fallidos: number;
  enCola: number;
  enviadosHoy: number;
  /** Hora aproximada en que terminaría de avisarse a toda la cola. */
  terminaHacia: string | null;
  /** Si no se envió nada por una razón (fuera de horario, sesión caída, tope…), cuál. */
  pausa?: string;
}

/** Lo ya enviado hoy: personas avisadas, fallos recientes y quiénes llevan demasiados fallos. */
function analizarDia(mensajes: MensajeDelDia[], umbral: number) {
  const avisadas = new Set<string>();
  // Un mensaje a una persona con varios paquetes genera varias filas con la misma hora: es UN envío
  const envios = new Map<string, { telefono: string; fallido: boolean; en: string }>();
  for (const m of mensajes) {
    const clave = `${m.telefono}|${m.creado_en}`;
    envios.set(clave, { telefono: m.telefono, fallido: m.estado === "fallido", en: m.creado_en });
    if (m.estado !== "fallido") avisadas.add(m.telefono);
  }
  const ordenados = [...envios.values()].sort((a, b) => b.en.localeCompare(a.en));

  let fallosSeguidos = 0;
  for (const e of ordenados) {
    if (!e.fallido) break;
    fallosSeguidos += 1;
  }

  const fallosPorPersona = new Map<string, number>();
  for (const e of ordenados) {
    if (e.fallido) fallosPorPersona.set(e.telefono, (fallosPorPersona.get(e.telefono) ?? 0) + 1);
  }
  const rendidas = new Set([...fallosPorPersona].filter(([, n]) => n >= umbral).map(([tel]) => tel));

  return { enviadosHoy: avisadas.size, fallosSeguidos, rendidas };
}

/**
 * Una tanda del goteo: avisa a unas pocas personas (con pausas entre mensaje y mensaje) y se detiene
 * sola si es fuera de horario, si el WhatsApp no está listo o tiene restricción, si hubo muchos
 * fallos seguidos o si se llegó al tope del día.
 */
export async function enviarTanda(ahora: Date = new Date()): Promise<ResumenTanda> {
  // Un solo candado por proceso (en globalThis porque Next puede cargar este módulo más de una vez):
  // el botón "Enviar avisos" y el programador no pueden mandar dos tandas a la vez.
  const candado = globalThis as typeof globalThis & { __tandaEnCurso?: boolean };
  if (candado.__tandaEnCurso) {
    return { enviados: 0, fallidos: 0, enCola: 0, enviadosHoy: 0, terminaHacia: null, pausa: "Ya hay una tanda enviándose." };
  }
  candado.__tandaEnCurso = true;
  try {
    return await ejecutarTanda(ahora);
  } finally {
    candado.__tandaEnCurso = false;
  }
}

async function ejecutarTanda(ahora: Date): Promise<ResumenTanda> {
  const admin = createAdminClient();
  const ritmo = ritmoDesdeEntorno();
  const configs = configsOpenWA();
  if (configs.length === 0) {
    return {
      enviados: 0,
      fallidos: 0,
      enCola: 0,
      enviadosHoy: 0,
      terminaHacia: null,
      pausa: "Faltan las variables OPENWA_* en .env.local.",
    };
  }
  const sesiones = await Promise.all(configs.map((c) => estadoSesionOpenWA(c)));

  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: paquetes }, { data: delDia }] = await Promise.all([
    admin
      .from("paquetes")
      .select("id, numero_guia, nombre_etiqueta, destinatario_id, fecha_recibido, destinatarios(telefono)")
      .eq("estado", "recibido")
      .order("fecha_recibido"),
    admin
      .from("mensajes_whatsapp")
      .select("telefono, sesion, estado, creado_en")
      .eq("direccion", "saliente")
      .in("tipo", ["aviso", "recordatorio"])
      .gte("creado_en", hace24h),
  ]);

  const deHoy = ((delDia ?? []) as MensajeDelDia[]).filter((m) => diaLocal(new Date(m.creado_en)) === diaLocal(ahora));
  const primera = configs[0].sessionId;
  // Los mensajes de antes de usar varias cuentas no traen sesión: se cuentan en la primera
  const diaDeCuenta = (sesion: string) =>
    analizarDia(deHoy.filter((m) => (m.sesion ?? primera) === sesion), FALLOS_MAXIMOS_POR_PERSONA);
  const dia = analizarDia(deHoy, FALLOS_MAXIMOS_POR_PERSONA);

  const { grupos: todos } = agruparAvisos((paquetes ?? []) as unknown as PaqueteNuevo[]);
  const telefonosCola = todos.map((g) => g[0].destinatarios!.telefono);
  const dijeronNo = await telefonosQueDijeronNo(telefonosCola);
  const cola = todos.filter((g) => {
    const tel = g[0].destinatarios!.telefono;
    return !dia.rendidas.has(tel) && !dijeronNo.has(tel);
  });

  // Cuenta que ya le escribió antes a cada persona (para que siga hablando con la misma)
  const preferidas = new Map<string, string>();
  if (cola.length > 0) {
    const { data: menus } = await admin
      .from("menus_whatsapp")
      .select("telefono, sesion")
      .in("telefono", cola.map((g) => g[0].destinatarios!.telefono));
    for (const m of (menus ?? []) as { telefono: string; sesion: string | null }[]) {
      if (m.sesion) preferidas.set(m.telefono, m.sesion);
    }
  }

  // Plan de cada cuenta: cuántas personas puede avisar ahora, o por qué no
  const planes: { sesion: string; plan: PlanTanda; enviadosHoy: number; caida: boolean }[] = configs.map((c, k) => {
    const d = diaDeCuenta(c.sessionId);
    const plan = planificarTanda({
      ahora,
      ritmo,
      enviadosHoy: d.enviadosHoy,
      enCola: cola.length,
      fallosSeguidos: d.fallosSeguidos,
      sesion: sesiones[k],
      azar: Math.random,
    });
    // "Caída": no sirve ahora (desconectada, restringida o frenada por fallos); no cuenta el horario ni el tope
    const caida = !sesiones[k].lista || d.fallosSeguidos >= ritmo.fallosSeguidosParaFrenar;
    return { sesion: c.sessionId, plan, enviadosHoy: d.enviadosHoy, caida };
  });

  const reparto = repartirCola(
    cola.map((g): PersonaEnCola & { grupo: typeof g } => ({
      telefono: g[0].destinatarios!.telefono,
      preferida: preferidas.get(g[0].destinatarios!.telefono),
      grupo: g,
    })),
    planes.map((p) => ({ sesion: p.sesion, cupo: p.plan.enviar, enviadosHoy: p.enviadosHoy, caida: p.caida }))
  );

  const base = { enCola: cola.length, enviadosHoy: dia.enviadosHoy, terminaHacia: horaEstimadaFin(ahora, cola.length, ritmo) };
  const hayEnvio = [...reparto.values()].some((v) => v.length > 0);
  if (!hayEnvio) {
    const motivos = [...new Set(planes.map((p) => p.plan.pausa).filter((m): m is string => !!m))];
    return {
      ...base,
      enviados: 0,
      fallidos: 0,
      pausa: motivos.length > 0 ? motivos.join(" ") : "No hay avisos en cola.",
      ...(configs.length > 1 ? { cuentas: planes.map((p) => ({ sesion: p.sesion, enviados: 0, fallidos: 0, pausa: p.plan.pausa })) } : {}),
    };
  }

  // Cada cuenta envía a su ritmo, al mismo tiempo que las demás (cada una con sus propias pausas)
  const porCuenta = await Promise.all(
    planes.map(async (p): Promise<ResumenCuenta> => {
      const personas = (reparto.get(p.sesion) ?? []) as (PersonaEnCola & { grupo: PaqueteNuevo[] })[];
      if (personas.length === 0) return { sesion: p.sesion, enviados: 0, fallidos: 0, pausa: p.plan.pausa };

      const grupos = personas.map((x) => x.grupo);
      const mensajes = mensajesDeAvisos(grupos);
      const resultados = await enviarPorWhatsApp(mensajes, { sesionId: p.sesion });

      const { filas, idsAvisados } = historialDeAvisos(grupos, mensajes, resultados);
      if (filas.length > 0) await admin.from("mensajes_whatsapp").insert(filas);
      if (idsAvisados.length > 0) await admin.from("paquetes").update({ estado: "notificado" }).in("id", idsAvisados);

      const enviados = resultados.filter((r) => r.ok).length;
      return { sesion: p.sesion, enviados, fallidos: resultados.length - enviados };
    })
  );

  const enviados = porCuenta.reduce((n, c) => n + c.enviados, 0);
  const fallidos = porCuenta.reduce((n, c) => n + c.fallidos, 0);
  const restantes = cola.length - enviados;
  return {
    enviados,
    fallidos,
    enCola: restantes,
    enviadosHoy: dia.enviadosHoy + enviados,
    terminaHacia: horaEstimadaFin(new Date(), restantes, ritmo),
    ...(configs.length > 1 ? { cuentas: porCuenta } : {}),
  };
}

/** Texto corto del estado para mostrar en el panel. */
export function describirTanda(r: ResumenTanda): string {
  const cola = `En cola: ${r.enCola} · enviados hoy: ${r.enviadosHoy}`;
  if (r.pausa) return `En pausa: ${r.pausa} ${cola}.`;
  const fin = r.terminaHacia ? ` · terminará ≈ ${r.terminaHacia}` : "";
  const ahora = horaLocalRD();
  const fallos = r.fallidos > 0 ? ` (${r.fallidos} fallaron y se reintentan)` : "";
  const detalle = r.cuentas ? ` Por cuenta: ${r.cuentas.map((c, k) => `#${k + 1} ${c.enviados}`).join(" · ")}.` : "";
  return `Tanda de las ${ahora}: se avisó a ${r.enviados} ${r.enviados === 1 ? "persona" : "personas"}${fallos}.${detalle} ${cola}${fin}.`;
}
