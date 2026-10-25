import "server-only";
import { diaLocal } from "@/lib/plazo";
import { createAdminClient } from "@/lib/supabase/admin";
import { agruparAvisos, historialDeAvisos, mensajesDeAvisos, type PaqueteNuevo } from "./avisos";
import { enviarPorWhatsApp } from "./cliente";
import { horaEstimadaFin, planificarTanda } from "./goteo";
import { horaLocalRD } from "./mensajes";
import { estadoSesionOpenWA } from "./openwa";
import { telefonosQueDijeronNo } from "./optout";
import { configOpenWA, ritmoDesdeEntorno } from "./proveedor";

/** Un mismo paquete de avisos fallando 2 veces en el día deja de reintentarse (número inválido, etc.). */
const FALLOS_MAXIMOS_POR_PERSONA = 2;

interface MensajeDelDia {
  telefono: string;
  estado: string;
  creado_en: string;
}

export interface ResumenTanda {
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
  const config = configOpenWA();
  const sesion = config ? await estadoSesionOpenWA(config) : { lista: false, motivo: "Faltan las variables OPENWA_* en .env.local." };

  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: paquetes }, { data: delDia }] = await Promise.all([
    admin
      .from("paquetes")
      .select("id, numero_guia, nombre_etiqueta, destinatario_id, fecha_recibido, destinatarios(telefono)")
      .eq("estado", "recibido")
      .order("fecha_recibido"),
    admin
      .from("mensajes_whatsapp")
      .select("telefono, estado, creado_en")
      .eq("direccion", "saliente")
      .in("tipo", ["aviso", "recordatorio"])
      .gte("creado_en", hace24h),
  ]);

  const deHoy = ((delDia ?? []) as MensajeDelDia[]).filter((m) => diaLocal(new Date(m.creado_en)) === diaLocal(ahora));
  const dia = analizarDia(deHoy, FALLOS_MAXIMOS_POR_PERSONA);

  const { grupos: todos } = agruparAvisos((paquetes ?? []) as unknown as PaqueteNuevo[]);
  const dijeronNo = await telefonosQueDijeronNo(todos.map((g) => g[0].destinatarios!.telefono));
  const cola = todos.filter((g) => {
    const tel = g[0].destinatarios!.telefono;
    return !dia.rendidas.has(tel) && !dijeronNo.has(tel);
  });

  const plan = planificarTanda({
    ahora,
    ritmo,
    enviadosHoy: dia.enviadosHoy,
    enCola: cola.length,
    fallosSeguidos: dia.fallosSeguidos,
    sesion,
    azar: Math.random,
  });

  const base = { enCola: cola.length, enviadosHoy: dia.enviadosHoy, terminaHacia: horaEstimadaFin(ahora, cola.length, ritmo) };
  if (plan.enviar === 0) return { ...base, enviados: 0, fallidos: 0, pausa: plan.pausa };

  const grupos = cola.slice(0, plan.enviar);
  const mensajes = mensajesDeAvisos(grupos);
  const resultados = await enviarPorWhatsApp(mensajes);

  const { filas, idsAvisados } = historialDeAvisos(grupos, mensajes, resultados);
  if (filas.length > 0) await admin.from("mensajes_whatsapp").insert(filas);
  if (idsAvisados.length > 0) await admin.from("paquetes").update({ estado: "notificado" }).in("id", idsAvisados);

  const enviados = resultados.filter((r) => r.ok).length;
  const restantes = cola.length - enviados;
  return {
    enviados,
    fallidos: resultados.length - enviados,
    enCola: restantes,
    enviadosHoy: dia.enviadosHoy + enviados,
    terminaHacia: horaEstimadaFin(new Date(), restantes, ritmo),
  };
}

/** Texto corto del estado para mostrar en el panel. */
export function describirTanda(r: ResumenTanda): string {
  const cola = `En cola: ${r.enCola} · enviados hoy: ${r.enviadosHoy}`;
  if (r.pausa) return `En pausa: ${r.pausa} ${cola}.`;
  const fin = r.terminaHacia ? ` · terminará ≈ ${r.terminaHacia}` : "";
  const ahora = horaLocalRD();
  const fallos = r.fallidos > 0 ? ` (${r.fallidos} fallaron y se reintentan)` : "";
  return `Tanda de las ${ahora}: se avisó a ${r.enviados} ${r.enviados === 1 ? "persona" : "personas"}${fallos}. ${cola}${fin}.`;
}
