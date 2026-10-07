import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con la clave service_role: salta los permisos (RLS). Solo para código de servidor
// (rutas de API, acciones, tareas programadas). "server-only" rompe el build si se importa
// por error desde un componente del navegador.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
