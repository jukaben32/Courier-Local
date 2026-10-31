import { validarCedulaRD } from "./cedula";
import { normalizarTelefonoRD } from "./telefono";

/** Un envío del "Listado de envíos en la oficina", ya con los datos que usa Courier Local. */
export interface EnvioListado {
  /** Número de fila en el Excel (para que la oficina lo encuentre). */
  fila: number;
  guia: string;
  nombre: string;
  telefonoOriginal: string;
  /** 10 dígitos de RD, o null si el teléfono del listado no es válido. */
  telefono: string | null;
  direccion: string;
  /** Cédula del destinatario (11 dígitos válidos) si el listado la trae; "" si no la trae o no es válida. */
  cedula: string;
  /** El sector tal como viene en el listado ("COLINA I", "AZUL"...). */
  sectorListado: string;
  contenido: string;
  /** La fila completa: { "CÓDIGO": "...", "MANIFIESTO": "...", ... }. Se guarda tal cual. */
  original: Record<string, string>;
}

export interface ResultadoListado {
  envios: EnvioListado[];
  error?: string;
}

// Nombres de columna que aceptamos para cada dato (sin tildes y en mayúsculas)
const COLUMNAS = {
  guia: ["CODIGO", "GUIA", "NUMERO DE GUIA", "TRACKING"],
  nombre: ["CLIENTE", "NOMBRE", "DESTINATARIO"],
  telefono: ["TELEFONO", "CELULAR", "TEL"],
  direccion: ["DIRECCION"],
  cedula: ["CEDULA", "DOCUMENTO", "IDENTIFICACION", "CED"],
  sector: ["SECTOR", "BARRIO"],
  servicio: ["SERVICIO", "TIENDA"],
  peso: ["PESO"],
} as const;

const OBLIGATORIAS = ["guia", "nombre", "telefono"] as const;

/** Mayúsculas, sin tildes ni espacios de más: "Teléfono " -> "TELEFONO". */
function clave(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

// El sistema del courier pone "-" en las celdas vacías
const limpiar = (texto: string | undefined) => {
  const t = (texto ?? "").trim();
  return t === "-" ? "" : t;
};

/**
 * Busca la fila de títulos (en las primeras 10) y convierte cada fila en un envío.
 * Las columnas se reconocen por su título, no por su posición.
 */
export function extraerEnvios(filas: string[][]): ResultadoListado {
  const indiceTitulos = filas.slice(0, 10).findIndex((fila) => {
    const titulos = fila.map(clave);
    return OBLIGATORIAS.every((dato) => COLUMNAS[dato].some((nombre) => titulos.includes(nombre)));
  });
  if (indiceTitulos < 0) {
    return { envios: [], error: "No se encontraron las columnas CÓDIGO, CLIENTE y TELÉFONO. ¿Es el listado de envíos?" };
  }

  const titulos = filas[indiceTitulos];
  const titulosClave = titulos.map(clave);
  const columna = (dato: keyof typeof COLUMNAS) => titulosClave.findIndex((t) => (COLUMNAS[dato] as readonly string[]).includes(t));
  const pos = Object.fromEntries((Object.keys(COLUMNAS) as (keyof typeof COLUMNAS)[]).map((d) => [d, columna(d)])) as Record<
    keyof typeof COLUMNAS,
    number
  >;

  const envios: EnvioListado[] = [];
  filas.slice(indiceTitulos + 1).forEach((fila, i) => {
    const valor = (dato: keyof typeof COLUMNAS) => (pos[dato] < 0 ? "" : limpiar(fila[pos[dato]]));
    const guia = valor("guia");
    const nombre = valor("nombre");
    if (!guia && !nombre) return; // fila vacía o de totales

    const original: Record<string, string> = {};
    titulos.forEach((titulo, c) => {
      if (titulo && limpiar(fila[c])) original[titulo] = limpiar(fila[c]);
    });

    const peso = valor("peso");
    envios.push({
      fila: indiceTitulos + i + 2,
      guia,
      nombre,
      telefonoOriginal: valor("telefono"),
      telefono: normalizarTelefonoRD(valor("telefono")),
      direccion: valor("direccion"),
      cedula: validarCedulaRD(valor("cedula")) ?? "",
      sectorListado: valor("sector"),
      contenido: [valor("servicio"), peso && `${peso} kg`].filter(Boolean).join(" · "),
      original,
    });
  });
  return { envios };
}

// Palabras que no ayudan a distinguir un sector de otro
const PALABRAS_VACIAS = new Set(["BARRIO", "SECTOR", "URBANIZACION", "RESIDENCIAL", "ENSANCHE", "DE", "DEL", "LA", "EL", "LOS", "LAS"]);

function palabras(texto: string): string[] {
  return clave(texto)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter((p) => p && !PALABRAS_VACIAS.has(p))
    // "FILIPINAS" y "Filipina", "CONUCO" y "Conucos" cuentan igual
    .map((p) => (p.length > 3 && p.endsWith("S") ? p.slice(0, -1) : p));
}

/**
 * Empareja el sector del listado con un sector de Courier Local. Devuelve su id o null.
 * 1. Igual (sin tildes, mayúsculas, "Barrio", "de", plurales): "AZUL" = "Barrio Azul".
 *    Los sectores que agrupan varios ("Colina I, Colina II y Colina III") cuentan por cada parte.
 * 2. Si no, el único sector cuyas palabras están todas en el texto: "INGENIO SANTA FE" -> "Santa fe".
 */
export function buscarSector(texto: string, sectores: { id: string; nombre: string }[]): string | null {
  const buscado = palabras(texto);
  if (buscado.length === 0) return null;

  const partes = sectores.flatMap((s) =>
    s.nombre.split(/,| y /i).map((parte) => ({ id: s.id, palabras: palabras(parte) })).filter((p) => p.palabras.length > 0)
  );

  const igual = partes.find((p) => p.palabras.join(" ") === buscado.join(" "));
  if (igual) return igual.id;

  const contenidos = new Set(partes.filter((p) => p.palabras.every((w) => buscado.includes(w))).map((p) => p.id));
  return contenidos.size === 1 ? [...contenidos][0] : null;
}
