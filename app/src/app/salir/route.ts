import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cierra la sesión y manda al login. Se usa cuando alguien tiene sesión pero su usuario fue desactivado.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
