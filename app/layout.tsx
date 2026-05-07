import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asesoría en vivo · Programación y Seguridad Informática",
  description:
    "Conecta por videollamada con un asesor de programación o seguridad informática.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="px-6 py-5 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl"
                style={{
                  background: "linear-gradient(135deg,#5b8cff,#7b5bff)",
                }}
              />
              <span className="font-semibold tracking-tight">
                Asesoría en vivo
              </span>
            </a>
            <nav className="text-sm text-muted hidden sm:flex gap-5">
              <a href="/#areas" className="hover:text-white">
                Áreas
              </a>
              <a href="/#como-funciona" className="hover:text-white">
                Cómo funciona
              </a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="px-6 py-6 text-xs text-muted text-center">
            © {new Date().getFullYear()} Asesoría en vivo · WebRTC P2P
          </footer>
        </div>
      </body>
    </html>
  );
}
