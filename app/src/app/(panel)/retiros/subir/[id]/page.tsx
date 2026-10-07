import { notFound } from "next/navigation";
import { PasoCourier } from "@/components/PasoCourier";
import { createClient } from "@/lib/supabase/server";
import { marcarRetiroSubido } from "../../actions";

export const dynamic = "force-dynamic";

const VIGENCIA_ENLACE_SEGUNDOS = 600;

export default async function PaginaSubirRetiro({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: entrega } = await supabase
    .from("entregas")
    .select("id, cargado_en_courier, cedula_leida, nombre_en_cedula, foto_cedula_destinatario_url, tipo, paquetes(numero_guia, nombre_etiqueta)")
    .eq("id", id)
    .maybeSingle();
  if (!entrega || entrega.tipo !== "retiro_oficina" || !entrega.foto_cedula_destinatario_url) notFound();

  const paquete = entrega.paquetes as unknown as { numero_guia: string; nombre_etiqueta: string } | null;
  const { data: firmada } = await supabase.storage
    .from("evidencias")
    .createSignedUrl(entrega.foto_cedula_destinatario_url, VIGENCIA_ENLACE_SEGUNDOS);
  if (!firmada) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <PasoCourier
        entregaId={entrega.id}
        urlFoto={firmada.signedUrl}
        guia={paquete?.numero_guia ?? ""}
        nombre={paquete?.nombre_etiqueta ?? entrega.nombre_en_cedula ?? ""}
        cedula={entrega.cedula_leida ?? ""}
        yaSubido={entrega.cargado_en_courier}
        marcarSubido={marcarRetiroSubido}
        rutaVolver="/retiros"
        textoVolver="Volver a retiros"
      />
    </div>
  );
}
