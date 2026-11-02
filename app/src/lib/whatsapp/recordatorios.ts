import "server-only";
import { diaLocal } from "@/lib/plazo";
import {
  configDesdeEntorno,
  decidirRecordatorios,
  type CandidatoRecordatorio,
} from "@/lib/recordatorios";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPorWhatsApp } from "./cliente";
import { telefonosQueDijeronNo } from "./optout";
import { ritmoDesdeEntorno, usaOpenWA } from "./proveedor";
import { cuerpoPlantilla, type MensajeSaliente } from "./envio";
import { PLANTILLAS, primerNombre, textoGuias } from "./plantillas";

const LOTE_CONSULTA = 100;

interface PaqueteEsperando {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  destinatario_id: string;
  fecha_recibido: string;
  destinatarios: { telefono: string } | null;
}

interface MensajePrevio {
  paquete_id: string;
  tipo: string;
  estado: string;
  creado_en: string;
}

export interface ResumenRecordatorios {
  esperando: number;
  enviados: number;
  fallidos: number;
}

/**
 * Manda el recordatorio a quien sigue sin confirmar su entrega. "Sin confirmar" es estado
 * "notificado": si el cliente respondió, o el repartidor lo confirmó por llamada, el paquete ya
 * no está en ese estado y no se le escribe.
 */
export async function enviarRecordatorios(ahora: Date = new Date()): Promise<ResumenRecordatorios> {
  const admin = createAdminClient();
  const config = configDesdeEntorno(process.env);

  const { data } = await admin
    .from("paquetes")
    .select("id, numero_guia, nombre_etiqueta, destinatario_id, fecha_recibido, destinatarios(telefono)")
    .eq("estado", "notificado");
  const paquetes = (data ?? []) as unknown as PaqueteEsperando[];
  if (paquetes.length === 0) return { esperando: 0, enviados: 0, fallidos: 0 };

  const previos: MensajePrevio[] = [];
  for (let i = 0; i < paquetes.length; i += LOTE_CONSULTA) {
    const { data: lote } = await admin
      .from("mensajes_whatsapp")
      .select("paquete_id, tipo, estado, creado_en")
      .eq("direccion", "saliente")
      .in("tipo", ["aviso", "recordatorio"])
      .in("paquete_id", paquetes.slice(i, i + LOTE_CONSULTA).map((p) => p.id))
      .order("creado_en");
    previos.push(...((lote ?? []) as MensajePrevio[]));
  }

  const porPaquete = new Map<string, MensajePrevio[]>();
  for (const m of previos) porPaquete.set(m.paquete_id, [...(porPaquete.get(m.paquete_id) ?? []), m]);

  // Una persona = un mensaje, con todos sus paquetes
  const personas = new Map<string, PaqueteEsperando[]>();
  for (const p of paquetes) {
    if (p.destinatarios?.telefono) personas.set(p.destinatario_id, [...(personas.get(p.destinatario_id) ?? []), p]);
  }

  const candidatos: CandidatoRecordatorio[] = [...personas].map(([destinatarioId, grupo]) => {
    const mensajes = grupo.flatMap((p) => porPaquete.get(p.id) ?? []).sort((a, b) => a.creado_en.localeCompare(b.creado_en));
    const ultimo = mensajes[mensajes.length - 1];
    return {
      destinatarioId,
      telefono: grupo[0].destinatarios!.telefono,
      nombreEtiqueta: grupo[0].nombre_etiqueta,
      guias: grupo.map((p) => p.numero_guia),
      fechaRecibido: grupo.map((p) => p.fecha_recibido).sort()[0],
      ultimoMensajeEn: ultimo?.creado_en ?? null,
      mensajesEnviados: Math.max(...grupo.map((p) => porPaquete.get(p.id)?.length ?? 0)),
      ultimoFallo: ultimo?.estado === "fallido",
      recordatoriosHoy: mensajes.filter(
        (m) => m.tipo === "recordatorio" && diaLocal(new Date(m.creado_en)) === diaLocal(ahora)
      ).length,
    };
  });

  // Quien respondió "NO" no vuelve a recibir mensajes
  const dijeronNo = await telefonosQueDijeronNo(candidatos.map((c) => c.telefono));
  const disponibles = candidatos.filter((c) => !dijeronNo.has(c.telefono));

  // Con OpenWA los recordatorios salen de pocos en pocos (el resto en la siguiente pasada de 15 min)
  const todas = decidirRecordatorios(disponibles, ahora, config);
  const decisiones = usaOpenWA() ? todas.slice(0, ritmoDesdeEntorno().recordatoriosPorLlamada) : todas;
  if (decisiones.length === 0) return { esperando: personas.size, enviados: 0, fallidos: 0 };

  const mensajes: MensajeSaliente[] = decisiones.map(({ candidato, plantilla }) => ({
    telefono: candidato.telefono,
    externalId: candidato.destinatarioId,
    cuerpo: cuerpoPlantilla(PLANTILLAS[plantilla].nombre, [primerNombre(candidato.nombreEtiqueta), textoGuias(candidato.guias)]),
  }));
  const resultados = await enviarPorWhatsApp(mensajes);

  const historial = decisiones.flatMap(({ candidato, plantilla }, i) =>
    personas.get(candidato.destinatarioId)!.map((p) => ({
      paquete_id: p.id,
      telefono: candidato.telefono,
      direccion: "saliente",
      tipo: "recordatorio",
      plantilla: PLANTILLAS[plantilla].nombre,
      estado: resultados[i].ok ? "enviado" : "fallido",
      proveedor_id: resultados[i].id ?? null,
      sesion: resultados[i].sesion ?? null,
      error: resultados[i].error ?? null,
    }))
  );
  await admin.from("mensajes_whatsapp").insert(historial);

  const enviados = resultados.filter((r) => r.ok).length;
  return { esperando: personas.size, enviados, fallidos: resultados.length - enviados };
}
