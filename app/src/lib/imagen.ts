const LADO_MAXIMO = 1600;

/** Reduce la foto del celular (varios MB) a un JPEG liviano en base64, para subirla rápido. */
export async function fotoABase64(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL("image/jpeg", 0.85).split(",")[1];
}
