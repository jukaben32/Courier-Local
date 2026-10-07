import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormularioRetiro } from "./FormularioRetiro";

export const dynamic = "force-dynamic";

export default async function PaginaEntregaOficina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: paquete } = await supabase.from("paquetes").select("id, numero_guia, nombre_etiqueta").eq("id", id).maybeSingle();
  if (!paquete) notFound();

  return <FormularioRetiro paqueteId={paquete.id} guia={paquete.numero_guia} nombre={paquete.nombre_etiqueta} />;
}
