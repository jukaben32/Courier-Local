// Horario de la oficina (para el retiro de paquetes). Si cambia, se cambia solo aquí.
export const HORARIO_OFICINA = { abre: "8:00 am", cierra: "6:00 pm" } as const;

/** "de 8:00 am a 6:00 pm" */
export const TEXTO_HORARIO_OFICINA = `de ${HORARIO_OFICINA.abre} a ${HORARIO_OFICINA.cierra}`;
