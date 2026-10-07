// Crea en YCloud (y de ahí en Meta, para su aprobación) las plantillas de Courier Local.
//
//   node scripts/crear-plantillas.mjs            -> solo muestra lo que enviaría (no toca nada)
//   node scripts/crear-plantillas.mjs --enviar   -> las crea de verdad
//
// Necesita YCLOUD_API_KEY y YCLOUD_WABA_ID en app/.env.local.
import fs from "node:fs";
import { PLANTILLAS } from "../src/lib/whatsapp/plantillas.ts";

const enviar = process.argv.includes("--enviar");

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

function cuerpoDe(p) {
  const componentes = [{ type: "BODY", text: p.cuerpo, example: { body_text: [p.ejemplos] } }];
  if (p.botones.length > 0) {
    componentes.push({ type: "BUTTONS", buttons: p.botones.map((b) => ({ type: "QUICK_REPLY", text: b.texto })) });
  }
  return { wabaId: env.YCLOUD_WABA_ID || "<WABA_ID>", name: p.nombre, language: p.idioma, category: p.categoria, components: componentes };
}

if (enviar && (!env.YCLOUD_API_KEY || !env.YCLOUD_WABA_ID)) {
  console.error("Faltan YCLOUD_API_KEY o YCLOUD_WABA_ID en app/.env.local");
  process.exit(1);
}

for (const plantilla of Object.values(PLANTILLAS)) {
  const cuerpo = cuerpoDe(plantilla);
  if (!enviar) {
    console.log(`\n--- ${plantilla.nombre} (solo vista previa)\n${JSON.stringify(cuerpo, null, 2)}`);
    continue;
  }
  const r = await fetch("https://api.ycloud.com/v2/whatsapp/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": env.YCLOUD_API_KEY },
    body: JSON.stringify(cuerpo),
  });
  const json = await r.json().catch(() => ({}));
  console.log(`${r.ok ? "OK   " : "FALLA"} ${plantilla.nombre} -> ${r.ok ? (json.status ?? "enviada a revisión") : (json.error?.message ?? r.status)}`);
}
if (!enviar) console.log("\nNo se envió nada. Para crearlas de verdad: node scripts/crear-plantillas.mjs --enviar");
