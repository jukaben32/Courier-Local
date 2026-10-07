import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas que no exigen sesión: el webhook de WhatsApp y las tareas programadas
// (cada una se protege por su propia firma o clave secreta).
const RUTAS_PUBLICAS = ["/api/webhooks", "/api/cron"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esLogin = ruta.startsWith("/login");
  const esPublica = RUTAS_PUBLICAS.some((p) => ruta.startsWith(p));

  // Las llamadas de la app (fetch) reciben un 401 claro, no una redirección al login
  if (!user && !esPublica && ruta.startsWith("/api/")) {
    return NextResponse.json({ error: "Tu sesión venció. Vuelve a entrar." }, { status: 401 });
  }

  if (!user && !esLogin && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && esLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
