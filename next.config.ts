import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // fabric trae dependencias opcionales de Node (canvas/jsdom) que nunca deben
  // entrar en el bundle del servidor: el lienzo sólo se ejecuta en el navegador.
  serverExternalPackages: ['canvas', 'jsdom'],
  // Cabeceras básicas de endurecimiento (la API key vive en localStorage).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
