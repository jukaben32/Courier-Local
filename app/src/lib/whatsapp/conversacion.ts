import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatearTelefono, normalizarTelefonoRD } from "@/lib/telefono";
import { enviarPorWhatsApp } from "./cliente";
import { cuerpoBotones, cuerpoPedirUbicacion, cuerpoTexto } from "./envio";
import {
  bloquesDisponibles,
  columnaDeHora,
  etiquetaBloque,
  franjaDeHora,
  horaDeColumna,
} from "./horas";
import { configHorasDesdeEntorno, usaOpenWA } from "./proveedor";
import { cuerpoMenuHoras } from "./textoPlano";
import {
  franjasDisponibles,
  horaLocalRD,
  opcionesFranjas,
  tituloFranja,
  type Entrante,
  type Franja,
} from "./mensajes";
import {
  ACCION_COORDINAR,
  ACCION_OTRA_PERSONA,
  ACCION_RETIRO,
  TEXTOS,
  textoConfirmacionFinal,
  textoUbicacionRecibida,
} from "./plantillas";

type Admin = ReturnType<typeof createAdminClient>;

const ESTADOS_COORDINABLES = ["recibido", "notificado", "confirmado"];
const ESTADOS_ESPERANDO = ["recibido", "notificado"];
const ESTADOS_CON_RUTA = ["recibido", "notificado", "confirmado", "en_ruta"];

interface PaqueteAbierto {
  id: string;
  estado: string;
  nombre_etiqueta: string;
  ventana_horaria: string | null;
  hora_preferida: string | null;
  ubicacion_entrega_lat: number | null;
}

async function paquetesDelCliente(admin: Admin, telefono: string, estados: string[]): Promise<PaqueteAbierto[]> {
  const { data: personas } = await admin.from("destinatarios").select("id").eq("telefono", telefono);
  const ids = (personas ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data } = await admin
    .from("paquetes")
    .select("id, estado, nombre_etiqueta, ventana_horaria, hora_preferida, ubicacion_entrega_lat")
    .in("destinatario_id", ids)
    .in("estado", estados)
    .order("fecha_recibido");
  return (data ?? []) as PaqueteAbierto[];
}

interface Respuesta {
  tipo: "franjas" | "ubicacion" | "respuesta";
  cuerpo: Record<string, unknown>;
  resumen: string;
}

/** Envía una respuesta libre al cliente y la deja anotada en el historial. */
async function responder(admin: Admin, telefono: string, paqueteId: string | null, r: Respuesta): Promise<boolean> {
  const [resultado] = await enviarPorWhatsApp([{ telefono, cuerpo: r.cuerpo }]);
  await admin.from("mensajes_whatsapp").insert({
    paquete_id: paqueteId,
    telefono,
    direccion: "saliente",
    tipo: r.tipo,
    estado: resultado.ok ? "enviado" : "fallido",
    contenido: r.resumen,
    proveedor_id: resultado.id ?? null,
    sesion: resultado.sesion ?? null,
    error: resultado.error ?? null,
  });
  return resultado.ok;
}

const texto = (t: string): Pick<Respuesta, "cuerpo" | "resumen"> => ({ cuerpo: cuerpoTexto(t), resumen: t });

async function pedirFranjas(admin: Admin, telefono: string, paqueteId: string | null, introduccion: string): Promise<void> {
  // Versión OpenWA: se ofrecen las horas que quedan hoy (de 9 am a 7 pm) en vez de las 3 franjas
  if (usaOpenWA()) {
    if (bloquesDisponibles(new Date(), configHorasDesdeEntorno(process.env)).length === 0) {
      await responder(admin, telefono, paqueteId, { tipo: "respuesta", ...texto(TEXTOS.sinFranjas) });
      return;
    }
    await responder(admin, telefono, paqueteId, {
      tipo: "franjas",
      cuerpo: cuerpoMenuHoras(introduccion),
      resumen: introduccion,
    });
    return;
  }

  const { data } = await admin.from("franjas").select("codigo, hora_inicio, hora_fin").order("hora_inicio");
  const disponibles = franjasDisponibles((data ?? []) as Franja[], horaLocalRD());

  if (disponibles.length === 0) {
    await responder(admin, telefono, paqueteId, { tipo: "respuesta", ...texto(TEXTOS.sinFranjas) });
    return;
  }
  await responder(admin, telefono, paqueteId, {
    tipo: "franjas",
    cuerpo: cuerpoBotones(introduccion, opcionesFranjas(disponibles)),
    resumen: introduccion,
  });
}

async function pedirUbicacion(admin: Admin, telefono: string, paqueteId: string | null): Promise<void> {
  const enviado = await responder(admin, telefono, paqueteId, {
    tipo: "ubicacion",
    cuerpo: cuerpoPedirUbicacion(TEXTOS.pedirUbicacion),
    resumen: TEXTOS.pedirUbicacion,
  });
  if (enviado) return;

  // Si YCloud no acepta el botón de ubicación, se le explica cómo mandarla a mano
  const alternativa = `${TEXTOS.pedirUbicacion} Toca el clip 📎 > Ubicación > Enviar tu ubicación actual.`;
  await responder(admin, telefono, paqueteId, { tipo: "ubicacion", ...texto(alternativa) });
}

/**
 * Versión OpenWA: cuando ya hay hora y ubicación se manda UN solo mensaje de cierre, con el
 * nombre y el teléfono del repartidor para que arreglen cualquier detalle directamente.
 */
async function confirmarCoordinacion(admin: Admin, telefono: string, paqueteIds: string[]): Promise<void> {
  const { data } = await admin
    .from("paquetes")
    .select("id, nombre_etiqueta, ventana_horaria, hora_preferida, repartidores!paquetes_repartidor_asignado_id_fkey(nombre, telefono)")
    .in("id", paqueteIds)
    .eq("estado", "confirmado")
    .order("fecha_recibido")
    .limit(1);
  const paquete = (data ?? [])[0] as unknown as
    | {
        id: string;
        nombre_etiqueta: string;
        ventana_horaria: string | null;
        hora_preferida: string | null;
        repartidores: { nombre: string; telefono: string | null } | null;
      }
    | undefined;
  if (!paquete) return;

  const { data: franjas } = await admin.from("franjas").select("codigo, hora_inicio, hora_fin");
  const franja = ((franjas ?? []) as Franja[]).find((f) => f.codigo === paquete.ventana_horaria);
  const hora = horaDeColumna(paquete.hora_preferida);
  const horario = hora !== null ? etiquetaBloque(hora) : franja ? tituloFranja(franja) : null;

  const telefonoRepartidor = paquete.repartidores?.telefono ?? null;
  const normalizado = telefonoRepartidor ? normalizarTelefonoRD(telefonoRepartidor) : null;
  const repartidor = paquete.repartidores
    ? { nombre: paquete.repartidores.nombre, telefono: normalizado ? formatearTelefono(normalizado) : telefonoRepartidor }
    : null;

  await responder(admin, telefono, paquete.id, {
    tipo: "respuesta",
    ...texto(textoConfirmacionFinal(horario, paquete.nombre_etiqueta, repartidor)),
  });
}

/**
 * Lo que pasa cuando un cliente escribe o toca un botón. Sin sesión de usuario: usa la clave de
 * servidor. Cada paso solo toca los paquetes de ESE teléfono que están en un estado válido.
 */
export async function procesarEntrante(
  entrante: Entrante,
  opciones: { soloLoEntendido?: boolean; /** Lo que escribió el cliente tal cual ("2", "a la 1"). */ textoOriginal?: string } = {}
): Promise<void> {
  const admin = createAdminClient();
  const { telefono } = entrante;

  const abiertos = await paquetesDelCliente(admin, telefono, ESTADOS_CON_RUTA);
  const primero = abiertos[0]?.id ?? null;

  await admin.from("mensajes_whatsapp").insert({
    paquete_id: primero,
    telefono,
    direccion: "entrante",
    tipo: "respuesta",
    estado: "entregado",
    contenido: opciones.textoOriginal ?? (entrante.tipo === "texto" ? entrante.texto : `${entrante.tipo}`),
  });

  if (abiertos.length === 0) {
    // En un número compartido con personas, quien no tiene paquetes no recibe respuesta automática
    if (!opciones.soloLoEntendido) {
      await responder(admin, telefono, null, { tipo: "respuesta", ...texto(TEXTOS.sinPaquetes) });
    }
    return;
  }

  if (entrante.tipo === "ubicacion") {
    const yaTeniaUbicacion = abiertos.some((p) => p.ubicacion_entrega_lat !== null);
    await admin
      .from("paquetes")
      .update({
        ubicacion_entrega_lat: entrante.lat,
        ubicacion_entrega_lng: entrante.lng,
        ubicacion_entrega_en: new Date().toISOString(),
      })
      .in("id", abiertos.map((p) => p.id));

    if (usaOpenWA()) {
      // Sin mensajes intermedios: solo se responde si ya eligió hora y es la primera vez que manda su ubicación
      const confirmados = abiertos.filter((p) => p.estado === "confirmado");
      if (confirmados.length > 0 && !yaTeniaUbicacion) await confirmarCoordinacion(admin, telefono, confirmados.map((p) => p.id));
      return;
    }

    const { data: franjas } = await admin.from("franjas").select("codigo, hora_inicio, hora_fin");
    const franja = ((franjas ?? []) as Franja[]).find((f) => f.codigo === abiertos[0].ventana_horaria);
    const horaElegida = horaDeColumna(abiertos[0].hora_preferida);
    const horario = horaElegida !== null ? etiquetaBloque(horaElegida) : franja ? tituloFranja(franja) : null;
    const mensaje = textoUbicacionRecibida(horario, abiertos[0].nombre_etiqueta);
    await responder(admin, telefono, primero, { tipo: "respuesta", ...texto(mensaje) });
    return;
  }

  // Solo se pueden coordinar los paquetes que aún no salen en ruta ni están en retiro
  // Lo que el cliente elige aplica a los paquetes que esperan su respuesta; los que ya tienen horario
  // confirmado solo cambian si no queda ninguno esperando (el cliente está reprogramando).
  const coordinables = abiertos.filter((p) => ESTADOS_COORDINABLES.includes(p.estado));
  const esperando = coordinables.filter((p) => ESTADOS_ESPERANDO.includes(p.estado));
  const objetivo = (esperando.length > 0 ? esperando : coordinables).map((p) => p.id);

  if (entrante.tipo === "franja") {
    const { data } = await admin.from("franjas").select("codigo, hora_inicio, hora_fin").order("hora_inicio");
    const disponibles = franjasDisponibles((data ?? []) as Franja[], horaLocalRD());
    if (!disponibles.some((f) => f.codigo === entrante.codigo)) {
      await pedirFranjas(admin, telefono, primero, TEXTOS.franjaPasada);
      return;
    }
    await admin
      .from("paquetes")
      .update({
        estado: "confirmado",
        ventana_horaria: entrante.codigo,
        hora_confirmacion: new Date().toISOString(),
      })
      .in("id", objetivo);
    if (usaOpenWA()) {
      if (abiertos.some((p) => p.ubicacion_entrega_lat !== null)) await confirmarCoordinacion(admin, telefono, objetivo);
      return;
    }
    await pedirUbicacion(admin, telefono, primero);
    return;
  }

  if (entrante.tipo === "hora") {
    const disponibles = bloquesDisponibles(new Date(), configHorasDesdeEntorno(process.env));
    if (!disponibles.includes(entrante.hora)) {
      await pedirFranjas(admin, telefono, primero, TEXTOS.franjaPasada);
      return;
    }
    // Si repite la misma hora que ya tenía confirmada, no se le vuelve a escribir
    const columna = columnaDeHora(entrante.hora);
    const mismaHora = abiertos.filter((p) => objetivo.includes(p.id)).every((p) => p.estado === "confirmado" && p.hora_preferida === columna);
    await admin
      .from("paquetes")
      .update({
        estado: "confirmado",
        ventana_horaria: franjaDeHora(entrante.hora),
        hora_preferida: columnaDeHora(entrante.hora),
        hora_confirmacion: new Date().toISOString(),
      })
      .in("id", objetivo);
    if (usaOpenWA()) {
      if (!mismaHora && abiertos.some((p) => p.ubicacion_entrega_lat !== null)) await confirmarCoordinacion(admin, telefono, objetivo);
      return;
    }
    await pedirUbicacion(admin, telefono, primero);
    return;
  }

  if (entrante.tipo === "accion") {
    if (entrante.accion === ACCION_COORDINAR) {
      await pedirFranjas(admin, telefono, primero, TEXTOS.pedirFranja);
    } else if (entrante.accion === ACCION_RETIRO) {
      await admin
        .from("paquetes")
        .update({ estado: "retiro_oficina" })
        .in("id", objetivo);
      await responder(admin, telefono, primero, { tipo: "respuesta", ...texto(TEXTOS.retiro) });
    } else if (entrante.accion === ACCION_OTRA_PERSONA) {
      // OpenWA: no se contesta; el mensaje de cierre ya recuerda llevar la cédula del destinatario
      if (usaOpenWA()) return;
      await responder(admin, telefono, primero, { tipo: "respuesta", ...texto(TEXTOS.otraPersona) });
      await pedirFranjas(admin, telefono, primero, TEXTOS.pedirFranja);
    }
    return;
  }

  if (!opciones.soloLoEntendido) {
    await responder(admin, telefono, primero, { tipo: "respuesta", ...texto(TEXTOS.usarBotones) });
  }
}
