// Vincula el WhatsApp de un repartidor para que los avisos de su ruta salgan de SU número.
//
// Uso:  node scripts/cuenta-repartidor.mjs "Julius" 8495818850
//   1) Crea (o reutiliza) una sesión de OpenWA para ese repartidor y pide un código de emparejamiento.
//   2) En el teléfono del repartidor:  WhatsApp > Dispositivos vinculados > Vincular un dispositivo >
//      "Vincular con el número de teléfono" y escribir el código que sale aquí.
//   3) Cuando queda conectada: la agrega a OPENWA_SESSION_IDS (.env.local), la asigna al repartidor en la
//      base de datos y registra el webhook.
//   Después hay que REINICIAR el servidor de Courier y el programador (leen .env.local al arrancar).
//
// Requisitos: OpenWA encendido, SQL 014 aplicado en Supabase, el repartidor existe en la app.
// Opcional: --sin-codigo  (solo crea la sesión y muestra su estado, para vincular por QR desde el panel de OpenWA)

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUTA_ENV = new URL("../.env.local", import.meta.url);

function leerEntorno() {
  const entorno = {};
  for (const linea of readFileSync(RUTA_ENV, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) entorno[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return entorno;
}

const [nombreBuscado, telefonoCrudo] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const sinCodigo = process.argv.includes("--sin-codigo");
if (!nombreBuscado || (!telefonoCrudo && !sinCodigo)) {
  console.error('Uso: node scripts/cuenta-repartidor.mjs "Nombre del repartidor" 8495550000');
  process.exit(1);
}
const digitos = (telefonoCrudo ?? "").replace(/\D/g, "");
const telefono = digitos.length === 10 ? `1${digitos}` : digitos; // formato internacional, solo dígitos
if (!sinCodigo && !/^\d{11,15}$/.test(telefono)) {
  console.error("El teléfono debe tener 10 dígitos (RD) o venir con código de país.");
  process.exit(1);
}

const env = leerEntorno();
for (const v of ["OPENWA_URL", "OPENWA_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[v]) {
    console.error(`Falta ${v} en .env.local`);
    process.exit(1);
  }
}
const openwa = env.OPENWA_URL.replace(/\/$/, "");
const supa = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");

async function api(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${openwa}/api${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "X-API-Key": env.OPENWA_API_KEY },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(`OpenWA ${respuesta.status}: ${datos.message ?? JSON.stringify(datos)}`);
  return datos;
}

async function supabase(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${supa}/rest/v1${ruta}`, {
    method: metodo,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`Supabase ${respuesta.status}: ${texto}`);
  return texto ? JSON.parse(texto) : [];
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) El repartidor
const coincidencias = await supabase("GET", `/repartidores?select=id,nombre,sesion_openwa&nombre=ilike.${encodeURIComponent(`*${nombreBuscado}*`)}`);
if (coincidencias.length !== 1) {
  console.error(
    coincidencias.length === 0
      ? `No encontré ningún repartidor que contenga "${nombreBuscado}".`
      : `Hay varios repartidores con "${nombreBuscado}": ${coincidencias.map((r) => r.nombre).join(", ")}. Sé más específico.`
  );
  process.exit(1);
}
const repartidor = coincidencias[0];
console.log(`Repartidor: ${repartidor.nombre}`);

// 2) La sesión de OpenWA (nombre: solo letras, números y guiones)
const nombreSesion = `rep-${repartidor.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 50);
const listado = await api("GET", "/sessions");
const existentes = Array.isArray(listado) ? listado : listado.data ?? [];
let sesion = existentes.find((s) => s.name === nombreSesion);
if (sesion) console.log(`Sesión existente: ${sesion.name} (${sesion.status})`);
else {
  sesion = await api("POST", "/sessions", { name: nombreSesion });
  console.log(`Sesión creada: ${sesion.name}`);
}
const id = sesion.id;

// 3) Vincular
if (sesion.status !== "ready") {
  if (!["starting", "initializing", "qr_ready", "connecting"].includes(sesion.status)) {
    sesion = await api("POST", `/sessions/${id}/start`);
  }
  if (sinCodigo) {
    console.log(`Estado: ${sesion.status}. Vincula por QR desde el panel de OpenWA y vuelve a correr este script sin --sin-codigo.`);
    process.exit(0);
  }
  // Esperar a que el motor esté listo para pedir el código
  for (let i = 0; i < 30; i++) {
    sesion = await api("GET", `/sessions/${id}`);
    if (sesion.status === "qr_ready" || sesion.status === "ready") break;
    await esperar(2000);
  }
  if (sesion.status !== "ready") {
    const { code } = await api("POST", `/sessions/${id}/pairing-code`, { phoneNumber: telefono });
    console.log("\n==============================================");
    console.log(`  CÓDIGO PARA ${repartidor.nombre.toUpperCase()}:   ${code}`);
    console.log("==============================================");
    console.log("En su teléfono: WhatsApp > Dispositivos vinculados > Vincular un dispositivo >");
    console.log('"Vincular con el número de teléfono" y escribir ese código. Tiene unos minutos.\n');
    for (let i = 0; i < 100; i++) {
      await esperar(3000);
      sesion = await api("GET", `/sessions/${id}`);
      if (sesion.status === "ready") break;
    }
  }
}
if (sesion.status !== "ready") {
  console.error(`La sesión no quedó conectada (estado: ${sesion.status}). Vuelve a correr el script para pedir otro código.`);
  process.exit(1);
}
console.log(`✔ Conectada: ${sesion.pushName ?? ""} ${sesion.phone ?? ""}`);

// 4) Agregarla a OPENWA_SESSION_IDS (la primera cuenta de la lista es la de la oficina)
const lineas = readFileSync(RUTA_ENV, "utf8").split(/\r?\n/);
const k = lineas.findIndex((l) => /^\s*OPENWA_SESSION_IDS\s*=/.test(l));
const ids = (k >= 0 ? lineas[k].split("=")[1] : env.OPENWA_SESSION_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!ids.includes(id)) {
  ids.push(id);
  if (k >= 0) lineas[k] = `OPENWA_SESSION_IDS=${ids.join(",")}`;
  else lineas.push(`OPENWA_SESSION_IDS=${ids.join(",")}`);
  writeFileSync(RUTA_ENV, lineas.join("\n"));
  console.log("✔ Agregada a OPENWA_SESSION_IDS en .env.local");
}

// 5) Asignarla al repartidor
await supabase("PATCH", `/repartidores?id=eq.${repartidor.id}`, { sesion_openwa: id });
console.log(`✔ ${repartidor.nombre} usará esta cuenta para los avisos de su ruta`);

// 6) Webhook
const r = spawnSync(process.execPath, [fileURLToPath(new URL("./configurar-webhooks.mjs", import.meta.url))], { stdio: "inherit" });
if (r.status !== 0) console.error("El webhook no se pudo registrar: corre  node scripts/configurar-webhooks.mjs");

console.log("\nListo. Reinicia el servidor de Courier y el programador para que lean la configuración nueva.");
