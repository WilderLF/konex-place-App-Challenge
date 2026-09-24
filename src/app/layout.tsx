import type { Metadata, Viewport } from "next";
import "@fontsource/pixelify-sans/500.css";
import "@fontsource/pixelify-sans/700.css";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";

export const metadata: Metadata = {
  title: "konex/place · Pintemos Nerdearla píxel a píxel",
  description:
    "Un lienzo de 10.000 píxeles para pintar entre todos en Nerdearla 2026. Un píxel cada 15 segundos.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#EEF2FB",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
