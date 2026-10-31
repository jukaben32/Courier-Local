import type { DatosEstadoEnvio } from "@/lib/estadoEnvioDatos";
import { formatearTelefono, normalizarTelefonoRD } from "@/lib/telefono";

const COLOR = {
  rojo: "border-rojo/40 bg-rojo/10 text-rojo",
  ambar: "border-ambar/50 bg-ambar/10 text-[#8a6200]",
  verde: "border-verde/40 bg-verde/10 text-verde",
} as const;

/** Si los avisos de WhatsApp están saliendo bien: cuentas conectadas, cuántos van y si algo se detuvo. */
export function EstadoEnvio({ datos }: { datos: DatosEstadoEnvio }) {
  const { estado, sesiones } = datos;
  return (
    <section className="space-y-3 rounded-xl border border-linea bg-tarjeta p-4" aria-label="Estado del envío">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Estado del envío</h2>
        <p className="text-sm text-tinta-2">
          <b className="text-tinta tabular-nums">{datos.avisadosHoy}</b> avisados hoy · <b className="text-tinta tabular-nums">{datos.enCola}</b> por avisar
        </p>
      </div>

      <ul className="space-y-1.5">
        {estado.alertas.map((a) => (
          <li key={a.texto} role={a.nivel === "rojo" ? "alert" : undefined} className={`rounded-lg border px-3 py-2 text-sm font-medium ${COLOR[a.nivel]}`}>
            {a.texto}
          </li>
        ))}
      </ul>

      {sesiones && sesiones.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {sesiones.map((s) => {
            const tel = s.telefono ? normalizarTelefonoRD(s.telefono) : null;
            return (
              <li key={s.nombre} className={`rounded-full border px-3 py-1 ${s.lista ? COLOR.verde : COLOR.rojo}`}>
                <b>{s.nombre}</b> · {s.lista ? "conectada" : s.estado}
                {tel && ` · ${formatearTelefono(tel)}`}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
