import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormularioEntrega } from "./FormularioEntrega";

export const dynamic = "force-dynamic";

export default async function PaginaEntrega({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: paquete } = await supabase
    .from("paquetes")
    .select("id, numero_guia, nombre_etiqueta, estado")
    .eq("id", id)
    .maybeSingle();
  if (!paquete) notFound();

  return <FormularioEntrega paqueteId={paquete.id} guia={paquete.numero_guia} nombre={paquete.nombre_etiqueta} />;
}
