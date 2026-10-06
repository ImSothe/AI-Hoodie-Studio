import type { Metadata, Viewport } from 'next';
// Tipografías autoalojadas (sin peticiones a Google Fonts): interfaz y motor de texto.
import '@fontsource/inter/200.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/400-italic.css';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/ibm-plex-mono/300.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Hoodie Studio — Atelier',
  description: 'Atelier digital de sudaderas: diseño con IA, visor 3D y dossier técnico de taller.',
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
