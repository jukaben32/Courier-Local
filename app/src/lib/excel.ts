import { inflateRawSync } from "node:zlib";

/**
 * Lee la primera hoja de un .xlsx y la devuelve como filas de texto (una celda vacía = "").
 * Un .xlsx es un ZIP con XML adentro: no hace falta ninguna librería externa.
 * Lanza un Error con mensaje para la oficina si el archivo no es un Excel válido.
 */
export function leerPrimeraHoja(archivo: Uint8Array): string[][] {
  const zip = leerZip(archivo);
  const texto = (ruta: string) => {
    const datos = zip.get(ruta);
    return datos ? new TextDecoder("utf-8").decode(datos) : null;
  };

  const rutaHoja = rutaPrimeraHoja(texto("xl/workbook.xml"), texto("xl/_rels/workbook.xml.rels"));
  const hoja = texto(rutaHoja);
  if (!hoja) throw new Error("El archivo no tiene hojas. ¿Es un Excel (.xlsx)?");

  const compartidos = [...(texto("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDeNodo(m[1]));

  const filas: string[][] = [];
  for (const fila of hoja.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas: string[] = [];
    for (const celda of fila[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = celda[1];
      const contenido = celda[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(atributos);
      if (!ref) continue;
      const tipo = /\bt="(\w+)"/.exec(atributos)?.[1];
      const valor = /<v>([\s\S]*?)<\/v>/.exec(contenido)?.[1];

      let resultado = "";
      if (tipo === "s" && valor !== undefined) resultado = compartidos[Number(valor)] ?? "";
      else if (tipo === "inlineStr") resultado = textoDeNodo(contenido);
      else if (valor !== undefined) resultado = decodificarXml(valor);

      celdas[indiceColumna(ref[1])] = resultado.trim();
    }
    filas[Number(fila[1]) - 1] = Array.from(celdas, (c) => c ?? "");
  }
  return Array.from(filas, (f) => f ?? []);
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26 */
export function indiceColumna(letras: string): number {
  return [...letras].reduce((total, letra) => total * 26 + letra.charCodeAt(0) - 64, 0) - 1;
}

function rutaPrimeraHoja(libro: string | null, relaciones: string | null): string {
  const idRelacion = libro && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(libro)?.[1];
  const destino =
    idRelacion &&
    relaciones &&
    new RegExp(`<Relationship\\b[^>]*\\bId="${idRelacion}"[^>]*\\bTarget="([^"]+)"`).exec(relaciones)?.[1];
  if (!destino) return "xl/worksheets/sheet1.xml";
  return destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;
}

// Junta todos los <t> de un nodo (los textos con formato vienen partidos en varios)
function textoDeNodo(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodificarXml(m[1])).join("");
}

function decodificarXml(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Lector mínimo de ZIP: directorio central + archivos guardados o comprimidos (deflate)
function leerZip(datos: Uint8Array): Map<string, Uint8Array> {
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const noEsExcel = () => new Error("El archivo no es un Excel válido (.xlsx).");

  let fin = -1;
  for (let i = datos.length - 22; i >= Math.max(0, datos.length - 65557); i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw noEsExcel();

  const archivos = new Map<string, Uint8Array>();
  const total = vista.getUint16(fin + 10, true);
  let pos = vista.getUint32(fin + 16, true);
  for (let n = 0; n < total; n++) {
    if (vista.getUint32(pos, true) !== 0x02014b50) throw noEsExcel();
    const metodo = vista.getUint16(pos + 10, true);
    const tamano = vista.getUint32(pos + 20, true);
    const largoNombre = vista.getUint16(pos + 28, true);
    const largoExtra = vista.getUint16(pos + 30, true);
    const largoComentario = vista.getUint16(pos + 32, true);
    const local = vista.getUint32(pos + 42, true);
    const nombre = new TextDecoder().decode(datos.subarray(pos + 46, pos + 46 + largoNombre));
    pos += 46 + largoNombre + largoExtra + largoComentario;

    if (nombre.endsWith("/")) continue;
    const inicio = local + 30 + vista.getUint16(local + 26, true) + vista.getUint16(local + 28, true);
    const comprimido = datos.subarray(inicio, inicio + tamano);
    if (metodo === 0) archivos.set(nombre, comprimido);
    else if (metodo === 8) archivos.set(nombre, inflateRawSync(comprimido));
  }
  return archivos;
}
