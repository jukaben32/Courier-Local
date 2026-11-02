// Reparto de la cola de avisos entre varias cuentas de WhatsApp (sesiones de OpenWA).
// Función pura: decide quién escribe a quién; el envío real está en tanda.ts.
//
// Reglas:
//  - Una persona siempre recibe de la misma cuenta ("preferida"): así sus respuestas y recordatorios
//    siguen en una sola conversación.
//  - Si la cuenta preferida está caída (sesión desconectada, restricción, frenada por fallos), la
//    persona se reasigna a otra. Si solo está en pausa por horario o tope del día, espera su turno.
//  - Las personas nuevas van a la cuenta que lleva menos envíos hoy.

export interface PersonaEnCola {
  telefono: string;
  /** Cuenta que ya le escribió antes, si hay. */
  preferida?: string | null;
}

export interface CupoCuenta {
  sesion: string;
  /** Personas que esta cuenta puede avisar en esta tanda (0 = no envía ahora). */
  cupo: number;
  /** Ya avisadas hoy por esta cuenta: sirve para repartir parejo. */
  enviadosHoy: number;
  /** true si la cuenta no sirve ahora (desconectada, restringida o frenada por fallos). */
  caida: boolean;
}

/** Personas que atenderá cada cuenta en esta tanda (en el orden de la cola). */
export function repartirCola(cola: PersonaEnCola[], cuentas: CupoCuenta[]): Map<string, PersonaEnCola[]> {
  const asignadas = new Map<string, PersonaEnCola[]>(cuentas.map((c) => [c.sesion, []]));
  const quedan = new Map(cuentas.map((c) => [c.sesion, c.cupo]));
  const cargaHoy = new Map(cuentas.map((c) => [c.sesion, c.enviadosHoy]));
  const porId = new Map(cuentas.map((c) => [c.sesion, c]));

  const tomar = (sesion: string, persona: PersonaEnCola) => {
    asignadas.get(sesion)!.push(persona);
    quedan.set(sesion, quedan.get(sesion)! - 1);
    cargaHoy.set(sesion, cargaHoy.get(sesion)! + 1);
  };

  const libres: PersonaEnCola[] = [];
  for (const persona of cola) {
    const preferida = persona.preferida ? porId.get(persona.preferida) : undefined;
    if (!preferida || preferida.caida) {
      libres.push(persona);
    } else if (quedan.get(preferida.sesion)! > 0) {
      tomar(preferida.sesion, persona);
    }
    // Preferida sana pero sin cupo ahora: espera a la próxima tanda
  }

  for (const persona of libres) {
    const candidatas = cuentas.filter((c) => !c.caida && quedan.get(c.sesion)! > 0);
    if (candidatas.length === 0) break;
    const elegida = candidatas.reduce((a, b) => (cargaHoy.get(b.sesion)! < cargaHoy.get(a.sesion)! ? b : a));
    tomar(elegida.sesion, persona);
  }
  return asignadas;
}
