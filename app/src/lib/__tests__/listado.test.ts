import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { indiceColumna, leerPrimeraHoja } from "../excel";
import { buscarSector, extraerEnvios } from "../listado";

const TITULOS = ["", "CÓDIGO", "SERVICIO", "CLIENTE", "PESO", "TELÉFONO", "DIRECCIÓN", "SECTOR", "CIUDAD"];
const fila = (...celdas: string[]) => ["", ...celdas];

describe("extraerEnvios", () => {
  it("toma los datos por el título de la columna y guarda la fila completa", () => {
    const { envios, error } = extraerEnvios([
      ["Listado de envíos en la oficina"],
      TITULOS,
      fila("SP100989865T", "TEMU", "Yenifer Calderon", "2.06", "8494052160", "Calle julio anglada casa #12", "BUENOS AIRES", "SAN PEDRO"),
    ]);
    expect(error).toBeUndefined();
    expect(envios).toEqual([
      {
        fila: 3,
        guia: "SP100989865T",
        nombre: "Yenifer Calderon",
        telefonoOriginal: "8494052160",
        telefono: "8494052160",
        direccion: "Calle julio anglada casa #12",
        cedula: "",
        sectorListado: "BUENOS AIRES",
        contenido: "TEMU · 2.06 kg",
        original: {
          CÓDIGO: "SP100989865T",
          SERVICIO: "TEMU",
          CLIENTE: "Yenifer Calderon",
          PESO: "2.06",
          TELÉFONO: "8494052160",
          DIRECCIÓN: "Calle julio anglada casa #12",
          SECTOR: "BUENOS AIRES",
          CIUDAD: "SAN PEDRO",
        },
      },
    ]);
  });

  it("si el listado trae una columna de cédula la toma, y solo si es válida", () => {
    const { envios } = extraerEnvios([
      [...TITULOS, "CÉDULA"],
      [...fila("SP1", "TEMU", "Ana Pérez", "1", "8295551234", "Calle 1", "AZUL", "SPM"), "023-0153593-2"],
      [...fila("SP2", "TEMU", "Luis Gómez", "1", "8295551235", "Calle 2", "AZUL", "SPM"), "123-4567890-1"],
      fila("SP3", "TEMU", "Eva Díaz", "1", "8295551236", "Calle 3", "AZUL", "SPM"),
    ]);
    expect(envios.map((e) => e.cedula)).toEqual(["02301535932", "", ""]);
  });

  it("los '-' cuentan como vacío, se saltan filas vacías y el teléfono inválido queda en null", () => {
    const { envios } = extraerEnvios([
      TITULOS,
      fila("SP1", "TEMU", "Ana Pérez", "-", "555-1234", "-", "-", "-"),
      [],
      fila("", "", "", "", "", "", "", ""),
    ]);
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ fila: 2, telefono: null, telefonoOriginal: "555-1234", direccion: "", sectorListado: "", contenido: "TEMU" });
  });

  it("avisa si el archivo no tiene las columnas del listado", () => {
    expect(extraerEnvios([["NOMBRE", "EDAD"], ["Ana", "30"]]).error).toMatch(/CÓDIGO, CLIENTE y TELÉFONO/);
  });
});

describe("buscarSector", () => {
  const sectores = [
    { id: "azul", nombre: "Barrio Azul" },
    { id: "colinas", nombre: "Colina I, Colina II y Colina III" },
    { id: "filipina", nombre: "Barrio la Filipina" },
    { id: "cochero", nombre: "Loma del Cochero" },
    { id: "palo", nombre: "Urbanización Palo de Azúcar" },
    { id: "santafe", nombre: "Santa fe" },
    { id: "porvenir", nombre: "Proyecto Porvenir" },
    { id: "ingenio", nombre: "Ingenio Porvenir" },
  ];

  it.each([
    ["AZUL", "azul"],
    ["COLINA II", "colinas"],
    ["FILIPINAS", "filipina"],
    ["LOMA DE COCHERO", "cochero"],
    ["URBANIZACIÓN PALO DE AZÚCAR", "palo"],
    ["INGENIO SANTA FE", "santafe"],
    ["PROYECTO PORVENIR", "porvenir"],
  ])("'%s' -> %s", (texto, esperado) => {
    expect(buscarSector(texto, sectores)).toBe(esperado);
  });

  it("si no lo reconoce o hay dudas, no adivina", () => {
    expect(buscarSector("SECTOR EVANGELINA RODRÍGUEZ", sectores)).toBeNull();
    expect(buscarSector("-", sectores)).toBeNull();
    // Cabe en dos sectores ("Villa Centro" y "Centro"): no se elige ninguno
    const dudosos = [{ id: "a", nombre: "Villa Centro" }, { id: "b", nombre: "Centro" }];
    expect(buscarSector("VILLA CENTRO NORTE", dudosos)).toBeNull();
  });
});

// Arma un .xlsx mínimo (ZIP con deflate) para probar el lector sin archivos externos
function crearXlsx(archivos: Record<string, string>): Uint8Array {
  const locales: Buffer[] = [];
  const central: Buffer[] = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const nombreB = Buffer.from(nombre);
    const datos = deflateRawSync(Buffer.from(contenido));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt16LE(nombreB.length, 26);
    const cabecera = Buffer.alloc(46);
    cabecera.writeUInt32LE(0x02014b50, 0);
    cabecera.writeUInt16LE(8, 10);
    cabecera.writeUInt32LE(datos.length, 20);
    cabecera.writeUInt16LE(nombreB.length, 28);
    cabecera.writeUInt32LE(desplazamiento, 42);
    locales.push(local, nombreB, datos);
    central.push(cabecera, nombreB);
    desplazamiento += 30 + nombreB.length + datos.length;
  }
  const directorio = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return new Uint8Array(Buffer.concat([...locales, directorio, fin]));
}

describe("leerPrimeraHoja", () => {
  it("lee textos en línea, compartidos, números y entidades XML", () => {
    const xlsx = crearXlsx({
      "xl/sharedStrings.xml": "<sst><si><t>CLIENTE</t></si><si><r><t>Ana </t></r><r><t>&amp; Luis</t></r></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Teléfono</t></is></c><c r="C1" t="s"><v>0</v></c></row>' +
        '<row r="3"><c r="A3"><v>8494052160</v></c><c r="B3"/><c r="C3" t="s"><v>1</v></c></row></sheetData></worksheet>',
    });
    expect(leerPrimeraHoja(xlsx)).toEqual([["Teléfono", "", "CLIENTE"], [], ["8494052160", "", "Ana & Luis"]]);
  });

  it("rechaza archivos que no son Excel", () => {
    expect(() => leerPrimeraHoja(new TextEncoder().encode("hola"))).toThrow(/no es un Excel/);
  });

  it("convierte letras de columna a número", () => {
    expect([indiceColumna("A"), indiceColumna("Z"), indiceColumna("AA"), indiceColumna("AX")]).toEqual([0, 25, 26, 49]);
  });
});
