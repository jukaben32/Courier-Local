// Conecta cada cuenta de WhatsApp (sesión de OpenWA) con Courier Local: registra en OpenWA el
// webhook que avisa a la app cuando un cliente responde y cuando un mensaje se entrega o falla.
// Se puede correr las veces que haga falta (si el webhook ya existe, lo actualiza). Correrlo
// otra vez cada vez que se agregue una sesión a OPENWA_SESSION_IDS.
//
// Uso:  node scripts/configurar-webhooks.mjs
//       (OpenWA debe estar abierto; la URL es APP_URL + /api/webhooks/openwa, o OPENWA_WEBHOOK_URL)

import { readFileSync } from "node:fs";

// Lee .env.local sin depender de librerías
function leerEntorno() {
  const entorno = {};
  try {
    for (const linea of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) entorno[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.error("No encontré .env.local");
    process.exit(1);
  }
  return entorno;
}

const env = leerEntorno();
const faltan = ["OPENWA_URL", "OPENWA_API_KEY", "OPENWA_SESSION_IDS", "OPENWA_WEBHOOK_SECRET"].filter((v) => !env[v]);
if (faltan.length > 0) {
  console.error(`Faltan en .env.local: ${faltan.join(", ")}`);
  process.exit(1);
}

const openwa = env.OPENWA_URL.replace(/\/$/, "");
const destino = env.OPENWA_WEBHOOK_URL || `${(env.APP_URL || "http://localhost:3001").replace(/\/$/, "")}/api/webhooks/openwa`;
const sesiones = [...new Set(env.OPENWA_SESSION_IDS.split(",").map((s) => s.trim()).filter(Boolean))];
// Lo que la app procesa: respuestas del cliente y estado de los mensajes enviados
const EVENTOS = ["message.received", "message.ack", "message.failed"];

async function api(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${openwa}/api${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "X-API-Key": env.OPENWA_API_KEY },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(`${respuesta.status} ${datos.message ?? JSON.stringify(datos)}`);
  return datos;
}

console.log(`Webhook: ${destino}\n`);
let errores = 0;
for (const sesion of sesiones) {
  try {
    const { name, status, phone } = await api("GET", `/sessions/${sesion}`);
    const existentes = await api("GET", `/sessions/${sesion}/webhooks`);
    const actual = (Array.isArray(existentes) ? existentes : existentes.data ?? []).find((w) => w.url === destino);
    const cuerpo = { url: destino, events: EVENTOS, secret: env.OPENWA_WEBHOOK_SECRET };
    if (actual) await api("PUT", `/sessions/${sesion}/webhooks/${actual.id}`, cuerpo);
    else await api("POST", `/sessions/${sesion}/webhooks`, cuerpo);
    console.log(`✔ ${name} (${phone ?? "sin vincular"}, ${status}): webhook ${actual ? "actualizado" : "creado"}`);
  } catch (error) {
    errores++;
    console.error(`✘ ${sesion}: ${error.message}`);
  }
}
process.exit(errores > 0 ? 1 : 0);
