// Horario de la oficina (para el retiro de paquetes). Si cambia, se cambia solo aquí.
export const HORARIO_OFICINA = { abre: "8:00 am", cierra: "6:00 pm" } as const;

/** "de 8:00 am a 6:00 pm" */
export const TEXTO_HORARIO_OFICINA = `de ${HORARIO_OFICINA.abre} a ${HORARIO_OFICINA.cierra}`;

/** Dirección de la oficina, tal como se le dice al cliente. */
export const DIRECCION_OFICINA = "Mauricio Báez #186, San Pedro de Macorís";

/** Enlace de Google Maps a la oficina. Para un punto exacto, ponlo en OFICINA_ENLACE_MAPA. */
export const ENLACE_MAPA_OFICINA =
  process.env.OFICINA_ENLACE_MAPA?.trim() ||
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Mauricio Báez 186, San Pedro de Macorís, República Dominicana")}`;
