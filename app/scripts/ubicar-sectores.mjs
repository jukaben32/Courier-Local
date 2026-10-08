// Busca en OpenStreetMap el centro aproximado de cada sector de San Pedro de Macorís.
//
//   node scripts/ubicar-sectores.mjs            -> solo muestra lo que encontraría (no guarda nada)
//   node scripts/ubicar-sectores.mjs --guardar  -> guarda en la base los sectores que aún no tienen ubicación
//
// Solo acepta resultados dentro de la zona de la provincia; los sectores que el mapa no conoce se
// quedan sin ubicación y se aprenden solos con los pines que comparten los clientes.
// Respeta el límite del servicio público (1 consulta por segundo).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const GUARDAR = process.argv.includes("--guardar");
const ESPERA_MS = 1200;
// Recuadro de la provincia (oeste, norte, este, sur) para descartar coincidencias de otros lugares
const ZONA = { oeste: -69.55, norte: 18.7, este: -69.1, sur: 18.3 };
// Solo se aceptan lugares y barrios; las calles, iglesias y negocios con el mismo nombre dan ubicaciones engañosas
const CLASES_ACEPTADAS = ["place", "boundary"];
// Los sectores de la zona "San Pedro" (la ciudad) tienen que caer dentro de la ciudad; si el mapa los pone en otro pueblo, es un homónimo
const CIUDAD = { oeste: -69.37, norte: 18.53, este: -69.22, sur: 18.4 };
const dentroDeLaCiudad = (lat, lng) => lat >= CIUDAD.sur && lat <= CIUDAD.norte && lng >= CIUDAD.oeste && lng <= CIUDAD.este;
const AGENTE = "CourierLocal-ubicar-sectores/1.0";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const dentroDeLaZona = (lat, lng) => lat >= ZONA.sur && lat <= ZONA.norte && lng >= ZONA.oeste && lng <= ZONA.este;

async function buscar(consulta, esCiudad) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", consulta);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "3");
  url.searchParams.set("viewbox", `${ZONA.oeste},${ZONA.norte},${ZONA.este},${ZONA.sur}`);
  url.searchParams.set("bounded", "1");
  const respuesta = await fetch(url, { headers: { "User-Agent": AGENTE } });
  if (!respuesta.ok) throw new Error(`El mapa respondió ${respuesta.status}`);
  const resultados = await respuesta.json();
  const bueno = resultados.find((r) => CLASES_ACEPTADAS.includes(r.class) && dentroDeLaZona(Number(r.lat), Number(r.lon)) && (!esCiudad || dentroDeLaCiudad(Number(r.lat), Number(r.lon))));
  return bueno ? { lat: Number(bueno.lat), lng: Number(bueno.lon), encontrado: bueno.display_name.split(",").slice(0, 2).join(",") } : null;
}

/** Prueba el nombre completo y, si no aparece, su primera parte ("Colina I, Colina II y Colina III" -> "Colina I"). */
async function ubicar(nombre, esCiudad) {
  const variantes = [...new Set([nombre, nombre.split(/,| y /)[0].trim()])];
  for (const variante of variantes) {
    const resultado = await buscar(`${variante}, San Pedro de Macoris`, esCiudad);
    await pausa(ESPERA_MS);
    if (resultado) return resultado;
  }
  return null;
}

const { data: sectores, error } = await admin.from("sectores").select("id, nombre, zonas(nombre)").is("latitud", null).order("nombre");
if (error) throw new Error("No se pudieron leer los sectores: " + error.message);
console.log(`Buscando ${sectores.length} sectores sin ubicación${GUARDAR ? " (se guardará)" : " (solo vista previa)"}…\n`);

let encontrados = 0;
const sinUbicar = [];
for (const sector of sectores) {
  const r = await ubicar(sector.nombre, sector.zonas?.nombre === "San Pedro");
  if (!r) {
    sinUbicar.push(sector.nombre);
    console.log(`  ✗ ${sector.nombre}`);
    continue;
  }
  encontrados += 1;
  console.log(`  ✓ ${sector.nombre.padEnd(36)} ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}   (${r.encontrado})`);
  if (GUARDAR) {
    const { error: errorGuardar } = await admin.from("sectores").update({ latitud: r.lat, longitud: r.lng, origen_ubicacion: "osm" }).eq("id", sector.id);
    if (errorGuardar) console.log("    no se pudo guardar:", errorGuardar.message);
  }
}

console.log(`\nUbicados: ${encontrados} de ${sectores.length}.`);
if (sinUbicar.length) console.log(`Sin ubicación (el mapa no los conoce): ${sinUbicar.join(", ")}`);
