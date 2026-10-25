// Programador local: llama a la app cada pocos minutos para que el envío siga solo.
//   /api/cron/goteo  cada 2 minutos  -> una tanda de avisos (pocas personas, con pausas)
//   /api/cron/tareas cada 15 minutos -> recordatorios y cierre de paquetes vencidos
// Una llamada nunca se solapa con la anterior de su mismo tipo: si una tanda tarda más de
// 2 minutos, la siguiente espera. Para detenerlo: Ctrl+C (el envío se pausa al instante).
//
// Uso:  npm run programador      (la app debe estar corriendo: npm run dev:prueba)

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
const base = process.env.APP_URL ?? env.APP_URL ?? "http://localhost:3001";
const secreto = env.CRON_SECRET;
if (!secreto) {
  console.error("Falta CRON_SECRET en .env.local");
  process.exit(1);
}

const ahora = () => new Date().toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo" });

function programar(nombre, ruta, cadaMs) {
  let enCurso = false;
  async function llamar() {
    if (enCurso) return;
    enCurso = true;
    try {
      const respuesta = await fetch(`${base}${ruta}`, { method: "POST", headers: { Authorization: `Bearer ${secreto}` } });
      const datos = await respuesta.json().catch(() => ({}));
      const resumen = datos.pausa
        ? `pausa: ${datos.pausa} (en cola ${datos.enCola ?? "?"}, enviados hoy ${datos.enviadosHoy ?? "?"})`
        : JSON.stringify(datos);
      console.log(`[${ahora()}] ${nombre}: ${respuesta.status} ${resumen}`);
    } catch (error) {
      console.error(`[${ahora()}] ${nombre}: no hubo conexión con la app (${error.message})`);
    } finally {
      enCurso = false;
    }
  }
  void llamar();
  setInterval(llamar, cadaMs);
}

console.log(`Programador encendido. App: ${base}. Ctrl+C para pausar.`);
programar("goteo ", "/api/cron/goteo", 2 * 60 * 1000);
programar("tareas", "/api/cron/tareas", 15 * 60 * 1000);
