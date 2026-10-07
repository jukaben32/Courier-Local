import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";

const cuerpo = DM_Sans({ variable: "--font-cuerpo", subsets: ["latin"] });
const titulo = Bricolage_Grotesque({ variable: "--font-titulo", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Courier Local",
  description: "Gestión de entregas de última milla en San Pedro de Macorís",
};

export const viewport: Viewport = {
  themeColor: "#0f1b2d",
  width: "device-width",
  initialScale: 1,
  // Pantallas con muesca: la app usa todo el ancho y deja márgenes seguros donde hace falta
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${cuerpo.variable} ${titulo.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
