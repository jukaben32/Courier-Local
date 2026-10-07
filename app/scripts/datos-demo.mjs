// Datos de prueba para probar todo el sistema sin clientes reales ni WhatsApp.
//
//   node scripts/datos-demo.mjs                  -> crea usuarios de prueba + 40 paquetes
//   node scripts/datos-demo.mjs --paquetes=80    -> otra cantidad de paquetes
//   node scripts/datos-demo.mjs --confirmar      -> además deja ~60 % ya confirmados con su horario y ubicación
//   node scripts/datos-demo.mjs --reiniciar      -> genera contraseñas nuevas para los usuarios de prueba
//   node scripts/datos-demo.mjs --limpiar        -> borra los paquetes, clientes y entregas de prueba
//   node scripts/datos-demo.mjs --limpiar-usuarios -> borra los usuarios de prueba
//
// Las contraseñas se guardan en "Courier Local/usuarios-demo.txt" (no se sube a GitHub).
import crypto from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const RAIZ = new URL("../../", import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const bandera = (n) => args.includes(`--${n}`);
const valor = (n, porDefecto) => Number(args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? porDefecto);

const DOMINIO = "courier-local.test";
const PREFIJO_GUIA = "DEMO-";
const PREFIJO_TEL = "80955501";

// ---------- Limpieza ----------
async function limpiarDatos() {
  const { data: paquetes } = await admin.from("paquetes").select("id").like("numero_guia", `${PREFIJO_GUIA}%`);
  const ids = (paquetes ?? []).map((p) => p.id);
  if (ids.length) {
    const { data: entregas } = await admin.from("entregas").select("foto_cedula_destinatario_url").in("paquete_id", ids);
    const fotos = (entregas ?? []).map((e) => e.foto_cedula_destinatario_url).filter(Boolean);
    if (fotos.length) await admin.storage.from("evidencias").remove(fotos);
    await admin.from("mensajes_whatsapp").delete().in("paquete_id", ids);
    await admin.from("entregas").delete().in("paquete_id", ids);
    await admin.from("paquetes").delete().in("id", ids);
  }
  await admin.from("mensajes_whatsapp").delete().like("telefono", `${PREFIJO_TEL}%`);
  await admin.from("destinatarios").delete().like("telefono", `${PREFIJO_TEL}%`);
  console.log(`Datos de prueba borrados (${ids.length} paquetes).`);
}

async function limpiarUsuarios() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const demos = (data?.users ?? []).filter((u) => u.email?.startsWith("demo.") && u.email.endsWith(`@${DOMINIO}`));
  for (const u of demos) {
    await admin.from("usuarios").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  if (fs.existsSync(new URL("usuarios-demo.txt", RAIZ))) fs.unlinkSync(new URL("usuarios-demo.txt", RAIZ));
  console.log(`Usuarios de prueba borrados (${demos.length}).`);
}

if (bandera("limpiar")) { await limpiarDatos(); process.exit(0); }
if (bandera("limpiar-usuarios")) { await limpiarUsuarios(); process.exit(0); }

// ---------- Usuarios ----------
const clave = () => crypto.randomBytes(12).toString("base64url");

async function asegurarUsuario({ email, nombre, rol, repartidorId }, existentes) {
  const previo = existentes.get(email);
  const password = clave();
  if (previo) {
    if (bandera("reiniciar")) await admin.auth.admin.updateUserById(previo.id, { password });
    await admin.from("usuarios").upsert({ id: previo.id, nombre, rol, repartidor_id: repartidorId ?? null, activo: true });
    return { rol, email, password: bandera("reiniciar") ? password : null };
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from("usuarios").upsert({ id: data.user.id, nombre, rol, repartidor_id: repartidorId ?? null, activo: true });
  return { rol, email, password };
}

const { data: lista } = await admin.auth.admin.listUsers({ perPage: 200 });
const existentes = new Map((lista?.users ?? []).map((u) => [u.email, u]));
const { data: repartidores } = await admin.from("repartidores").select("id, nombre, rol").eq("activo", true).order("nombre");

const usuarios = [
  { email: `demo.dueno@${DOMINIO}`, nombre: "Dueño (prueba)", rol: "dueno" },
  { email: `demo.organizador1@${DOMINIO}`, nombre: "Organizador 1 (prueba)", rol: "organizador" },
  { email: `demo.organizador2@${DOMINIO}`, nombre: "Organizador 2 (prueba)", rol: "organizador" },
  ...(repartidores ?? [])
    .filter((r) => r.rol === "repartidor")
    .map((r, i) => ({ email: `demo.repartidor${i + 1}@${DOMINIO}`, nombre: `${r.nombre.split(" ")[0]} (prueba)`, rol: "repartidor", repartidorId: r.id })),
];

const creados = [];
for (const u of usuarios) creados.push(await asegurarUsuario(u, existentes));

const archivo = new URL("usuarios-demo.txt", RAIZ);
if (creados.some((c) => c.password)) {
  const previas = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf8").split("\n").filter((l) => l.includes(" | ")) : [];
  const porCorreo = new Map(previas.map((l) => [l.split(" | ")[1], l]));
  for (const c of creados) if (c.password) porCorreo.set(c.email, `${c.rol} | ${c.email} | ${c.password}`);
  fs.writeFileSync(archivo, ["USUARIOS DE PRUEBA (rol | correo | contraseña) — no compartir", ...porCorreo.values(), ""].join("\n"));
}
console.log(`Usuarios de prueba listos (${creados.length}). Contraseñas en: Courier Local/usuarios-demo.txt`);
if (bandera("solo-usuarios")) process.exit(0);

// ---------- Paquetes de prueba ----------
await limpiarDatos();

function aleatorioConSemilla(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = aleatorioConSemilla(20261006);
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

const NOMBRES = ["Maria", "Juan", "Ana", "Pedro", "Rosa", "Luis", "Carmen", "Jose", "Yesenia", "Franklin", "Daniela", "Wilson", "Katherine", "Rafael", "Altagracia", "Miguel", "Yokasta", "Starling"];
const APELLIDOS = ["Perez", "Rodriguez", "Gomez", "Santana", "Martinez", "Diaz", "Reyes", "Mejia", "De los Santos", "Ramirez", "Sosa", "Peña", "Castillo", "Medina"];

const { data: sectores } = await admin.from("sectores").select("id, nombre");
const { data: rutas } = await admin.from("repartidor_sectores").select("repartidor_id, sector_id");
const administrador = (repartidores ?? []).find((r) => r.rol === "administrador");
const carga = new Map();
const duenos = (sectorId) => (rutas ?? []).filter((r) => r.sector_id === sectorId).map((r) => r.repartidor_id);

const cantidad = valor("paquetes", 40);
const confirmar = bandera("confirmar");
const FRANJAS = ["MID", "PM"];
let creadosPaquetes = 0;

for (let i = 1; i <= cantidad; i += 1) {
  const sector = elegir(sectores);
  const nombre = `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
  const telefono = `${PREFIJO_TEL}${String(i % 100).padStart(2, "0")}`;
  const voluminoso = azar() < 0.05;

  let repartidorId = voluminoso && administrador ? administrador.id : null;
  if (!repartidorId) {
    const candidatos = duenos(sector.id);
    repartidorId = candidatos.sort((a, b) => (carga.get(a) ?? 0) - (carga.get(b) ?? 0))[0] ?? null;
  }
  if (repartidorId) carga.set(repartidorId, (carga.get(repartidorId) ?? 0) + 1);

  const { data: dest, error: eDest } = await admin
    .from("destinatarios")
    .insert({ nombre, telefono, sector_id: sector.id, direccion_texto: `Calle ${Math.ceil(azar() * 30)} #${Math.ceil(azar() * 99)}, ${sector.nombre}` })
    .select("id")
    .single();
  if (eDest || !dest) { console.error(eDest?.message); continue; }
  const destinatarioId = dest.id;

  const fila = {
    numero_guia: `${PREFIJO_GUIA}${String(i).padStart(4, "0")}`,
    destinatario_id: destinatarioId,
    nombre_etiqueta: nombre,
    contenido: "Paquete de prueba",
    voluminoso,
    sector_id: sector.id,
    repartidor_asignado_id: repartidorId,
    estado: "recibido",
  };

  if (confirmar && azar() < 0.6) {
    // Punto cerca del centro de San Pedro de Macorís, distinto según el sector
    const base = [...sector.nombre].reduce((t, c) => t + c.charCodeAt(0), 0);
    Object.assign(fila, {
      estado: "confirmado",
      ventana_horaria: elegir(FRANJAS),
      hora_confirmacion: new Date().toISOString(),
      ubicacion_entrega_lat: 18.4539 + ((base % 60) - 30) / 1000 + (azar() - 0.5) / 100,
      ubicacion_entrega_lng: -69.3086 + (((base * 7) % 60) - 30) / 1000 + (azar() - 0.5) / 100,
      ubicacion_entrega_en: new Date().toISOString(),
    });
  }

  const { error } = await admin.from("paquetes").insert(fila);
  if (error) console.error(`Guía ${fila.numero_guia}: ${error.message}`);
  else creadosPaquetes += 1;
}
console.log(`Paquetes de prueba creados: ${creadosPaquetes}${confirmar ? " (~60 % ya confirmados)" : ""}.`);
